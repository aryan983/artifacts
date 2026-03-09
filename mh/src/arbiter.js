INES; fk++) {
                    if (cacheState[smI].l1[fk].s === 2) {
                      (function(slot, delay) {
                        // Flash orange first
                        if (typeof flashL1Slot !== 'undefined') flashL1Slot(smI, cacheState[smI].l1[slot].addr, '#f97316');
                        // Then downgrade to clean after flash peaks
                        setTimeout(function() {
                          if (cacheState[smI] && cacheState[smI].l1[slot].s === 2) {
                            var flushedAddr = cacheState[smI].l1[slot].addr;
                            if (typeof flashL1Slot !== 'undefined') flashL1Slot(smI, flushedAddr, '#339af0');
                            cacheState[smI].l1[slot] = makeLine(1, cacheState[smI].l1[slot].op, flushedAddr);
                            // Mark exactly this address dirty in L2 (not a random slot)
                            if (flushedAddr >= 0) l2DirtyAddr(flushedAddr);
                          }
                        }, delay);
                      })(fk, flushDelay);
                      flushDelay += 80; // 80ms stagger between slots
                    }
                  }
                }
                fsmState.l1.state = 'shared'; // L1 is now clean — L2 is authority
                flash(fsmState.l1, '#f97316');
                stats.wb++;
                logOp('SM'+smI+': all lines written back, L1 → Shared', '#51cf66');
                bubble(l1Pos(smI).x, l1Pos(smI).y, 'L1 clean', '#51cf66', {sub:'WB complete', life:1.4});
                wbLanded++;
                if (wbLanded === dirtySMs.length) {
                  // All L1 WBs landed — now flush L2 → DRAM
                  flash(layout.l2, '#f97316');
                  bubble(l2Top().x, l2Top().y, 'L2 flushing', '#f97316', {sub:'→ DRAM', life:1.6});
                  logOp('L2: all dirty lines draining to DRAM', '#f97316');
                  setTimeout(doL2Flush, 400);
                }
              }, [busCtr]);
            }));
          })(dirtySMs[fj]);
        }
      }

      function doL2Flush() {
        // Count dirty L2 lines to drain
        var dirtyL2 = 0;
        for (var dl=0; dl<NUM_L2_LINES; dl++) { var _dl2=l2Lines[dl]?(typeof l2Lines[dl]==='object'?l2Lines[dl].s:l2Lines[dl]):0; if (_dl2 === 2) dirtyL2++; }

        if (dirtyL2 === 0) {
          logOp('FLUSH complete — no dirty L2 lines, all clean', '#51cf66');
          // Even with nothing dirty, show a quick scan particle so the bubble
          // doesn't pop up out of thin air — ping L2 then confirm clean.
          flash(layout.l2, '#51cf66');
          particles.push(new Particle(l2Bot(), cbP(), '#51cf66', 'CHK', 1.6, function() {
            particles.push(new Particle(cbP(), l2Bot(), '#51cf66', 'CLN', 1.4, function() {
              bubble(l2Top().x, l2Top().y, 'flush done', '#51cf66', {sub:'all caches clean', life:2.0});
              schedReactive('flush', si, '', 300);
              updateStats();
            }));
          }));
          return;
        }

        // Fire one EVICT particle representing the dirty drain
        logOp('L2: '+dirtyL2+' dirty line(s) draining to DRAM', '#f97316');
        particles.push(new Particle(l2Bot(), cbP(), '#f97316', 'FLUSH', 2.0, function() {
          particles.push(new Particle(cbP(), gmTop(), '#f97316', 'WR', 2.0, function() {
            flash(layout.globalMem, '#f97316');
            bubble(gmTop().x, gmTop().y, 'MC write', '#f97316', {sub:dirtyL2+' lines → HBM', life:1.4});
            particles.push(new Particle(gmTop(), gmBot(), '#f97316', 'WR', 1.8, function() {
              particles.push(new Particle(gmBot(), hbmTop(), '#845ef7', 'STORE', 1.5, function() {
                flash(layout.hbm, '#845ef7');
                bubble(hbmTop().x, hbmTop().y, 'persisted', '#845ef7',
                  {sub:dirtyL2+' lines written', life:2.0});
                logOp('HBM: '+dirtyL2+' dirty line(s) written — flush complete', '#845ef7');
                // Stagger L2 slot clean transitions — flash each dirty slot then clear it
                var cleanDelay = 0;
                for (var cl=0; cl<NUM_L2_LINES; cl++) {
                  var _cl2=l2Lines[cl]; if (!_cl2) continue;
                  var _cl2s = typeof _cl2==='object' ? _cl2.s : _cl2;
                  if (_cl2s === 2) {
                    (function(slot) {
                      var slotAddr = l2Lines[slot] && typeof l2Lines[slot]==='object' ? l2Lines[slot].addr : -1;
                      if (slotAddr >= 0) flashL2Slot(slotAddr, '#339af0');
                      setTimeout(function() {
                        var e = l2Lines[slot];
                        if (!e) return;
                        if (typeof e==='object') { if (e.s===2) e.s=1; }
                        else if (e===2) l2Lines[slot]=1;
                      }, cleanDelay + 60);
                    })(cl);
                    cleanDelay += 60;
                  }
                }
                setTimeout(function() {
                  // Clear all L1 physical lines and block state
                  for (var _fsi=0; _fsi<layout.sms.length; _fsi++) {
                    layout.sms[_fsi].l1.state = 'invalid';
                    if (cacheState[_fsi]) {
                      for (var _fli=0; _fli<NUM_LINES; _fli++)
                        cacheState[_fsi].l1[_fli] = makeLine(0, null, -1);
                    }
                  }
                  flash(layout.l2, '#51cf66');
                  bubble(l2Top().x, l2Top().y, 'L2 clean', '#51cf66', {sub:'flush complete', life:2.0});
                  logOp('FLUSH complete — all caches clean, HBM authoritative', '#51cf66');
                  schedReactive('flush', si, '', 300);
                  updateStats();
                }, cleanDelay + 80);
              }));
            }));
          }));
        }));
      }
      break;
    }

    case 'atomic':
      triggerAtomic();
      return;

    case 'reg_spill': {
      // ── Register Spill: regs → L1 (→ L2 if L1 full) then RELOAD back ──
      var regsP = regsPos(si);
      var l1B = layout.sms[si].l1;
      var l1P = l1Pos(si);

      logOp('SM'+si+': register pressure — spilling to L1', '#fb923c');
      bubble(regsP.x, regsP.y, 'reg pressure', '#fb923c', {sub:'out of registers'});
      stats.misses++;

      // Spike pressure visually to overflow
      setRegPressure(si, 1.10);  // overflow — bars visibly exceed capacity
      spawnParticle(regsP, l1P, '#fb923c', 'SPILL', 2.2, function() {
        var l1Full = (function() {
          var cs = cacheState[si]; if (!cs) return false;
          var filled = 0; for (var i=0;i<NUM_LINES;i++) if(cs.l1[i].s>0) filled++;
          return filled >= NUM_LINES - 2;
        })();

        if (!l1Full) {
          // L1 hit — absorb spill into L1 as a dirty line
          var spillAddr = fillL1Random(si, true, 'spill');
          if (spillAddr >= 0) flashL1Slot(si, spillAddr, '#fb923c');
          bubble(l1P.x, l1P.y, 'spill hit L1', '#fb923c', {sub:'~28 cycle penalty'});
          logOp('SM'+si+': spill → L1 hit (~28 cycles)', '#fb923c');

          // RELOAD after short delay
          setTimeout(function() {
            logOp('SM'+si+': RELOAD ← L1', '#fb923c');
            bubble(l1P.x, l1P.y, 'reloading', '#fb923c', {sub:'value back in regs'});
            spawnParticle(l1P, regsP, '#fb923c', 'RELOAD', 2.2, function() {
              flash(regsBlock(si) || layout.sms[si], '#fb923c');
              bubble(regsP.x, regsP.y, 'reg restored', '#51cf66', {sub:'warp resumes', life:1.8});
              logOp('SM'+si+': register restored — warp resumes', '#51cf66');
              schedReactive('reg_spill', si, '', 300);
              setRegPressure(si, 0.72 + Math.random() * 0.08);  // back to loaded baseline
              stats.hits++; updateStats();
            });
          }, 800);

        } else {
          // L1 full — spill cascades to L2
          bubble(l1P.x, l1P.y, 'L1 full!', '#ff6b6b', {sub:'spill → L2'});
          logOp('SM'+si+': L1 full — spill cascades to L2 (~200 cycles)', '#ff6b6b');
          spawnPassthrough(si, '#fb923c', 'SPILL', 2.2, function() {
            // Spill to L2: allocate a real L2 line for this spilled data (dirty)
            var spillL2Addr = fillL1Random(si, false, null); // evict from L1 to make conceptual room
            // Install the spill data as a fresh dirty line in L2
            var missingL2 = [];
            for (var sla=0; sla<NUM_ADDRS; sla++) { if (!l2HasAddr(sla)) missingL2.push(sla); }
            var spillL2 = missingL2.length > 0 ? missingL2[Math.floor(Math.random()*missingL2.length)] : -1;
            if (spillL2 >= 0) { l2InstallAddr(spillL2, true); flashL2Slot(spillL2, '#fb923c'); }
            flash(layout.l2, '#fb923c');
            bubble(l2Top().x, l2Top().y, 'spill in L2', '#fb923c', {sub:'~200 cycle penalty'});
            logOp('L2: spill absorbed (dirty — new register data)', '#fb923c');

            setTimeout(function() {
              logOp('SM'+si+': RELOAD ← L2', '#fb923c');
              var bcSpill = { x: l2Top().x, y: layout.bus.y };
              spawnParticle(l2Top(), l1P, '#fb923c', 'RELOAD', 2, function() {
                spawnParticle(l1P, regsP, '#fb923c', 'RELOAD', 2.2, function() {
                  flash(regsBlock(si) || layout.sms[si], '#fb923c');
                  bubble(regsP.x, regsP.y, 'reg restored', '#51cf66', {sub:'~200 cyc stall', life:1.8});
                  logOp('SM'+si+': register restored from L2', '#51cf66');
                  schedReactive('reg_spill', si, '', 300);
                  setRegPressure(si, 0.72 + Math.random() * 0.08);  // back to loaded baseline
                  stats.hits++; updateStats();
                });
              }, [bcSpill, busP(si)]);
            }, 700);
          });
        }
      });
      break;
    }




  }
  updateStats();
}

// ── arbiter.js ──────────────────────────────────────────
// arbiter.js — GPU Cache Coherency Demo

// Atomic arbiter state machine, ROB, spawn helpers, app utils

function toggleAuto() {
  autoMode = !autoMode;
  document.getElementById('btn-auto').classList.toggle('active', autoMode);
  if (autoMode) {
    // Switched back to auto — close side panel, clear manual ops
    closeSidePanel();
  }
  // When turning auto OFF: panel opens on first operation press, not immediately
}

function resetAll(silent) {
  // Stop any running program first, before touching state
  if (typeof sortRunning !== 'undefined' && (sortRunning || programMode)) stopProgram();
  particles=[]; flashEffects=[]; bubbles=[]; if(typeof slotFlashEffects!=='undefined') slotFlashEffects=[]; if(typeof slotL2FlashEffects!=='undefined') slotL2FlashEffects=[]; if(typeof closeSidePanel!=='undefined') closeSidePanel();
  stats={hits:0,misses:0,inv:0,wb:0,flush:0}; updateStats();
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
  l2ProgressBars = [];
  if(!silent) logEvent('Reset — all caches invalidated','#6b7094');
  calloutIdleShown = false;
  calloutIdleDismissed = false; // Reset re-enables idle callouts
  setTimeout(showIdleCallouts, 400);
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
  var isHead = false;
  for (var ri = 0; ri < arbiterState.rob.length; ri++) {
    if (arbiterState.rob[ri].seq === seq) {
      arbiterState.rob[ri].state = 'complete';
      arbiterState.rob[ri].onRetired = onRetired;
      robIdx = ri;
      isHead = (ri === 0);
      break;
    }
  }
  // Bubble directly on the ROB slot that just received DATA
  if (robIdx >= 0) {
    var rPos = robSlotPos(robIdx);
    if (isHead) {
      bubble(rPos.x, rPos.y, '#'+seq+' HEAD', '#51cf66', { sub: 'retiring now →', life: 1.6 });
    } else {
      // OOO — how many slots ahead of this one are still pending?
      var waiting = robIdx; // slots 0..robIdx-1 must retire first
      bubble(rPos.x, rPos.y, '#'+seq+' held', '#f59e0b', { sub: 'waiting for #'+(seq - robIdx), life: 2.5 });
    }
  }
  for (var ao = 0; ao < arbiterState.activeOps.length; ao++) {
    if (arbiterState.activeOps[ao].seq === seq) {
      arbiterState.activeOps[ao].phase = isHead ? 'retiring' : 'complete';
      arbiterState.activeOps[ao].phaseName = isHead ? ARB_PHASES.retiring.label : 'buffered';
      arbiterS
