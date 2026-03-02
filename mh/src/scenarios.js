// scenarios.js — GPU Cache Coherency Demo

// Cache scenario triggers, explanations, auto mode

function getExplanation(type) {
  var arch = currentArch;
  var e = {
    read:{ title:'L1 Read Miss → L2 Fetch', color:'#ff6b6b',
      steps:[
        {text:'<strong>Warp issues load</strong> — global memory read.', micro:'LD.E Rx, [addr]', delay:0},
        {text:'<strong>L1 tag lookup: MISS</strong>', micro:'Tag compare → miss', delay:700},
        {text:'<strong>Request to L2</strong>', micro:'RdReq → Bus → L2', delay:1500},
        {text:'<strong>L2 hit</strong> — data read from L2.', micro:'L2 '+ARCHS[arch].blocks.l2.size+' slice lookup', delay:2500},
        {text:'<strong>Data returns</strong> — cache line fills L1.', micro:'DATA → SM L1 fill', delay:3300},
        {text:'<strong>L1 → Shared</strong>', micro:'State: Invalid → Shared', delay:4000},
      ], summary: arch==='pascal' ? 'Pascal L1 is read-only for globals.' : 'Standard read miss path.'
    },
    write:{ title: arch==='pascal' ? 'SM Write → Direct to L2' : 'SM Write → Invalidate Others', color:'#51cf66',
      steps: arch==='pascal' ? [
        {text:'<strong>Warp issues store</strong>', micro:'ST.E [addr], Rx', delay:0},
        {text:'<strong>L1 bypassed</strong> — write goes directly to L2.', micro:'Write-through: skip L1', delay:500},
        {text:'<strong>L2 absorbs write</strong>', micro:'L2 SRAM write', delay:1200},
        {text:'<strong>No invalidation needed</strong>', micro:'No INV broadcast', delay:1800},
      ] : [
        {text:'<strong>Warp issues store</strong>', micro:'ST.E [addr], Rx', delay:0},
        {text:'<strong>L1 → Modified</strong> — write-evict policy.', micro:'Write-evict: L1 drop + L2 write', delay:500},
        {text:'<strong>Invalidation broadcast</strong>', micro:'INV → all SMs via bus', delay:1200},
        {text:'<strong>Remote L1s invalidated</strong>', micro:'Other SMs: * → Invalid', delay:2000},
        {text:'<strong>Coherency restored</strong>', micro:'Single-writer invariant', delay:2800},
      ], summary: arch==='pascal' ? 'Pascal: L1 read-only, writes go to L2.' : 'Write-evict: L1 line dropped, L2 gets the write.'
    },
    invalidate:{ title:'Broadcast Invalidation', color:'#f06595',
      steps:[
        {text:'<strong>Coherency event</strong>', micro:'SM write or host DMA', delay:0},
        {text:'<strong>Bus broadcasts INV</strong>', micro:'INV(addr) → all SMs', delay:600},
        {text:'<strong>L1 tags probed</strong>', micro:'Parallel tag lookup', delay:1200},
        {text:'<strong>All copies dropped</strong>', micro:'All: * → Invalid', delay:2200},
      ], summary:'Broadcast invalidation scales linearly with SM count.'
    },
    writeback:{ title:'Write-Back → L2 → '+ARCHS[currentArch].blocks.hbm.label, color:'#ffa94d',
      steps:[
        {text:'<strong>L1 eviction</strong> — dirty line needs to leave L1.', micro:'Capacity eviction or flush', delay:0},
        {text:'<strong>Data → L2</strong>', micro:'WB+DATA → L2 slice', delay:800},
        {text:'<strong>L2 absorbs</strong>', micro:'L2 write', delay:1800},
        {text:'<strong>L2 eviction</strong> — if full, victim evicted to DRAM.', micro:'LRU victim → NoC → MC', delay:3000},
        {text:'<strong>'+ARCHS[arch].blocks.hbm.label+' write</strong>', micro:'MC → bank write', delay:4000},
        {text:'<strong>Stored in '+ARCHS[arch].blocks.hbm.label+'</strong>', micro:'~400+ cycles total', delay:4800},
      ], summary:'Full eviction cascade: L1→L2→MC→DRAM.'
    },
    shared:{ title: currentArch==='hopper' ? 'Shared Mem + DSMEM' : 'Shared Memory Access', color:'#51cf66',
      steps: currentArch==='hopper' ? [
        {text:'<strong>Thread accesses __shared__</strong>', micro:'LDS Rx, [smem_addr]', delay:0},
        {text:'<strong>Direct SRAM access</strong> — no coherency. 32 banks.', micro:'~20 cycles', delay:500},
        {text:'<strong>DSMEM option</strong> — access other SMs\' shared memory.', micro:'dst_sm.smem[addr]', delay:1200},
        {text:'<strong>Cluster-local</strong> — DSMEM at SMEM latency.', micro:'~20 cycles cross-SM', delay:1800},
      ] : [
        {text:'<strong>Thread accesses __shared__</strong>', micro:'LDS Rx, [smem_addr]', delay:0},
        {text:'<strong>Direct SRAM access</strong> — no coherency.', micro:'~20 cycles, 32 banks', delay:500},
        {text:'<strong>Bank conflict check</strong>', micro:'Best: 1 cycle. Worst: 32-way', delay:1100},
        {text:'<strong>SM-local only</strong> — no bus traffic.', micro:'Scope: CTA local', delay:1600},
      ], summary: currentArch==='hopper' ? 'DSMEM enables cross-SM shared memory within a cluster.' : 'Shared memory sidesteps coherency by being SM-private.'
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
    cp_async: { title:'cp.async — Global → SMEM (No Register Stall)', color:'#22d3ee',
      steps:[
        {text:'<strong>Warp issues cp.async</strong> — initiates async DMA.', micro:'cp.async.ca smem[addr], [gmem]', delay:0},
        {text:'<strong>Warp continues immediately</strong> — no register stall.', micro:'Next compute instruction runs', delay:400},
        {text:'<strong>Data fetches from global memory</strong> — in background.', micro:'LD global → bypass registers', delay:900},
        {text:'<strong>L2 serves the line</strong> — or DRAM on L2 miss.', micro:'L2 slice lookup', delay:1700},
        {text:'<strong>Data lands directly in SMEM</strong> — no register touch.', micro:'DATA → SMEM (bypass reg file)', delay:2600},
        {text:'<strong>Warp barrier</strong> — commit point ensures data is ready.', micro:'cp.async.commit_group / wait', delay:3400},
      ], summary:'cp.async decouples memory latency from compute — the key to software pipelining on Ampere and Hopper.'
    },
    tma_load: { title:'TMA Load — Tensor Tile → SMEM (Hardware DMA)', color:'#22d3ee',
      steps:[
        {text:'<strong>One thread issues TMA descriptor</strong>', micro:'cp.async.bulk.tensor ... smem', delay:0},
        {text:'<strong>TMA engine takes over</strong> — threads completely free.', micro:'HW DMA: address calc offloaded', delay:500},
        {text:'<strong>All threads compute on prev tile</strong>', micro:'WGMMA / tensor core compute', delay:1000},
        {text:'<strong>TMA fetches tile from global memory</strong>', micro:'TILE → NoC → L2 → Bus', delay:1600},
        {text:'<strong>Tile arrives in SMEM</strong> — zero register pressure.', micro:'TILE → SMEM direct deposit', delay:2700},
        {text:'<strong>Barrier completes</strong> — next tile ready for compute.', micro:'mbarrier::arrive_and_expect_tx', delay:3500},
      ], summary:'TMA completely hides memory latency — one thread drives bulk DMA while all other threads compute. The Hopper pipeline model.'
    }
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

function logEvent(msg, color) {
  var log=document.getElementById('event-log');
  var e=document.createElement('div'); e.className='log-entry';
  e.innerHTML='<span class="tag" style="background:'+color+'30;color:'+color+'">'+new Date().toLocaleTimeString().slice(0,8)+'</span> '+msg;
  log.prepend(e); if(log.children.length>40) log.lastChild.remove();
}

function updateStats() {
  document.getElementById('stat-hits').textContent=stats.hits;
  document.getElementById('stat-misses').textContent=stats.misses;
  document.getElementById('stat-inv').textContent=stats.inv;
  document.getElementById('stat-wb').textContent=stats.wb;
}

function triggerScenario(type, silent) {
  if (paused) togglePause();

  var si = Math.floor(Math.random()*layout.sms.length);
  showExplanation(type);
  var sm = layout.sms[si];

  // For write on non-Pascal, prefer an SM that has a Shared line so the write is meaningful
  if (type === 'write' && currentArch !== 'pascal') {
    for (var wi0 = 0; wi0 < layout.sms.length; wi0++) {
      if (layout.sms[wi0].l1.state === 'shared') { si = wi0; sm = layout.sms[si]; break; }
    }
  }

  // ── Precondition enforcement ──
  // Each scenario has requirements. If not met, tell the user clearly and abort.
  // In silent (auto) mode we abort silently — no toast shown.
  if (type === 'write' && currentArch !== 'pascal') {
    var anyShared = layout.sms.some(function(s){ return s.l1.state === 'shared'; });
    if (!anyShared) {
      if (!silent) notifyUser('SM Write needs cached data first',
        'No SM has a Shared line in L1. Run SM Read first to populate the cache, then write.', '#51cf66');
      return;
    }
  }
  if (type === 'invalidate') {
    var anyValid = layout.sms.some(function(s){ return s.l1.state !== 'invalid'; });
    if (!anyValid) {
      if (!silent) notifyUser('Nothing to invalidate',
        'All L1 caches are already empty (Invalid). Run SM Read first to put data in L1.', '#f06595');
      return;
    }
  }
  if (type === 'writeback') {
    var anyModified = layout.sms.some(function(s){ return s.l1.state === 'modified'; });
    if (!anyModified) {
      if (!silent) notifyUser('No dirty data to write back',
        'Write-back needs a Modified (dirty) L1 line. Run SM Write first to dirty a line.', '#ffa94d');
      return;
    }
    for (var mi = 0; mi < layout.sms.length; mi++) {
      if (layout.sms[mi].l1.state === 'modified') { si = mi; sm = layout.sms[si]; break; }
    }
  }
  if (type === 'atomic' && currentArch === 'apex' && arbiterState.active) {
    if (!silent) notifyUser('Arbiter busy',
      'An atomic sequence is already in flight. Wait for it to complete or Reset.', '#f59e0b');
    return;
  }

  switch(type) {
    case 'read': {
      // L1 miss — force invalid so the read request is clearly needed
      if (sm.l1.state !== 'invalid') { sm.l1.state = 'invalid'; }
      stats.misses++;

      // Check L2 occupancy — if <25% filled treat as L2 miss → go to DRAM
      var l2Filled = 0;
      for (var rl = 0; rl < NUM_L2_LINES; rl++) if (l2Lines[rl] > 0) l2Filled++;
      var l2Hit = l2Filled > Math.floor(NUM_L2_LINES * 0.25);

      if (l2Hit) {
        logEvent('SM'+si+': L1 miss → L2 hit','#ff6b6b');
        bubble(l1Pos(si).x,l1Pos(si).y,'L1 miss','#ff6b6b',{sub:'checking L2'});
        particles.push(new Particle(l1Pos(si),busP(si),'#ff6b6b','RdReq',2,function(){
          spawnPassthrough(si,'#ff6b6b','RdReq',2.5,function(){
            logEvent('L2: hit — line found, serving to SM'+si,'#ffa94d');
            l2AbsorbOne();
            bubble(l2Top().x,l2Top().y,'L2 hit','#51cf66',{life:1.5,sub:'data ready'});
            spawnParticle(l2Top(), l1Pos(si), '#ffa94d', 'DATA', 2, function(){
              sm.l1.state='shared'; fillL1Random(si, false); flash(sm.l1,'#339af0');
              bubble(l1Pos(si).x,l1Pos(si).y,'line cached','#339af0',{life:1.6,sub:'L1 → Shared'});
              logEvent('SM'+si+': L1 → Shared (filled from L2)','#339af0');
              stats.hits++;
            }, [busP(si)]);
          });
        }));
      } else {
        // L2 miss — request goes all the way to DRAM, L2 fills on return
        logEvent('SM'+si+': L1 miss → L2 miss → DRAM fetch','#ff6b6b');
        bubble(l1Pos(si).x,l1Pos(si).y,'L1 miss','#ff6b6b',{sub:'L2 empty → DRAM'});
        particles.push(new Particle(l1Pos(si),busP(si),'#ff6b6b','RdReq',2,function(){
          spawnPassthrough(si,'#ff6b6b','RdReq',2.5,function(){
            bubble(l2Top().x,l2Top().y,'L2 miss','#ff6b6b',{life:1.4,sub:'→ global mem'});
            logEvent('L2: miss — forwarding to global memory','#ff6b6b');
            // RdReq continues down: L2 → globalMem → HBM
            spawnParticle(l2Top(), gmTop(), '#ff6b6b', 'RdReq', 2.2, function(){
              flash(layout.globalMem,'#339af0');
              bubble(gmTop().x,gmTop().y,'DRAM fetch','#339af0',{life:1.4,sub:'~400 cycles'});
              logEvent('GlobalMem: reading from HBM','#339af0');
              spawnParticle(gmTop(), hbmTop(), '#339af0', 'RdReq', 2.0, function(){
                flash(layout.hbm,'#845ef7');
                bubble(hbmTop().x,hbmTop().y,'HBM read','#845ef7',{life:1.2,sub:'data found'});
                // DATA returns: HBM → globalMem → L2 (fills L2) → bus → L1
                spawnParticle(hbmTop(), gmTop(), '#845ef7', 'DATA', 2.2, function(){
                  flash(layout.globalMem,'#339af0');
                  spawnParticle(gmTop(), l2Top(), '#339af0', 'DATA', 2.2, function(){
                    // L2 fills as line comes through
                    l2AbsorbOne(); l2AbsorbOne(); flash(layout.l2,'#ffa94d');
                    bubble(l2Top().x,l2Top().y,'L2 filled','#ffa94d',{life:1.5,sub:'cached for next time'});
                    logEvent('L2: line installed from DRAM','#ffa94d');
                    spawnParticle(l2Top(), l1Pos(si), '#ffa94d', 'DATA', 2, function(){
                      sm.l1.state='shared'; fillL1Random(si,false); flash(sm.l1,'#339af0');
                      bubble(l1Pos(si).x,l1Pos(si).y,'line cached','#339af0',{life:1.6,sub:'L1 → Shared'});
                      logEvent('SM'+si+': L1 → Shared (filled from DRAM via L2)','#339af0');
                      stats.hits++;
                    }, [busP(si)]);
                  });
                });
              });
            });
          });
        }));
      }
      break;
    }
    case 'write':
      if (currentArch==='pascal') {
        // Pascal: L1 is read-only for global data. Writes bypass L1 entirely.
        // Particle originates from the SM body (warp/register level), skips L1, goes straight to bus.
        logEvent('SM'+si+': Write → bus (L1 bypassed)','#51cf66');
        stats.hits++;
        var warpSrc = { x: sm.x + sm.w/2, y: sm.y + 18 };
        bubble(warpSrc.x, warpSrc.y, 'write bypass','#51cf66',{sub:'L1 read-only'});
        // L1 state unchanged — it wasn't involved
        spawnParticle(warpSrc, l2Top(), '#51cf66', 'WR', 2, function(){
          flash(layout.l2,'#ffa94d'); l2AbsorbDirty();
          bubble(l2Top().x,l2Top().y,'L2 updated','#ffa94d',{life:1.5,sub:'write absorbed (dirty)'});
          logEvent('L2: Write-through received — line dirty','#ffa94d');
        }, [busP(si)]);
      } else {
        // Volta+: Write-evict policy.
        // Step 1: SM writes the line into L1 → L1 = Modified (the SM owns it now).
        // Step 2: INV fires to any SM that has a Shared copy of this line.
        // The line stays in L1 as Modified until capacity pressure evicts it (that's writeback).
        // We do NOT evict to L2 here — that's a separate scenario.
        stats.hits++;
        logEvent('SM'+si+': Write → L1 Modified, INV others','#51cf66');
        bubble(l1Pos(si).x,l1Pos(si).y,'write hit','#51cf66',{sub:'L1 → Modified'});

        // Snapshot which SMs have Shared copies right now (before state changes)
        var staleSMs = [];
        for (var wi=0;wi<layout.sms.length;wi++) {
          if (wi!==si && layout.sms[wi].l1.state==='shared') staleSMs.push(wi);
        }

        // L1 of writing SM goes Modified immediately (the write happened locally)
        sm.l1.state='modified'; setL1Dirty(si); flash(sm.l1,'#51cf66');

        // WR packet travels to bus to announce the write (triggers INV broadcast)
        particles.push(new Particle(l1Pos(si),busP(si),'#51cf66','WR',2,function(){
          bubble(busP(si).x,busP(si).y,'announcing write','#51cf66',{life:1.2,sub:'INV outgoing'});

          if (staleSMs.length === 0) {
            logEvent('SM'+si+': No other sharers — no INV needed','#51cf66');
            return;
          }

          // On Apex: route INV via the Coherency Directory (targeted, not broadcast)
          if (currentArch === 'apex' && layout.cohDir) {
            var cdCentre = { x: layout.cohDir.x + layout.cohDir.w/2, y: layout.cohDir.y + layout.cohDir.h/2 };
            // Consult directory: WR → cohDir
            particles.push(new Particle(busP(si), l2Top(), '#f06595', 'WR→DIR', 2.5, function(){
              flash(layout.cohDir, '#f06595');
              bubble(cdCentre.x, cdCentre.y, 'dir lookup','#f06595',{life:1.3,sub:'checking sharers'});
              logEvent('CohDir: '+staleSMs.length+' sharer(s) found → targeted INV','#f06595');
              // Directory knows exactly which SMs have copies — fire targeted INV only to them
              for (var wj=0;wj<staleSMs.length;wj++) {
                (function(idx){
                  setTimeout(function(){
                    // Targeted INV: l2Top → busP(idx) → l1Pos(idx)
                    spawnParticle(l2Top(), l1Pos(idx), '#f06595', 'INV', 2.8, function(){
                      layout.sms[idx].l1.state='invalid';
                      invalidateL1Lines(idx, 1 + Math.floor(Math.random()*2));
                      flash(layout.sms[idx].l1,'#f06595');
                      bubble(l1Pos(idx).x,l1Pos(idx).y,'line dropped','#f06595',{life:1.3,sub:'targeted INV'});
                      logEvent('SM'+idx+': 1-2 lines invalidated (targeted)','#f06595');
                      stats.inv++; updateStats();
                    }, [busP(idx)]);
                  }, wj*180);
                })(staleSMs[wj]);
              }
            }));
          } else {
            // Non-Apex: broadcast INV to all SMs that have a Shared copy
            for (var wj=0;wj<staleSMs.length;wj++) {
              (function(idx){
                setTimeout(function(){
                  particles.push(new Particle(busP(si),busP(idx),'#f06595','INV',3,function(){
                    particles.push(new Particle(busP(idx),l1Pos(idx),'#f06595','INV',2,function(){
                      layout.sms[idx].l1.state='invalid';
                      // INV carries specific address — only drop 1-2 matching lines, rest of L1 stays
                      invalidateL1Lines(idx, 1 + Math.floor(Math.random()*2));
                      flash(layout.sms[idx].l1,'#f06595');
                      bubble(l1Pos(idx).x,l1Pos(idx).y,'line dropped','#f06595',{life:1.3,sub:'addr match'});
                      logEvent('SM'+idx+': 1-2 lines invalidated','#f06595');
                      stats.inv++; updateStats();
                    }));
                  }));
                }, wj*180 + Math.round(Math.random()*60));
              })(staleSMs[wj]);
            }
          }
        }));
      }
      break;
    case 'invalidate':
      // validSMs already verified non-empty by precondition above
      var validSMs = [];
      for (var ii=0;ii<layout.sms.length;ii++) {
        if (layout.sms[ii].l1.state !== 'invalid') validSMs.push(ii);
      }
      stats.inv++;
      // L2 state does NOT change here — L2 is the coherence point and retains all lines.
      // Only L1 copies are dropped.
      logEvent('Broadcast INV → '+validSMs.length+' SM(s) with valid lines','#f06595');
      bubble((layout.bus.x1+layout.bus.x2)/2,layout.bus.y,'INV broadcast','#f06595',{sub:validSMs.length+' SM(s) targeted'});

      if (currentArch === 'apex' && layout.cohDir) {
        // Apex: Coherency Directory knows exactly which SMs have copies.
        // Packet goes bus→cohDir, then targeted INV fires only to SMs in directory.
        var cdPos2 = { x: layout.cohDir.x + layout.cohDir.w/2, y: layout.cohDir.y + layout.cohDir.h/2 };
        var busCenter = {x:(layout.bus.x1+layout.bus.x2)/2, y:layout.bus.y};
        particles.push(new Particle(busCenter, l2Top(), '#f06595', 'INV', 2.5, function(){
          flash(layout.cohDir, '#f06595');
          bubble(cdPos2.x, cdPos2.y, 'dir lookup','#f06595',{life:1.3,sub:validSMs.length+' sharer(s)'});
          logEvent('CohDir: targeted INV to '+validSMs.length+' SM(s)','#f06595');
          for (var vi=0;vi<validSMs.length;vi++) {
            (function(idx){
              setTimeout(function(){
                spawnParticle(l2Top(), l1Pos(idx), '#f06595', 'INV', 2.8, function(){
                  layout.sms[idx].l1.state = 'invalid';
                  invalidateL1Lines(idx, 1 + Math.floor(Math.random()*2));
                  flash(layout.sms[idx].l1,'#f06595');
                  bubble(l1Pos(idx).x,l1Pos(idx).y,'line(s) dropped','#f06595',{life:1.2,sub:'targeted'});
                }, [busP(idx)]);
              }, vi*140);
            })(validSMs[vi]);
          }
        }));
      } else {
        // Non-Apex: broadcast INV from bus centre to all SMs with valid lines.
        // Each INV carries a specific address — it drops 1-2 matching lines, not all of L1.
        for (var vi=0;vi<validSMs.length;vi++) {
          (function(idx){
            setTimeout(function(){
              var from={x:(layout.bus.x1+layout.bus.x2)/2,y:layout.bus.y};
              particles.push(new Particle(from,busP(idx),'#f06595','INV',3,function(){
                particles.push(new Particle(busP(idx),l1Pos(idx),'#f06595','INV',2,function(){
                  layout.sms[idx].l1.state='invalid';
                  // Drop only the lines matching the invalidated address — 1 to 2 lines
                  invalidateL1Lines(idx, 1 + Math.floor(Math.random()*2));
                  flash(layout.sms[idx].l1,'#f06595');
                  bubble(l1Pos(idx).x,l1Pos(idx).y,'line(s) dropped','#f06595',{life:1.2,sub:'addr match'});
                  logEvent('SM'+idx+': L1 line(s) invalidated','#f06595');
                }));
              }));
            }, vi*120 + Math.round(Math.random()*60));
          })(validSMs[vi]);
        }
      }
      break;
    case 'writeback':
      // Precondition already ensures sm is Modified — only coerce lines if not already dirty
      if (sm.l1.state !== 'modified') { sm.l1.state='modified'; setL1Dirty(si); }
      logEvent('SM'+si+': Write-back → L2','#ffa94d');
      bubble(l1Pos(si).x,l1Pos(si).y,'dirty evict','#ffa94d',{sub:'must flush out'});
      particles.push(new Particle(l1Pos(si),busP(si),'#ffa94d','WB',2,function(){
        spawnPassthrough(si,'#ffa94d','WB',2.5,function(){
          // WB arrives at L2: mark L1 clean (evicted from L1), dirty line now lives in L2
          sm.l1.state='invalid'; invalidateL1(si); l2Dirty(); stats.wb++;
          flash(layout.l2,'#ffa94d');
          bubble(l2Top().x,l2Top().y,'L2 absorbed','#ffa94d',{life:1.4,sub:'dirty → L2'});
          logEvent('L2: Write-back received — line dirty in L2','#ffa94d');
          // L2 eviction cascade: only fires if L2 is >75% full (realistic pressure)
          var l2FilledCount = 0;
          for (var li=0;li<NUM_L2_LINES;li++) if(l2Lines[li]>0) l2FilledCount++;
          var l2Pressure = l2FilledCount / NUM_L2_LINES;
          if (l2Pressure > 0.75) {
            setTimeout(function(){
              // Evict dirty victim from L2 → crossbar → globalMem → HBM
              l2Evict();
              bubble(l2Bot().x,l2Bot().y,'L2 evicting','#339af0',{life:1.3,sub:'victim to DRAM'});
              particles.push(new Particle(l2Bot(),cbP(),'#339af0','EVICT',2,function(){
                particles.push(new Particle(cbP(),gmTop(),'#339af0','WR',2,function(){
                  flash(layout.globalMem,'#339af0');
                  bubble(gmTop().x,gmTop().y,'queued MC','#339af0',{life:1.2,sub:'scheduling write'});
                  particles.push(new Particle(gmTop(),gmBot(),'#339af0','WR',2,function(){
                    particles.push(new Particle(gmBot(),hbmTop(),'#845ef7','STORE',1.5,function(){
                      flash(layout.hbm,'#845ef7');
                      bubble(hbmTop().x,hbmTop().y,'persisted','#845ef7',{life:1.5,sub:'written to DRAM'});
                      logEvent(ARCHS[currentArch].blocks.hbm.label+': Stored','#845ef7');
                    }));
                  }));
                }));
              }));
            },500);
          } else {
            logEvent('L2: Dirty line retained — no eviction needed','#ffa94d');
          }
        });
      }));
      break;
    case 'shared':
      var smemBlock=null;
      for(var sbi=0;sbi<sm.sub.length;sbi++){if(sm.sub[sbi].type==='smem')smemBlock=sm.sub[sbi];}
      if(!smemBlock) break;
      logEvent('SM'+si+': SMEM access','#51cf66');
      flash(smemBlock,'#51cf66'); stats.hits++;
      fillSmem(si);
      bubble(sm.x+sm.w/2,sm.y+14,'no coherency','#51cf66',{sub:'SM-private scratchpad'});
      var regsBlockEl=null;
      for(var ri=0;ri<sm.sub.length;ri++){if(sm.sub[ri].type==='regs')regsBlockEl=sm.sub[ri];}
      var sfrom={x:sm.x+sm.w/2,y:regsBlockEl?regsBlockEl.y+3:sm.y+40};
      particles.push(new Particle(sfrom,{x:smemBlock.x+smemBlock.w/2,y:smemBlock.y+smemBlock.h/2},'#51cf66','ST.S',1.5,function(){
        bubble(smemBlock.x+smemBlock.w/2,smemBlock.y,'~20 cycles','#51cf66',{life:1.4,sub:'fast SRAM hit'});
      }));
      if (currentArch==='hopper'&&layout.sms.length>1) {
        var other=(si+1)%layout.sms.length;
        var otherDsmem=null, myDsmem=null;
        for(var od=0;od<layout.sms[other].sub.length;od++){if(layout.sms[other].sub[od].type==='dsmem')otherDsmem=layout.sms[other].sub[od];}
        for(var md=0;md<sm.sub.length;md++){if(sm.sub[md].type==='dsmem')myDsmem=sm.sub[md];}
        if(otherDsmem&&myDsmem){
          setTimeout(function(){
            logEvent('SM'+si+' → SM'+other+': DSMEM read','#22d3ee');
            bubble(myDsmem.x+myDsmem.w/2,myDsmem.y,'peer read','#22d3ee',{sub:'cross-SM memory'});
            particles.push(new Particle(
              {x:myDsmem.x+myDsmem.w/2,y:myDsmem.y+myDsmem.h/2},
              {x:otherDsmem.x+otherDsmem.w/2,y:otherDsmem.y+otherDsmem.h/2},
              '#22d3ee','DSMEM',2,function(){
                flash(otherDsmem,'#22d3ee');
                bubble(otherDsmem.x+otherDsmem.w/2,otherDsmem.y,'cluster hit','#22d3ee',{life:1.4,sub:'no bus needed'});
              }
            ));
          },800);
        }
      }
      break;
    case 'atomic':
      triggerAtomic();
      return;

    case 'reg_spill': {
      // ── Register Spill: regs → L1 (→ L2 if L1 full) then RELOAD back ──
      var regsP = regsPos(si);
      var l1B = layout.sms[si].l1;
      var l1P = l1Pos(si);

      logEvent('SM'+si+': register pressure — spilling to L1', '#fb923c');
      bubble(regsP.x, regsP.y, 'reg pressure', '#fb923c', {sub:'out of registers'});
      stats.misses++;

      // Spike pressure visually to overflow
      setRegPressure(si, 1.10);  // overflow — bars visibly exceed capacity
      spawnParticle(regsP, l1P, '#fb923c', 'SPILL', 2.2, function() {
        var l1Full = (function() {
          var cs = cacheState[si]; if (!cs) return false;
          var filled = 0; for (var i=0;i<NUM_LINES;i++) if(cs.l1[i]>0) filled++;
          return filled >= NUM_LINES - 2;
        })();

        if (!l1Full) {
          // L1 hit — absorb spill into L1
          fillL1Random(si, false); flash(l1B, '#fb923c');
          bubble(l1P.x, l1P.y, 'spill hit L1', '#fb923c', {sub:'~28 cycle penalty'});
          logEvent('SM'+si+': spill → L1 hit (~28 cycles)', '#fb923c');

          // RELOAD after short delay
          setTimeout(function() {
            logEvent('SM'+si+': RELOAD ← L1', '#fb923c');
            bubble(l1P.x, l1P.y, 'reloading', '#fb923c', {sub:'value back in regs'});
            spawnParticle(l1P, regsP, '#fb923c', 'RELOAD', 2.2, function() {
              flash(regsBlock(si) || layout.sms[si], '#fb923c');
              bubble(regsP.x, regsP.y, 'reg restored', '#51cf66', {sub:'warp resumes', life:1.8});
              logEvent('SM'+si+': register restored — warp resumes', '#51cf66');
              setRegPressure(si, 0.72 + Math.random() * 0.08);  // back to loaded baseline
              stats.hits++; updateStats();
            });
          }, 800);

        } else {
          // L1 full — spill cascades to L2
          bubble(l1P.x, l1P.y, 'L1 full!', '#ff6b6b', {sub:'spill → L2'});
          logEvent('SM'+si+': L1 full — spill cascades to L2 (~200 cycles)', '#ff6b6b');
          spawnPassthrough(si, '#fb923c', 'SPILL', 2.2, function() {
            l2AbsorbOne(); flash(layout.l2, '#fb923c');
            bubble(l2Top().x, l2Top().y, 'spill in L2', '#fb923c', {sub:'~200 cycle penalty'});
            logEvent('L2: spill absorbed', '#fb923c');

            setTimeout(function() {
              logEvent('SM'+si+': RELOAD ← L2', '#fb923c');
              spawnParticle(l2Top(), l1P, '#fb923c', 'RELOAD', 2, function() {
                spawnParticle(l1P, regsP, '#fb923c', 'RELOAD', 2.2, function() {
                  flash(regsBlock(si) || layout.sms[si], '#fb923c');
                  bubble(regsP.x, regsP.y, 'reg restored', '#51cf66', {sub:'~200 cyc stall', life:1.8});
                  logEvent('SM'+si+': register restored from L2', '#51cf66');
                  setRegPressure(si, 0.72 + Math.random() * 0.08);  // back to loaded baseline
                  stats.hits++; updateStats();
                });
              }, [busP(si)]);
            }, 700);
          });
        }
      });
      break;
    }

    case 'cp_async': {
      // ── cp.async: global → SMEM directly, bypassing registers ──
      // Only on Ampere/Hopper. Warp continues computing while data arrives.
      var smemB = subBlock(si, 'smem');
      var asyncB = subBlock(si, 'async');
      if (!smemB) { logEvent('No SMEM block found', '#ff6b6b'); break; }

      var smemCentre = { x: smemB.x + smemB.w/2, y: smemB.y + smemB.h/2 };
      var asyncSrc   = asyncB
        ? { x: asyncB.x + asyncB.w/2, y: asyncB.y + asyncB.h/2 }
        : { x: layout.sms[si].x + layout.sms[si].w/2, y: layout.sms[si].y + layout.sms[si].h - 8 };

      logEvent('SM'+si+': cp.async issued — warp continues immediately', '#22d3ee');
      bubble(asyncSrc.x, asyncSrc.y, 'cp.async issued', '#22d3ee', {sub:'warp not stalled'});
      if (asyncB) flash(asyncB, '#22d3ee');
      stats.misses++;

      // Registers stay moderately loaded — warp is computing, not stalled
      setRegPressure(si, 0.80 + Math.random() * 0.08);  // active compute, high occupancy

      // Show warp computing (register pulse) simultaneously
      setTimeout(function() {
        var rb = regsBlock(si);
        if (rb) {
          flash(rb, '#a78bfa');
          bubble(regsPos(si).x, regsPos(si).y, 'computing…', '#a78bfa', {sub:'warp not stalled', life:2.0});
          logEvent('SM'+si+': warp computes on prev tile while data fetches', '#a78bfa');
        }
      }, 300);

      // Data path: gmTop → cbP → l2Top → busP(si) → smem (bypassing regs)
      spawnParticle(gmTop(), l2Top(), '#22d3ee', 'cp.async', 2.0, function() {
        l2AbsorbOne(); flash(layout.l2, '#22d3ee');
        bubble(l2Top().x, l2Top().y, 'L2 serving', '#22d3ee', {sub:'async DMA path'});
        spawnParticle(l2Top(), smemCentre, '#22d3ee', 'DATA', 2.2, function() {
          fillSmem(si); flash(smemB, '#22d3ee');
          bubble(smemCentre.x, smemCentre.y, 'data in SMEM', '#22d3ee', {sub:'regs untouched!', life:1.8});
          logEvent('SM'+si+': cp.async complete — SMEM filled, no register used', '#22d3ee');
          stats.hits++; updateStats();
          // Barrier completion
          setTimeout(function() {
            if (asyncB) flash(asyncB, '#51cf66');
            bubble(asyncSrc.x, asyncSrc.y, 'barrier done', '#51cf66', {sub:'tile committed', life:1.4});
            logEvent('SM'+si+': cp.async.wait complete — tile ready', '#51cf66');
          }, 400);
        }, [busP(si)]);
      }, [cbP()]);
      break;
    }

    case 'tma_load': {
      // ── TMA: bulk tensor tile load, hardware DMA, threads free ──
      // Hopper only. One thread issues descriptor; TMA engine does everything.
      var tmaB = subBlock(si, 'tma');
      var smemBt = subBlock(si, 'smem');
      if (!tmaB || !smemBt) { logEvent('TMA/SMEM block not found', '#ff6b6b'); break; }

      var tmaCentre  = { x: tmaB.x + tmaB.w/2, y: tmaB.y + tmaB.h/2 };
      var smemCentreT = { x: smemBt.x + smemBt.w/2, y: smemBt.y + smemBt.h/2 };

      logEvent('SM'+si+': TMA descriptor issued — HW DMA takes over', '#22d3ee');
      bubble(tmaCentre.x, tmaCentre.y, 'TMA issued', '#22d3ee', {sub:'HW DMA starts'});
      flash(tmaB, '#22d3ee');
      stats.misses++;

      // All threads computing on previous tile simultaneously
      setTimeout(function() {
        for (var ti = 0; ti < layout.sms.length; ti++) {
          var rb2 = regsBlock(ti);
          if (rb2) flash(rb2, '#a78bfa');
          // All SMs show compute pressure — TMA frees threads to work
          setRegPressure(ti, 0.82 + Math.random() * 0.08);  // all SMs computing, near-peak occupancy
        }
        var rp = regsPos(si);
        bubble(rp.x, rp.y, 'all threads', '#a78bfa', {sub:'computing prev tile', life:2.2});
        logEvent('All SM'+si+' threads: computing on prev tile', '#a78bfa');
      }, 200);

      // TMA fetches multiple tiles in sequence
      var tileCount = 2 + Math.floor(Math.random() * 2); // 2–3 tiles
      (function fetchTile(tileIdx) {
        if (tileIdx >= tileCount) return;
        var delay = tileIdx * 900;
        setTimeout(function() {
          logEvent('TMA: fetching tile '+tileIdx+' from global memory', '#22d3ee');
          // Particle originates from TMA block → gmTop → cbP → l2Top → bus → smem
          spawnParticle(gmTop(), l2Top(), '#22d3ee', 'TILE', 2.2, function() {
            l2AbsorbOne();
            bubble(l2Top().x, l2Top().y, 'tile '+tileIdx+' from L2', '#22d3ee', {sub:'DMA path', life:1.2});
            spawnParticle(l2Top(), smemCentreT, '#22d3ee', 'TILE', 2.4, function() {
              fillSmem(si); flash(smemBt, '#22d3ee');
              bubble(smemCentreT.x, smemCentreT.y, 'tile '+tileIdx+' ready', '#22d3ee', {sub:'SMEM filled', life:1.4});
              logEvent('SM'+si+': tile '+tileIdx+' landed in SMEM', '#22d3ee');
              if (tileIdx === tileCount - 1) {
                stats.hits++; updateStats();
                setTimeout(function() {
                  flash(tmaB, '#51cf66');
                  bubble(tmaCentre.x, tmaCentre.y, 'mbarrier done', '#51cf66', {sub:'all tiles ready', life:1.6});
                  logEvent('SM'+si+': TMA complete — mbarrier arrived', '#51cf66');
                }, 300);
              }
            }, [busP(si)]);
          }, [cbP()]);
          fetchTile(tileIdx + 1);
        }, delay);
      })(0);
      break;
    }


  }
  updateStats();
}
