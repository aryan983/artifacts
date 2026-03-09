// ── cache.js ──────────────────────────────────────────
// cache.js — GPU Cache Coherency Demo

// Cache line state, L2 state helpers, resize, drawing utilities

// ── Operation type → color map ────────────────────────────────────────────────
// Used by draw.js to color individual L1 line slots by the op that filled them.
var OP_COLORS = {
  read:     '#339af0',   // blue   — global load / L2 fetch
  write:    '#51cf66',   // green  — store / write-evict
  atomic:   '#f59e0b',   // amber  — atomicAdd / RMW
  spill:    '#fb923c',   // orange — register spill
  tma:      '#22d3ee',   // cyan   — TMA tile load
  shared:   '#6ee09a',   // light-green — shared mem / DSMEM
};

// Return the render color for a single L1 line slot object {s, op}.
// s: 0=empty, 1=clean, 2=dirty
function lineColor(line, blockState) {
  if (!line || line.s === 0) return '#2a2d3a';
  if (line.op && OP_COLORS[line.op]) {
    return line.s === 2 ? OP_COLORS[line.op] : OP_COLORS[line.op] + '70';
  }
  // no op tag — fall back to state-based color
  if (line.s === 2) return '#51cf66';
  return blockState === 'shared' ? '#339af0' : '#51cf6688';
}

// Make an empty line slot object
function makeLine(s, op) { return { s: s || 0, op: op || null }; }

var _canvasBaselineW = 0;  // width measured when panel is closed — never shrinks

function resize(force) {
  dpr = window.devicePixelRatio || 1;

  // ── Compute true available canvas width ─────────────────────────────────
  // Available = viewport - padding(20) - info-panel(240) - gaps(16) - step-log(0 or 240)
  // This ensures the diagram scales proportionally at any viewport width.
  var vw = window.innerWidth || 1280;
  var infoPanelEl = document.querySelector('.info-panel');
  var infoPanelW  = infoPanelEl ? (infoPanelEl.offsetWidth || 240) : 240;
  var containerPad = 20;  // 2 × 10px padding
  var gapTotal = 16;       // gaps between flex children
  var panelOpen = (function() {
    var pw = document.getElementById('pause-panel-wrap');
    return pw && pw.classList.contains('open');
  })();
  var stepLogW = panelOpen ? 248 : 0;  // pause-panel-wrap.open width + gap
  var availW = vw - containerPad - infoPanelW - gapTotal - stepLogW;
  availW = Math.max(availW, 400);  // never below 400px

  // Baseline: when panel is closed, record available width for pinning during open
  if (!panelOpen) {
    if (availW > 200) _canvasBaselineW = availW;
  }
  var newW = (_canvasBaselineW > 200 ? _canvasBaselineW : availW);
  // When panel is open, keep canvas pinned at baseline so layout doesn't squish
  // but still respect the true available width ceiling
  if (panelOpen) newW = Math.min(_canvasBaselineW, vw - containerPad - infoPanelW - gapTotal - stepLogW);
  newW = Math.max(newW, 400);

  var r = canvas.getBoundingClientRect();
  var newH = (r.height > 10 ? r.height : null) ||
             (canvas.offsetHeight > 10 ? canvas.offsetHeight : null) ||
             (vw < 500 ? 640 : 720);

  if (!force && newW === W && newH === H) return;
  W = newW; H = newH;
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Sync panel height to canvas height
  var panel = document.getElementById('pause-panel-wrap');
  if (panel) panel.style.height = newH + 'px';
  if (initialized) {
    buildLayout();
    // Callouts store canvas pixel coords — refresh after layout changes
    if (calloutIdleShown) {
      setTimeout(function() { showIdleCallouts(); }, 30);
    } else {
      // Non-idle callouts: just clear them — next scenario will redraw correctly
      clearReactiveCallouts();
    }
  }
}

window.addEventListener('resize', resize);

// Programs modal input live preview
window.addEventListener('load', function() {
  var inp = document.getElementById('pm-numbers');
  if (inp) inp.addEventListener('input', function(){ if(typeof updatePmPreview==='function') updatePmPreview(); });
  // Close modal on backdrop click
  var modal = document.getElementById('programs-modal');
  if (modal) modal.addEventListener('click', function(e){ if(e.target===modal) closeProgramsModal(); });
});

function rrect(x, y, w, h, r) {
  r = Math.min(r, w/2, h/2);
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r);
  ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
  ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r);
  ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}

function l2Fill(dirty) {
  var count = 10 + Math.floor(Math.random() * 10);
  for (var i = 0; i < NUM_L2_LINES; i++) l2Lines[i] = i < count ? (dirty ? 2 : 1) : 0;
  for (var j = NUM_L2_LINES-1; j > 0; j--) {
    var k = Math.floor(Math.random()*(j+1));
    var t = l2Lines[j]; l2Lines[j]=l2Lines[k]; l2Lines[k]=t;
  }
}
function l2AbsorbOne() {
  for (var i = 0; i < NUM_L2_LINES; i++) {
    if (l2Lines[i] === 0) { l2Lines[i] = 1; return; }
  }
  for (var i2 = 0; i2 < NUM_L2_LINES; i2++) {
    if (l2Lines[i2] === 1) { l2Lines[i2] = 1; return; }
  }
  l2Lines[0] = 1;
}
function l2Absorb() {
  var filled = 0;
  for (var i = 0; i < NUM_L2_LINES; i++) if (l2Lines[i] > 0) filled++;
  var empty = NUM_L2_LINES - filled;
  var toFill = Math.min(empty, 2 + Math.floor(Math.random()*3));
  var added = 0;
  for (var i2 = 0; i2 < NUM_L2_LINES && added < toFill; i2++) {
    if (l2Lines[i2] === 0) { l2Lines[i2] = 1; added++; }
  }
}
function l2AbsorbDirty() {
  for (var i = 0; i < NUM_L2_LINES; i++) {
    if (l2Lines[i] === 0) { l2Lines[i] = 2; return; }
  }
  for (var i2 = 0; i2 < NUM_L2_LINES; i2++) {
    if (l2Lines[i2] === 1) { l2Lines[i2] = 2; return; }
  }
}
function l2Dirty() {
  for (var i = 0; i < NUM_L2_LINES; i++) {
    if (l2Lines[i] === 1) { l2Lines[i] = 2; return; }
  }
  for (var i2 = 0; i2 < NUM_L2_LINES; i2++) {
    if (l2Lines[i2] === 0) { l2Lines[i2] = 2; return; }
  }
}
function l2Evict() {
  for (var i = 0; i < NUM_L2_LINES; i++) {
    if (l2Lines[i] === 2) { l2Lines[i] = 0; return; }
  }
  for (var i2 = 0; i2 < NUM_L2_LINES; i2++) {
    if (l2Lines[i2] === 1) { l2Lines[i2] = 0; return; }
  }
}

function initCacheState() {
  cacheState = [];
  var l2Count = Math.floor(NUM_L2_LINES * (0.38 + Math.random() * 0.14));
  l2Lines = new Array(NUM_L2_LINES).fill(0);
  for (var li = 0; li < l2Count; li++) l2Lines[li] = 1;
  for (var lj = NUM_L2_LINES - 1; lj > 0; lj--) {
    var lk = Math.floor(Math.random() * (lj + 1));
    var lt = l2Lines[lj]; l2Lines[lj] = l2Lines[lk]; l2Lines[lk] = lt;
  }
  var n = layout.sms ? layout.sms.length : 4;
  for (var i = 0; i < n; i++) {
    var base = 0.72 + Math.random() * 0.10;
    // l1: array of {s, op} objects instead of plain integers
    var l1lines = [];
    for (var li2 = 0; li2 < NUM_LINES; li2++) l1lines.push(makeLine(0, null));
    cacheState.push({
      l1:   l1lines,
      smem: new Array(NUM_LINES).fill(0),
      regsPressure: base,
      regsPressureTarget: base,
    });
  }
}

function setRegPressure(smIdx, target) {
  if (!cacheState[smIdx]) return;
  cacheState[smIdx].regsPressureTarget = Math.max(0, Math.min(1.15, target));
}

function tickRegPressure(dt) {
  for (var i = 0; i < cacheState.length; i++) {
    var cs = cacheState[i];
    if (!cs) continue;
    var diff = cs.regsPressureTarget - cs.regsPressure;
    var rate = diff > 0 ? 3.5 : 1.2;
    cs.regsPressure += diff * rate * dt;
  }
}

// Add exactly ONE cache line from an operation — realistic: each fetch installs one line.
// op: 'read','write','atomic','spill' or null
function fillL1Random(smIdx, dirty, op) {
  if (!cacheState[smIdx]) return -1;
  // Pick a real address not already in this L1
  var missing = [];
  for (var a = 0; a < NUM_ADDRS; a++) { if (!l1HasAddr(smIdx, a)) missing.push(a); }
  var addr = missing.length > 0 ? missing[Math.floor(Math.random() * missing.length)] : Math.floor(Math.random() * NUM_ADDRS);
  l1InstallAddr(smIdx, addr, dirty, op || null);
  return addr; // caller can use this to flash the specific slot
}

// Fill multiple lines at once — used only for initialization / reset seeding
function fillL1Many(smIdx, dirty, op) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  var count = 6 + Math.floor(Math.random() * 8);
  for (var i = 0; i < NUM_LINES; i++) {
    lines[i] = makeLine(i < count ? (dirty ? 2 : 1) : 0, i < count ? (op || null) : null);
  }
  for (var j = NUM_LINES - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var tmp = lines[j]; lines[j] = lines[k]; lines[k] = tmp;
  }
}

function setL1Dirty(smIdx, op) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  // Ensure at least one line exists to dirty
  var hasLine = false;
  for (var i = 0; i < NUM_LINES; i++) { if (lines[i].s > 0) { hasLine = true; break; } }
  if (!hasLine) { fillL1Random(smIdx, false, op || null); }
  // Mark exactly ONE existing clean line dirty — or install a new dirty line
  for (var i2 = 0; i2 < NUM_LINES; i2++) {
    if (lines[i2].s === 1) {
      lines[i2] = makeLine(2, op || lines[i2].op, lines[i2].addr);
      return;
    }
  }
  // No clean line found — add a new dirty line
  fillL1Random(smIdx, true, op || null);
}

// Full wipe — only for arch switch / full reset / complete writeback eviction
function invalidateL1(smIdx) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  for (var i = 0; i < NUM_LINES; i++) lines[i] = makeLine(0, null);
}

// Evict exactly one line (the written-back line) — used by writeback scenario
function evictOneL1Line(smIdx) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  // Evict first dirty line (it was written back)
  for (var i = 0; i < NUM_LINES; i++) {
    if (lines[i].s === 2) { lines[i] = makeLine(0, null); return; }
  }
  // No dirty — evict first clean line
  for (var i2 = 0; i2 < NUM_LINES; i2++) {
    if (lines[i2].s === 1) { lines[i2] = makeLine(0, null); return; }
  }
}

// Targeted invalidation — drops 1 to `count` specific lines, leaving the rest intact
function invalidateL1Lines(smIdx, count) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  count = count || 1;
  var occupied = [];
  for (var i = 0; i < NUM_LINES; i++) { if (lines[i].s > 0) occupied.push(i); }
  for (var j = occupied.length - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var tmp = occupied[j]; occupied[j] = occupied[k]; occupied[k] = tmp;
  }
  var toDrop = Math.min(count, occupied.length);
  for (var d = 0; d < toDrop; d++) { lines[occupied[d]] = makeLine(0, null); }
}

function writebackL1(smIdx) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  for (var i = 0; i < NUM_LINES; i++) {
    if (lines[i].s === 2) lines[i] = makeLine(1, lines[i].op, lines[i].addr);
  }
}

function fillSmem(smIdx) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].smem;
  var count = 8 + Math.floor(Math.random() * 7);
  for (var i = 0; i < NUM_LINES; i++) lines[i] = i < count ? 1 : 0;
  for (var j = NUM_LINES - 1; j > 0; j--) {
    var kk = Math.floor(Math.random() * (j + 1));
    var tt = lines[j]; lines[j] = lines[kk]; lines[kk] = tt;
  }
}

function getCacheStats(smIdx, kind) {
  if (!cacheState[smIdx]) return { filled:0, dirty:0, empty:NUM_LINES };
  var arr = cacheState[smIdx][kind];
  var filled = 0, dirty = 0;
  for (var i = 0; i < arr.length; i++) {
    // support both old integer format (smem) and new object format (l1)
    var sv = (arr[i] && typeof arr[i] === 'object') ? arr[i].s : arr[i];
    if (sv === 1) filled++;
    else if (sv === 2) { filled++; dirty++
