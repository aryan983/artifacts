// arbiter.js — GPU Cache Coherency Demo

// Atomic arbiter state machine, ROB, spawn helpers, app utils

function toggleAuto() {
  autoMode=!autoMode;
  document.getElementById('btn-auto').classList.toggle('active',autoMode);
}

function resetAll(silent) {
  particles=[]; flashEffects=[]; bubbles=[];
  stats={hits:0,misses:0,inv:0,wb:0}; updateStats();
  for(var ri=0;ri<layout.sms.length;ri++){layout.sms[ri].l1.state='invalid';}
  initCacheState();
  document.getElementById('event-log').innerHTML='';
  stepTimers.forEach(function(t){clearTimeout(t);}); stepTimers=[];
  document.getElementById('explainer-title').innerHTML='<span class="dot" style="background:#6b7094"></span> Click a scenario or wait for auto...';
  document.getElementById('explainer-title').style.color='#6b7094';
  document.getElementById('step-list').innerHTML='';
  var s=document.getElementById('explainer-summary'); s.textContent=''; s.classList.remove('visible');
  autoTimer=0;
  // Also unpause on reset
  if (paused) togglePause();
  resetArbiter();
  if(!silent) logEvent('Reset — all caches invalidated','#6b7094');
}

function buildInstrChips() {
  var container = document.getElementById('instr-chips');
  if (!container) return;
  container.innerHTML = '';
  var keys = Object.keys(INSTRUCTION_INFO);
  keys.forEach(function(key) {
    var info = INSTRUCTION_INFO[key];
    var chip = document.createElement('span');
    chip.className = 'instr-chip';
    chip.textContent = key;
    chip.style.background = info.color + '18';
    chip.style.color = info.color;
    chip.style.borderColor = info.color + '50';
    chip.addEventListener('mouseenter', function(e) {
      showInstrTooltip(key, e.clientX, e.clientY);
    });
    chip.addEventListener('mousemove', function(e) {
      positionInstrTooltip(e.clientX, e.clientY);
    });
    chip.addEventListener('mouseleave', function() {
      hideInstrTooltip();
    });
    container.appendChild(chip);
  });
}

// ════════════════════════════════════════
// APEX ARBITER STATE SYSTEM
// ════════════════════════════════════════
var QUEUE_CAPACITY = 6;  // hard limit — arrivals beyond this stall at the bus interface

var arbiterState = {
  seqCounter: 0,
  queue: [],       // pending requests waiting for grant (arrival order = grant order)
  rob: [],         // reorder buffer: [{seq, smIdx, state:'pending'|'complete'|'retiring'|'done'}]
  activeOps: [],   // [{seq, smIdx, phase, phaseName, phaseStart}] — live phase tracking
  grantCount: 0,
  contentionLevel: 0,
  recentGrants: [],
  active: false,
  retireTimerPending: false,  // guards against duplicate ghost timers in arbiterTryRetire
  passthroughCount: 0,        // number of non-atomic particles currently passing through
};


function resetArbiter() {
  arbiterState.seqCounter = 0;
  arbiterState.queue = [];
  arbiterState.rob = [];
  arbiterState.activeOps = [];
  arbiterState.grantCount = 0;
  arbiterState.contentionLevel = 0;
  arbiterState.recentGrants = [];
  arbiterState.active = false;
  arbiterState.retireTimerPending = false;
  arbiterState.passthroughCount = 0;
  updateArbiterDom();
}

function arbiterEnqueue(smIdx, type) {
  if (currentArch !== 'apex') return -1;
  // Queue full → back-pressure. Caller stalls the particle at the bus interface.
  if (arbiterState.queue.length >= QUEUE_CAPACITY) return -1;
  var seq = arbiterState.seqCounter++;
  arbiterState.queue.push({ seq: seq, smIdx: smIdx, type: type || 'ATOM' });
  arbiterState.rob.push({ seq: seq, smIdx: smIdx, state: 'pending' });
  arbiterState.activeOps.push({ seq: seq, smIdx: smIdx, phase: 'queued', phaseName: ARB_PHASES.queued.label, phaseStart: Date.now() });
  arbiterState.contentionLevel = Math.min(1, arbiterState.queue.length / QUEUE_CAPACITY);
  arbiterState.active = true;
  var qPos = queueSlotPos(arbiterState.queue.length - 1);
  bubble(qPos.x, qPos.y, '#'+seq, '#f59e0b', { sub:'SM'+smIdx+' queued', life:1.1 });
  var rPos = robSlotPos(arbiterState.rob.length - 1);
  bubble(rPos.x, rPos.y, '#'+seq, '#f59e0b', { sub:'⏳ pending', life:1.0 });
  updateArbiterDom();
  return seq;
}

function arbiterGrant(seq) {
  if (currentArch !== 'apex') return;
  // Mark as granted — change phase and show bubble, but KEEP the queue slot.
  // The slot stays visible until the RMW physically enters the arbiter (arbiterDequeue).
  // This way the queue shows the full occupancy picture: pending + in-transit.
  var qIdx = -1;
  for (var qi = 0; qi < arbiterState.queue.length; qi++) {
    if (arbiterState.queue[qi].seq === seq) { qIdx = qi; break; }
  }
  if (qIdx >= 0) {
    arbiterState.queue[qIdx].granted = true;  // visually distinguish granted-but-not-entered
    var qPos = queueSlotPos(qIdx);
    bubble(qPos.x, qPos.y, '#'+seq+' granted', '#51cf66', { sub:'→ RMW', life:1.0 });
  }
  for (var ao = 0; ao < arbiterState.activeOps.length; ao++) {
    if (arbiterState.activeOps[ao].seq === seq) {
      arbiterState.activeOps[ao].phase = 'granted';
      arbiterState.activeOps[ao].phaseName = ARB_PHASES.granted.label;
      arbiterState.activeOps[ao].phaseStart = Date.now();
      break;
    }
  }
  arbiterState.grantCount++;
  var cycles = Math.round(2 + arbiterState.queue.length * 8 + Math.random() * 6);
  arbiterState.recentGrants.unshift({ seq: seq, cycles: cycles });
  if (arbiterState.recentGrants.length > 4) arbiterState.recentGrants.pop();
  updateArbiterDom();
}

// Called when the granted RMW particle physically enters the arbiter top.
// Only now does the queue slot free up — back-pressure lifts here.
function arbiterDequeue(seq) {
  if (currentArch !== 'apex') return;
  arbiterState.queue = arbiterState.queue.filter(function(e){ return e.seq !== seq; });
  arbiterState.contentionLevel = Math.min(1, arbiterState.queue.length / QUEUE_CAPACITY);
  updateArbiterDom();
}

// Called when ACK physically arrives back from L2 for a given SEQ#
// Marks ROB slot 'complete' but does NOT send DATA yet — that waits for in-order retirement
// Returns a callback that the caller should invoke to actually send DATA when retirement is allowed
function arbiterAckFromL2(seq, onRetired) {
  if (currentArch !== 'apex') { if (onRetired) onRetired(); return; }
  var robIdx = -1;
  for (var ri = 0; ri < arbiterState.rob.length; ri++) {
    if (arbiterState.rob[ri].seq === seq) {
      arbiterState.rob[ri].state = 'complete';
      arbiterState.rob[ri].onRetired = onRetired;
      robIdx = ri;
      break;
    }
  }
  // Bubble on the exact ROB slot that just flipped to 'complete'
  if (robIdx >= 0) {
    var rPos = robSlotPos(robIdx);
    var isHead = robIdx === 0;
    bubble(rPos.x, rPos.y, '#'+seq+' ✦', '#339af0', { sub: isHead ? 'head→retire' : 'waiting…', life:1.1 });
  }
  for (var ao = 0; ao < arbiterState.activeOps.length; ao++) {
    if (arbiterState.activeOps[ao].seq === seq) {
      arbiterState.activeOps[ao].phase = 'retiring';
      arbiterState.activeOps[ao].phaseName = ARB_PHASES.retiring.label;
      arbiterState.activeOps[ao].phaseStart = Date.now();
      break;
    }
  }
  updateArbiterDom();
  arbiterTryRetire();
}

// Drain ROB head: retire all consecutive 'complete' entries in SEQ order.
// This is the actual reordering — if #3 finishes before #2, it waits here.
//
// Fix Bug #1: replaced `changed = true` + while-loop continuation with an
//   immediate `return` after marking a head 'done'. The removal setTimeout
//   calls arbiterTryRetire() itself once the slot is gone, so the chain
//   continues correctly without racing the while loop.
//
// Fix Bug #3: `retireTimerPending` flag prevents accumulating duplicate
//   ghost timers when arbiterTryRetire() is called while the head is still
//   in its 600ms removal window (state === 'done').
function arbiterTryRetire() {
  if (arbiterState.rob.length === 0) return;

  var head = arbiterState.rob[0];

  // Head is already marked 'done' but not yet removed — removal timer is
  // running. Guard against scheduling duplicate re-check timers.
  if (head.state === 'done') {
    if (!arbiterState.retireTimerPending) {
      arbiterState.retireTimerPending = true;
      setTimeout(function() {
        arbiterState.retireTimerPending = false;
        arbiterTryRetire();
      }, 650);
    }
    return;
  }

  // Head not yet complete — nothing to retire right now.
  if (head.state !== 'complete') return;

  // Retire the head: mark done, fire callback, schedule removal.
  head.state = 'done';
  var rPos = robSlotPos(0);
  bubble(rPos.x, rPos.y, '#'+head.seq+' ✓', '#51cf66', { sub:'retired→DATA', life:1.2 });
  updateArbiterDom();

  var cb = head.onRetired;
  if (cb) cb();  // send DATA to SM — fires immediately (correct: retirement is the trigger)

  (function(entry) {
    setTimeout(function() {
      arbiterState.rob = arbiterState.rob.filter(function(e){ return e.seq !== entry.seq; });
      arbiterState.activeOps = arbiterState.activeOps.filter(function(e){ return e.seq !== entry.seq; });
      if (arbiterState.queue.length === 0 && arbiterState.rob.length === 0) {
        arbiterState.active = false;
        arbiterState.contentionLevel = 0;
      }
      updateArbiterDom();
      // Try to retire the next head now that this slot is removed.
      arbiterTryRetire();
    }, 600);
  })(head);
  // Do NOT continue the loop here — the 600ms setTimeout above will call
  // arbiterTryRetire() for the next entry once this slot is fully removed.
}

// Legacy wrapper kept for any remaining call sites
function arbiterRetire(seq) {
  // No-op — retirement now handled by arbiterAckFromL2 + arbiterTryRetire
}

function updateArbiterDom() {
  // State-only update — rendering is done entirely on canvas
  // Nothing to update in DOM since we removed the arbiter panel
}


// ════════════════════════════════════════
// LATENCY ANNOTATION TOASTS
// ════════════════════════════════════════


// ════════════════════════════════════════
// APEX HELPERS
// ════════════════════════════════════════
function arbiterPos() {
  if (!layout.arbiter) return l2Top();
  return { x: layout.arbiter.x + layout.arbiter.w/2, y: layout.arbiter.y + layout.arbiter.h/2 };
}
function arbiterBot() {
  if (!layout.arbiter) return l2Top();
  return { x: layout.arbiter.x + layout.arbiter.w/2, y: layout.arbiter.y + layout.arbiter.h };
}
function arbiterTop() {
  if (!layout.arbiter) return l2Top();
  return { x: layout.arbiter.x + layout.arbiter.w/2, y: layout.arbiter.y };
}
// Point on the coherency bus directly above arbiter centre — waypoint for routed particles
function arbiterBusEntry() {
  if (!layout.arbiter || !layout.bus) return arbiterTop();
  return { x: layout.arbiter.x + layout.arbiter.w/2, y: layout.bus.y };
}
// ── Slot pixel-position helpers ──
// Return {x,y} centre of a queue slot or ROB slot so bubbles appear ON the slot itself.
// Uses the same layout arithmetic as the canvas draw loop.
function queueSlotPos(slotIdx) {
  if (!layout.arbiter) return arbiterPos();
  var arb = layout.arbiter;
  var divX    = arb.x + arb.w * 0.48;
  var qLabelX = arb.x + 12;
  var innerY  = arb.y + 21;
  var slotH2  = 15, slotGap2 = 4, qSlotW2 = 24;
  var qSlotY  = innerY + 11;
  var sx = qLabelX + slotIdx * (qSlotW2 + slotGap2);
  return { x: sx + qSlotW2 / 2, y: qSlotY + slotH2 / 2 };
}
function robSlotPos(slotIdx) {
  if (!layout.arbiter) return arbiterPos();
  var arb = layout.arbiter;
  var divX     = arb.x + arb.w * 0.48;
  var robLabelX= divX + 18;
  var innerY   = arb.y + 21;
  var slotH2   = 15, slotGap2 = 4;
  var robSlotW2= Math.max(Math.floor((arb.x + arb.w - robLabelX - 12) / 6) - slotGap2, 18);
  var robSlotY = innerY + 11;
  var rx = robLabelX + slotIdx * (robSlotW2 + slotGap2);
  return { x: rx + robSlotW2 / 2, y: robSlotY + slotH2 / 2 };
}
// Route a particle through the bus correctly:
// from l1 → busP(smIdx) → arbiterBusEntry → arbiterTop (two right-angle turns, no diagonals)
function spawnRoutedToArbiter(smIdx, color, label, speed, onArrival) {
  var fromPos  = l1Pos(smIdx);
  var busJunct = busP(smIdx);
  var busAbove = arbiterBusEntry();
  var dest     = arbiterTop();
  // leg 1: L1 → bus junction (vertical up)
  particles.push(new Particle(fromPos, busJunct, color, label, speed, function() {
    // leg 2: bus junction → arbiter bus entry (horizontal along bus)
    particles.push(new Particle(busJunct, busAbove, color, label, speed * 1.1, function() {
      // leg 3: bus entry → arbiter top (vertical down)
      particles.push(new Particle(busAbove, dest, color, label, speed, function() {
        if (onArrival) onArrival();
      }));
    }));
  }));
}
// Route a GRANT signal from arbiter back to SM.
// GRANT is a control signal received by the warp scheduler — it travels all the
// way down to the SM's warp scheduler block so it's visually clear which SM got the grant.
function spawnGrantToSM(smIdx, onArrival) {
  var busAbove = arbiterBusEntry();
  var busJunct = busP(smIdx);
  // Find the warp scheduler block for this SM so GRANT visibly lands there
  var warpDest = busJunct; // fallback: stop at bus junction
  var sm = layout.sms[smIdx];
  if (sm) {
    for (var bi = 0; bi < sm.sub.length; bi++) {
      if (sm.sub[bi].type === 'warpScheduler') {
        warpDest = { x: sm.sub[bi].x + sm.sub[bi].w/2, y: sm.sub[bi].y + sm.sub[bi].h/2 };
        break;
      }
    }
    // If no warp scheduler block, land at bottom of SM
    if (warpDest === busJunct) {
      warpDest = { x: sm.x + sm.w/2, y: sm.y + sm.h - 8 };
    }
  }
  // Route: arbiterBusEntry (bus level) → busP(smIdx) (SM's bus junction) → warpDest (inside SM)
  // Start from arbiterBusEntry — the GRANT comes from the arbiter upward onto the bus,
  // then travels horizontally to the SM, then drops into the SM body.
  particles.push(new Particle(busAbove, busJunct, '#51cf66', 'GRANT', 3.0, function() {
    particles.push(new Particle(busJunct, warpDest, '#51cf66', 'GRANT', 2.5, function() {
      if (onArrival) onArrival();
    }));
  }));
}
// Route DATA from arbiter back to SM's L1 via the bus.
// Starts from arbiterBusEntry (bus level above arbiter) — NOT from arbiterTop —
// so the particle never visually passes back through the arbiter block body.
function spawnRoutedFromArbiter(smIdx, color, label, speed, onArrival) {
  var busAbove = arbiterBusEntry();
  var busJunct = busP(smIdx);
  var dest     = l1Pos(smIdx);
  // Route: arbiterBusEntry → busP(smIdx) → l1Pos(smIdx)
  // The particle emerges onto the bus at the arbiter's horizontal position,
  // then travels horizontally to the SM's bus junction, then drops into L1.
  particles.push(new Particle(busAbove, busJunct, color, label, speed * 1.1, function() {
    particles.push(new Particle(busJunct, dest, color, label, speed, function() {
      if (onArrival) onArrival();
    }));
  }));
}
// Passthrough: flash arbiter briefly when a non-atomic op crosses it on Apex
// Shows a dim pulse and a small label — particles routed through it as a waypoint
function spawnPassthrough(smIdx, color, label, speed, onArrival) {
  if (currentArch !== 'apex' || !layout.arbiter) {
    // Non-Apex: go straight bus → L2 as before
    particles.push(new Particle(busP(smIdx), l2Top(), color, label, speed, onArrival));
    return;
  }
  arbiterState.passthroughCount++;
  var busJunct  = busP(smIdx);
  var busAbove  = arbiterBusEntry();
  var arbEntry  = arbiterTop();
  var arbExit   = arbiterBot();
  var l2dest    = l2Top();
  // leg 1: bus junction → bus-above-arbiter (horizontal)
  particles.push(new Particle(busJunct, busAbove, color, label, speed * 1.1, function() {
    // leg 2: bus above → arbiter top (enter arbiter — vertical down)
    particles.push(new Particle(busAbove, arbEntry, color, label, speed, function() {
      // Passthrough pulse on arbiter
      flashEffects.push({ x:layout.arbiter.x, y:layout.arbiter.y, w:layout.arbiter.w, h:layout.arbiter.h,
        c: color, t:0, dur:0.35 });
      // leg 3: arbiter top → arbiter bottom (pass through — very short, vertical)
      particles.push(new Particle(arbEntry, arbExit, color, 'PASS', speed * 1.5, function() {
        // leg 4: arbiter bottom → L2 top (exit to L2)
        particles.push(new Particle(arbExit, l2dest, color, label, speed, function() {
          arbiterState.passthroughCount = Math.max(0, arbiterState.passthroughCount - 1);
          if (onArrival) onArrival();
        }));
      }));
    }));
  }));
}

// ════════════════════════════════════════
// ATOMIC SCENARIO
// ════════════════════════════════════════
