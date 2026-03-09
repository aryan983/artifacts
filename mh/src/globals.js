// ── globals.js ──────────────────────────────────────────
// globals.js — GPU Cache Coherency Demo

// Global state, constants, pause toggle, scenario tooltip data


var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');
var W, H, dpr;
var initialized = false;

// ── Global error catcher — surfaces crashes visibly on canvas ─────────────
window.onerror = function(msg, src, line, col, err) {
  var errDiv = document.getElementById('_errOverlay');
  if (!errDiv) {
    errDiv = document.createElement('div');
    errDiv.id = '_errOverlay';
    errDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#1a0a0a;color:#ff6b6b;font:12px monospace;padding:10px;z-index:99999;white-space:pre-wrap;word-break:break-all;max-height:40vh;overflow:auto;border-bottom:2px solid #ff6b6b';
    document.body.appendChild(errDiv);
  }
  errDiv.textContent += 'ERROR: ' + msg + '\n  at ' + src + ':' + line + ':' + col + '\n';
};

// ── Pause state ──────────────────────────────────────────────────────────────
var paused = false;


// Pauseable timeout for program mode
function sortTimeout(fn, delay) {
  if (!sortRunning) return;
  return setTimeout(function() {
    if (!sortRunning) return;
    if (paused) {
      var iv = setInterval(function() {
        if (!paused || !sortRunning) {
          clearInterval(iv);
          if (sortRunning && !paused) fn();
        }
      }, 80);
    } else {
      fn();
    }
  }, delay);
}

function togglePause() {
  paused = !paused;
  var btn = document.getElementById('btn-pause');
  var badge = document.getElementById('paused-badge');
  if (paused) {
    btn.classList.add('active');
    btn.textContent = '▶ Resume';
    if (badge) badge.classList.add('visible');
    if (autoMode) { autoMode = false; document.getElementById('btn-auto').classList.remove('active'); }
    logEvent('Paused — animation frozen', '#845ef7');
    // Panel stays open if already open from a previous op
  } else {
    btn.classList.remove('active');
    btn.textContent = '⏸ Pause';
    if (badge) badge.classList.remove('visible');
    lastTime = performance.now();
    logEvent('Resumed', '#845ef7');
    // Side panel stays open — it's tied to manual mode, not pause state
  }
}


// ── Scenario button tooltip data ─────────────────────────────────────────────
var SCENARIO_INFO = {
  read: {
    title: 'SM Read  (L1 Miss → L2 Fetch)',
    color: '#ff6b6b',
    desc: 'A warp issues a global load (LD.E). The SM checks its L1 — on a miss, it sends a read request down to L2. The cache line travels back and fills L1.',
    watch: 'Watch the RdReq particle travel SM→Bus→L2, then DATA come back and fill the L1 line. L1 state transitions: Invalid → Shared.'
  },
  write: {
    title: 'SM Write  (write-evict + INV)',
    color: '#51cf66',
    desc: 'SM writes to L1 (Modified), then evicts to L2 and broadcasts INV to invalidate other SMs\' copies.',
    watch: 'See INV packets fan out to actual sharers identified by the Coherency Directory. '
  },
  invalidate: {
    title: 'Broadcast Invalidation',
    color: '#f06595',
    desc: 'A global coherency event — a write happened somewhere and all cached copies of that address must be dropped. The coherency bus broadcasts INV to every SM simultaneously.',
    watch: 'INV packets fire from the bus center to all SMs in parallel. Each SM\'s L1 transitions to Invalid (grey). Cost scales linearly with SM count — this is why write-heavy kernels are expensive.'
  },
  writeback: {
    title: 'Write-Back Cascade (L1→L2→DRAM)',
    color: '#ffa94d',
    desc: 'A dirty L1 line is being evicted (capacity pressure). It writes to L2. If L2 is also full, the victim cascades all the way to DRAM through the memory controller.',
    watch: 'The full eviction chain: WB particle L1→Bus→L2, then EVICT particle L2→Crossbar→Global Mem→HBM. The HBM block flashes purple at the end — data is now only in DRAM.'
  },
  shared: {
    title: 'Shared Memory Access ',
    color: '#51cf66',
    desc: 'Threads access __shared__ SRAM via LDS/STS — no coherency protocol, no bus traffic, no L2 involvement. Pure on-chip speed. ',
    watch: 'Notice: no bus or L2 activity at all. The particles stay entirely inside the SM. SMEM is completely SM-private — no coherency needed.'
  },
  atomic: {
    title: '⚛ atomicAdd — Hardware Serialization',
    color: '#f59e0b',
    desc: 'Multiple SMs simultaneously call atomicAdd() to the same address. Without an arbiter, two SMs could both read the value, add to it, and one result gets silently lost. The Apex Arbiter prevents this by serializing all requests with sequence numbers.',
    watch: 'Watch ATOM packets queue in the Arbiter panel (hover it to expand). Each gets a SEQ#. GRANTs fire one at a time. The contention meter shows the serialization cost.'
  },
  reg_spill: {
    title: 'Register Spill — Regs → L1 → L2',
    color: '#fb923c',
    desc: 'A warp runs out of physical registers. The compiler spills excess live values to L1 cache, stalling the warp. If L1 is full, the spill cascades to L2 (~200 cycles). When the value is needed again, a RELOAD brings it back.',
    watch: 'See the SPILL particle travel from the register file into L1. If L1 is under pressure, watch it cascade all the way to L2. Then the RELOAD particle comes back — that entire round-trip is latency the warp is stalled for.'
  },
  flush: {
    title: '⚡ Flush — Drain All Caches to HBM',
    color: '#f97316',
    desc: '__threadfence() / cudaDeviceSynchronize() triggers a full cache flush. All dirty L1 lines write back to L2. All dirty L2 lines drain to HBM through the memory controllers. After flush, HBM is authoritative — every SM sees coherent data.',
    watch: 'Watch the cascade: L1 WBs land in L2 (orange), then L2 dirty lines drain through the crossbar to Global Mem, then STORE to HBM (purple flash). After completion all L1 lines go Invalid and L2 lines go clean (blue).'
  },
};

var scenarioTooltipEl = document.getElementById('scenario-tooltip');
var scenarioVisible = false;


function showScenarioTooltip(key, clientX, clientY) {
  var info = SCENARIO_INFO[key];
  if (!info) return;
  document.getElementById('st-dot').style.background = info.color;
  scenarioTooltipEl.style.borderColor = info.color + '50';
  document.getElementById('st-title-text').textContent = info.title;
  document.getElementById('st-desc-text').textContent = info.desc;
  document.getElementById('st-watch-text').textContent = info.watch;
  positionScenarioTooltip(clientX, clientY);
  scenarioTooltipEl.classList.add('visible');
  scenarioVisible = true;
}

function hideScenarioTooltip() {
  scenarioTooltipEl.classList.remove('visible');
  scenarioVisible = false;
}

function positionScenarioTooltip(clientX, clientY) {
  var tw = 300, th = 200;
  var vw = window.innerWidth, vh = window.innerHeight;
  var tx = clientX - tw / 2;
  var ty = clientY - th - 14; // above the button
  if (tx + tw > vw - 10) tx = vw - tw - 10;
  if (tx < 8) tx = 8;
  if (ty < 8) ty = clientY + 40; // flip below if no room above
  scenarioTooltipEl.style.left = tx + 'px';
  scenarioTooltipEl.style.top  = ty + 'px';
}

// Attach hover listeners to scenario buttons
document.querySelectorAll('.scenario-btn').forEach(function(btn) {
  var key = btn.getAttribute('data-scenario');
  btn.addEventListener('mouseenter', function(e) {
    showScenarioTooltip(key, e.clientX, e.clientY);
  });
  btn.addEventListener('mousemove', function(e) {
    positionScenarioTooltip(e.clientX, e.clientY);
  });
  btn.addEventListener('mouseleave', function() {
    hideScenarioTooltip();
  });
});
