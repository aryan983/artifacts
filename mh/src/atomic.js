tate.activeOps[ao].phaseStart = Date.now();
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

  // Head already retiring — removal timer running, guard duplicate timers
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

  // Head not yet complete — waiting for its DATA from L2
  if (head.state !== 'complete') return;

  // ── Retire the head ────────────────────────────────────────────────────
  head.state = 'retiring';
  updateArbiterDom();
  var rPos = robSlotPos(0);
  bubble(rPos.x, rPos.y, '#'+head.seq+' ↗', '#51cf66', { sub:'retire → DATA to SM', life:1.2 });

  // Small pause so slot flips visible before DATA departs
  setTimeout(function() {
    head.state = 'done';
    updateArbiterDom();
    var cb = head.onRetired;
    if (cb) cb();  // DATA particle departs from ROB slot → SM (defined in triggerAtomic)

    (function(entry) {
      setTimeout(function() {
        arbiterState.rob = arbiterState.rob.filter(function(e){ return e.seq !== entry.seq; });
        arbiterState.activeOps = arbiterState.activeOps.filter(function(e){ return e.seq !== entry.seq; });
        if (arbiterState.queue.length === 0 && arbiterState.rob.length === 0) {
          arbiterState.active = false;
          arbiterState.contentionLevel = 0;
        }
        updateArbiterDom();
        // New head: if it's already complete (was buffered OOO), auto-retire it
        if (arbiterState.rob.length > 0 && arbiterState.rob[0].state === 'complete') {
          setTimeout(function() {
            var nextPos = robSlotPos(0);
            if (layout.arbiter) addCallout('rob-unblocked',
              layout.arbiter.x + layout.arbiter.w, layout.arbiter.y + layout.arbiter.h * 0.3,
              '🔓 #'+arbiterState.rob[0].seq+' unblocked', 'buffered DATA → retiring now',
              '#22d3ee', { side:'right', smIdx:-1, life:4, fadeDelay:0 });
            setTimeout(arbiterTryRetire, 350);
          }, 150);
        } else {
          arbiterTryRetire();
        }
      }, 500);
    })(head);
  }, 120);
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
    // Non-Apex: bus column → bus center (horizontal) → L2 top (vertical down)
    var busCenter0 = { x: l2Top().x, y: layout.bus.y };
    spawnParticle(busP(smIdx), l2Top(), color, label, speed, onArrival, [busCenter0]);
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


// ── atomic.js ──────────────────────────────────────────
// atomic.js — GPU Cache Coherency Demo

// Atomic scenario, app startup, canvas event listeners

function triggerAtomic() {
  if (paused) togglePause();
  var smCount2 = layout.sms.length;
  var isApex = currentArch === 'apex';
  showExplanation('atomic');
  if (!autoMode) openSidePanel('atomic');
  var _myOpId = _currentOpId;
  function logOp(msg, color) { logEvent(msg, color, _myOpId); }

  // Pick a single hotspot address - all SMs fight over this one
  var atomAddr = (typeof pickAddr !== 'undefined') ? pickAddr('atomic', 0) : -1;
  currentAddr = atomAddr;
  var atomAddrN = (atomAddr >= 0 && typeof ADDR_NAMES !== 'undefined') ? ADDR_NAMES[atomAddr] : '';
  if (atomAddr >= 0) logOp('atomicAdd target: ' + atomAddrN, '#f59e0b');

  if (isApex) {
    // ── APEX: Arbiter-serialized atomicAdd ──────────────────────────────────────
    if (arbiterState.active) return;
    logOp('atomicAdd: ' + smCount2 + ' SMs → Arbiter', '#f59e0b');
    bubble((layout.bus.x1+layout.bus.x2)/2, layout.bus.y-12, 'atomic storm', '#f59e0b', { sub: smCount2+' reqs inbound', life:2.0 });
    resetArbiter();

    // Grant serialization: only one grant is outstanding at a time.
    // The ATOM is already physically inside the arbiter when granted —
    // we just need to route it arbEntry→arbExit→L2, not re-traverse the bus.
    var pendingGrants = [];      // {seq, smIdx} — fifo, head gets issued next
    var grantInFlight = false;   // only one grant+RMW traversing arbiter body at once
    var l2ArrivalCount = 0;      // how many RMWs have physically arrived at L2
    var l2PendingCallbacks = []; // {seq, smIdx} for each arrived RMW

    function tryNextGrant() {
      if (grantInFlight || pendingGrants.length === 0) return;
      var head = pendingGrants.shift();
      grantInFlight = true;
      issueGrant(head.seq, head.smIdx);
    }

    function issueGrant(seq, smIdx) {
      arbiterGrant(seq);
      logOp('ARBITER: GRANT SEQ#'+seq+' → SM'+smIdx, '#51cf66');
      if (layout.arbiter) addCallout('arb-grant-'+seq,
        layout.arbiter.x + layout.arbiter.w, layout.arbiter.y + layout.arbiter.h/2,
        '⚡ GRANT #'+seq, 'RMW → L2 serialized',
        '#51cf66', { side:'right', smIdx:-1, life:5, fadeDelay:0 });

      spawnGrantToSM(smIdx, function() {
        (function(capturedSeq, capturedIdx) {
          for (var pa = 0; pa < arbiterState.activeOps.length; pa++) {
            if (arbiterState.activeOps[pa].seq === capturedSeq) {
              arbiterState.activeOps[pa].phase = 'rmw';
              arbiterState.activeOps[pa].phaseName = ARB_PHASES.rmw.label;
              arbiterState.activeOps[pa].phaseStart = Date.now();
              break;
            }
          }
          arbiterDequeue(capturedSeq);

          var arbEntry = arbiterTop();
          var arbExit  = arbiterBot();
          var l2dest   = l2Top();

          // RMW traverses arbiter body (serialized — one at a time)
          particles.push(new Particle(arbEntry, arbExit, '#f59e0b', 'RMW', 2.0, function() {
            // Release lock → next grant can now traverse arbiter body
            grantInFlight = false;
            tryNextGrant();

            // RMW continues to L2
            particles.push(new Particle(arbExit, l2dest, '#f59e0b', 'RMW', 2.0, function() {
              flash(layout.l2, '#f59e0b');
              logOp('L2: SEQ#'+capturedSeq+' RMW arrived', '#ffa94d');
              if (layout.l2) addCallout('rmw-exec-'+capturedSeq,
                layout.l2.x + layout.l2.w, layout.l2.y + layout.l2.h/2,
                'RMW exec', 'SEQ#'+capturedSeq+' · atomicAdd in-place',
                '#ffa94d', { side:'right', smIdx:-1, life:5, fadeDelay:0 });
              for (var pb = 0; pb < arbiterState.activeOps.length; pb++) {
                if (arbiterState.activeOps[pb].seq === capturedSeq) {
                  arbiterState.activeOps[pb].phase = 'ack';
                  arbiterState.activeOps[pb].phaseName = ARB_PHASES.ack.label;
                  arbiterState.activeOps[pb].phaseStart = Date.now();
                  break;
                }
              }

              // Track arrivals — only start L2 processing once ALL RMWs have arrived
              l2ArrivalCount++;
              l2PendingCallbacks.push({ seq: capturedSeq, smIdx: capturedIdx });

              if (l2ArrivalCount === smCount2) {
                // All RMWs at L2 — now assign random latencies and fire concurrently
                // Shuffle the callbacks so we log them in a random order too
                logOp('L2: all ' + smCount2 + ' RMWs received — processing concurrently', '#ffa94d');
                bubble(l2Top().x, l2Top().y, 'L2 processing', '#ffa94d',
                  { sub: smCount2 + ' ops · random latency', life: 1.8 });

                // ── L2 progress bars: one per SEQ, shown on right side of L2 ──
                // Bars fill left→right over their processing time.
                // They are registered BEFORE the shuffle so we know which slot fires first.
                // CHAINED dispatch: each DATA only fires after the previous one's
                // particle chain has fully ARRIVED at the ROB — then we wait an
                // additional 5–7s gap before firing the next one.
                // This is the ONLY way to guarantee X seconds BETWEEN arrivals,
                // since particle travel time (~8s) would otherwise eat into any
                // fixed setTimeout offset approach.
                var shuffled = l2PendingCallbacks.slice().sort(function(){ return Math.random()-0.5; });
                logOp('L2 processing ' + shuffled.length + ' RMWs — returning one by one', '#ffa94d');
                var returnOrder = shuffled.map(function(x){ return '#'+x.seq; }).join(' → ');
                logOp('Return order: ' + returnOrder, '#ffa94d');

                // Register progress bars in return order (shuffled order)
                // Bar 0 = first to return, fills fastest; bar 1 = second, etc.
                // Each bar's duration = cumulative time until that bar's DATA departs:
                //   bar 0: initialDelay (3-5s)
                //   bar 1: initialDelay + travel(~8s) + nextGap(5-7s) + travel...
                // We use wall-clock startTime + estimated total duration per slot.
                // Since exact times aren't known yet, we use a running estimate.
                l2ProgressBars = [];
                var _barNow = Date.now();
                var _initialEstimate = 4000; // midpoint of 3-5s initial delay
                var _travelEstimate  = 8500; // ~3 particles × 2.7s avg
                var _gapEstimate     = 6000; // midpoint of 5-7s chain gap
                shuffled.forEach(function(cb, slotIdx) {
                  // Cumulative time until this slot's DATA starts traveling
                  var cumDelay = _initialEstimate + slotIdx * (_travelEstimate + _gapEstimate);
                  l2ProgressBars.push({
                    seq: cb.seq,
                    slotIdx: slotIdx,
                    startTime: _barNow,
                    duration: cumDelay,  // bar fills over this many ms
                    done: false
                  });
                });

                // Kick off the chain: first response fires after 3–5s initial delay
                var _robArrivalCallbacks = [];
                var _chainIdx = 0;

                function fireNextDataResponse() {
                  if (_chainIdx >= shuffled.length) return;
                  var item = shuffled[_chainIdx];
                  _chainIdx++;
                  var captSeq = item.seq;
                  var captIdx = item.smIdx;
                  logOp('L2→ROB: DATA(' + (atomAddrN||'?') + ')#' + captSeq + ' departing', '#ffa94d');
                  // Mark this seq's progress bar as done (filled)
                  for (var _pbi = 0; _pbi < l2ProgressBars.length; _pbi++) {
                    if (l2ProgressBars[_pbi].seq === captSeq) {
                      l2ProgressBars[_pbi].done = true;
                      break;
                    }
                  }
                  if (layout.l2) addCallout('data-depart-'+captSeq,
                    layout.l2.x, layout.l2.y + layout.l2.h/2,
                    'DATA#'+captSeq+' →ROB', 'result ready · OOO return',
                    '#22d3ee', { side:'left', smIdx:-1, life:5, fadeDelay:0 });
                  // Find ROB slot for this SEQ#
                  var robSlotIdx = 0;
                  for (var rsi = 0; rsi < arbiterState.rob.length; rsi++) {
                    if (arbiterState.rob[rsi].seq === captSeq) { robSlotIdx = rsi; break; }
                  }
                  var robTarget = robSlotPos(robSlotIdx);
                  var dataLabel = 'DATA(' + (atomAddrN||'?') + ')#' + captSeq;

                  // DATA travels: L2 top → arbiter bottom → below ROB slot → into ROB slot
                  var arbBotCentre = arbExit;
                  var belowSlot = { x: robTarget.x, y: arbBotCentre.y };
                  particles.push(new Particle(l2Top(), arbBotCentre, '#ffa94d', dataLabel, 2.5, function() {
                    particles.push(new Particle(arbBotCentre, belowSlot, '#ffa94d', dataLabel, 2.8, function() {
                      particles.push(new Particle(belowSlot, robTarget, '#ffa94d', dataLabel, 2.8, function() {
                        // DATA arrived at ROB — CHAIN: schedule next response 5–7s from NOW
                        var nextGap = 5000 + Math.random() * 2000;
                        setTimeout(fireNextDataResponse, nextGap);

                        flash(layout.arbiter, '#ffa94d');
                        var isHead = (arbiterState.rob.length > 0 &&
                                      arbiterState.rob[0].seq === captSeq);
                        if (isHead) {
                          logOp('ROB: SEQ#'+captSeq+' is HEAD → retire now', '#51cf66');
                        } else {
                          logOp('ROB: SEQ#'+captSeq+' OOO → buffered in hold buffer', '#f59e0b');
                        }
                        arbiterAckFromL2(captSeq, function() {
                          var retirePos = robSlotPos(0);
                          var busEntry = arbiterBusEntry();
                          logOp('ROB: SEQ#'+captSeq+' retired → DATA via bus → SM'+captIdx, '#a78bfa');
                          // Orthogonal route: ROB slot → straight up to bus.y → left along bus to arbiter center → then to SM
                          var upToBus = { x: retirePos.x, y: busEntry.y }; // same x as slot, at bus height
                          particles.push(new Particle(retirePos, upToBus, '#51cf66', 'DATA', 2.8, function() {
                            particles.push(new Particle(upToBus, busEntry, '#51cf66', 'DATA', 2.5, function() {
                              spawnRoutedFromArbiter(captIdx, '#51cf66', 'DATA', 2.2, function() {
                                layout.sms[captIdx].l1.state = 'modified';
                                flashL1Slot(captIdx, atomAddr, '#f59e0b');
                                setL1Dirty(captIdx, 'atomic');
                                flash(layout.sms[captIdx].l1, '#f59e0b');
                                stats.hits++; updateStats();
                              });
                            }));
                          }));
                        });
                      }));
                    }));
                  }));
                }

                // Fire the first response after a 3–5s initial delay
                var initialDelay = 3000 + Math.random() * 2000;
                setTimeout(fireNextDataResponse, initialDelay);
              }
            }));
          }));
        })(seq, smIdx);
      });
    }

    // All SMs send their ATOMs toward the arbiter with a small spread (0-80ms)
    // ensuring they all arrive before any grant issues.
    for (var ai = 0; ai < smCount2; ai++) {
      (function(idx) {
        var launchDelay = idx * 18 + Math.random() * 25;  // staggered, not random overlap
        setTimeout(function() {
          stats.misses++;
          bubble(l1Pos(idx).x, l1Pos(idx).y, 'atomicAdd', '#f59e0b', { sub:'→ arbiter', life:1.2 });
          // ATOM travels: L1 → busP → arbiterBusEntry → arbiterTop (where it waits for grant)
          spawnRoutedToArbiter(idx, '#f59e0b', 'ATOM', 2.5, function() {
            // Particle is now physically AT arbiterTop. Enqueue it.
            function tryEnqueue() {
              var seq = arbiterEnqueue(idx, 'ATOM');
              if (seq === -1) {
                var iface = arbiterBusEntry();
                bubble(iface.x + (idx - 1.5) * 14, iface.y, 'STALLED', '#ff6b6b', { sub:'queue full', life:0.7 });
                setTimeout(tryEnqueue, 200);
                return;
              }
              logOp('SM'+idx+': ATOM arrived → SEQ#'+seq, '#f59e0b');
              flash(layout.arbiter, '#f59e0b');
              if (layout.arbiter) addCallout('atom-queued-'+seq,
                layout.arbiter.x, layout.arbiter.y + layout.arbiter.h/2,
                'ATOM queued', 'SEQ#'+seq+' · waiting grant',
                '#f59e0b', { side:'left', smIdx:-1, life:4, fadeDelay:0 });
              pendingGrants.push({ seq: seq, smIdx: idx });
              // Sort by SEQ# so grants always issue in strict sequence order,
              // regardless of which SM's particle arrived at arbiterTop first.
              // Without this, animation-timing jitter can invert grant order vs
              // the ROB, causing SEQ#1 to be granted before SEQ#0.
              pendingGrants.sort(function(a, b) { return a.seq - b.seq; });
              tryNextGrant();  // will only fire if nothing currently in flight
            }
            tryEnqueue();
          });
        }, launchDelay);
      })(ai);
    }
  } else {
    // Non-Apex: raw bus contention, no arbiter coordination
    logOp('atomicAdd: raw bus contention (no arbiter)', '#f59e0b');
    bubble((layout.bus.x1+layout.bus.x2)/2, layout.bus.y, 'no arbiter!', '#ff6b6b', { sub:'serialized at L2 (slow)', life:2.2 });
    for (var ri = 0; ri < smCount2; ri++) {
      (function(idx2) {
        setTimeout(function() {
          stats.misses++;
          bubble(l1Pos(idx2).x, l1Pos(idx2).y, 'atomicAdd', '#f59e0b', { sub:'racing for bus', life:1.4 });
          particles.push(new Particle(l1Pos(idx2), busP(idx2), '#f59e0b', 'ATOM', 2.5, function() {
            particles.push(new Particle(busP(idx2), l2Top(), '#f59e0b', 'ATOM', 2.5, function() {
              flash(layout.l2, '#f59e0b');
              logOp('L2: atomic locked (SM'+idx2+')', '#ffa94d');
              setTimeout(function() {
                // DATA returns: l2Top → busP (horizontal along bus) → l1Pos (down to SM)
                var _aL2={x:l2Top().x,y:layout.bus.y};
                spawnParticle(l2Top(), l1Pos(idx2), '#ffa94d', 'DATA', 2, function() {
                  flashL1Slot(idx2, atomAddr >= 0 ? atomAddr : -1, '#f59e0b'); layout.sms[idx2].l1.state = 'modified'; setL1Dirty(idx2, 'atomic');
                  flash(layout.sms[idx2].l1, '#f59e0b');
                  stats.hits++; updateStats();
                }, [_aL2, busP(idx2)]);
              }, 100 + Math.random() * 600); // random L2 lock contention
            }));
          }));
        }, Math.random() * 600); // random warp scheduler timing
      })(ri);
    }
  }
  updateStats();
}


function startApp() {
  try {
    resize();
    if (!W || !H) { requestAnimationFrame(startApp); return; }
    buildLayout();
    initialized = true;
    updateKeyCard();
    updateScenarioButtons();
    buildInstrChips();
    lastTime = performance.now();
    requestAnimationFrame(drawFrame);
    setTimeout(showIdleCallouts, 700);
  } catch(e) {
    var msg = 'startApp ERROR: ' + e.message + '\n' + (e.stack||'');
    console.error(msg);
    if (ctx) {
      ctx.fillStyle = '#0d0f1a'; ctx.fillRect(0,0,W||400,H||400);
      ctx.fillStyle = '#ff6b6b'; ctx.font = '11px monospace';
      msg.split('\n').forEach(function(l,i){ ctx.fillText(l.slice(0,80),10,20+i*15); });
    }
  }
}
// Robust startup for file:// and slow-layout environments
function _launchApp() {
  // Force a layout flush before starting
  document.body.offsetHeight;
  requestAnimationFrame(function() {
    document.body.offsetHeight; // second flush
    requestAnimationFrame(startApp);
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _launchApp);
} else {
  _launchApp();
}

// ── Background L2 writeback drain ────────────────────────────────────────
// Real GPU hardware has a background eviction engine that continuously drains
// dirty lines to DRAM. Fires every 3–6s: full particle animation
// L2 → Memory Crossbar → Global Memory Interface → HBM, just like a real WB.
var _l2EvictTimer = null;
function _scheduleL2Drain() {
  if (_l2EvictTimer) clearTimeout(_l2EvictTimer);
  var delay = 3000 + Math.random() * 3000; // 3–6s between background evictions
  _l2EvictTimer = setTimeout(function() {
    if (!paused && initialized && layout.l2 && layout.globalMem && layout.hbm) {
      // Find one dirty line to evict
      var dirtyIdx = -1;
      for (var _i = 0; _i < l2Lines.length; _i++) {
        var _ln = l2Lines[_i];
        var _isDirty = (typeof _ln === 'object' && _ln !== null)
                       ? _ln.s === 2
                       : _ln === 2;
        if (_isDirty) { dirtyIdx = _i; break; }
      }
      if (dirtyIdx >= 0) {
        // Mark clean immediately (hardware commits WB intent at eviction)
        if (typeof l2Lines[dirtyIdx] === 'object') {
          l2Lines[dirtyIdx].s = 1;
        } else {
          l2Lines[dirtyIdx] = 1;
        }
        // Full write-back animation: L2 → crossbar → GlobalMem → HBM
        bubble(l2Bot().x, l2Bot().y, 'BG writeback', '#ffa94d',
               { life: 1.4, sub: 'dirty victim → DRAM' });
        flash(layout.l2, '#ffa94d');
        particles.push(new Particle(l2Bot(), cbP(), '#ffa94d', 'WB', 1.8, function() {
          particles.push(new Particle(cbP(), gmTop(), '#ffa94d', 'WB', 1.8, function() {
            flash(layout.globalMem, '#339af0');
            bubble(gmTop().x, gmTop().y, 'MC write', '#339af0',
                   { life: 1.2, sub: 'scheduling store' });
            particles.push(new Particle(gmTop(), gmBot(), '#ffa94d', 'WB', 1.8, function() {
              particles.push(new Particle(gmBot(), hbmTop(), '#845ef7', 'STORE', 1.5, function() {
                flash(layout.hbm, '#845ef7');
                bubble(hbmTop().x, hbmTop().y, 'persisted', '#845ef7',
                       { life: 1.5, sub: 'BG drain → DRAM' });
              }));
            }));
          }));
        }));
      }
    }
    _scheduleL2Drain(); // always reschedule
  }, delay);
}
// Start drain after initial settle — 4s gives the first scenario time to run
setTimeout(_scheduleL2Drain, 4000);

var explainerEl = document.getElementById('step-list');
explainerEl.addEventListener('mousemove', function(e) {
  var target = e.target.closest('.micro-instr');
  if (target) {
    var key = target.getAttribute('data-instr');
    showInstrTooltip(key, e.clientX, e.clientY);
  } else {
    hideInstrTooltip();
  }
});
explainerEl.addEventListener('mouseleave', function() { hideInstrTooltip(); });
