; }
  }
  return { filled: filled, dirty: dirty, empty: NUM_LINES - filled };
}

var hoveredBlock = null;
var selectedBlock = null;
var connLines = [];
var mouseX = 0, mouseY = 0;
var lastClientX = 0, lastClientY = 0;

var ARB_PHASES = {
  queued:    { label: 'QUEUED',    color: '#f59e0b', desc: 'Waiting in request queue for grant' },
  granted:   { label: 'GRANTED',   color: '#51cf66', desc: 'Grant issued — SM has exclusive access' },
  rmw:       { label: 'RMW→L2',   color: '#339af0', desc: 'Read-Modify-Write in progress at L2' },
  ack:       { label: 'ACK←L2',   color: '#ffa94d', desc: 'Acknowledgement returning from L2' },
  retiring:  { label: 'RETIRING',  color: '#a78bfa', desc: 'ROB retiring — data routing to SM' },
};
var hitRects = [];



// ── addrspace.js ──────────────────────────────────────────

// addrspace.js — GPU Cache Coherency Demo
// Coherent address-space simulation.
// 24 global addresses A00–A23, direct-mapped to 24 L2 slots.
// L1 lines and L2 slots now carry `addr` — hit/miss logic is real.
//
// Load order in HTML: globals.js → data.js → addrspace.js → cache.js → ...
// Functions defined here OVERRIDE stubs in cache.js (cache.js loads after us
// but the definitions here win because they're declared with `function` — no,
// actually cache.js redefines them. So: either (a) delete the duplicates from
// cache.js, or (b) load addrspace.js AFTER cache.js so our declarations win.
// We use option (b): load addrspace.js last among the cache helpers.
// The consolidated gpu_cache_coherency.html inlines this block right after cache.js.

// ── Address space ─────────────────────────────────────────────────────────────
var NUM_ADDRS = 24;
var ADDR_NAMES = (function () {
  var n = [];
  for (var i = 0; i < NUM_ADDRS; i++) n.push('A' + (i < 10 ? '0' : '') + i);
  return n;
})();

// Direct-mapped: each address has exactly one possible L2 slot.
// Simple, visual, educational — conflict misses become obvious.
function addrToL2Slot(addr) {
  return addr % NUM_L2_LINES;
}

// ── Active operation address ──────────────────────────────────────────────────
// Set at the top of triggerScenario / triggerAtomic before each operation.
var currentAddr = -1;

// ── L2 slot object factory ────────────────────────────────────────────────────
// Replaces the plain integer (0/1/2) l2Lines entries.
// { s: 0=empty, 1=clean, 2=dirty,  addr: -1 | 0..NUM_ADDRS-1 }
function _makeL2Slot(s, addr) {
  return { s: s, addr: (s === 0 ? -1 : (addr !== undefined ? addr : -1)) };
}

function initL2Lines() {
  l2Lines = [];
  for (var i = 0; i < NUM_L2_LINES; i++) l2Lines.push(_makeL2Slot(0, -1));
}

// ── L1 line factory — replaces cache.js makeLine, adds `addr` ─────────────────
// This definition appears AFTER cache.js loads, so it overrides the cache.js stub.
function makeLine(s, op, addr) {
  return {
    s:    s    || 0,
    op:   op   || null,
    addr: (s ? (addr !== undefined && addr !== null ? addr : -1) : -1)
  };
}

// ── L2 address-aware accessors ────────────────────────────────────────────────
function l2HasAddr(addr) {
  var slot = addrToL2Slot(addr);
  return !!(l2Lines[slot] && l2Lines[slot].s > 0 && l2Lines[slot].addr === addr);
}
function l2InstallAddr(addr, dirty) {
  l2Lines[addrToL2Slot(addr)] = _makeL2Slot(dirty ? 2 : 1, addr);
}
function l2DirtyAddr(addr) {
  // Only marks dirty if the address already has a slot — never installs a new line
  var s = l2Lines[addrToL2Slot(addr)];
  if (s && s.addr === addr) { s.s = 2; }
}
function l2CleanAddr(addr) {
  var s = l2Lines[addrToL2Slot(addr)];
  if (s && s.addr === addr) s.s = 1;
}
function l2EvictAddr(addr) {
  if (l2HasAddr(addr)) l2Lines[addrToL2Slot(addr)] = _makeL2Slot(0, -1);
}

// ── Legacy l2* helpers — now addr-aware ──────────────────────────────────────
// These replace the integer-based versions in cache.js.

function l2Fill(dirty) {
  initL2Lines();
  var addrs = [];
  for (var i = 0; i < NUM_ADDRS; i++) addrs.push(i);
  // shuffle
  for (var j = addrs.length - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var t = addrs[j]; addrs[j] = addrs[k]; addrs[k] = t;
  }
  var count = 10 + Math.floor(Math.random() * 10);
  for (var a = 0; a < Math.min(count, NUM_ADDRS); a++) {
    l2InstallAddr(addrs[a], dirty && Math.random() < 0.3);
  }
}

function l2AbsorbOne() {
  var missing = [];
  for (var i = 0; i < NUM_ADDRS; i++) if (!l2HasAddr(i)) missing.push(i);
  if (!missing.length) return;
  l2InstallAddr(missing[Math.floor(Math.random() * missing.length)], false);
}

function l2Absorb() {
  var c = 2 + Math.floor(Math.random() * 3);
  for (var i = 0; i < c; i++) l2AbsorbOne();
}

function l2AbsorbDirty() {
  var missing = [];
  for (var i = 0; i < NUM_ADDRS; i++) if (!l2HasAddr(i)) missing.push(i);
  if (missing.length) {
    l2InstallAddr(missing[Math.floor(Math.random() * missing.length)], true);
    return;
  }
  // All slots occupied — dirty a clean one
  for (var j = 0; j < NUM_L2_LINES; j++) {
    if (l2Lines[j] && l2Lines[j].s === 1) { l2Lines[j].s = 2; return; }
  }
}

function l2Dirty() {
  for (var i = 0; i < NUM_L2_LINES; i++) {
    if (l2Lines[i] && l2Lines[i].s === 1) { l2Lines[i].s = 2; return; }
  }
}

function l2Evict() {
  for (var i = 0; i < NUM_L2_LINES; i++) {
    if (l2Lines[i] && l2Lines[i].s === 2) { l2Lines[i] = _makeL2Slot(0, -1); return; }
  }
  for (var i2 = 0; i2 < NUM_L2_LINES; i2++) {
    if (l2Lines[i2] && l2Lines[i2].s === 1) { l2Lines[i2] = _makeL2Slot(0, -1); return; }
  }
}

// ── getCacheStats — works for object arrays (l1) and int arrays (smem) ────────
function getCacheStats(smIdx, kind) {
  if (!cacheState[smIdx]) return { filled: 0, dirty: 0, empty: NUM_LINES };
  var arr = cacheState[smIdx][kind], filled = 0, dirty = 0;
  for (var i = 0; i < arr.length; i++) {
    var sv = (arr[i] && typeof arr[i] === 'object') ? arr[i].s : arr[i];
    if (sv === 1) filled++;
    else if (sv === 2) { filled++; dirty++; }
  }
  return { filled: filled, dirty: dirty, empty: NUM_LINES - filled };
}

// ── getL2Stats — for draw.js / tooltip.js ────────────────────────────────────
function getL2Stats() {
  var filled = 0, dirty = 0;
  for (var i = 0; i < NUM_L2_LINES; i++) {
    var s = l2Lines[i] ? l2Lines[i].s : 0;
    if (s === 1) filled++;
    else if (s === 2) { filled++; dirty++; }
  }
  return { filled: filled, dirty: dirty, empty: NUM_L2_LINES - filled };
}

// ── L1 address-aware accessors ────────────────────────────────────────────────
function l1HasAddr(smIdx, addr) {
  if (!cacheState[smIdx]) return false;
  var lines = cacheState[smIdx].l1;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].s > 0 && lines[i].addr === addr) return true;
  }
  return false;
}

function l1AddrState(smIdx, addr) {
  if (!cacheState[smIdx]) return 0;
  var lines = cacheState[smIdx].l1;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].s > 0 && lines[i].addr === addr) return lines[i].s;
  }
  return 0;
}

function l1InstallAddr(smIdx, addr, dirty, op) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  // Update existing slot if addr already present
  for (var i = 0; i < NUM_LINES; i++) {
    if (lines[i].addr === addr) {
      lines[i].s = dirty ? 2 : 1;
      if (op) lines[i].op = op;
      return;
    }
  }
  // Collect empty slots — pick one at random (simulates set-associative random way selection)
  var emptySlots = [];
  for (var j = 0; j < NUM_LINES; j++) { if (lines[j].s === 0) emptySlots.push(j); }
  var slot = -1;
  if (emptySlots.length > 0) {
    slot = emptySlots[Math.floor(Math.random() * emptySlots.length)];
  }
  // Evict a random clean line if no empty slot (pseudo-LRU approximation)
  if (slot === -1) {
    var cleanSlots = [];
    for (var j2 = 0; j2 < NUM_LINES; j2++) { if (lines[j2].s === 1) cleanSlots.push(j2); }
    if (cleanSlots.length > 0) slot = cleanSlots[Math.floor(Math.random() * cleanSlots.length)];
  }
  // Last resort: evict a random dirty line
  if (slot === -1) slot = Math.floor(Math.random() * NUM_LINES);
  lines[slot] = makeLine(dirty ? 2 : 1, op || null, addr);
}

function l1DirtyAddr(smIdx, addr, op) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  for (var i = 0; i < NUM_LINES; i++) {
    if (lines[i].addr === addr) { lines[i].s = 2; if (op) lines[i].op = op; return; }
  }
  l1InstallAddr(smIdx, addr, true, op);
}

function l1EvictAddr(smIdx, addr) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  for (var i = 0; i < NUM_LINES; i++) {
    if (lines[i].addr === addr) { lines[i] = makeLine(0, null, -1); return; }
  }
}

// Returns list of SM indices that hold `addr` in their L1
function sharersOf(addr) {
  var r = [];
  for (var i = 0; i < cacheState.length; i++) {
    if (l1HasAddr(i, addr)) r.push(i);
  }
  return r;
}

// ── initCacheState — addr-aware replacement ────────────────────────────────────
function initCacheState() {
  initL2Lines();
  cacheState = [];
  var n = layout.sms ? layout.sms.length : 4;

  // Seed L2: ~40% occupancy, random addresses
  var seedPool = [];
  for (var sc = 0; sc < NUM_ADDRS; sc++) seedPool.push(sc);
  for (var sj = seedPool.length - 1; sj > 0; sj--) {
    var sk = Math.floor(Math.random() * (sj + 1));
    var st = seedPool[sj]; seedPool[sj] = seedPool[sk]; seedPool[sk] = st;
  }
  var l2Count = Math.floor(NUM_ADDRS * (0.35 + Math.random() * 0.15));
  for (var sa = 0; sa < l2Count; sa++) l2InstallAddr(seedPool[sa], false);

  for (var i = 0; i < n; i++) {
    var base = 0.72 + Math.random() * 0.10;
    var l1lines = [];
    for (var li = 0; li < NUM_LINES; li++) l1lines.push(makeLine(0, null, -1));

    // L1 starts empty — user must run scenarios to populate it
    cacheState.push({
      l1: l1lines,
      smem: new Array(NUM_LINES).fill(0),
      regsPressure: base,
      regsPressureTarget: base
    });
  }
}

// ── fillL1Random / fillL1Many / setL1Dirty — addr-aware ──────────────────────
function fillL1Random(smIdx, dirty, op) {
  // Prefer an address already in L2 but not in this L1
  var candidates = [];
  for (var a = 0; a < NUM_ADDRS; a++) {
    if (l2HasAddr(a) && !l1HasAddr(smIdx, a)) candidates.push(a);
  }
  var addr;
  if (candidates.length) {
    addr = candidates[Math.floor(Math.random() * candidates.length)];
  } else {
    // Nothing in L2 not in L1 — find any address not in L1
    for (var b = 0; b < NUM_ADDRS; b++) {
      if (!l1HasAddr(smIdx, b)) { addr = b; break; }
    }
    if (addr === undefined) addr = Math.floor(Math.random() * NUM_ADDRS);
    l2InstallAddr(addr, false);
  }
  l1InstallAddr(smIdx, addr, dirty, op);
}

function fillL1Many(smIdx, dirty, op) {
  var c = 6 + Math.floor(Math.random() * 8);
  for (var i = 0; i < c; i++) fillL1Random(smIdx, dirty, op);
}

function setL1Dirty(smIdx, op) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  for (var i = 0; i < NUM_LINES; i++) {
    if (lines[i].s === 1) { lines[i].s = 2; if (op) lines[i].op = op; return; }
  }
  fillL1Random(smIdx, true, op);
}

function invalidateL1Lines(smIdx, count) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  var occupied = [];
  for (var i = 0; i < NUM_LINES; i++) if (lines[i].s > 0) occupied.push(i);
  for (var j = occupied.length - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var tmp = occupied[j]; occupied[j] = occupied[k]; occupied[k] = tmp;
  }
  var toDrop = Math.min(count || 1, occupied.length);
  for (var d = 0; d < toDrop; d++) lines[occupied[d]] = makeLine(0, null, -1);
}

function evictOneL1Line(smIdx) {
  if (!cacheState[smIdx]) return -1;
  var lines = cacheState[smIdx].l1;
  var dirty = [], clean = [];
  for (var i = 0; i < NUM_LINES; i++) {
    if (lines[i].s === 2) dirty.push(i);
    else if (lines[i].s === 1) clean.push(i);
  }
  var pool = dirty.length > 0 ? dirty : clean;
  if (pool.length === 0) return -1;
  var slot = pool[Math.floor(Math.random() * pool.length)];
  var evictedAddr = lines[slot].addr;
  lines[slot] = makeLine(0, null, -1);
  return evictedAddr; // caller uses this to update L2 correctly
}

function invalidateL1(smIdx) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  for (var i = 0; i < NUM_LINES; i++) lines[i] = makeLine(0, null, -1);
}

function writebackL1(smIdx) {
  if (!cacheState[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  for (var i = 0; i < NUM_LINES; i++) {
    if (lines[i].s === 2) lines[i] = makeLine(1, lines[i].op, lines[i].addr);
  }
}

// ── L2 slot flash ────────────────────────────────────────────────────────────
// slotL2FlashEffects: [{slot, c, t, dur}]
var slotL2FlashEffects = [];

// Flash a likely-victim slot on L1 miss — shows WHERE the incoming line will land
function flashL1MissSlot(smIdx, color) {
  if (!cacheState[smIdx] || !layout.sms || !layout.sms[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  var candidates = [];
  for (var i = 0; i < lines.length; i++) { if (lines[i].s === 0) candidates.push(i); }
  if (candidates.length === 0) for (var j = 0; j < lines.length; j++) { if (lines[j].s === 1) candidates.push(j); }
  if (candidates.length === 0) candidates = [Math.floor(Math.random() * lines.length)];
  var slot = candidates[Math.floor(Math.random() * candidates.length)];
  if (typeof slotFlashEffects !== 'undefined') {
    slotFlashEffects = slotFlashEffects.filter(function(e){ return !(e.smIdx===smIdx && e.slotIdx===slot); });
    slotFlashEffects.push({ smIdx: smIdx, slotIdx: slot, c: color, t: 0, dur: 0.9 });
  }
}

function flashL2Slot(addr, color) {
  if (addr < 0 || addr >= NUM_ADDRS) return;
  var slot = addrToL2Slot(addr);
  slotL2FlashEffects = slotL2FlashEffects.filter(function(e){ return e.slot !== slot; });
  slotL2FlashEffects.push({ slot: slot, c: color, t: 0, dur: 0.7 });
}

// ── Address picker — biased for educational value ─────────────────────────────
// Returns an integer address index (0..NUM_ADDRS-1)
function pickAddr(type, smIdx) {
  var inL1 = [], dirtyL1 = [], inL2NotL1 = [], nowhere = [];

  if (cacheState[smIdx]) {
    var lines = cacheState[smIdx].l1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].s === 0 || lines[i].addr < 0) continue;
      if (lines[i].s === 2) dirtyL1.push(lines[i].addr);
      else inL1.push(lines[i].addr);
    }
  }
  for (var a = 0; a < NUM_ADDRS; a++) {
    if (!l1HasAddr(smIdx, a) && l2HasAddr(a))  inL2NotL1.push(a);
    if (!l1HasAddr(smIdx, a) && !l2HasAddr(a)) nowhere.push(a);
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function fallback() { return Math.floor(Math.random() * NUM_ADDRS); }

  switch (type) {
    case 'read':
      // 30% hit L1, 50% hit L2, 20% cold miss from DRAM
      var rr = Math.random();
      if (rr < 0.30 && inL1.length)      return pick(inL1);
      if (rr < 0.80 && inL2NotL1.length) return pick(inL2NotL1);
      return nowhere.length ? pick(nowhere) : fallback();

    case 'write':
      // 60% write to something in L1 (generates INV), 40% cold write
      if (inL1.length && Math.random() < 0.60)      return pick(inL1);
      if (inL2NotL1.length && Math.random() < 0.70) return pick(inL2NotL1);
      return fallback();

    case 'writeback':
      if (dirtyL1.length) return pick(dirtyL1);
      if (inL1.length)    return pick(inL1);
      return fallback();

    case 'invalidate':
      // Prefer ad
