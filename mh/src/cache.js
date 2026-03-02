// cache.js — GPU Cache Coherency Demo

// Cache line state, L2 state helpers, resize, drawing utilities

function resize() {
  dpr = window.devicePixelRatio || 1;
  var r = canvas.getBoundingClientRect();
  // In sandboxed iframes getBCR and offsetWidth can both be 0 during first paint.
  // Fall back to the canvas's CSS-declared height (640px) and parent width, or
  // hardcoded safe defaults — we'd rather draw at wrong size than not draw at all.
  var newW = (r.width  > 10 ? r.width  : null) ||
             (canvas.offsetWidth  > 10 ? canvas.offsetWidth  : null) ||
             (canvas.parentElement ? canvas.parentElement.offsetWidth : 0) ||
             800;
  var newH = (r.height > 10 ? r.height : null) ||
             (canvas.offsetHeight > 10 ? canvas.offsetHeight : null) ||
             640;
  if (newW === W && newH === H) return;
  W = newW; H = newH;
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (initialized) buildLayout();
}

window.addEventListener('resize', resize);

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
  // shuffle
  for (var j = NUM_L2_LINES-1; j > 0; j--) {
    var k = Math.floor(Math.random()*(j+1));
    var t = l2Lines[j]; l2Lines[j]=l2Lines[k]; l2Lines[k]=t;
  }
}
// Add exactly one clean slot — used on a single cache line read hit
function l2AbsorbOne() {
  // First try to fill an empty slot
  for (var i = 0; i < NUM_L2_LINES; i++) {
    if (l2Lines[i] === 0) { l2Lines[i] = 1; return; }
  }
  // L2 full: silently evict the first clean line to make room for the new one
  for (var i2 = 0; i2 < NUM_L2_LINES; i2++) {
    if (l2Lines[i2] === 1) { l2Lines[i2] = 1; return; } // stays clean — just refreshed
  }
  // All dirty — evict one dirty line (LRU approximation)
  l2Lines[0] = 1;
}
function l2Absorb() {
  // Mark some empty slots as clean — data written to L2
  var filled = 0;
  for (var i = 0; i < NUM_L2_LINES; i++) if (l2Lines[i] > 0) filled++;
  var empty = NUM_L2_LINES - filled;
  var toFill = Math.min(empty, 2 + Math.floor(Math.random()*3));
  var added = 0;
  for (var i2 = 0; i2 < NUM_L2_LINES && added < toFill; i2++) {
    if (l2Lines[i2] === 0) { l2Lines[i2] = 1; added++; }
  }
}
// Mark one clean line dirty — write-evict arrives at L2 (line is written, not clean)
function l2AbsorbDirty() {
  // Find an empty slot and mark dirty (write arrived from SM)
  for (var i = 0; i < NUM_L2_LINES; i++) {
    if (l2Lines[i] === 0) { l2Lines[i] = 2; return; }
  }
  // No empty slot — upgrade a clean line to dirty (overwrite)
  for (var i2 = 0; i2 < NUM_L2_LINES; i2++) {
    if (l2Lines[i2] === 1) { l2Lines[i2] = 2; return; }
  }
}
function l2Dirty() {
  // Mark a clean line dirty — happens on write-back. Guaranteed to mark one.
  for (var i = 0; i < NUM_L2_LINES; i++) {
    if (l2Lines[i] === 1) { l2Lines[i] = 2; return; }
  }
  // No clean lines — fill one slot as dirty (writeback still arrived)
  for (var i2 = 0; i2 < NUM_L2_LINES; i2++) {
    if (l2Lines[i2] === 0) { l2Lines[i2] = 2; return; }
  }
}
function l2Evict() {
  // Remove the first dirty line — evicted victim going to DRAM
  for (var i = 0; i < NUM_L2_LINES; i++) {
    if (l2Lines[i] === 2) { l2Lines[i] = 0; return; }
  }
  // No dirty line — evict a clean line instead (capacity eviction)
  for (var i2 = 0; i2 < NUM_L2_LINES; i2++) {
    if (l2Lines[i2] === 1) { l2Lines[i2] = 0; return; }
  }
}

function initCacheState() {
  cacheState = [];
  // Pre-fill L2 to ~45% — realistic: L2 is a shared last-level cache that
  // is never truly empty on a running GPU. Cold start only happens at power-on.
  var l2Count = Math.floor(NUM_L2_LINES * (0.38 + Math.random() * 0.14));
  l2Lines = new Array(NUM_L2_LINES).fill(0);
  for (var li = 0; li < l2Count; li++) l2Lines[li] = 1;
  // Shuffle so filled slots are scattered, not just at the front
  for (var lj = NUM_L2_LINES - 1; lj > 0; lj--) {
    var lk = Math.floor(Math.random() * (lj + 1));
    var lt = l2Lines[lj]; l2Lines[lj] = l2Lines[lk]; l2Lines[lk] = lt;
  }
  var n = layout.sms ? layout.sms.length : 4;
  for (var i = 0; i < n; i++) {
    // Baseline ~75-82%: registers are nearly always heavily allocated on a real GPU kernel.
    // Each resident warp has a fixed compile-time register allocation — the file is never "empty".
    var base = 0.72 + Math.random() * 0.10;
    cacheState.push({
      l1:   new Array(NUM_LINES).fill(0),
      smem: new Array(NUM_LINES).fill(0),
      regsPressure: base,
      regsPressureTarget: base,
    });
  }
}

// Set register pressure target for an SM — animates smoothly in draw loop
function setRegPressure(smIdx, target) {
  if (!cacheState[smIdx]) return;
  cacheState[smIdx].regsPressureTarget = Math.max(0, Math.min(1.15, target)); // allow slight overflow past 1
}

// Tick register pressure toward target — call once per draw frame
function tickRegPressure(dt) {
  for (var i = 0; i < cacheState.length; i++) {
    var cs = cacheState[i];
    if (!cs) continue;
    var diff = cs.regsPressureTarget - cs.regsPressure;
    // Fast rise on spill (overflow is sudden), moderate decay back to loaded baseline
    var rate = diff > 0 ? 3.5 : 1.2;
    cs.regsPressure += diff * rate * dt;
  }
}

function fillL1Random(smIdx, dirty) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  var count = 6 + Math.floor(Math.random() * 8);
  for (var i = 0; i < NUM_LINES; i++) {
    lines[i] = i < count ? (dirty ? 2 : 1) : 0;
  }
  for (var j = NUM_LINES - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var tmp = lines[j]; lines[j] = lines[k]; lines[k] = tmp;
  }
}

function setL1Dirty(smIdx) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  var filled = lines.filter(function(v){ return v > 0; }).length;
  if (filled < 4) { fillL1Random(smIdx, false); }
  var dirtied = 0;
  for (var i = 0; i < NUM_LINES && dirtied < 3; i++) {
    if (lines[i] === 1 && Math.random() > 0.5) { lines[i] = 2; dirtied++; }
  }
  if (dirtied === 0) { lines[Math.floor(Math.random()*NUM_LINES)] = 2; }
}

// Full wipe — used on arch switch, reset, or when entire L1 is being flushed (e.g. writeback eviction)
function invalidateL1(smIdx) {
  if (!cacheState[smIdx]) return;
  cacheState[smIdx].l1 = new Array(NUM_LINES).fill(0);
}
// Targeted invalidation — drops 1 to 3 specific lines, leaving the rest intact.
// This is what a real INV message does: it carries an address (or a few lines' worth)
// and only those matching tags get dropped. The SM keeps everything else cached.
function invalidateL1Lines(smIdx, count) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  count = count || 1;
  // Collect indices of occupied lines, pick randomly among them
  var occupied = [];
  for (var i = 0; i < NUM_LINES; i++) { if (lines[i] > 0) occupied.push(i); }
  // Shuffle occupied list and drop the first `count` entries
  for (var j = occupied.length - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var tmp = occupied[j]; occupied[j] = occupied[k]; occupied[k] = tmp;
  }
  var toDrop = Math.min(count, occupied.length);
  for (var d = 0; d < toDrop; d++) { lines[occupied[d]] = 0; }
}

function writebackL1(smIdx) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  for (var i = 0; i < NUM_LINES; i++) { if (lines[i] === 2) lines[i] = 1; }
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
    if (arr[i] === 1) filled++;
    else if (arr[i] === 2) { filled++; dirty++; }
  }
  return { filled: filled, dirty: dirty, empty: NUM_LINES - filled };
}

var hoveredBlock = null;
var selectedBlock = null;
var connLines = [];
var mouseX = 0, mouseY = 0;
var lastClientX = 0, lastClientY = 0;

// Phase names for display
var ARB_PHASES = {
  queued:    { label: 'QUEUED',    color: '#f59e0b', desc: 'Waiting in request queue for grant' },
  granted:   { label: 'GRANTED',   color: '#51cf66', desc: 'Grant issued — SM has exclusive access' },
  rmw:       { label: 'RMW→L2',   color: '#339af0', desc: 'Read-Modify-Write in progress at L2' },
  ack:       { label: 'ACK←L2',   color: '#ffa94d', desc: 'Acknowledgement returning from L2' },
  retiring:  { label: 'RETIRING',  color: '#a78bfa', desc: 'ROB retiring — data routing to SM' },
};
var hitRects = [];


