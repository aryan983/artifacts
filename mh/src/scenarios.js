ide of SM0 (leftmost SM, opens left into margin)
  var regs0 = null;
  for (var i=0;i<sm0.sub.length;i++) if(sm0.sub[i].type==='regs') regs0=sm0.sub[i];
  if (regs0 && !mob) addCallout('regs-idle', regs0.x, regs0.y + regs0.h/2,
    'Register file', 'spills to L1 when full',
    '#fb923c', { side:'left', life:18, fadeDelay:0.15 });

  // L1 — LEFT side of SM0
  var l10 = sm0.l1;
  addCallout('l1-idle', l10.x, l10.y + l10.h/2,
    '16-line L1', '~28 cycle hit',
    '#ff6b6b', { side:'left', life:18, fadeDelay:0.4, offsetY: 14 });

  // SMEM — RIGHT side of last SM
  var smemLast = null;
  for (var i=0;i<lastSM.sub.length;i++) if(lastSM.sub[i].type==='smem') smemLast=lastSM.sub[i];
  if (smemLast) addCallout('smem-idle', smemLast.x + smemLast.w, smemLast.y + smemLast.h/2,
    'SMEM', 'no coherency · SM-private',
    '#51cf66', { side:'right', life:18, fadeDelay:0.7 });

  // Bus — LEFT anchor, box goes further left
  var bus = layout.bus;
  addCallout('bus-idle', bus.x1 + 6, bus.y,
    'Coherency Bus', 'INVs broadcast here',
    '#f06595', { side:'left', life:18, fadeDelay:1.0 });

  // Arbiter (Apex only) — RIGHT edge
  if (layout.arbiter) {
    var arb = layout.arbiter;
    addCallout('arb-idle', arb.x, arb.y + arb.h/2,
      'Apex Arbiter', 'serializes all atomics',
      '#f59e0b', { side:'left', life:18, fadeDelay:1.2 });
  }

  // L2 — RIGHT edge
  var l2 = layout.l2;
  addCallout('l2-idle', l2.x, l2.y + l2.h/2,
    '64MB unified L2', 'write-back · ~200cyc',
    '#ffa94d', { side:'left', life:18, fadeDelay:1.5 });

  // Global Memory Interface — bottom left
  if (layout.globalMem) {
    var gm = layout.globalMem;
    addCallout('gm-idle', gm.x, gm.y + gm.h/2,
      'Global Mem I/F', '4 memory controllers · routes to HBM',
      '#339af0', { side:'left', life:18, fadeDelay:1.8 });
  }

  // HBM4 — bottom left
  if (layout.hbm) {
    var hbm = layout.hbm;
    addCallout('hbm-idle', hbm.x, hbm.y + hbm.h/2,
      'HBM4', '~400cyc off-chip · high-bandwidth DRAM',
      '#845ef7', { side:'left', life:18, fadeDelay:2.1 });
  }
}

// ── Reactive callouts: shown after a scenario completes ───────────────────
// smIdx = the SM that actually did the operation (corrected after write reassigns si)
// addrN = address name string e.g. "A05", or "" if not address-specific
// isL1Hit = for read, distinguishes hit vs miss path
function showReactiveCallouts(type, smIdx, addrN, opts) {
  // Fade out existing rather than hard-clear — let tickCallouts clean them
  var hasVisible = callouts.some(function(c){ return c.alpha > 0.05; });
  if (hasVisible) {
    callouts.forEach(function(c){
      c.targetAlpha = 0;
      c.permanent = false;
      // Idle callouts get a graceful fade; reactive get a quick exit
      c.life = c.id && c.id.indexOf('-idle') >= 0 ? 1.2 : 0.3;
    });
  } else {
    callouts = [];
  }

  var o = opts || {};
  var sm = layout.sms[smIdx];
  if (!sm) return;
  var l1  = sm.l1;
  var l2  = layout.l2;
  var hbm = layout.hbm;
  var bus = layout.bus;
  var LIFE = 9;
  var addrSub = addrN ? addrN + ' ' : '';
  var smCount = layout.sms.length;

  // PCB routing: SM0 and SM1 → box on the LEFT margin
  //              SM2 and SM3 → box on the RIGHT margin
  // SM1 trace must route AROUND SM0 (go up, across, down into left margin)
  // SM2 trace must route AROUND SM3 (go up, across, down into right margin)
  var smOnLeft = smIdx < smCount / 2;  // SM0,1 → left; SM2,3 → right
  var l1Ax = smOnLeft ? l1.x : l1.x + l1.w;
  var l1Side = smOnLeft ? 'left' : 'right';
  var l1FadeDelay = hasVisible ? 0.5 : 0.1;
  // routeAround: for SM1 going left, it needs to detour around SM0
  // for SM2 going right, detour around SM3
  // Encode as smIdx so drawCallouts can compute the correct waypoints

  if (type === 'read') {
    var isHit = !!o.l1Hit;
    addCallout('r-l1', l1Ax, l1.y + l1.h/2,
      isHit ? 'L1 Hit ✓' : 'Now Shared',
      addrSub + (isHit ? '~28 cycles, no bus' : 'clean copy from L2'),
      '#339af0', { side:l1Side, smIdx:smIdx, life:LIFE, fadeDelay:l1FadeDelay  });
    if (!isHit) {
      addCallout('r-l2', l2.x, l2.y + l2.h/2,
        o.l2Hit ? 'L2 served it' : 'L2 miss → DRAM',
        o.l2Hit ? '~200cyc, no DRAM' : '~400cyc round-trip',
        '#ffa94d', { side:'left', life:LIFE, fadeDelay: 0.05 });
      if (!o.l2Hit) {
        // DRAM miss — show GlobalMem interface and HBM
        var gm = layout.globalMem;
        if (gm) addCallout('r-gm', gm.x + gm.w, gm.y + gm.h/2,
          'Global Mem I/F',
          'routes miss to HBM',
          '#339af0', { side:'right', life:LIFE, fadeDelay:0.4 });
        if (hbm) addCallout('r-hbm', hbm.x + hbm.w/2, hbm.y,
          'HBM4',
          '~400cyc · off-chip DRAM',
          '#845ef7', { side:'up', life:LIFE, fadeDelay:0.8 });
      }
    }
  }

  if (type === 'write') {
    addCallout('w-l1', l1Ax, l1.y + l1.h/2,
      'Modified',
      addrSub + 'dirty — write-evict to L2',
      '#51cf66', { side:l1Side, smIdx:smIdx, life:LIFE, fadeDelay:l1FadeDelay  });
    addCallout('w-bus', bus.x1 + 10, bus.y,
      'INV fired',
      'stale copies dropped',
      '#f06595', { side:'left', life:LIFE, fadeDelay:l1FadeDelay + 0.5, offsetX:-8 });
  }

  if (type === 'invalidate') {
    var invCount = (o.invCount !== undefined) ? o.invCount : layout.sms.length;
    addCallout('inv-bus', bus.x1 + 6, bus.y,
      'INV broadcast',
      invCount + ' SM' + (invCount !== 1 ? 's' : '') + ' invalidated',
      '#f06595', { side:'left', life:LIFE, fadeDelay:0.2 });
  }

  if (type === 'writeback') {
    addCallout('wb-l1', l1Ax, l1.y + l1.h/2,
      'Line evicted',
      'dirty → L2',
      '#ffa94d', { side:l1Side, smIdx:smIdx, life:LIFE, fadeDelay:l1FadeDelay  });
    addCallout('wb-l2', l2.x, l2.y + l2.h/2,
      'L2 absorbed',
      'dirty retained in L2',
      '#ffa94d', { side:'left', life:LIFE, fadeDelay:l1FadeDelay + 0.6 });
  }

  if (type === 'flush') {
    addCallout('fl-l2', l2.x, l2.y + l2.h/2,
      'L2 clean',
      'all dirty lines drained',
      '#51cf66', { side:'left', life:LIFE, fadeDelay:0.3 });
    addCallout('fl-hbm', hbm.x + hbm.w/2, hbm.y + hbm.h,
      'HBM authoritative',
      'ground truth is here',
      '#845ef7', { side:'down', life:LIFE, fadeDelay:1.0, offsetY:4 });
  }

  if (type === 'atomic') {
    // No summary callouts — progress bars shown during processing instead
  }

  if (type === 'reg_spill') {
    var regs = null;
    for (var i=0;i<sm.sub.length;i++) if(sm.sub[i].type==='regs') regs=sm.sub[i];
    var regAx = smOnLeft ? (regs ? regs.x : l1Ax) : (regs ? regs.x + regs.w : l1Ax);
    if (regs) addCallout('rs-regs', regAx, regs.y + regs.h/2,
      'Reg file full',
      'compiler spills to L1',
      '#fb923c', { side:l1Side, smIdx:smIdx, life:LIFE, fadeDelay:l1FadeDelay  });
    addCallout('rs-l1', l1Ax, l1.y + l1.h/2,
      'Spill target',
      '~28cyc if L1 hit',
      '#fb923c', { side:l1Side, smIdx:smIdx, life:LIFE, fadeDelay:l1FadeDelay + 0.5  });
  }

  if (type === 'shared') {
    var smem = null;
    for (var i=0;i<sm.sub.length;i++) if(sm.sub[i].type==='smem') smem=sm.sub[i];
    var smemAx = smem ? (smOnLeft ? smem.x : smem.x + smem.w) : l1Ax;
    if (smem) addCallout('sh-smem', smemAx, smem.y + smem.h/2,
      'SMEM hit',
      'no bus, no coherency',
      '#51cf66', { side:l1Side, smIdx:smIdx, life:LIFE, fadeDelay:l1FadeDelay  });
    addCallout('sh-bus', bus.x1 + 10, bus.y,
      'Bus idle',
      'SMEM bypasses coherency',
      '#6b7094', { side:'left', life:LIFE, fadeDelay:l1FadeDelay + 0.5, offsetX:-8 });
  }
}



function flashL1Slot(smIdx, addr, color) {
  if (!cacheState[smIdx] || !layout.sms || !layout.sms[smIdx]) return;
  var lines = cacheState[smIdx].l1;
  var slotIdx = -1;
  if (addr >= 0) {
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].addr === addr) { slotIdx = i; break; }
    }
  }
  if (slotIdx === -1) {
    for (var j = lines.length - 1; j >= 0; j--) {
      if (lines[j].s > 0) { slotIdx = j; break; }
    }
  }
  if (slotIdx === -1) return;
  // Remove any existing flash for same slot to avoid stacking
  slotFlashEffects = slotFlashEffects.filter(function(e){ return !(e.smIdx===smIdx && e.slotIdx===slotIdx); });
  slotFlashEffects.push({ smIdx: smIdx, slotIdx: slotIdx, c: color, t: 0, dur: 0.7 });
}

// Get the register file block for SM i (returns null if not found)
function regsBlock(i) {
  var sm = layout.sms[i];
  for (var bi = 0; bi < sm.sub.length; bi++) { if (sm.sub[bi].type === 'regs') return sm.sub[bi]; }
  return null;
}
// Centre of register file block (or top of SM body as fallback)
function regsPos(i) {
  var b = regsBlock(i);
  if (b) return { x: b.x + b.w/2, y: b.y + b.h/2 };
  var sm = layout.sms[i]; return { x: sm.x + sm.w/2, y: sm.y + 30 };
}
// Get a named sub-block for SM i by type
function subBlock(smIdx, type) {
  var sm = layout.sms[smIdx];
  for (var bi = 0; bi < sm.sub.length; bi++) { if (sm.sub[bi].type === type) return sm.sub[bi]; }
  return null;
}


// ── scenarios.js ──────────────────────────────────────────
// scenarios.js — GPU Cache Coherency Demo
// Cache scenario triggers, explanations, auto mode

function getExplanation(type) {
  var e = {
    read:{ title:'L1 Read Miss → L2 Fetch', color:'#ff6b6b',
      steps:[
        {text:'<strong>Warp issues load</strong> — global memory read.', micro:'LD.E Rx, [addr]', delay:0},
        {text:'<strong>L1 tag lookup: MISS</strong>', micro:'Tag compare → miss', delay:700},
        {text:'<strong>Request to L2</strong>', micro:'RdReq → Bus → L2', delay:1500},
        {text:'<strong>L2 hit</strong> — data read from L2.', micro:'L2 64MB slice lookup', delay:2500},
        {text:'<strong>Data returns</strong> — cache line fills L1.', micro:'DATA → SM L1 fill', delay:3300},
        {text:'<strong>L1 → Shared</strong>', micro:'State: Invalid → Shared', delay:4000},
      ], summary: 'Standard read miss path.'
    },
    write:{ title:'SM Write → Invalidate Others', color:'#51cf66',
      steps:[
        {text:'<strong>Warp issues store</strong>', micro:'ST.E [addr], Rx', delay:0},
        {text:'<strong>L1 → Modified</strong> — write-evict policy.', micro:'Write-evict: L1 drop + L2 write', delay:500},
        {text:'<strong>Invalidation fires</strong> — directory lookup', micro:'INV → only SMs with a copy', delay:1200},
        {text:'<strong>Remote L1s invalidated</strong>', micro:'Other SMs: * → Invalid', delay:2000},
        {text:'<strong>Coherency restored</strong>', micro:'Single-writer invariant', delay:2800},
      ], summary:'Write-evict: L1 line dropped, L2 gets the write. Directory targets only actual sharers.'
    },

    invalidate:{ title:'Broadcast Invalidation', color:'#f06595',
      steps:[
        {text:'<strong>Coherency event</strong>', micro:'SM write or host DMA', delay:0},
        {text:'<strong>Bus broadcasts INV</strong>', micro:'INV(addr) → all SMs', delay:600},
        {text:'<strong>L1 tags probed</strong>', micro:'Parallel tag lookup', delay:1200},
        {text:'<strong>All copies dropped</strong>', micro:'All: * → Invalid', delay:2200},
      ], summary:'Broadcast invalidation scales linearly with SM count.'
    },
    writeback:{ title:'Write-Back → L2 → HBM4', color:'#ffa94d',
      steps:[
        {text:'<strong>L1 eviction</strong> — dirty line needs to leave L1.', micro:'Capacity eviction or flush', delay:0},
        {text:'<strong>Data → L2</strong>', micro:'WB+DATA → L2 slice', delay:800},
        {text:'<strong>L2 absorbs</strong>', micro:'L2 write', delay:1800},
        {text:'<strong>L2 eviction</strong> — if full, victim evicted to DRAM.', micro:'LRU victim → NoC → MC', delay:3000},
        {text:'<strong>HBM4 write</strong>', micro:'MC → bank write', delay:4000},
        {text:'<strong>Stored in HBM4</strong>', micro:'~400+ cycles total', delay:4800},
      ], summary:'Full eviction cascade: L1→L2→MC→DRAM.'
    },
    shared:{ title:'Shared Memory Access', color:'#51cf66',
      steps:[
        {text:'<strong>Thread accesses __shared__</strong>', micro:'LDS Rx, [smem_addr]', delay:0},
        {text:'<strong>Direct SRAM access</strong> — no coherency.', micro:'~20 cycles, 32 banks', delay:500},
        {text:'<strong>Bank conflict check</strong>', micro:'Best: 1 cycle. Worst: 32-way', delay:1100},
        {text:'<strong>SM-local only</strong> — no bus traffic.', micro:'Scope: CTA local', delay:1600},
      ], summary:'Shared memory sidesteps coherency by being SM-private. No bus, no L2, no INV needed.'
    },

    atomic:{ title: currentArch==='apex' ? '⚛ atomicAdd → Apex Arbiter (SEQ# + ROB)' : '⚛ atomicAdd → Raw L2 Serialization', color:'#f59e0b',
      steps: currentArch==='apex' ? [
        {text:'<strong>All SMs issue atomicAdd</strong> simultaneously', micro:'ATOM → coherency bus', delay:0},
        {text:'<strong>ATOM packets hit the Arbiter</strong> — each gets a SEQ#', micro:'Arbiter: seq++ per request', delay:500},
        {text:'<strong>Arbiter queues requests</strong> — up to 6 deep', micro:'Round-robin grant policy', delay:1100},
        {text:'<strong>GRANT fires</strong> to front-of-queue SM', micro:'GRANT → SM: exclusive access', delay:1800},
        {text:'<strong>SM does read-modify-write</strong> on L2', micro:'ATOM → L2 RMW → ACK', delay:2600},
        {text:'<strong>ACK returns → ROB retires</strong> in SEQ order', micro:'ROB: #N retired → next SM', delay:3400},
        {text:'<strong>DATA sent back</strong> to originating SM', micro:'DATA#N → SM L1', delay:4200},
      ] : [
        {text:'<strong>All SMs issue atomicAdd</strong> simultaneously', micro:'ATOM → bus (no coordination)', delay:0},
        {text:'<strong>All ATOM packets race for L2</strong>', micro:'L2 serializes them internally', delay:600},
        {text:'<strong>L2 locks the cache line</strong> for each ATOM', micro:'One SM at a time — slow', delay:1400},
        {text:'<strong>DATA returns</strong> to each SM in turn', micro:'No ROB — order not guaranteed', delay:2400},
        {text:'<strong>On Apex</strong>: an explicit Arbiter would handle this cleanly', micro:'SEQ# + ROB = ordered, visible', delay:3200},
      ],
      summary: currentArch==='apex'
        ? 'Arbiter: SEQ# tags enable ROB ordering. Contention meter shows cost of serialization.'
        : 'Without an arbiter, atomics serialize hidden inside L2 — no visibility, high latency. Switch to Apex to see the full arbiter system.'
    },
    reg_spill: { title:'Register Spill → L1 → L2', color:'#fb923c',
      steps:[
        {text:'<strong>Register pressure</strong> — warp exceeds physical register file.', micro:'Compiler emits spill code', delay:0},
        {text:'<strong>SPILL to L1</strong> — excess live value written to L1 cache.', micro:'SPILL Rx → [L1 addr]', delay:700},
        {text:'<strong>L1 hit (best case)</strong> — spill absorbed, ~28 cycle penalty.', micro:'L1 tag lookup → hit', delay:1500},
        {text:'<strong>L1 full → cascade to L2</strong> — spill misses L1, goes to L2.', micro:'SPILL → RdReq → Bus → L2', delay:2400},
        {text:'<strong>RELOAD</strong> — value fetched back when needed.', micro:'RELOAD Rx ← [L1/L2 addr]', delay:3400},
        {text:'<strong>Warp resumes</strong> — register restored, execution continues.', micro:'~28–200 cycle stall total', delay:4200},
      ], summary:'Register spills are invisible in source but devastating in perf — they turn register accesses into cache traffic.'
    },
  };
  return e[type];
}

function showExplanation(type) {
  var exp = getExplanation(type); if (!exp) return;
  stepTimers.forEach(function(t){clearTimeout(t);}); stepTimers=[];
  var titleEl=document.getElementById('explainer-title');
  titleEl.innerHTML='<span class="dot" style="background:'+exp.color+'"></span> '+exp.title;
  titleEl.style.color=exp.color;
  var listEl=document.getElementById('step-list'); listEl.innerHTML='';
  var sumEl=document.getElementById('explainer-summary'); sumEl.textContent=''; sumEl.classList.remove('visible');
  exp.steps.forEach(function(s,i) {
    var li=document.createElement('li');
    var microText = s.micro;
    var microHtml = microText.replace(/\b(LD\.E|ST\.E|LDS|STS|ST\.S|RdReq|INV|DATA|WR|WB|RMW|EVICT|STORE|DSMEM|cp\.async|SPILL|RELOAD|TILE)\b/g, function(m) {
      return '<span class="micro-instr" data-instr="'+m+'" style="cursor:help;text-decoration:underline dotted;text-decoration-color:rgba(255,255,255,0.3)">'+m+'</span>';
    });
    li.innerHTML='<span class="step-num" style="background:'+exp.color+'20;color:'+exp.color+'">'+(i+1)+'</span><span class="step-text">'+s.text+'<span class="micro">'+microHtml+'</span></span>';
    listEl.appendChild(li);
    stepTimers.push(setTimeout(function() {
      var actives=listEl.querySelectorAll('li.active');
      for(var k=0;k<actives.length;k++){actives[k].classList.remove('active');actives[k].classList.add('past');}
      li.classList.add('visible','active');
    }, s.delay));
  });
  stepTimers.push(setTimeout(function() {
    sumEl.textContent=exp.summary; sumEl.classList.add('visible');
    var actives=listEl.querySelectorAll('li.active');
    for(var k=0;k<actives.length;k++){actives[k].classList.remove('active');actives[k].classList.add('past');}
  }, exp.steps[exp.steps.length-1].delay+1000));
}

var _currentOpId = 0;  // increments on each triggerScenario call

function logEvent(msg, color, opId) {
  var log=document.getElementById('event-log');
  var e=document.createElement('div'); e.className='log-entry';
  e.innerHTML='<span class="tag" style="background:'+color+'30;color:'+color+'">'+new Date().toLocaleTimeString().slice(0,8)+'</span> '+msg;
  log.prepend(e); if(log.children.length>40) log.lastChild.remove();
  // Mirror to pause panel only if this log belongs to the current operation
  if (sidePanelOpen && (!opId || opId === _currentOpId)) sideLog(msg, color);
}

// ── Pause panel ───────────────────────────────────────────────────────────────
var sidePanelOpen = false;
var sideStepCount = 0;

// Plain-English rewrites for common log fragments
function sideLogPlain(msg) {
  var m = msg;

  // ── READ: L1 hit ─────────────────────────────────────────────────────────
  // "SM2: L1 HIT A07 — no bus traffic"
  m = m.replace(/(SM\d+): L1 HIT (\w+) — no bus traffic/,
    '$1 already has $2 in its L1 cache — served instantly, no bus traffic at all.');
  // "SM2: A07 delivered from L1 (~28 cycles)"
  m = m.replace(/(SM\d+): (\w+) delivered from L1 \(~(\d+) cycles\)/,
    '$1 received $2 from L1 in ~$3 cycles — fastest possible path.');

  // ── READ: L1 miss → L2 hit ────────────────────────────────────────────────
  // "SM2: L1 MISS A18 → L2 HIT"
  m = m.replace(/(SM\d+): L1 MISS (\w+) → L2 HIT/,
    '$1 looked up $2 in its L1 — not there. Requesting from L2.');
  // "L2: HIT A18 — serving to SM2"
  m = m.replace(/L2: HIT (\w+) — serving to (SM\d+)/,
    'L2 has $1 cached — sending it to $2. No DRAM access needed.');
  // "SM2: L1 → Shared A18 (L2 hit)"
  m = m.replace(/(SM\d+): L1 → Shared (\w+) \(L2 hit\)/,
    '$1 loaded $2 into L1 from L2. L1 state set to Shared — $2 is a clean copy.');

  // ── READ: cold miss → DRAM ───────────────────────────────────────────────
  // "SM2: L1 MISS A18 → L2 MISS → DRAM"
  m = m.replace(/(SM\d+): L1 MISS (\w+) → L2 MISS → DRAM/,
    '$1 looked up $2 — missed in both L1 and L2. Fetching from HBM (~400 cycle penalty).');
  // "L2: MISS A18 — fetching from HBM"
  m = m.replace(/L2: MISS (\w+) — fetching from HBM/,
    'L2 also missed $1 — issuing a read request down to HBM.');
  // "L2: A18 installed from DRAM"
  m = m.replace(/L2: (\w+) installed from DRAM/,
    '$1 returned from HBM and installed into L2.');
  // "SM2: L1 → Shared A18 (DRAM via L2)"
  m = m.replace(/(SM\d+): L1 → Shared (\w+) \(DRAM via L2\)/,
    '$1 received $2 via L2 from HBM. L1 state: Shared — $2 is now cached.');

  // ── WRITE: write-evict + targeted INV ────────────────────────────────────
  // ── WRITE: write-hit ─────────────────────────────────────────────────────
  // "SM2: Write HIT A07 → Modified, evict to L2, INV 2 sharer(s)"
  m = m.replace(/(SM\d+): Write HIT (\w+) → Modified.*?INV (\d+) sharer/,
    '$1 has $2 in L1 and is writing to it. Line marked Modified. $3 other SM(s) hold stale copies — sending targeted invalidations to them now.');
  m = m.replace(/(SM\d+): Write HIT (\w+) → Modified.*?no sharers/,
    '$1 has $2 in L1 and is writing to it. Line marked Modified. No other SM holds a copy — no invalidations needed.');

  // ── WRITE: write-miss ─────────────────────────────────────────────────────
  // "SM2: Write miss A07 → write-evict to L2 (no INV)"
  // "no INV" here = address not present in any L1, so no stale copies exist.
  m = m.replace(/(SM\d+): Write miss (\w+) → write-evict to L2 \(no INV\)/,
    '$1 tried to write $2 but it is not in L1. The store goes directly to L2 (write-evict). No other SM holds $2 in their L1, so no invalidations are sent.');

  // ── WRITE: INV ────────────────────────────────────────────────────────────
  m = m.replace(/(SM\d+): (\w+) invalidated \(targeted\)/,
    '$1 held a stale copy of $2 — it has been invalidated (targeted, not broadcast).');
  m = m.replace(/(SM\d+): (\w+) invalidated$/,
    '$1 held a copy of $2 — invalidated to maintain coherency.');
  m = m.replace(/(SM\d+): No sharers of (\w+) — no INV needed/,
    'No other SM holds $2 — no invalidation traffic generated.');

  // ── WRITE: broadcast INV ─────────────────────────────────────────────────
  m = m.replace(/INV\((\w+)\) → (\d+) SM/,
    'Broadcasting invalidation for $1 to $2 SM(s) that hold stale copies.');

  // ── WRITE-BACK ────────────────────────────────────────────────────────────
  m = m.replace(/(SM\d+): Write-back → L2 \(1 dirty line evicted\)/,
    '$1\'s L1 is under capacity pressure — evicting one dirty line to L2 to free space.');
  m = m.replace(/(SM\d+): all lines written back, L1 → Shared/,
    '$1 finished writing all dirty lines back to L2. L1 is now clean (Shared).');
  m = m.replace(/L2: Write-back received — 1 dirty line installed/,
    'L2 received the evicted dirty line from L1 and stored it.');

  // ── FLUSH ────────────────────────────────────────────────────────────────
  m = m.replace(/FLUSH initiated — draining all dirty lines to DRAM/,
    'Flush triggered (__threadfence / cudaDeviceSynchronize) — draining all dirty data from every L1 and L2 down to HBM.');
  m = m.replace(/(SM\d+): flushing dirty lines → L2/,
    '$1 is writing its dirty L1 lines back to L2 as part of the flush.');
  m = m.replace(/L2: all dirty lines draining to DRAM/,
    'All L1 write-backs landed in L2. Now draining L2 dirty lines to HBM.');
  m = m.replace(/HBM: (\d+) dirty line\(s\) written — flush complete/,
    '$1 dirty line(s) written to HBM. The entire hierarchy is now coherent.');
  m = m.replace(/FLUSH complete — all caches clean, HBM authoritative/,
    'Flush complete — L1, L2, and HBM all agree. HBM holds the authoritative data.');

  // ── ATOMIC ───────────────────────────────────────────────────────────────
  m = m.replace(/atomicAdd target: (\w+)/,
    'All SMs will fight for exclusive access to $1. Only one wins the lock at a time.');
  m = m.replace(/ATOM\((\w+)\) granted to (SM\d+)/,
    '$2 won the atomic lock on $1 — executing read-modify-write exclusively.');
  m = m.replace(/(SM\d+): RMW complete on (\w+)/,
    '$1 finished its atomic read-modify-write on $2. Updated value written back to L2.');

  // ── REG SPILL ────────────────────────────────────────────────────────────
  m = m.replace(/(SM\d+):.*register.*spill/i,
    '$1\'s register file is full — spilling values to L1 as scratch space (SPILL).');
  m = m.replace(/(SM\d+):.*reload/i,
    '$1 reloading spilled values from L1 back into registers (RELOAD).');

  return m;
}

function sideLog(msg, color) {
  var log = document.getElementById('pp-log');
  if (!log) return;
  var empty = document.getElementById('pp-empty');
  if (empty) { empty.style.display = 'none'; }
  sideStepCount++;
  var entry = document.createElement('div');
  entry.className = 'pp-entry new';
  entry.style.setProperty('--pp-accent', color);
  var plain = sideLogPlain(msg);
  entry.innerHTML =
    '<span class="pp-step-num" style="background:'+color+'22;color:'+color+'">'+sideStepCount+'</span>' +
    plain;
  log.appendChild(entry);
  // Animate in
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      entry.classList.add('show');
      // Scroll to bottom
      log.scrollTop = log.scrollHeight;
      // After a moment, de-emphasise so next entry stands out
      setTimeout(function() { entry.classList.remove('new'); }, 1800);
    });
  });
}

function openSidePanel(opType) {
  sidePanelOpen = true;
  sideStepCount = 0;
  // Open the panel — resize() will compute correct canvas width accounting for
  // info-panel + step-log so diagram scales proportionally, not squishes.
  var wrap = document.getElementById('pause-panel-wrap');
  if (wrap) wrap.classList.add('open');
  // Let the DOM settle then recompute layout at correct reduced width
  setTimeout(function() { 
    if (canvas) { canvas.style.width = ''; canvas.style.flexShrink = ''; }
    if (typeof resize === 'function') resize(true); 
  }, 20);

  var opColors = {
    read:'#339af0', write:'#51cf66', invalidate:'#f06595',
    writeback:'#ffa94d', flush:'#f97316', atomic:'#f59e0b',
    reg_spill:'#a78bfa', shared:'#22d3ee'
  };
  var opLabels = {
    read:'SM Read', write:'SM Write', invalidate:'Invalidate',
    writeback:'Write-Back', flush:'Flush', atomic:'atomicAdd',
    reg_spill:'Reg Spill', shared:'Shared Mem'
  };
  var c = opColors[opType] || '#845ef7';
  var label = opLabels[opType] || opType;

  // Update badge
  _currentOpId++;  // new operation — stale callbacks from old op won't match
  var badge = document.getElementById('pp-op-badge');
  if (badge) {
    badge.textContent = label;
    badge.style.background = c + '22';
    badge.style.color = c;
    badge.style.border = '1px solid ' + c + '55';
  }

  // Insert a section header into the log separating this op from previous ones
  var log = document.getElementById('pp-log');
  if (log) {
    var emp = document.getElementById('pp-empty');
    if (emp) emp.style.display = 'none';
    var hasEntries = log.querySelectorAll('.pp-entry, .pp-op-header').length > 0;
    var hdr = document.createElement('div');
    hdr.className = 'pp-op-header';
    hdr.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 0 3px;margin-top:'+(hasEntries?'10px':'0');
    hdr.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+c+';flex-shrink:0"></span>'
      + '<span style="font-size:.65rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:'+c+'">'+label+'</span>'
      + '<span style="flex:1;height:1px;background:'+c+'30;margin-left:2px"></span>';
    log.appendChild(hdr);
    log.scrollTop = log.scrollHeight;
  }
}

function closeSidePanel() {
  if (sortRunning || programMode) stopProgram();
  sidePanelOpen = false;
  var wrap = document.getElementById('pause-panel-wrap');
  if (wrap) {
    wrap.classList.remove('open');
    // Restore fluid canvas width after panel has animated closed
    setTimeout(function() {
      if (canvas) { canvas.style.width = ''; canvas.style.flexShrink = ''; }
      if (typeof resize === 'function') resize(true);
    }, 370);
  }
  // Reset log for next manual session
  var log = document.getElementById('pp-log');
  if (log) log.innerHTML = '<div class="pp-empty" id="pp-empty">Press any operation button to see a plain&#8209;English walkthrough of each step here.</div>';
  sideStepCount = 0;
}


// ═══════════════════════════════════════════════════════════════════════════
// PROGRAMS SYSTEM — Bubble Sort
// ═══════════════════════════════════════════════════════════════════════════

var programMode = false;       // true while a program is running
var sortRunning = false;
var sortValues  = [];          // e.g. [4,2,7,1,5]
var sortAddrs   = [];          // indices into ADDR_NAMES, e.g. [0,1,2,3,4]
var sortSortedMask = [];       // which positions are confirmed sorted
var selectedProgram = 'bubble_sort';

// ── Modal open/close ────────────────────────────────────────────────────────
function openProgramsModal() {
  document.getElementById('programs-modal').style.display = 'flex';
  document.getElementById('pm-numbers').focus();
  updatePmPreview();
}
function closeProgramsModal() {
  document.getElementById('programs-modal').style.display = 'none';
}
function selectProgram(id) {
  selectedProgram = id;
  document.querySelectorAll('.pm-prog-card').forEach(function(c) {
    c.classList.toggle('active', c.onclick.toString().indexOf(id) !== -1);
  });
}

// ── Live preview of numbers ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  var inp = document.getElementById('pm-numbers');
  if (inp) inp.addEventListener('input', updatePmPreview);
});
function updatePmPreview() {
  var inp = document.getElementById('pm-numbers');
  var prev = document.getElementById('pm-preview');
  var err  = document.getElementById('pm-error');
  if (!inp || !prev) return;
  var raw = inp.value.trim().split(/[\s,]+/).filter(Boolean);
  err.textContent = '';
  prev.innerHTML = '';
  if (!raw.length) return;
  var nums = raw.map(Number);
  if (nums.some(isNaN)) { err.textContent = 'Only numbers please.'; return; }
  if (nums.length !== 3) { err.textContent = 'Enter exactly 3 numbers.'; return; }
  if (nums.some(function(n){ return n < 0 || n > 99; })) {
    err.textContent = 'Numbers must be 0–99.'; return;
  }
  nums.forEach(function(n, i) {
    var box = document.createElement('div');
    box.className = 'sort-box';
    box.innerHTML =
      '<div class="sort-box-val">' + n + '</div>' +
      '<div class="sort-box-addr">' + (ADDR_NAMES ? ADDR_NAMES[i] : 'A0'+i) + '</div>';
    prev.appendChild(box);
  });
}

// ── Run ─────────────────────────────────────────────────────────────────────
function runProgram() {
  var inp = document.getElementById('pm-numbers');
  var raw = inp.value.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  var err = document.getElementById('pm-error');
  if (raw.length !== 3 || raw.some(isNaN) || raw.some(function(n){ return n<0||n>99; })) {
    err.textContent = 'Enter exactly 3 numbers between 0 and 99.'; return;
  }
  closeProgramsModal();
  startBubbleSort(raw);
}

// ── Start sort ───────────────────────────────────────────────────────────────
function startBubbleSort(nums) {
  // Stop auto, disable scenario buttons
  if (autoMode) { autoMode = false; autoTimer = 0; var b = document.getElementById('btn-auto'); if(b) b.classList.remove('active'); }
  programMode = true;
  sortRunning = true;
  clearCallouts();
  sortValues  = nums.slice();
  sortAddrs   = [0,1,2];  // A00-A02
  sortSortedMask = [false,false,false];

  // Mark scenario buttons disabled
  document.querySelectorAll('.scenario-btn').forEach(function(b){ b.disabled = true; b.style.opacity='0.4'; });
  document.getElementById('btn-programs').classList.add('active');

  // Open side panel in sort mode
  var wrap = document.getElementById('pause-panel-wrap');
  if (wrap) {
    wrap.classList.add('open');
    setTimeout(function(){ if(typeof resize==='function') resize(true); }, 370);
  }
  sidePanelOpen = true;

  // Switch panel header
  var title = document.getElementById('pp-title');
  if (title) title.textContent = 'Bubble Sort';
  var badge = document.getElementById('pp-op-badge');
  if (badge) {
    badge.textContent = 'RUNNING';
    badge.style.background = '#845ef722';
    badge.style.color = '#c084fc';
    badge.style.border = '1px solid #845ef755';
  }

  // Show sort array display
  var sad = document.getElementById('sort-array-display');
  if (sad) sad.style.display = 'flex';

  // Clear log
  var log = document.getElementById('pp-log');
  if (log) log.innerHTML = '';
  sideStepCount = 0;

  // Load values into L2 from HBM — animate the full cold-miss chain
  updateSortArrayDisplay(sortValues, [], []);
  sortSideLog('Sorting [' + nums.join(', ') + '] — odd-even transposition sort', '#c084fc');
  sortSideLog('Cold miss: fetching A00–A02 from HBM (no data in cache yet)', '#845ef7');

  // HBM → Global Mem → L2 particle chain, then install
  sortTimeout(function() {
    flash(layout.hbm, '#845ef7');
    bubble(hbmTop().x, hbmTop().y, 'DRAM read', '#845ef7', {sub:'A00–A02 array', life:1.5});
    spawnParticle(hbmTop(), gmTop(), '#845ef7', 'DATA', 2.0, function() {
      flash(layout.globalMem, '#339af0');
      spawnParticle(gmTop(), l2Top(), '#339af0', 'DATA', 2.2, function() {
        for (var _i=0; _i<3; _i++) { l2InstallAddr(_i, false); }
        flashL2Slot(0, '#845ef7'); flashL2Slot(1, '#845ef7'); flashL2Slot(2, '#845ef7');
        flash(layout.l2, '#845ef7');
        bubble(l2Top().x, l2Top().y, 'L2 filled', '#845ef7', {sub:'A00–A02 installed', life:1.8});
        sortSideLog('A00='+nums[0]+', A01='+nums[1]+', A02='+nums[2]+' now in L2', '#845ef7');
        sortTimeout(function() { runSortPhase(0); }, 900);
      });
    });
  }, 300);
}

// ── Sort phase runner ─────────────────────────────────────────────────────────
function runSortPhase(phaseNum) {
  if (!sortRunning) return;

  var isEven = (phaseNum % 2 === 0);
  var startIdx = isEven ? 0 : 1;
  var pairs = [];
  for (var i = startIdx; i < sortValues.length - 1; i += 2) pairs.push([i, i+1]);

  var phaseLabel = 'Phase ' + (phaseNum+1) + ' — ' + (isEven ? 'Even' : 'Odd') + ' pass';
  var phaseLabelEl = document.getElementById('sort-phase-label');
  if (phaseLabelEl) phaseLabelEl.textContent = phaseLabel;

  sortSideLog('━━ ' + phaseLabel + ' ━━', '#845ef7');

  // Highlight comparing pairs
  var comparingIdxs = [];
  pairs.forEach(function(p){ comparingIdxs.push(p[0], p[1]); });
  updateSortArrayDisplay(sortValues, comparingIdxs, []);

  // Run pairs sequentially with delays
  var swappedAny = false;
  var pairDelay = 0;

  pairs.forEach(function(pair, pi) {
    var li = pair[0], ri = pair[1];
    var smIdx = (phaseNum % 2 === 0 ? 0 : 1) < layout.sms.length ? (phaseNum % 2 === 0 ? 0 : 1) : 0;  // SM0 for even, SM1 for odd

    sortTimeout(function() {
      if (!sortRunning) return;
      var lv = sortValues[li], rv = sortValues[ri];
      var addrL = sortAddrs[li], addrR = sortAddrs[ri];
      var addrLN = ADDR_NAMES[addrL], addrRN = ADDR_NAMES[addrR];

      sortSideLog('SM'+smIdx+' reads '+addrLN+'='+lv+' and '+addrRN+'='+rv, '#339af0');

      // Particle: SM reads both addresses from L2
      var smPos = l1Pos(smIdx);
      var l2t = l2Top();
      var bj = busP(smIdx);              // bus junction above this SM
      var busAtL2 = { x: l2t.x, y: layout.bus.y }; // bus-level intercept at L2 x

      // Read addrL: L2 top → bus-at-L2-level → bus junction above SM → L1
      flashL2Slot(addrL, '#339af0');
      spawnParticle(l2t, smPos, '#339af0', addrLN, 2.2, function() {
        l1InstallAddr(smIdx, addrL, false, 'read');
        flashL1Slot(smIdx, addrL, '#339af0');

        // Read addrR: same routing
        flashL2Slot(addrR, '#339af0');
        spawnParticle(l2t, smPos, '#339af0', addrRN, 2.2, function() {
          l1InstallAddr(smIdx, addrR, false, 'read');
          flashL1Slot(smIdx, addrR, '#339af0');

          // Compare
          if (lv > rv) {
            // Swap
            sortSideLog('SM'+smIdx+' compares '+lv+' > '+rv+' — swapping '+addrLN+' and '+addrRN, '#f59e0b');
            sortValues[li] = rv; sortValues[ri] = lv;
            swappedAny = true;

            updateSortArrayDisplay(sortValues, [], [li, ri]);

            // Write back: L1 → bus junction → L2
            l1DirtyAddr(smIdx, addrL, 'write');
            l1DirtyAddr(smIdx, addrR, 'write');
            flashL1Slot(smIdx, addrL, '#f06595');
            flashL1Slot(smIdx, addrR, '#f06595');

            spawnParticle(smPos, l2t, '#f06595', addrLN+'↔'+addrRN, 2.2, function() {
              l2DirtyAddr(addrL);
              l2DirtyAddr(addrR);
              flashL2Slot(addrL, '#f06595');
              flashL2Slot(addrR, '#f06595');
              l1InstallAddr(smIdx, addrL, false, 'read');
              l1InstallAddr(smIdx, addrR, false, 'read');
              sortSideLog('SM'+smIdx+' wrote '+rv+'→'+addrLN+', '+lv+'→'+addrRN+' back to L2 (dirty)', '#ffa94d');
            }, [bj, {x:l2t.x, y:layout.bus.y}]);
          } else {
            sortSideLog('SM'+smIdx+' compares '+lv+' ≤ '+rv+' — no swap needed', '#51cf66');
            updateSortArrayDisplay(sortValues, [], []);
          }
        }, [busAtL2, bj]);
      }, [busAtL2, bj]);

    }, pairDelay);
    pairDelay += 1400;
  });

  // After all pairs complete, check if sorted and continue
  sortTimeout(function() {
    if (!sortRunning) return;

    // Check if fully sorted
    var isSorted = true;
    for (var s=0; s<sortValues.length-1; s++) { if (sortValues[s] > sortValues[s+1]) { isSorted = false; break; } }

    // Find confirmed sorted positions from the ends
    var newSorted = sortSortedMask.slice();
    if (isEven && !swappedAny) {
      // Full pass with no swaps = sorted
      for (var k=0; k<sortValues.length; k++) newSorted[k] = true;
    }
    sortSortedMask = newSorted;

    if (isSorted) {
      sortComplete();
    } else {
      // L2 correctly stays dirty — SMs wrote back swapped values, correct hardware behavior
      sortTimeout(function() { runSortPhase(phaseNum + 1); }, 600);
    }
  }, pairDelay + 800);
}

// ── Sort complete ─────────────────────────────────────────────────────────────
function sortComplete() {
  sortSideLog('━━ Sorted! ━━', '#51cf66');
  sortSideLog('Final array: [' + sortValues.join(', ') + ']', '#51cf66');
  updateSortArrayDisplay(sortValues, [], [], true);

  var badge = document.getElementById('pp-op-badge');
  if (badge) {
    badge.textContent = 'DONE';
    badge.style.background = '#51cf6622';
    badge.style.color = '#51cf66';
    badge.style.border = '1px solid #51cf6655';
  }
  flash(layout.l2, '#51cf66');
  bubble((layout.bus.x1+layout.bus.x2)/2, layout.bus.y, 'Sort complete!', '#51cf66', {sub:'Array sorted', life:3.0});

  programMode = false;
  sortRunning = false;
  document.querySelectorAll('.scenario-btn').forEach(function(b){ b.disabled=false; b.style.opacity=''; });
  document.getElementById('btn-programs').classList.remove('active');
}

// ── Stop program (e.g. on Reset) ─────────────────────────────────────────────
function stopProgram() {
  sortRunning = false;
  programMode = false;
  document.querySelectorAll('.scenario-btn').forEach(function(b){ b.disabled=false; b.style.opacity=''; });
  var btn = document.getElementById('btn-programs');
  if (btn) btn.classList.remove('active');
  var sad = document.getElementById('sort-array-display');
  if (sad) sad.style.display = 'none';
  var title = document.getElementById('pp-title');
  if (title) title.textContent = 'Step Log';
}

// ── Sort array visual display ─────────────────────────────────────────────────
function updateSortArrayDisplay(vals, comparing, swapping, allSorted) {
  var boxes = document.getElementById('sort-array-boxes');
  if (!boxes) return;
  boxes.innerHTML = '';
  vals.forEach(function(v, i) {
    var isCmp  = comparing.indexOf(i) !== -1;
    var isSwap = swapping.indexOf(i) !== -1;
    var isSorted = allSorted || sortSortedMask[i];
    var cls = 'sort-box-val' + (isSwap ? ' swapping' : isCmp ? ' comparing' : isSorted ? ' sorted' : '');
    var box = document.createElement('div');
    box.className = 'sort-box';
    box.innerHTML =
      '<div class="' + cls + '">' + v + '</div>' +
      '<div class="sort-box-addr">' + (ADDR_NAMES ? ADDR_NAMES[i] : 'A0'+i) + '</div>';
    boxes.appendChild(box);
  });
}

// ── Sort-specific side log (bypasses sideLogPlain rewriting) ──────────────────
function sortSideLog(msg, color) {
  var log = document.getElementById('pp-log');
  if (!log) return;
  sideStepCount++;
  var c = color || '#845ef7';
  var entry = document.createElement('div');
  entry.className = 'pp-entry new';
  entry.style.setProperty('--pp-accent', c);
  entry.innerHTML =
    '<span class="pp-step-num" style="background:'+c+'22;color:'+c+'">'+sideStepCount+'</span>' +
    msg;
  log.appendChild(entry);
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      entry.classList.add('show');
      log.scrollTop = log.scrollHeight;
      setTimeout(function(){ entry.classList.remove('new'); }, 1800);
    });
  });
}

// ── Hover tooltip: show value when hovering L2/L1 sort address slots ─────────
// Values stored in sortValues array, indexed by sortAddrs
function getSortValueForAddr(addr) {
  if (!sortValues.length && !programMode) return null;
  var idx = sortAddrs.indexOf(addr);
  if (idx === -1) return null;
  return sortValues[idx];
}

function updateStats() {
  document.getElementById('stat-hits').textContent=stats.hits;
  document.getElementById('stat-misses').textContent=stats.misses;
  document.getElementById('stat-inv').textContent=stats.inv;
  document.getElementById('stat-wb').textContent=stats.wb;
  var fe = document.getElementById('stat-flush');
  if (fe) fe.textContent=stats.flush||0;
}


// Schedule a reactive callout — called from within each scenario case
// so smIdx is the ACTUAL sm used, and delay matches animation length.
function schedReactive(type, smIdx, addrN, delay, opts) {
  // Show in auto mode too — callouts are educational regardless of trigger
  setTimeout(function() {
    if (typeof showReactiveCallouts === 'function') {
      showReactiveCallouts(type, smIdx, addrN, opts);
    }
  }, delay);
}
function triggerScenario(type, silent) {
  // Manual press: kill auto mode so it doesn't interfere mid-animation
  if (!silent) {
    if (autoMode) {
      autoMode = false;
      autoTimer = 0;
      var btnAuto = document.getElementById('btn-auto');
      if (btnAuto) btnAuto.classList.remove('active');
    }
    openSidePanel(type);
  }
  // Capture this operation's ID — async callbacks will check against it
  var _myOpId = _currentOpId;
  function logOp(msg, color) { logEvent(msg, color, _myOpId); }

  var si = Math.floor(Math.random()*layout.sms.length);
  showExplanation(type);
  var sm = layout.sms[si];
  // ── Address-space: pick a real address for this operation ──────────────────
  var addr = -1;
  if (type !== 'shared' &&
      type !== 'reg_spill' && type !== 'flush' && type !== 'atomic') {
    addr = pickAddr(type, si);
    currentAddr = addr;
  }

  // For write, prefer an SM that actually holds `addr` ──────────
  if (type === 'write' && addr >= 0) {
    var wsh = sharersOf(addr);
    if (wsh.length > 0) { si = wsh[Math.floor(Math.random()*wsh.length)]; sm = layout.sms[si]; }
    else {
      // fallback: prefer any SM with a shared line
      for (var wi0 = 0; wi0 < layout.sms.length; wi0++) {
        if (!cacheState[wi0]) continue;
        var _hasClean = false;
        for (var _wk=0; _wk<NUM_LINES; _wk++) { if (cacheState[wi0].l1[_wk].s===1) { _hasClean=true; break; } }
        if (_hasClean) { si = wi0; sm = layout.sms[si]; break; }
      }
    }
  }

  // ── Precondition enforcement ──
  // Each scenario has requirements. If not met, tell the user clearly and abort.
  // In silent (auto) mode we abort silently — no toast shown.
  if (type === 'write') {
    var anyShared = false;
    for (var _wi=0; _wi<layout.sms.length && !anyShared; _wi++) {
      if (!cacheState[_wi]) continue;
      for (var _wj=0; _wj<NUM_LINES; _wj++) {
        if (cacheState[_wi].l1[_wj].s === 1) { anyShared = true; break; }
      }
    }
    if (!anyShared) {
      if (!silent) notifyUser('SM Write needs cached data first',
        'No SM has a clean line in L1. Run SM Read first to populate the cache, then write.', '#51cf66');
      return;
    }
  }
  if (type === 'invalidate') {
    var anyValid = false;
    for (var _ii=0; _ii<layout.sms.length && !anyValid; _ii++) {
      if (!cacheState[_ii]) continue;
      for (var _ij=0; _ij<NUM_LINES; _ij++) {
        if (cacheState[_ii].l1[_ij].s > 0) { anyValid = true; break; }
      }
    }
    if (!anyValid) {
      if (!silent) notifyUser('Nothing to invalidate',
        'All L1 caches are already empty. Run SM Read first to put data in L1.', '#f06595');
      return;
    }
  }
  if (type === 'writeback') {
    // Check physical dirty lines — block-level state can lag (e.g. after reg spill)
    var anyModified = false;
    for (var mi = 0; mi < layout.sms.length; mi++) {
      if (!cacheState[mi]) continue;
      for (var mj = 0; mj < NUM_LINES; mj++) {
        if (cacheState[mi].l1[mj].s === 2) { anyModified = true; break; }
      }
      if (anyModified) break;
    }
    if (!anyModified) {
      if (!silent) notifyUser('No dirty data to write back',
        'No physically dirty L1 lines found. Run SM Write or Reg Spill first.', '#ffa94d');
      return;
    }
    // Pick the SM that actually has dirty lines
    var found = false;
    for (var mi2 = 0; mi2 < layout.sms.length; mi2++) {
      if (!cacheState[mi2]) continue;
      for (var mj2 = 0; mj2 < NUM_LINES; mj2++) {
        if (cacheState[mi2].l1[mj2].s === 2) {
          si = mi2; sm = layout.sms[si];
          // Sync block-level state so the rest of the case works
          if (sm.l1.state !== 'modified') sm.l1.state = 'modified';
          found = true; break;
        }
      }
      if (found) break;
    }
  }
  if (type === 'flush') {
    // Check physical dirty lines — block-level state can be stale
    var anyDirty = false;
    for (var fdi2=0; fdi2<layout.sms.length; fdi2++) {
      if (!cacheState[fdi2]) continue;
      for (var fdj=0; fdj<NUM_LINES; fdj++) {
        if (cacheState[fdi2].l1[fdj].s === 2) { anyDirty = true; break; }
      }
      if (anyDirty) break;
    }
    var anyL2Dirty = false;
    for (var fdi=0; fdi<NUM_L2_LINES; fdi++) { var _fl2s = l2Lines[fdi] ? (typeof l2Lines[fdi]==='object' ? l2Lines[fdi].s : l2Lines[fdi]) : 0; if (_fl2s === 2) { anyL2Dirty = true; break; } }
    if (!anyDirty && !anyL2Dirty) {
      if (!silent) notifyUser('Nothing to flush',
        'No dirty lines in L1 or L2. Run SM Write or Write-Back first to create dirty data.', '#f97316');
      return;
    }
  }
  if (type === 'atomic' && currentArch === 'apex' && arbiterState.active) {
    if (!silent) notifyUser('Arbiter busy',
      'An atomic sequence is already in flight. Wait for it to complete or Reset.', '#f59e0b');
    return;
  }

  // Callouts: clearCallouts() called inside showReactiveCallouts — no pre-clear needed here
  // Each case schedules its own reactive callout at the right delay

  switch(type) {
    case 'read': {
      // ── Address-aware L1 hit/miss logic ───────────────────────────────────────
      // addr was chosen by pickAddr('read', si) at the top of triggerScenario.
      // If addr is in this SM's L1 → real hit (no bus traffic).
      // If addr is in L2 but not L1 → L2 hit (bus traffic, no DRAM).
      // If addr is in neither → cold miss (full DRAM fetch).
      var addrN = (addr >= 0 && typeof ADDR_NAMES !== 'undefined') ? ADDR_NAMES[addr] : '?';
      var _l1Hit  = addr >= 0 && l1HasAddr(si, addr);
      var _l2Hit  = !_l1Hit && addr >= 0 && l2HasAddr(addr);

      if (_l1Hit) {
        // ── Real L1 HIT ──
        stats.hits++;
        logOp('SM'+si+': L1 HIT '+addrN+' — no bus traffic', '#339af0');
        bubble(l1Pos(si).x, l1Pos(si).y, 'L1 HIT', '#339af0', {sub:addrN+' cached', life:1.8});
        flash(sm.l1, '#339af0');
        var regsTarget = regsPos(si);
        (function(captSI, captAddr, captAddrN){
          flashL1Slot(captSI, captAddr, '#339af0');
          spawnParticle(l1Pos(captSI), regsTarget, '#339af0', addrLabel('DATA', captAddr), 2.5, function(){
            flash(layout.sms[captSI], '#339af0');
            bubble(regsTarget.x, regsTarget.y, 'reg filled', '#339af0', {sub:'~28 cycles', life:1.4});
            logOp('SM'+captSI+': '+captAddrN+' delivered from L1 (~28 cycles)', '#339af0');
              schedReactive('read', captSI, captAddrN, 100, {l1Hit:true});
          });
        })(si, addr, addrN);
        updateStats();
        break;
      }

      // ── L1 Miss ───────────────────────────────────────────────────────────────
      stats.misses++;
      sm.l1.state = 'invalid';

      if (_l2Hit) {
        // L2 HIT path
        logOp('SM'+si+': L1 MISS '+addrN+' → L2 HIT', '#ff6b6b');
        bubble(l1Pos(si).x, l1Pos(si).y, 'L1 MISS', '#ff6b6b', {sub:addrN+' → L2'});
        flashL1MissSlot(si, '#ff6b6b');
        (function(captSI, captSM, captAddr, captAddrN){
          particles.push(new Particle(l1Pos(captSI), busP(captSI), '#ff6b6b', addrLabel('RdReq', captAddr), 2, function(){
            spawnPassthrough(captSI, '#ff6b6b', addrLabel('RdReq', captAddr), 2.5, function(){
              logOp('L2: HIT '+captAddrN+' — serving to SM'+captSI, '#ffa94d');
              bubble(l2Top().x, l2Top().y, 'L2 HIT', '#ffa94d', {life:1.5, sub:captAddrN+' ready'});
              flashL2Slot(captAddr, '#339af0');
              flash(layout.l2, '#339af0');
              schedReactive('read', captSI, captAddrN, 100, {l1Hit:false, l2Hit:true});
              var busAtL2 = { x: l2Top().x, y: layout.bus.y };
              spawnParticle(l2Top(), l1Pos(captSI), '#ffa94d', addrLabel('DATA', captAddr), 2, function(){
                captSM.l1.state = 'shared';
                l1InstallAddr(captSI, captAddr, false, 'read');
                flashL1Slot(captSI, captAddr, '#339af0');
                flash(captSM.l1, '#339af0');
                bubble(l1Pos(captSI).x, l1Pos(captSI).y, 'L1 fill', '#339af0', {life:1.6, sub:captAddrN+' installed'});
                logOp('SM'+captSI+': L1 → Shared '+captAddrN+' (L2 hit)', '#339af0');
                stats.hits++; updateStats();
              }, [busAtL2, busP(captSI)]);
            });
          }));
        })(si, sm, addr, addrN);
      } else {
        // L2 MISS — cold miss → DRAM fetch, fills L2 then L1
        logOp('SM'+si+': L1 MISS '+addrN+' → L2 MISS → DRAM', '#ff6b6b');
        bubble(l1Pos(si).x, l1Pos(si).y, 'L1 MISS', '#ff6b6b', {sub:addrN+' → DRAM'});
        flashL1MissSlot(si, '#ff6b6b');
        (function(captSI, captSM, captAddr, captAddrN){
          particles.push(new Particle(l1Pos(captSI), busP(captSI), '#ff6b6b', addrLabel('RdReq', captAddr), 2, function(){
            spawnPassthrough(captSI, '#ff6b6b', addrLabel('RdReq', captAddr), 2.5, function(){
              bubble(l2Top().x, l2Top().y, 'L2 MISS', '#ff6b6b', {life:1.4, sub:captAddrN+' → DRAM'});
              flashL2Slot(captAddr, '#ff6b6b');
              logOp('L2: MISS '+captAddrN+' — fetching from HBM', '#ff6b6b');
              schedReactive('read', captSI, captAddrN, 200, {l1Hit:false, l2Hit:false});
              spawnParticle(l2Top(), gmTop(), '#ff6b6b', addrLabel('RdReq', captAddr), 2.2, function(){
                flash(layout.globalMem, '#339af0');
                bubble(gmTop().x, gmTop().y, 'DRAM fetch', '#339af0', {life:1.4, sub:'~400 cycles'});
                spawnParticle(gmTop(), hbmTop(), '#339af0', addrLabel('RdReq', captAddr), 2.0, function(){
                  flash(layout.hbm, '#845ef7');
                  bubble(hbmTop().x, hbmTop().y, 'HBM read', '#845ef7', {life:1.2, sub:captAddrN+' found'});
                  spawnParticle(hbmTop(), gmTop(), '#845ef7', addrLabel('DATA', captAddr), 2.2, function(){
                    flash(layout.globalMem, '#339af0');
                    spawnParticle(gmTop(), l2Top(), '#339af0', addrLabel('DATA', captAddr), 2.2, function(){
                      // Install in L2
                      l2InstallAddr(captAddr, false);
                      flashL2Slot(captAddr, '#ffa94d');
                      flash(layout.l2, '#ffa94d');
                      bubble(l2Top().x, l2Top().y, 'L2 fill', '#ffa94d', {life:1.5, sub:captAddrN+' installed'});
                      logOp('L2: '+captAddrN+' installed from DRAM', '#ffa94d');
                      var busAtL2m = { x: l2Top().x, y: layout.bus.y };
                      spawnParticle(l2Top(), l1Pos(captSI), '#ffa94d', addrLabel('DATA', captAddr), 2, function(){
                        captSM.l1.state = 'shared';
                        l1InstallAddr(captSI, captAddr, false, 'read');
                        flashL1Slot(captSI, captAddr, '#339af0');
                        flash(captSM.l1, '#339af0');
                        bubble(l1Pos(captSI).x, l1Pos(captSI).y, 'L1 fill', '#339af0', {life:1.6, sub:captAddrN+' Shared'});
                        logOp('SM'+captSI+': L1 → Shared '+captAddrN+' (DRAM via L2)', '#339af0');
                        stats.hits++; updateStats();
                      }, [busAtL2m, busP(captSI)]);
                    });
                  });
                });
              });
            });
          }));
        })(si, sm, addr, addrN);
      }
      break;
    }
    case 'write':
      {
        // Write-evict + targeted INV to actual sharers
        var addrNW2 = (addr >= 0 && typeof ADDR_NAMES !== 'undefined') ? ADDR_NAMES[addr] : '?';
        var _wl1Hit = addr >= 0 && l1HasAddr(si, addr);
        // Sharers: all SMs that hold addr in their L1 (excluding writer)
        var staleSMs = (addr >= 0) ? sharersOf(addr).filter(function(x){ return x !== si; }) : [];

        if (!_wl1Hit) {
          // Write-Miss: write-evict straight to L2, no L1 allocation, no INV needed
          stats.misses++;
          logOp('SM'+si+': Write miss '+addrNW2+' → write-evict to L2 (no INV)', '#51cf66');
          bubble(l1Pos(si).x, l1Pos(si).y, 'write miss', '#51cf66', {sub:addrNW2+' → L2'});
          flashL1MissSlot(si, '#ff6b6b');
          var warpSrcM = { x: sm.x + sm.w/2, y: sm.y + 18 };
          var busCenterWM = { x: l2Top().x, y: layout.bus.y };
          (function(captSI, captAddr, captAddrN){
            spawnParticle(warpSrcM, l2Top(), '#51cf66', addrLabel('WR', captAddr), 2, function(){
              l2InstallAddr(captAddr, true);
              flashL2Slot(captAddr, '#ffa94d');
              flash(layout.l2, '#ffa94d');
              bubble(l2Top().x, l2Top().y, captAddrN+' landed', '#ffa94d', {life:1.5, sub:'L2 dirty (no L1 fill)'});
              logOp('L2: '+captAddrN+' dirty, L1 not allocated (write-evict miss)', '#ffa94d');
            }, [busP(captSI), busCenterWM]);
          })(si, addr, addrNW2);
          updateStats();
        } else {
          // Write-Hit: mark L1 modified, evict to L2, INV real sharers only
          stats.hits++;
          logOp('SM'+si+': Write HIT '+addrNW2+' → Modified, evict to L2' + (staleSMs.length ? ', INV '+staleSMs.length+' sharer(s)' : ' (no sharers)'), '#51cf66');
          bubble(l1Pos(si).x, l1Pos(si).y, 'write HIT', '#51cf66', {sub:addrNW2+' → Modified'});

          sm.l1.state = 'modified';
          l1DirtyAddr(si, addr, 'write');
          flashL1Slot(si, addr, '#51cf66');
          flash(sm.l1, '#51cf66');

          (function(captSI, captSM, captAddr, captAddrN, captStaleSMs){
            particles.push(new Particle(l1Pos(captSI), busP(captSI), '#51cf66', addrLabel('WR', captAddr), 2, function(){
              bubble(busP(captSI).x, busP(captSI).y, 'write-evict', '#51cf66', {life:1.0, sub:captAddrN+' → L2'});
              var busCenterWH = { x: l2Top().x, y: layout.bus.y };
              spawnParticle(busP(captSI), l2Top(), '#51cf66', addrLabel('WR', captAddr), 2, function(){
                l2InstallAddr(captAddr, true);
                flashL2Slot(captAddr, '#ffa94d');
                flash(layout.l2, '#ffa94d');
                bubble(l2Top().x, l2Top().y, 'L2 updated', '#ffa94d', {life:1.3, sub:captAddrN+' dirty'});
                logOp('L2: '+captAddrN+' dirty', '#ffa94d');
              }, [busCenterWH]);

              // Fan-out INV to actual sharers only
              if (captStaleSMs.length === 0) {
                logOp('SM'+captSI+': No sharers of '+captAddrN+' — no INV needed', '#51cf66');
              } else if (currentArch === 'apex' && layout.cohDir) {
                var cdCentre = { x: layout.cohDir.x + layout.cohDir.w/2, y: layout.cohDir.y + layout.cohDir.h/2 };
                particles.push(new Particle(busP(captSI), l2Top(), '#f06595', addrLabel('WR→DIR', captAddr), 2.5, function(){
                  flash(layout.cohDir, '#f06595');
                  bubble(cdCentre.x, cdCentre.y, 'dir lookup', '#f06595', {life:1.3, sub:captAddrN+': '+captStaleSMs.length+' sharer(s)'});
                  logOp('CohDir: '+captAddrN+' → targeted INV to '+captStaleSMs.length+' SM(s)', '#f06595');
                  for (var wj=0; wj<captStaleSMs.length; wj++) {
                    (function(idx){
                      setTimeout(function(){
                        var bcInv = { x: l2Top().x, y: layout.bus.y };
                        spawnParticle(bcInv, l1Pos(idx), '#f06595', addrLabel('INV', captAddr), 2.8, function(){
                          flashL1Slot(idx, captAddr, '#f06595');
                          l1EvictAddr(idx, captAddr);
                          var remR = 0; if (cacheState[idx]) for (var ri=0;ri<NUM_LINES;ri++) if(cacheState[idx].l1[ri].s>0) remR++;
                          layout.sms[idx].l1.state = remR > 0 ? 'shared' : 'invalid';
                          flash(layout.sms[idx].l1, '#f06595');
                          bubble(l1Pos(idx).x, l1Pos(idx).y, 'INV hit', '#f06595', {life:1.3, sub:captAddrN+' dropped'});
                          logOp('SM'+idx+': '+captAddrN+' invalidated (targeted)', '#f06595');
                          stats.inv++; updateStats();
                        }, [busP(idx)]);
                      }, wj*180);
                    })(captStaleSMs[wj]);
                  }
                }));
              } else {
                // Non-Apex: broadcast to real sharers only
                for (var wj=0; wj<captStaleSMs.length; wj++) {
                  (function(idx){
                    setTimeout(function(){
                      particles.push(new Particle(busP(captSI), busP(idx), '#f06595', addrLabel('INV', captAddr), 3, function(){
                        particles.push(new Particle(busP(idx), l1Pos(idx), '#f06595', addrLabel('INV', captAddr), 2, function(){
                          flashL1Slot(idx, captAddr, '#f06595');
                          l1EvictAddr(idx, captAddr);
                          var remR2 = 0; if (cacheState[idx]) for (var ri2=0;ri2<NUM_LINES;ri2++) if(cacheState[idx].l1[ri2].s>0) remR2++;
                          layout.sms[idx].l1.state = remR2 > 0 ? 'shared' : 'invalid';
                          flash(layout.sms[idx].l1, '#f06595');
                          bubble(l1Pos(idx).x, l1Pos(idx).y, 'INV hit', '#f06595', {life:1.3, sub:captAddrN+' dropped'});
                          logOp('SM'+idx+': '+captAddrN+' invalidated', '#f06595');
                          stats.inv++; updateStats();
                        }));
                      }));
                    }, wj*180 + Math.round(Math.random()*60));
                  })(captStaleSMs[wj]);
                }
              }
            }));
          })(si, sm, addr, addrNW2, staleSMs);
          schedReactive('write', si, addrNW2, 300);
          updateStats();
        }
      }
      break;
    case 'invalidate':
      // addr = pickAddr('invalidate', si) — chosen to prefer multi-SM shared addresses
      var addrNI = (addr >= 0 && typeof ADDR_NAMES !== 'undefined') ? ADDR_NAMES[addr] : '?';
      var invTargets = (addr >= 0) ? sharersOf(addr) : [];
      // Fallback: if no sharers of picked addr, use any SM with physically valid L1 lines
      if (invTargets.length === 0) {
        invTargets = [];
        for (var ii=0; ii<layout.sms.length; ii++) {
          if (!cacheState[ii]) continue;
          var _hasAny = false;
          for (var _ij=0; _ij<NUM_LINES; _ij++) { if (cacheState[ii].l1[_ij].s > 0) { _hasAny=true; break; } }
          if (_hasAny) invTargets.push(ii);
        }
      }
      if (invTargets.length === 0) {
        if (!silent) notifyUser('Nothing to invalidate', 'No SM holds '+addrNI+' in L1.', '#f06595');
        return;
      }
      stats.inv++;
      logOp('INV('+addrNI+') → '+invTargets.length+' SM(s)', '#f06595');
      // Bus bubble fires when the INV broadcast physically reaches the bus (inside doINV particle cb)

      (function(captAddr, captAddrN, captTargets){
        var doINV = function(targets) {
          for (var vi=0; vi<targets.length; vi++) {
            (function(idx){
              setTimeout(function(){
                var from = (currentArch === 'apex' && layout.cohDir)
                  ? { x: layout.cohDir.x+layout.cohDir.w/2, y: layout.cohDir.y }
                  : { x: (layout.bus.x1+layout.bus.x2)/2, y: layout.bus.y };
                var busMid = { x: (layout.bus.x1+layout.bus.x2)/2, y: layout.bus.y };
                spawnParticle(l2Top(), busMid, '#f06595', addrLabel('INV', captAddr), 1.8, function(){
                  // Particle has reached the coherency bus — now broadcast
                  bubble(busMid.x, busMid.y, 'INV('+captAddrN+')', '#f06595', {sub:targets.length+' target(s)'});
                  spawnParticle(busMid, l1Pos(idx), '#f06595', addrLabel('INV', captAddr), 1.6, function(){
                    flashL1Slot(idx, captAddr, '#f06595');
                    if (captAddr >= 0) l1EvictAddr(idx, captAddr);
                    else invalidateL1Lines(idx, 1 + Math.floor(Math.random()*2));
                    var remI = 0; if (cacheState[idx]) for (var ri=0;ri<NUM_LINES;ri++) if(cacheState[idx].l1[ri].s>0) remI++;
                    layout.sms[idx].l1.state = remI > 0 ? 'shared' : 'invalid';
                    flash(layout.sms[idx].l1, '#f06595');
                    bubble(l1Pos(idx).x, l1Pos(idx).y, 'INV hit', '#f06595', {life:1.2, sub:captAddrN+' dropped'});
                    logOp('SM'+idx+': '+captAddrN+' evicted', '#f06595');
                  }, [{ x: l2Top().x, y: layout.bus.y }, busP(idx)]);
                }); // outer spawnParticle: l2Top → busMid
              }, vi*130 + Math.round(Math.random()*60));
            })(targets[vi]);
          }
        };

        if (currentArch === 'apex' && layout.cohDir) {
          var cdPos2 = { x: layout.cohDir.x+layout.cohDir.w/2, y: layout.cohDir.y+layout.cohDir.h/2 };
          particles.push(new Particle({x:(layout.bus.x1+layout.bus.x2)/2,y:layout.bus.y}, l2Top(), '#f06595', addrLabel('INV',captAddr), 2.5, function(){
            flash(layout.cohDir, '#f06595');
            bubble(cdPos2.x, cdPos2.y, 'dir lookup', '#f06595', {life:1.3, sub:captAddrN+': '+captTargets.length+' sharer(s)'});
            logOp('CohDir: targeted INV('+captAddrN+') → '+captTargets.length+' SM(s)', '#f06595');
            doINV(captTargets);
          }));
        } else {
          doINV(captTargets);
        }
      })(addr, addrNI, invTargets);
      schedReactive('invalidate', si, addrNI, 200, {invCount: invTargets.length});
      break;
    case 'writeback':
      // Precondition ensures physical dirty lines exist — no coercion needed
      logOp('SM'+si+': Write-back → L2 (1 dirty line evicted)','#ffa94d');
      bubble(l1Pos(si).x,l1Pos(si).y,'dirty evict','#ffa94d',{sub:'1 line flushed'});
      particles.push(new Particle(l1Pos(si),busP(si),'#ffa94d','WB',2,function(){
        spawnPassthrough(si,'#ffa94d','WB',2.5,function(){
          // WB arrives at L2: evict exactly the one dirty line from L1, install it in L2
          var wbEvictedAddr = evictOneL1Line(si);
          if (wbEvictedAddr >= 0) flashL1Slot(si, wbEvictedAddr, '#ffa94d');
          // After eviction: check what's left in L1
          var wbDirtyLeft = 0, wbCleanLeft = 0;
          if (cacheState[si]) {
            for (var wbi=0;wbi<NUM_LINES;wbi++) {
              var ws = cacheState[si].l1[wbi].s;
              if (ws === 2) wbDirtyLeft++;
              else if (ws === 1) wbCleanLeft++;
            }
          }
          if (wbDirtyLeft > 0)        sm.l1.state = 'modified';
          else if (wbCleanLeft > 0)   sm.l1.state = 'shared';
          else                         sm.l1.state = 'invalid';
          // Install the evicted line into L2 as dirty (address-aware — no random slot mutation)
          if (wbEvictedAddr >= 0) {
            l2DirtyAddr(wbEvictedAddr);
            flashL2Slot(wbEvictedAddr, '#ffa94d');
          }
          stats.wb++;
          flash(layout.l2,'#ffa94d');
          bubble(l2Top().x,l2Top().y,'1 line absorbed','#ffa94d',{life:1.4,sub:'dirty → L2 slot'});
          logOp('L2: Write-back received — 1 dirty line installed','#ffa94d');
          // L2 eviction cascade: only fires if L2 is >75% full (realistic pressure)
          var l2FilledCount = 0;
          for (var li=0;li<NUM_L2_LINES;li++) { var _lfc=l2Lines[li]?(typeof l2Lines[li]==='object'?l2Lines[li].s:l2Lines[li]):0; if(_lfc>0) l2FilledCount++; }
          var l2Pressure = l2FilledCount / NUM_L2_LINES;
          if (l2Pressure > 0.75) {
            setTimeout(function(){
              // Evict dirty victim from L2 → crossbar → globalMem → HBM
              l2Evict();
              bubble(l2Bot().x,l2Bot().y,'L2 evicting','#ffa94d',{life:1.3,sub:'dirty victim → DRAM'});
              schedReactive('writeback', si, '', 300);
              particles.push(new Particle(l2Bot(),cbP(),'#ffa94d','EVICT',2,function(){
                particles.push(new Particle(cbP(),gmTop(),'#ffa94d','WR',2,function(){
                  flash(layout.globalMem,'#339af0');
                  bubble(gmTop().x,gmTop().y,'queued MC','#339af0',{life:1.2,sub:'scheduling write'});
                  particles.push(new Particle(gmTop(),gmBot(),'#ffa94d','WR',2,function(){
                    particles.push(new Particle(gmBot(),hbmTop(),'#845ef7','STORE',1.5,function(){
                      flash(layout.hbm,'#845ef7');
                      bubble(hbmTop().x,hbmTop().y,'persisted','#845ef7',{life:1.5,sub:'written to DRAM'});
                      logOp('HBM4: Stored','#845ef7');
                    }));
                  }));
                }));
              }));
            },500);
          } else {
            schedReactive('writeback', si, '', 300);
      logOp('L2: Dirty line retained — no eviction needed','#ffa94d');
          }
        });
      }));

      break;
    case 'shared':
      var smemBlock=null;
      for(var sbi=0;sbi<sm.sub.length;sbi++){if(sm.sub[sbi].type==='smem')smemBlock=sm.sub[sbi];}
      if(!smemBlock) break;
      var regsBlockEl=null;
      for(var ri=0;ri<sm.sub.length;ri++){if(sm.sub[ri].type==='regs')regsBlockEl=sm.sub[ri];}
      var sfrom={x:sm.x+sm.w/2,y:regsBlockEl?regsBlockEl.y+3:sm.y+40};
      var smemCentre={x:smemBlock.x+smemBlock.w/2, y:smemBlock.y+smemBlock.h/2};

      // Phase 1: threads compute, then issue STS (store to SMEM)
      logOp('SM'+si+': threads computing, then STS issued','#51cf66');
      bubble(sfrom.x, sfrom.y, 'STS issued','#51cf66',{sub:'writing to SMEM'});

      // Phase 2: ST.S particle travels regs → SMEM. Only on arrival do we fill + flash SMEM.
      particles.push(new Particle(sfrom, smemCentre, '#51cf66', 'ST.S', 1.5, function(){
        // Data arrives at SMEM — now update visual state
        fillSmem(si);
        flash(smemBlock, '#51cf66');
        stats.hits++;
        bubble(smemBlock.x+smemBlock.w/2, smemBlock.y, '~20 cycles','#51cf66',{life:1.6,sub:'SRAM write complete'});
        logOp('SM'+si+': ST.S complete — data in SMEM (~20 cycles)','#51cf66');

        // Phase 3: __syncthreads() — all threads must reach barrier before any LDS
        setTimeout(function(){
          bubble(sm.x+sm.w/2, sm.y+14, '__syncthreads()','#f59e0b',{sub:'barrier — all threads sync',life:2.0});
          logOp('SM'+si+': __syncthreads() — waiting for all threads','#f59e0b');

          // Phase 4: LDS after barrier — threads read back from SMEM
          setTimeout(function(){
            logOp('SM'+si+': LDS — all threads reading from SMEM','#51cf66');
            bubble(smemBlock.x+smemBlock.w/2, smemBlock.y,'LDS','#51cf66',{sub:'no coherency cost'});
            spawnParticle(smemCentre, sfrom, '#51cf66', 'LDS', 1.5, function(){
              bubble(sfrom.x, sfrom.y,'reg filled','#51cf66',{sub:'~20 cycle SMEM hit',life:1.4});
              logOp('SM'+si+': LDS hit — data in registers, no bus traffic','#51cf66');
              bubble(sm.x+sm.w/2, sm.y+14, 'no coherency','#51cf66',{sub:'SM-private scratchpad',life:1.8});
              schedReactive('shared', si, '', 300);
            });
          }, 900);
        }, 600);
      }));

      break;
    case 'flush': {
      // ── Cache Flush: __threadfence / cudaDeviceSynchronize ──────────────────
      // Phase 1: All SMs with dirty L1 lines fire WB packets simultaneously to L2.
      // Phase 2: All L2 dirty lines drain to DRAM via crossbar → memory controller → HBM.
      // Result: all caches clean, HBM holds authoritative data.
      stats.flush++;
      logOp('FLUSH initiated — draining all dirty lines to DRAM', '#f97316');
      bubble((layout.bus.x1+layout.bus.x2)/2, layout.bus.y, '__threadfence()', '#f97316',
        {sub:'flushing all dirty lines', life:2.2});

      // Collect all SMs with dirty L1
      // Collect SMs with physically dirty lines — don't rely on block-level state
      var dirtySMs = [];
      for (var fi=0; fi<layout.sms.length; fi++) {
        if (!cacheState[fi]) continue;
        for (var fci=0; fci<NUM_LINES; fci++) {
          if (cacheState[fi].l1[fci].s === 2) { dirtySMs.push(fi); break; }
        }
      }

      var l2FlushDone = false;  // gate: only start L2→DRAM after all L1 WBs land

      // Phase 1: fan-out — all dirty SMs fire WB simultaneously
      if (dirtySMs.length === 0) {
        // No dirty L1s — skip straight to L2 flush
        l2FlushDone = false;
        doL2Flush();
      } else {
        var wbLanded = 0;
        for (var fj=0; fj<dirtySMs.length; fj++) {
          (function(smI) {
            var fsmState = layout.sms[smI];
            logOp('SM'+smI+': flushing dirty lines → L2', '#f97316');
            bubble(l1Pos(smI).x, l1Pos(smI).y, 'WB flush', '#f97316', {sub:'all dirty lines'});
            // WB packet: L1 → bus → L2
            particles.push(new Particle(l1Pos(smI), busP(smI), '#f97316', 'WB', 2.2, function() {
              var busCtr = { x: l2Top().x, y: layout.bus.y };
              spawnParticle(busP(smI), l2Top(), '#f97316', 'WB', 2.2, function() {
                // Stagger dirty→clean per slot so each one visibly flashes before clearing
                if (cacheState[smI]) {
                  var flushDelay = 0;
                  for (var fk=0; fk<NUM_L
