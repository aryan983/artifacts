// atomic.js — GPU Cache Coherency Demo

// Atomic scenario, app startup, canvas event listeners

function triggerAtomic() {
  if (paused) togglePause();
  var smCount2 = layout.sms.length;
  var isApex = currentArch === 'apex';
  showExplanation('atomic');

  if (isApex) {
    // ── APEX: Arbiter-serialized atomicAdd ──────────────────────────────────────
    if (arbiterState.active) return;
    logEvent('atomicAdd: ' + smCount2 + ' SMs → Arbiter', '#f59e0b');
    bubble((layout.bus.x1+layout.bus.x2)/2, layout.bus.y-12, 'atomic storm', '#f59e0b', { sub: smCount2+' reqs inbound', life:2.0 });
    resetArbiter();

    // Grant serialization: only one grant is outstanding at a time.
    // The ATOM is already physically inside the arbiter when granted —
    // we just need to route it arbEntry→arbExit→L2, not re-traverse the bus.
    var pendingGrants = [];   // {seq, smIdx} — fifo, head gets issued next
    var grantInFlight = false; // only one grant+RMW in flight through arbiter at once

    function tryNextGrant() {
      if (grantInFlight || pendingGrants.length === 0) return;
      var head = pendingGrants.shift();
      grantInFlight = true;
      issueGrant(head.seq, head.smIdx);
    }

    function issueGrant(seq, smIdx) {
      arbiterGrant(seq);
      logEvent('ARBITER: GRANT SEQ#'+seq+' → SM'+smIdx, '#51cf66');

      // Step 1: Send GRANT signal down to SM (control signal only, no data)
      spawnGrantToSM(smIdx, function() {
        // GRANT arrived at SM's bus junction — warp scheduler ACKs.
        // The ATOM is already at arbiterTop waiting — now route it through arbiter → L2.
        (function(capturedSeq, capturedIdx) {
          for (var pa = 0; pa < arbiterState.activeOps.length; pa++) {
            if (arbiterState.activeOps[pa].seq === capturedSeq) {
              arbiterState.activeOps[pa].phase = 'rmw';
              arbiterState.activeOps[pa].phaseName = ARB_PHASES.rmw.label;
              arbiterState.activeOps[pa].phaseStart = Date.now();
              break;
            }
          }

          // Dequeue now — slot frees as the ATOM proceeds
          arbiterDequeue(capturedSeq);

          var arbEntry = arbiterTop();
          var arbExit  = arbiterBot();
          var l2dest   = l2Top();

          // Step 2: RMW travels through arbiter body (arbEntry → arbExit)
          particles.push(new Particle(arbEntry, arbExit, '#f59e0b', 'RMW', 2.0, function() {
            // Arbiter body exited — next grant can now issue (queue slot freed above)
            grantInFlight = false;
            tryNextGrant();  // issue next grant now that arbiter body is clear

            // Step 3: RMW exits arbiter → L2
            particles.push(new Particle(arbExit, l2dest, '#f59e0b', 'RMW', 2.0, function() {
              flash(layout.l2, '#f59e0b');
              logEvent('L2: RMW SEQ#'+capturedSeq+' complete', '#ffa94d');
              for (var pb = 0; pb < arbiterState.activeOps.length; pb++) {
                if (arbiterState.activeOps[pb].seq === capturedSeq) {
                  arbiterState.activeOps[pb].phase = 'ack';
                  arbiterState.activeOps[pb].phaseName = ARB_PHASES.ack.label;
                  arbiterState.activeOps[pb].phaseStart = Date.now();
                  break;
                }
              }
              // L2 jitter: bimodal — 60% fast bank (50-180ms), 40% busy bank (320-600ms)
              var l2Jitter = Math.random() < 0.6
                ? 50  + Math.random() * 130
                : 320 + Math.random() * 280;
              setTimeout(function() {
                // Step 4: ACK returns from L2 → up through arbiter → bus level
                // l2Top → arbExit (bottom of arbiter) → arbiterTop → arbiterBusEntry
                // This makes the ACK visibly traverse the arbiter body upward
                particles.push(new Particle(l2Top(), arbExit, '#ffa94d', 'ACK#'+capturedSeq, 2.0, function() {
                  // ACK enters arbiter bottom — travel up through arbiter body to bus level
                  particles.push(new Particle(arbExit, arbiterBusEntry(), '#ffa94d', 'ACK#'+capturedSeq, 2.0, function() {
                    flash(layout.arbiter, '#ffa94d');
                    arbiterAckFromL2(capturedSeq, function() {
                      logEvent('ROB: SEQ#'+capturedSeq+' retired → DATA→SM'+capturedIdx, '#a78bfa');
                      // Step 5: DATA routes from bus level → SM bus junction → L1
                      // spawnRoutedFromArbiter starts at arbiterBusEntry (bus level), no air-travel
                      spawnRoutedFromArbiter(capturedIdx, '#ffa94d', 'DATA', 2.2, function() {
                        layout.sms[capturedIdx].l1.state = 'modified';
                        setL1Dirty(capturedIdx);
                        flash(layout.sms[capturedIdx].l1, '#f59e0b');
                        stats.hits++; updateStats();
                      });
                    });
                  }));
                }));
              }, l2Jitter);
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
              logEvent('SM'+idx+': ATOM arrived → SEQ#'+seq, '#f59e0b');
              flash(layout.arbiter, '#f59e0b');
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
    logEvent('atomicAdd: raw bus contention (no arbiter)', '#f59e0b');
    bubble((layout.bus.x1+layout.bus.x2)/2, layout.bus.y, 'no arbiter!', '#ff6b6b', { sub:'serialized at L2 (slow)', life:2.2 });
    for (var ri = 0; ri < smCount2; ri++) {
      (function(idx2) {
        setTimeout(function() {
          stats.misses++;
          bubble(l1Pos(idx2).x, l1Pos(idx2).y, 'atomicAdd', '#f59e0b', { sub:'racing for bus', life:1.4 });
          particles.push(new Particle(l1Pos(idx2), busP(idx2), '#f59e0b', 'ATOM', 2.5, function() {
            particles.push(new Particle(busP(idx2), l2Top(), '#f59e0b', 'ATOM', 2.5, function() {
              flash(layout.l2, '#f59e0b');
              logEvent('L2: atomic locked (SM'+idx2+')', '#ffa94d');
              setTimeout(function() {
                // DATA returns: l2Top → busP (horizontal along bus) → l1Pos (down to SM)
                spawnParticle(l2Top(), l1Pos(idx2), '#ffa94d', 'DATA', 2, function() {
                  layout.sms[idx2].l1.state = 'modified'; setL1Dirty(idx2);
                  flash(layout.sms[idx2].l1, '#f59e0b');
                  stats.hits++; updateStats();
                }, [busP(idx2)]);
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
  resize();
  if (!W || !H) { requestAnimationFrame(startApp); return; }
  buildLayout();
  initialized = true;
  updateKeyCard();
  updateArchIntro();
  updateScenarioButtons();
  buildInstrChips();
  lastTime = performance.now();
  requestAnimationFrame(drawFrame);
}
requestAnimationFrame(startApp);

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

