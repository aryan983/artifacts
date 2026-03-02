// draw.js — GPU Cache Coherency Demo

// Layout building, arch switching, all canvas rendering

function bubble(x, y, text, color, opts) {
  var o = opts || {};
  bubbles.push({ x:x, y:y-8, text:text, sub:o.sub||null, color:color, bg:(o.bg||color.slice(0,7))+'18', age:0, life:o.life||2.8, rise:o.rise||18, wobble:Math.random()*6, vx:0, vy:0 });
}

function updateDiffBanner() {
  var banner = document.getElementById('diff-banner');
  if (!prevArch || prevArch === currentArch) { banner.classList.remove('visible'); return; }
  var prev = ARCHS[prevArch], curr = ARCHS[currentArch];
  var parts = [];
  for (var k in curr.blocks) {
    var v = curr.blocks[k]; if (!v) continue;
    var prevBlock = prev.blocks[k];
    if (!prevBlock && v) parts.push('<span class="new-tag">+ ' + v.label + '</span>');
    else if (prevBlock && v.changed) parts.push('<span class="changed-tag">↑ ' + v.label + '</span>');
  }
  for (var k2 in prev.blocks) {
    var v2 = prev.blocks[k2]; if (!v2) continue;
    if (!curr.blocks[k2] || curr.blocks[k2] === null) parts.push('<span class="removed-tag">' + v2.label + '</span>');
  }
  if (curr.keyChange) parts.push('<br><span style="color:var(--dim)">Key: ' + curr.keyChange + '</span>');
  if (parts.length) {
    banner.innerHTML = '<strong style="color:' + curr.color + '">' + prev.name + ' → ' + curr.name + ':</strong> ' + parts.join(' · ');
    banner.classList.add('visible');
  } else { banner.classList.remove('visible'); }
}

function updateKeyCard() {
  var arch = ARCHS[currentArch];
  var prev = prevArch ? ARCHS[prevArch] : null;
  var html = '<h3>Diagram Key — ' + arch.name + ' <span style="color:' + arch.color + ';font-weight:600">' + arch.example + '</span></h3>';
  var items = [
    { key:'l1', color:'var(--l1)', meta:'per-SM' },
    { key:'texCache', color:'#e599f7', meta:'per-SM' },
    { key:'sharedMem', color:'var(--smem)', meta:'per-SM' },
    { key:'warpScheduler', color:'#a78bfa', meta:'per-SM' },
    { key:'dsmem', color:'var(--new-block)', meta:'cluster' },
    { key:'tma', color:'var(--new-block)', meta:'per-SM' },
    { key:'asyncCopy', color:'var(--new-block)', meta:'engine' },
    { key:'arbiter', color:'#f59e0b', meta:'atomic ctrl' },
    { key:'cohDir', color:'#22d3ee', meta:'dir-based' },
    { key:'coherencyBus', color:'var(--coherency)', meta:'fabric' },
    { key:'l2', color:'var(--l2)', meta:'unified' },
    { key:'l2Persist', color:'var(--l2)', meta:'L2 ctrl' },
    { key:'globalMem', color:'var(--global)', meta:'interface' },
    { key:'hbm', color:'var(--dram)', meta:'off-chip' },
  ];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var block = arch.blocks[item.key];
    if (!block) continue;
    var badge = '';
    if (block.isNew) badge = '<span class="acc-badge-new">NEW</span>';
    else if (block.changed && prev) badge = '<span class="acc-badge-changed">CHANGED</span>';
    html += '<div class="acc-item" onclick="this.classList.toggle(\'open\')"><div class="acc-head"><div class="acc-dot" style="background:' + item.color + '"></div><span class="acc-title">' + block.label + badge + '</span><span class="acc-meta">' + item.meta + '</span><span class="acc-chev">▸</span></div><div class="acc-body"><p>' + block.desc + '</p></div></div>';
  }
  html += '<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:.72rem;color:var(--dim)"><strong style="color:var(--text)">Write policy:</strong> ' + arch.writePolicy + '<br><strong style="color:var(--text)">Coherency:</strong> ' + arch.coherency + '</div>';
  document.getElementById('key-card').innerHTML = html;
}

function switchArch(arch) {
  if (arch === currentArch) return;
  prevArch = currentArch;
  currentArch = arch;
  var tabs = document.querySelectorAll('.arch-tab');
  for (var i = 0; i < tabs.length; i++) { tabs[i].classList.toggle('active', tabs[i].dataset.arch === arch); }
  clearSelection();
  resetAll(true);
  buildLayout();
  updateDiffBanner();
  updateKeyCard();
  updateArchIntro();
  updateScenarioButtons();
  logEvent('Switched to ' + ARCHS[arch].name + ' (' + ARCHS[arch].gen + ')', ARCHS[arch].color);
}

// Show a toast when an operation cannot run in the current state.
function notifyUser(msg, reason, color) {
  var existing = document.getElementById('op-notice');
  if (existing) existing.remove();
  var el = document.createElement('div');
  el.id = 'op-notice';
  el.style.cssText = [
    'position:fixed','bottom:24px','left:50%','transform:translateX(-50%)',
    'background:#12141a','border:1px solid '+(color||'#f06595')+'60',
    'color:'+(color||'#f06595'),'padding:10px 18px','border-radius:8px',
    'font-family:JetBrains Mono,monospace','font-size:.78rem',
    'z-index:9999','pointer-events:none','text-align:center',
    'box-shadow:0 4px 24px rgba(0,0,0,.5)',
    'animation:notifyFadeIn .18s ease'
  ].join(';');
  el.innerHTML = '<strong>' + msg + '</strong>'
    + (reason ? '<br><span style="opacity:.65;font-size:.72rem">' + reason + '</span>' : '');
  document.body.appendChild(el);
  if (!document.getElementById('notify-style')) {
    var s = document.createElement('style'); s.id = 'notify-style';
    s.textContent = '@keyframes notifyFadeIn{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
    document.head.appendChild(s);
  }
  clearTimeout(notifyUser._t);
  notifyUser._t = setTimeout(function(){ if (el.parentNode) el.remove(); }, 3500);
}

// Update button labels and arch-gated button visibility on arch change.
function updateScenarioButtons() {
  var isPascal = currentArch === 'pascal';
  var isHopper = currentArch === 'hopper';
  var isAmpere = currentArch === 'ampere';
  var isApex   = currentArch === 'apex';

  // atomicAdd — always visible, behaviour differs per arch
  var atomicBtn = document.getElementById('btn-atomic');
  if (atomicBtn) {
    atomicBtn.classList.remove('apex-only');
    atomicBtn.title = isApex
      ? 'Apex: arbiter-serialized atomicAdd with SEQ# + ROB'
      : 'Raw atomicAdd — serializes inside L2 with no coordination (slower)';
  }

  // Write button label
  var writeBtn = document.querySelector('[data-scenario="write"]');
  if (writeBtn) {
    writeBtn.textContent = isPascal ? 'SM Write (WT)' : 'SM Write';
    writeBtn.title = isPascal
      ? 'Pascal: writes bypass L1, go straight to L2 (write-through)'
      : 'Volta+: write hits L1 (Modified), INV fires to other SMs';
  }

  // cp.async — Ampere and Hopper only
  var cpBtn = document.getElementById('btn-cp-async');
  if (cpBtn) cpBtn.style.display = (isAmpere || isHopper) ? '' : 'none';

  // TMA Load — Hopper only
  var tmaBtn = document.getElementById('btn-tma-load');
  if (tmaBtn) tmaBtn.style.display = isHopper ? '' : 'none';
}

function updateArchIntro() {
  var arch = ARCHS[currentArch];
  var delta = arch.delta ? '<div class="arch-intro-delta">' + arch.delta + '</div>' : '';
  document.getElementById('arch-intro').innerHTML =
    '<div class="arch-intro-badge" style="background:' + arch.color + '20;color:' + arch.color + '">' + arch.name + ' · ' + arch.example + '</div>' +
    '<div class="arch-intro-text">' + arch.intro + '</div>' +
    delta;
}

function buildLayout() {
  if (!W || !H) return;
  var cx = W/2;
  var mob = W < 500;
  var arch = ARCHS[currentArch];
  var smCount = mob ? 2 : (currentArch === 'hopper' ? 4 : (currentArch === 'pascal' ? 3 : (currentArch === 'apex' ? 4 : 4)));
  var margin = mob ? 12 : 30;
  var usable = W - margin*2;
  var smGap = mob ? 12 : 20;
  var smW = Math.min(110, (usable - (smCount-1)*smGap)/smCount);
  var smSubBlocks = 2;
  if (arch.blocks.texCache) smSubBlocks++;
  if (arch.blocks.tma) smSubBlocks++;
  if (arch.blocks.dsmem) smSubBlocks++;
  if (arch.blocks.asyncCopy && arch.blocks.asyncCopy.isNew) smSubBlocks++;
  if (arch.blocks.warpScheduler) smSubBlocks++;
  var smH = mob ? (80+smSubBlocks*18) : (90+smSubBlocks*22);
  var totalSmW = smCount*smW + (smCount-1)*smGap;
  var smStartX = cx - totalSmW/2;
  var smY = mob ? 16 : 30;

  layout.sms = [];
  for (var i = 0; i < smCount; i++) {
    var x = smStartX + i*(smW+smGap);
    var subY = smY + (mob ? 32 : 38);
    var subH = mob ? 18 : 22;
    var subPad = mob ? 4 : 5;
    var sub = [];
    sub.push({ type:'regs', x:x+6, y:subY+8, w:smW-12, h:10 });
    subY += 22;
    if (arch.blocks.texCache) {
      sub.push({ type:'texCache', x:x+6, y:subY, w:smW-12, h:subH, label:'TEX$' });
      subY += subH+subPad;
    }
    sub.push({ type:'l1', x:x+6, y:subY, w:smW-12, h:subH, label:arch.blocks.l1.label.split('(')[0].trim(), state:'invalid' });
    var l1Ref = sub[sub.length-1];
    subY += subH+subPad;
    sub.push({ type:'smem', x:x+6, y:subY, w:smW-12, h:subH, label:'SMEM' });
    subY += subH+subPad;
    if (arch.blocks.tma) {
      sub.push({ type:'tma', x:x+6, y:subY, w:smW-12, h:subH, label:'TMA' });
      subY += subH+subPad;
    }
    if (arch.blocks.dsmem) {
      sub.push({ type:'dsmem', x:x+6, y:subY, w:smW-12, h:subH, label:'DSMEM' });
      subY += subH+subPad;
    }
    if (arch.blocks.asyncCopy && (currentArch === 'ampere' || currentArch === 'hopper')) {
      sub.push({ type:'async', x:x+6, y:subY, w:smW-12, h:14, label:'cp.async' });
      subY += 14+subPad;
    }
    if (arch.blocks.warpScheduler) {
      sub.push({ type:'warpScheduler', x:x+6, y:subY, w:smW-12, h:subH, label:'WARP SCHED' });
      subY += subH+subPad;
    }
    var actualH = Math.max(smH, subY-smY+8);
    layout.sms.push({ x:x, y:smY, w:smW, h:actualH, label:arch.smLabel+' '+i, sub:sub, l1:l1Ref });
  }

  var maxSmBottom = 0;
  for (var j = 0; j < layout.sms.length; j++) { maxSmBottom = Math.max(maxSmBottom, layout.sms[j].y+layout.sms[j].h); }

  if (currentArch === 'hopper' && smCount > 1) {
    layout.cluster = { x1:smStartX-6, x2:smStartX+totalSmW+6, y1:smY-8, y2:maxSmBottom+8 };
  } else { layout.cluster = null; }

  var busY = maxSmBottom + (mob ? 30 : 40);
  layout.bus = { y:busY, x1:smStartX-15, x2:smStartX+totalSmW+15, label:currentArch==='hopper' ? 'CLUSTER BUS + COHERENCY' : (currentArch==='pascal' ? 'CROSSBAR' : 'COHERENCY BUS') };

  var l2W = Math.min(totalSmW*0.85, usable*0.78);
  var l2Y = busY + (mob ? 35 : 45);
  var l2H = mob ? 42 : 52;
  layout.l2 = { x:cx-l2W/2, y:l2Y, w:l2W, h:l2H };
  layout.l2Persist = (currentArch==='ampere'||currentArch==='hopper') ? { x:cx-l2W/2+6, y:l2Y+l2H-12, w:l2W-12, h:8 } : null;

  // Shared vars needed by both Apex and non-Apex paths
  var gmH = mob ? 52 : 62;
  var mcCount = mob ? 2 : (currentArch==='pascal' ? 3 : 4);
  var mcW = mob ? 36 : 44;

  // Apex-specific: Arbiter is a FULL-WIDTH block between bus and L2
  // cohDir is a sub-region INSIDE L2 (right portion)
  if (currentArch === 'apex') {
    var arbH = mob ? 56 : 68;
    var arbGap = mob ? 32 : 38;  // gap between arbiter and L2 — enough for ACK particle travel
    // Arbiter and L2 span the full usable width on Apex
    var apexW = Math.min(usable * 0.92, totalSmW * 1.02);
    var apexX = cx - apexW/2;
    var newL2Y = l2Y + arbH + arbGap;
    layout.arbiter = { x: apexX, y: l2Y, w: apexW, h: arbH };
    // Shift l2 down to make room
    layout.l2 = { x: apexX, y: newL2Y, w: apexW, h: l2H };
    // cohDir is a sub-region inside l2 (right 35%)
    var cdW = Math.round(apexW * 0.35);
    layout.cohDir = { x: apexX + apexW - cdW - 6, y: newL2Y + 6, w: cdW, h: l2H - 12 };
    // Shift everything below l2 down too
    var cbY2 = newL2Y + l2H + (mob ? 16 : 22);
    layout.crossbar = { y: cbY2, x1: apexX-8, x2: apexX+apexW+8 };
    var gmY2 = cbY2 + (mob ? 22 : 30);
    var gmW2 = apexW;
    layout.globalMem = { x: apexX, y: gmY2, w: gmW2, h: gmH };
    var mcGap3 = (gmW2 - mcCount*mcW)/(mcCount+1);
    layout.mcs = [];
    for (var mi2 = 0; mi2 < mcCount; mi2++) {
      layout.mcs.push({ x: layout.globalMem.x+mcGap3+mi2*(mcW+mcGap3), y: gmY2+24, w: mcW, h: 14 });
    }
    var hbmY2 = gmY2 + gmH + (mob ? 16 : 22);
    var hbmW2 = gmW2*0.88;
    layout.hbm = { x: cx-hbmW2/2, y: hbmY2, w: hbmW2, h: mob ? 34 : 42, label: ARCHS[currentArch].blocks.hbm.label };
  } else {
    // Non-Apex: no arbiter, standard layout
    layout.arbiter = null;
    layout.cohDir = null;

    var cbY = l2Y+l2H+(mob ? 22 : 30);
    layout.crossbar = { y:cbY, x1:cx-l2W/2-8, x2:cx+l2W/2+8 };

    var gmW = Math.min(totalSmW*0.85, usable*0.82);
    var gmY = cbY + (mob ? 28 : 38);
    layout.globalMem = { x:cx-gmW/2, y:gmY, w:gmW, h:gmH };

    var mcGap2 = (gmW - mcCount*mcW)/(mcCount+1);
    layout.mcs = [];
    for (var mi = 0; mi < mcCount; mi++) {
      layout.mcs.push({ x:layout.globalMem.x+mcGap2+mi*(mcW+mcGap2), y:gmY+24, w:mcW, h:14 });
    }

    var hbmY = gmY+gmH+(mob ? 16 : 22);
    var hbmW = gmW*0.88;
    layout.hbm = { x:cx-hbmW/2, y:hbmY, w:hbmW, h:mob ? 34 : 42, label:ARCHS[currentArch].blocks.hbm.label };
  }

  buildHitRects();
  initCacheState();
}

function bezierPoint(p0, cp1, cp2, p1, t) {
  var mt = 1 - t;
  return {
    x: mt*mt*mt*p0.x + 3*mt*mt*t*cp1.x + 3*mt*t*t*cp2.x + t*t*t*p1.x,
    y: mt*mt*mt*p0.y + 3*mt*mt*t*cp1.y + 3*mt*t*t*cp2.y + t*t*t*p1.y,
  };
}

function drawConnLines(time) {
  if (connLines.length === 0) return;
  connLineAnim += 0.022;
  for (var i = 0; i < connLines.length; i++) {
    var cl = connLines[i];
    var dx = cl.to.x - cl.from.x;
    var dy = cl.to.y - cl.from.y;
    var dist = Math.sqrt(dx*dx + dy*dy);

    var isVertical = Math.abs(dy) > Math.abs(dx);
    var bow = Math.min(dist * 0.35, 60) * (i % 2 === 0 ? 1 : -1);
    var cp1, cp2;
    if (isVertical) {
      cp1 = { x: cl.from.x + bow, y: cl.from.y + dy * 0.3 };
      cp2 = { x: cl.to.x + bow,   y: cl.to.y   - dy * 0.3 };
    } else {
      cp1 = { x: cl.from.x + dx * 0.3, y: cl.from.y + bow };
      cp2 = { x: cl.to.x   - dx * 0.3, y: cl.to.y   + bow };
    }

    var alpha = 0.55 + Math.sin(connLineAnim * 2.5 + i * 1.2) * 0.2;
    var colorHex = cl.color + Math.round(alpha * 255).toString(16).padStart(2,'0');

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cl.from.x, cl.from.y);
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, cl.to.x, cl.to.y);
    ctx.strokeStyle = cl.color + '18';
    ctx.lineWidth = 7;
    ctx.setLineDash([]);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cl.from.x, cl.from.y);
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, cl.to.x, cl.to.y);
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([7, 5]);
    ctx.lineDashOffset = -connLineAnim * 28;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath(); ctx.arc(cl.from.x, cl.from.y, 3.5, 0, Math.PI*2);
    ctx.fillStyle = cl.color; ctx.fill();
    ctx.beginPath(); ctx.arc(cl.from.x, cl.from.y, 6, 0, Math.PI*2);
    ctx.fillStyle = cl.color + '30'; ctx.fill();

    var tip  = bezierPoint({x:cl.from.x,y:cl.from.y}, cp1, cp2, {x:cl.to.x,y:cl.to.y}, 0.98);
    var tang = bezierPoint({x:cl.from.x,y:cl.from.y}, cp1, cp2, {x:cl.to.x,y:cl.to.y}, 0.93);
    var angle = Math.atan2(cl.to.y - tang.y, cl.to.x - tang.x);
    ctx.translate(cl.to.x, cl.to.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-9, -4.5);
    ctx.lineTo(-9, 4.5);
    ctx.closePath();
    ctx.fillStyle = cl.color + 'dd';
    ctx.fill();

    var travelT = (connLineAnim * 0.55 + i * 0.28) % 1.0;
    ctx.restore();
    var tp = bezierPoint({x:cl.from.x,y:cl.from.y}, cp1, cp2, {x:cl.to.x,y:cl.to.y}, travelT);
    ctx.beginPath(); ctx.arc(tp.x, tp.y, 4, 0, Math.PI*2);
    ctx.fillStyle = cl.color; ctx.fill();
    ctx.beginPath(); ctx.arc(tp.x, tp.y, 8, 0, Math.PI*2);
    ctx.fillStyle = cl.color + '28'; ctx.fill();
  }
}

function drawHoverHighlight() {
  if (!hoveredBlock) return;
  var r = hoveredBlock;
  ctx.save();
  rrect(r.x-3, r.y-3, r.w+6, r.h+6, 6);
  var info = BLOCK_INFO[r.type];
  var hcolor = info ? info.color : '#ffffff';
  ctx.strokeStyle = hcolor + 'cc';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = hcolor + '10';
  ctx.fill();
  ctx.restore();
}

function drawSelectionHighlight() {
  if (!selectedBlock) return;
  var r = selectedBlock;
  ctx.save();
  rrect(r.x-4, r.y-4, r.w+8, r.h+8, 7);
  var info = BLOCK_INFO[r.type];
  var scolor = info ? info.color : '#ffffff';
  var pulse = 0.6 + Math.sin(Date.now()/300) * 0.4;
  ctx.strokeStyle = scolor + Math.round(pulse * 255).toString(16).padStart(2,'0');
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = scolor + '15';
  ctx.fill();
  ctx.restore();
}

function drawFrame(time) {
  if (!initialized || !layout.sms) { requestAnimationFrame(drawFrame); return; }
  try {
    if (paused) {
      drawStaticFrame();
      requestAnimationFrame(drawFrame);
      return;
    }
    var dt = Math.min((time - lastTime)/1000, 0.05);
    lastTime = time;
    drawAnimatedFrame(dt, time);
    requestAnimationFrame(drawFrame);
  } catch(e) {
    // Surface any silent crash to the canvas so we can see it
    ctx.fillStyle = '#ff6b6b';
    ctx.font = '13px monospace';
    ctx.fillText('JS error: ' + e.message, 20, 40);
    ctx.fillText(e.stack ? e.stack.split('\n')[1] : '', 20, 60);
    requestAnimationFrame(drawFrame);
  }
}

function drawStaticFrame() {
  ctx.clearRect(0, 0, W, H);
  drawSceneContent(0, performance.now());
  if (hoveredBlock && (hoveredBlock.type === 'l1' || hoveredBlock.type === 'smem')) {
    refreshTooltipCacheData(hoveredBlock, BLOCK_INFO[hoveredBlock.type]);
  }
}

function drawAnimatedFrame(dt, time) {
  ctx.clearRect(0, 0, W, H);
  tickRegPressure(dt);
  drawSceneContent(dt, time);

  // Live tooltip refresh for cache blocks
  if (hoveredBlock && (hoveredBlock.type === 'l1' || hoveredBlock.type === 'smem')) {
    refreshTooltipCacheData(hoveredBlock, BLOCK_INFO[hoveredBlock.type]);
  }
  // Live tooltip refresh for register file — pressure changes during scenarios
  if (hoveredBlock && hoveredBlock.type === 'regs' && tooltipEl.classList.contains('visible')) {
    refreshTooltipRegsData(hoveredBlock.smIdx);
  }
  // Live tooltip refresh for L2 — in-place DOM update so CSS transitions fire
  if (hoveredBlock && hoveredBlock.type === 'l2' && tooltipEl.classList.contains('visible')) {
    refreshTooltipL2Data();
  }
  // Live tooltip refresh for arbiter (state changes while hovered)
  if (hoveredBlock && hoveredBlock.type === 'arbiter' && tooltipEl.classList.contains('visible')) {
    updateTooltip(hoveredBlock, lastClientX, lastClientY);
  }

  if (autoMode) {
    autoTimer+=dt;
    var autoInterval = (currentArch === 'apex' && arbiterState.active) ? 99 : 6.5;
    if (autoTimer > autoInterval) {
      autoTimer=0;
      var anyValid    = layout.sms.some(function(s){ return s.l1.state !== 'invalid'; });
      var anyModified = layout.sms.some(function(s){ return s.l1.state === 'modified'; });
      var apex    = currentArch === 'apex';
      var hopper  = currentArch === 'hopper';
      var ampere  = currentArch === 'ampere';
      var pool;
      if (!anyValid) {
        // Nothing in L1 — only ops that work from cold state
        pool = apex    ? ['read','read','read','atomic','reg_spill'] :
               hopper  ? ['read','read','reg_spill','tma_load'] :
               ampere  ? ['read','read','reg_spill','cp_async'] :
                         ['read','reg_spill'];
      } else if (anyModified) {
        // At least one SM has dirty data — write-back and invalidate make sense; write does NOT (needs Shared)
        pool = apex    ? ['writeback','writeback','invalidate','read','atomic','reg_spill'] :
               hopper  ? ['writeback','writeback','invalidate','read','reg_spill','tma_load'] :
               ampere  ? ['writeback','writeback','invalidate','read','reg_spill','cp_async'] :
                         ['writeback','writeback','invalidate','read','reg_spill'];
      } else {
        // Some Shared lines in L1 — write, invalidate, and read all valid; writeback is NOT (nothing dirty)
        pool = apex    ? ['write','invalidate','read','read','shared','atomic','reg_spill'] :
               hopper  ? ['write','invalidate','read','read','shared','reg_spill','tma_load','cp_async'] :
               ampere  ? ['write','invalidate','read','read','shared','reg_spill','cp_async'] :
                         ['write','invalidate','read','read','shared','reg_spill'];
      }
      triggerScenario(pool[Math.floor(Math.random()*pool.length)], true); // true = silent (no toasts)
    }
  }
}

function drawSceneContent(dt, time) {
  var arch = ARCHS[currentArch];
  var mob = W < 500;
  var fs = mob ? 0.88 : 1;
  var FONT_SM_LABEL  = Math.max(10, 10*fs);
  var FONT_SM_WARP   = Math.max(7,  7*fs);
  var FONT_BLOCK_LG  = Math.max(8,  8*fs);
  var FONT_BLOCK_SM  = Math.max(7.5, 7.5*fs);
  var FONT_BLOCK_XS  = Math.max(7,  7*fs);
  var FONT_L2        = Math.max(11, 11*fs);
  var FONT_LABEL_MED = Math.max(10, 10*fs);
  var FONT_LABEL_SM  = Math.max(7,  7*fs);
  var FONT_HBM       = Math.max(11, 11*fs);

  if (layout.cluster) {
    var c = layout.cluster;
    ctx.setLineDash([4,4]);
    rrect(c.x1, c.y1, c.x2-c.x1, c.y2-c.y1, 10);
    ctx.strokeStyle = arch.color+'40'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.setLineDash([]);
    ctx.font='bold '+Math.max(8,8*fs)+'px monospace';
    ctx.fillStyle=arch.color+'90'; ctx.textAlign='center';
    ctx.fillText('THREAD BLOCK CLUSTER', (c.x1+c.x2)/2, c.y1-2);
  }

  for (var si = 0; si < layout.sms.length; si++) {
    var sm = layout.sms[si];
    rrect(sm.x, sm.y, sm.w, sm.h, 7);
    ctx.fillStyle='#0f1118'; ctx.fill();
    ctx.strokeStyle='#2a2d3a'; ctx.lineWidth=1; ctx.stroke();
    ctx.font='700 '+FONT_SM_LABEL+'px system-ui,sans-serif';
    ctx.fillStyle='#e8eaf6'; ctx.textAlign='center';
    ctx.fillText(sm.label, sm.x+sm.w/2, sm.y+14*fs);
    ctx.font='400 '+FONT_SM_WARP+'px monospace';
    ctx.fillStyle='#8890b0';
    ctx.fillText('Warps ▸▸▸', sm.x+sm.w/2, sm.y+24*fs);

    for (var bi = 0; bi < sm.sub.length; bi++) {
      var b = sm.sub[bi];
      if (b.type === 'regs') {
        var barC = Math.max(4, Math.floor(b.w/10));
        var cs_r = cacheState[si];
        var pressure = cs_r ? cs_r.regsPressure : 0.75;
        // Clamp visual fill to 1.0 — overflow (>1) is shown via color, not height
        var visualFill = Math.min(1.0, pressure);
        // Color: blue-grey at normal load → orange approaching limit → red pulsing at overflow
        var pressureColor;
        if (pressure < 0.82) {
          // Normal loaded state: blue-grey (registers allocated but not overflowing)
          pressureColor = 'hsl(220,35%,28%)';
        } else if (pressure < 0.95) {
          // High load approaching limit: shift warm
          var t2 = (pressure - 0.82) / 0.13;
          pressureColor = 'hsl(' + Math.round(220 - t2*180) + ',55%,' + Math.round(28+t2*8) + '%)';
        } else {
          // Overflow / spill: orange-red pulse — compiler had to spill!
          var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 100);
          pressureColor = 'hsl(' + Math.round(18 - pulse*18) + ',85%,' + Math.round(38+pulse*10) + '%)';
        }
        // Subtle shimmer across bars (texture, not a fill change)
        var shimmer = Math.sin(Date.now()/1200 + si) * 0.018;
        for (var rj = 0; rj < barC; rj++) {
          var barX = b.x + rj * (b.w / barC);
          var barW = b.w / barC - 1.5;
          ctx.fillStyle = '#141620';
          ctx.fillRect(barX, b.y, barW, b.h);
          var barFill = Math.min(1, Math.max(0, visualFill + shimmer + (rj % 3 - 1) * 0.015));
          var fillH = Math.round(b.h * barFill);
          ctx.fillStyle = pressureColor;
          ctx.fillRect(barX, b.y + b.h - fillH, barW, fillH);
        }
        // Label — orange when spilling
        ctx.font = '500 ' + Math.max(6, FONT_BLOCK_XS) + 'px monospace';
        ctx.fillStyle = pressure >= 0.95 ? '#fb923c' : '#6b7094';
        ctx.textAlign = 'center';
        ctx.fillText('regs', b.x + b.w/2, b.y - 1);
        continue;
      }
      rrect(b.x, b.y, b.w, b.h, 3);
      if (b.type === 'l1' && b.state) {
        var stColors = { modified:'#51cf66', shared:'#339af0', invalid:'#6b7090' };
        var sc = stColors[b.state]||'#6b7090';
        ctx.fillStyle = b.state === 'invalid' ? '#6b709018' : sc+'22'; ctx.fill();
        ctx.strokeStyle = b.state === 'invalid' ? '#5a5e78' : sc; ctx.lineWidth=1.5; ctx.stroke();

        var csm2 = cacheState[si];
        if (csm2) {
          var lines2 = csm2.l1;
          var gx = b.x + 4, gw = b.w - 8;
          var slotW = gw / NUM_LINES;
          var gy = b.y + b.h - 6;
          for (var li = 0; li < NUM_LINES; li++) {
            var lv = lines2[li];
            var lc = lv === 2 ? '#51cf66' : (lv === 1 ? (b.state==='shared'?'#339af0':'#51cf6688') : '#2a2d3a');
            ctx.fillStyle = lc;
            ctx.fillRect(gx + li*slotW + 0.5, gy, slotW - 1, 4);
          }
        }

        ctx.font='600 '+FONT_BLOCK_LG+'px monospace';
        ctx.fillStyle = b.state === 'invalid' ? '#9095b0' : sc;
        ctx.textAlign='center';
        ctx.fillText(b.label+' ['+b.state.charAt(0).toUpperCase()+']', b.x+b.w/2, b.y+b.h/2+1);
      } else {
        var cBg, cBr, cLbl;
        if (b.type==='texCache')             { cBg='#e599f712'; cBr='#e599f760'; cLbl='#e599f7'; }
        else if (b.type==='tma')             { cBg='#22d3ee12'; cBr='#22d3ee70'; cLbl='#22d3ee'; }
        else if (b.type==='dsmem')           { cBg='#22d3ee10'; cBr='#22d3ee60'; cLbl='#22d3ee'; }
        else if (b.type==='async')           { cBg='#22d3ee0a'; cBr='#22d3ee45'; cLbl='#6de8f0'; }
        else if (b.type==='warpScheduler')   { cBg='#a78bfa12'; cBr='#a78bfa60'; cLbl='#c4b5fd'; }
        else /* smem */                      { cBg='#51cf660a'; cBr='#51cf6660'; cLbl='#6ee09a'; }
        ctx.fillStyle=cBg; ctx.fill();
        ctx.strokeStyle=cBr; ctx.lineWidth=1; ctx.stroke();

        if (b.type === 'smem') {
          var csm3 = cacheState[si];
          if (csm3) {
            var slines = csm3.smem;
            var sgx = b.x + 4, sgw = b.w - 8;
            var sslotW = sgw / NUM_LINES;
            var sgy = b.y + b.h - 5;
            for (var sli2 = 0; sli2 < NUM_LINES; sli2++) {
              ctx.fillStyle = slines[sli2] === 1 ? '#51cf6680' : '#1e2030';
              ctx.fillRect(sgx + sli2*sslotW + 0.5, sgy, sslotW - 1, 3);
            }
          }
        }

        var lblFs = (b.type==='async') ? FONT_BLOCK_XS : FONT_BLOCK_SM;
        ctx.font='600 '+lblFs+'px monospace';
        ctx.fillStyle=cLbl; ctx.textAlign='center';
        ctx.fillText(b.label, b.x+b.w/2, b.y+b.h/2+1);
      }
    }
  }

  drawHoverHighlight();
  drawSelectionHighlight();
  drawConnLines(time);

  // ── Draw Apex arbiter (full-width block) and cohDir (L2 sub-region) ──
  if (currentArch === 'apex' && layout.arbiter) {
    var arb = layout.arbiter;

    // ── Bus-to-arbiter interface line ──
    // A single vertical tick at the arbiterBusEntry point, between bus and arbiter top.
    // This is the physical interface where back-pressure manifests when the queue is full.
    var ifaceX = arb.x + arb.w / 2;
    var ifaceY0 = layout.bus.y;       // bus level
    var ifaceY1 = arb.y;              // arbiter top
    var qFull = arbiterState.queue.length >= QUEUE_CAPACITY;
    ctx.save();
    ctx.strokeStyle = qFull ? '#ff6b6b' : '#f59e0b60';
    ctx.lineWidth   = qFull ? 2 : 1;
    if (qFull) { ctx.shadowColor = '#ff6b6b'; ctx.shadowBlur = 6; }
    ctx.beginPath(); ctx.moveTo(ifaceX, ifaceY0); ctx.lineTo(ifaceX, ifaceY1); ctx.stroke();
    // Small horizontal crossbar at the interface point (shows it's a named boundary)
    var tickW = qFull ? 10 : 6;
    ctx.beginPath(); ctx.moveTo(ifaceX - tickW, ifaceY0 + 2); ctx.lineTo(ifaceX + tickW, ifaceY0 + 2); ctx.stroke();
    ctx.restore();
    // Interface label
    ctx.font = '500 5px monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = qFull ? '#ff6b6b90' : '#f59e0b35';
    ctx.fillText(qFull ? '⚠ STALL' : 'interface', ifaceX + tickW + 3, ifaceY0 + 5);

    var arbTime2 = Date.now();
    var arbPulse = Math.sin(arbTime2/600) * 0.3 + 0.7;
    var isHovArb = hoveredBlock && hoveredBlock.type === 'arbiter';
    var latFrac = Math.min(arbiterState.contentionLevel, 1);
    var arbColor = latFrac > 0.6 ? '#ff6b6b' : '#f59e0b';

    // Main block
    rrect(arb.x, arb.y, arb.w, arb.h, 8);
    ctx.fillStyle = isHovArb ? '#f59e0b18' : '#f59e0b0c'; ctx.fill();
    ctx.strokeStyle = arbColor + Math.round(arbPulse * (isHovArb ? 230 : 160)).toString(16).padStart(2,'0');
    ctx.lineWidth = isHovArb ? 2 : 1.5; ctx.stroke();

    if (arbiterState.active) {
      ctx.save(); ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 14;
      rrect(arb.x, arb.y, arb.w, arb.h, 8);
      ctx.strokeStyle = '#f59e0b25'; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
    }

    // Header strip
    ctx.fillStyle = '#f59e0b16';
    rrect(arb.x+1, arb.y+1, arb.w-2, 17, 7); ctx.fill();

    ctx.font = '700 8.5px monospace'; ctx.fillStyle = '#f59e0b'; ctx.textAlign = 'left';
    ctx.fillText('⚖ ATOMIC ARBITER', arb.x + 12, arb.y + 13);
    var statusText = arbiterState.queue.length >= QUEUE_CAPACITY - 2 ? 'SATURATED' : arbiterState.active ? 'ACTIVE' : 'IDLE';
    var statusColor = arbiterState.queue.length >= QUEUE_CAPACITY - 2 ? '#ff6b6b' : arbiterState.active ? '#fbbf24' : '#4a5080';
    ctx.font = '600 7px monospace'; ctx.fillStyle = statusColor; ctx.textAlign = 'right';
    ctx.fillText('● ' + statusText, arb.x + arb.w - 12, arb.y + 13);

    // ── Layout: divide arbiter into left (QUEUE) and right (HOLD BUFFER / ROB) ──
    var divX = arb.x + arb.w * 0.48;  // vertical divider x
    var innerY = arb.y + 21;
    var slotH2 = 15, slotGap2 = 4;

    // Divider line
    ctx.strokeStyle = '#f59e0b20'; ctx.lineWidth = 1;
    ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(divX, arb.y + 18); ctx.lineTo(divX, arb.y + arb.h - 6); ctx.stroke();
    ctx.setLineDash([]);

    // ── LEFT: INCOMING QUEUE ──
    var qLabelX = arb.x + 12;
    ctx.font = '600 6px monospace'; ctx.fillStyle = '#f59e0b60'; ctx.textAlign = 'left';
    ctx.fillText('INCOMING QUEUE', qLabelX, innerY + 7);
    var qSlotW2 = 24;
    var qSlotStartX = qLabelX;
    var qSlotY = innerY + 11;
    var maxQSlots = Math.floor((divX - qLabelX - 12) / (qSlotW2 + slotGap2));
    maxQSlots = Math.min(maxQSlots, 6);
    for (var qs2 = 0; qs2 < maxQSlots; qs2++) {
      var sx2 = qSlotStartX + qs2 * (qSlotW2 + slotGap2);
      var qe2 = qs2 < arbiterState.queue.length ? arbiterState.queue[qs2] : null;
      ctx.fillStyle = qe2 ? '#f59e0b22' : '#141620';
      // granted slots show green (RMW dispatched, slot still held until arbiter entry)
      var qGranted = qe2 && qe2.granted;
      ctx.fillStyle = qGranted ? '#51cf6618' : (qe2 ? '#f59e0b22' : '#141620');
      ctx.strokeStyle = qGranted ? '#51cf6680' : (qe2 ? '#f59e0baa' : '#252840');
      ctx.lineWidth = qe2 ? 1.1 : 0.7;
      rrect(sx2, qSlotY, qSlotW2, slotH2, 3); ctx.fill(); ctx.stroke();
      ctx.font = '700 6px monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = qGranted ? '#51cf66' : (qe2 ? '#fbbf24' : '#2a2d45');
      ctx.fillText(qe2 ? '#'+qe2.seq : '—', sx2 + qSlotW2/2, qSlotY + 10);
      // SM label below slot
      if (qe2) {
        ctx.font = '500 5px monospace'; ctx.fillStyle = qGranted ? '#51cf6660' : '#f59e0b60';
        ctx.fillText('SM'+qe2.smIdx, sx2 + qSlotW2/2, qSlotY + slotH2 + 6);
      }
    }

    // Queue depth indicator
    var qBotY = qSlotY + slotH2 + 11;
    ctx.font = '500 6px monospace'; ctx.fillStyle = '#f59e0b50'; ctx.textAlign = 'left';
    ctx.fillText('SEQ#' + String(arbiterState.seqCounter).padStart(3,'0'), qLabelX, qBotY);

    // ── RIGHT: HOLD BUFFER (ROB) ──
    var robLabelX = divX + 18;  // offset right so label clears the dashed divider
    ctx.font = '600 6px monospace'; ctx.fillStyle = '#a78bfa90'; ctx.textAlign = 'left';
    ctx.fillText('HOLD BUFFER  (ROB)', robLabelX, innerY + 7);
    var robSlotW2 = Math.floor((arb.x + arb.w - robLabelX - 12) / 6) - slotGap2;
    robSlotW2 = Math.max(robSlotW2, 18);
    var robSlotY = innerY + 11;
    for (var rs2 = 0; rs2 < 6; rs2++) {
      var rx3 = robLabelX + rs2 * (robSlotW2 + slotGap2);
      if (rx3 + robSlotW2 > arb.x + arb.w - 8) break;
      var robE2 = rs2 < arbiterState.rob.length ? arbiterState.rob[rs2] : null;
      var rBg2 = '#141620', rBr2 = '#252840', rTxt2 = '#2a2d45';
      var rIcon = '';
      if (robE2) {
        if (robE2.state === 'pending')   { rBg2='#f59e0b18'; rBr2='#f59e0b70'; rTxt2='#f59e0b'; rIcon='⏳'; }
        if (robE2.state === 'complete')  { rBg2='#339af020'; rBr2='#339af090'; rTxt2='#339af0'; rIcon='✦'; } // ACK back, waiting for head
        if (robE2.state === 'retiring')  { rBg2='#a78bfa20'; rBr2='#a78bfa80'; rTxt2='#a78bfa'; rIcon='↩'; } // head-of-line, being retired
        if (robE2.state === 'done')      { rBg2='#51cf6620'; rBr2='#51cf6680'; rTxt2='#51cf66'; rIcon='✓'; } // retired, DATA sent
      }
      ctx.fillStyle = rBg2; ctx.strokeStyle = rBr2; ctx.lineWidth = robE2 ? 1.1 : 0.7;
      rrect(rx3, robSlotY, robSlotW2, slotH2, 3); ctx.fill(); ctx.stroke();
      ctx.font = '700 5.5px monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = rTxt2;
      ctx.fillText(robE2 ? '#'+robE2.seq : '—', rx3 + robSlotW2/2, robSlotY + 7);
      if (robE2) {
        ctx.font = '500 5px monospace'; ctx.fillStyle = rTxt2 + '90';
        ctx.fillText(rIcon, rx3 + robSlotW2/2, robSlotY + 13);
      }
    }

    // ROB state legend
    var robBotY = robSlotY + slotH2 + 11;
    ctx.font = '500 5.5px monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = '#f59e0b60'; ctx.fillText('⏳ pending', robLabelX, robBotY);
    ctx.fillStyle = '#339af060'; ctx.fillText('✦ complete', robLabelX + 52, robBotY);
    ctx.fillStyle = '#a78bfa60'; ctx.fillText('↩ retiring', robLabelX + 110, robBotY);
    ctx.fillStyle = '#51cf6660'; ctx.fillText('✓ done', robLabelX + 162, robBotY);

    // ── LEFT GUTTER ANNOTATION (side panel, left of arbiter) ──
    var gutterX = arb.x - 8;
    var gutterW = Math.max(gutterX - 10, 0);
    if (gutterW > 40) {
      var gx = 8, gw = gutterX - 12;
      var gArbY = arb.y + 4;
      ctx.font = '500 5.5px monospace'; ctx.fillStyle = '#f59e0b40'; ctx.textAlign = 'right';
      ctx.fillText('SERIALIZES', gx + gw, gArbY + 8);
      ctx.fillText('ATOMICS', gx + gw, gArbY + 16);
      ctx.fillStyle = '#f59e0b25'; ctx.textAlign = 'right';
      ctx.fillText('SEQ# tags', gx + gw, gArbY + 26);
      ctx.fillText('ROB order', gx + gw, gArbY + 34);
      // Contention bar
      var gbY = gArbY + 42;
      ctx.font = '500 5px monospace'; ctx.fillStyle = '#f59e0b40'; ctx.textAlign = 'right';
      ctx.fillText('contention', gx + gw, gbY);
      ctx.fillStyle = '#141620';
      ctx.fillRect(gx + gw - 36, gbY + 2, 36, 4);
      if (latFrac > 0) {
        var gGrad = ctx.createLinearGradient(gx + gw - 36, 0, gx + gw, 0);
        gGrad.addColorStop(0, '#51cf66'); gGrad.addColorStop(0.5, '#f59e0b'); gGrad.addColorStop(1, '#ff6b6b');
        ctx.fillStyle = gGrad;
        ctx.fillRect(gx + gw - 36, gbY + 2, 36 * latFrac, 4);
      }
      ctx.font = '600 5.5px monospace'; ctx.fillStyle = '#f59e0b'; ctx.textAlign = 'right';
      var cycEst3 = Math.round(2 + latFrac * 30);
      ctx.fillText('~'+cycEst3+'cyc', gx + gw, gbY + 14);
    }

    // ── RIGHT GUTTER ANNOTATION (side panel, right of arbiter) ──
    var rGutterX = arb.x + arb.w + 8;
    var rGutterW = W - rGutterX - 8;
    if (rGutterW > 40) {
      var rgx = rGutterX + 4;
      var rgArbY = arb.y + 4;
      ctx.font = '500 5.5px monospace'; ctx.fillStyle = '#f59e0b40'; ctx.textAlign = 'left';
      ctx.fillText('GRANT policy:', rgx, rgArbY + 8);
      ctx.fillStyle = '#f59e0b25';
      ctx.fillText('FIFO arrival', rgx, rgArbY + 17);
      ctx.fillText('1 at a time', rgx, rgArbY + 26);
      ctx.font = '500 5px monospace';
      ctx.fillStyle = '#f59e0b20';
      ctx.fillText('Granted: '+arbiterState.grantCount, rgx, rgArbY + 37);
    }
  }

  // ── cohDir drawn as sub-region INSIDE L2 block ──
  if (currentArch === 'apex' && layout.cohDir) {
    var cd = layout.cohDir;
    var isHovCd = hoveredBlock && hoveredBlock.type === 'cohDir';
    var cdPulse = Math.sin(Date.now()/900) * 0.2 + 0.8;
    rrect(cd.x, cd.y, cd.w, cd.h, 5);
    ctx.fillStyle = isHovCd ? '#22d3ee18' : '#22d3ee0a'; ctx.fill();
    ctx.strokeStyle = '#22d3ee' + Math.round(cdPulse * (isHovCd ? 200 : 100)).toString(16).padStart(2,'0');
    ctx.lineWidth = isHovCd ? 1.5 : 0.8; ctx.stroke();
    ctx.font = '700 6.5px monospace'; ctx.fillStyle = '#22d3ee'; ctx.textAlign = 'center';
    ctx.fillText('COH. DIR', cd.x + cd.w/2, cd.y + 10);
    var cdRowH = 5, cdRowGap = 2, cdRows = 3, cdBitCount = 4;
    for (var dr2 = 0; dr2 < cdRows; dr2++) {
      var ry2 = cd.y + 15 + dr2 * (cdRowH + cdRowGap);
      var cdBitW = (cd.w - 14) / cdBitCount;
      for (var db2 = 0; db2 < cdBitCount; db2++) {
        var hasSharer = (dr2 * 7 + db2 * 3 + Math.floor(Date.now()/2000)) % 3 !== 0;
        ctx.fillStyle = hasSharer ? '#22d3ee35' : '#1a1c28';
        ctx.strokeStyle = '#22d3ee30'; ctx.lineWidth = 0.5;
        ctx.fillRect(cd.x + 7 + db2*cdBitW, ry2, cdBitW-1, cdRowH);
      }
    }
    ctx.font = '500 5.5px monospace'; ctx.fillStyle = '#22d3ee50'; ctx.textAlign = 'center';
    ctx.fillText('targeted', cd.x + cd.w/2, cd.y + cd.h - 3);

    // ── L2 RIGHT GUTTER: bandwidth and state info ──
    var l2 = layout.l2;
    var l2RGutX = l2.x + l2.w + 8;
    var l2RGutW = W - l2RGutX - 8;
    if (l2RGutW > 40) {
      var l2gx = l2RGutX + 4;
      var l2gY = l2.y + 4;
      ctx.font = '500 5.5px monospace'; ctx.fillStyle = '#ffa94d40'; ctx.textAlign = 'left';
      ctx.fillText('L2: 64MB', l2gx, l2gY + 8);
      ctx.fillText('unified', l2gx, l2gY + 17);
      ctx.fillStyle = '#22d3ee30';
      ctx.fillText('coh. point', l2gx, l2gY + 28);
    }
    // ── L2 LEFT GUTTER: RMW annotation ──
    var l2LGutW2 = l2.x - 12;
    if (l2LGutW2 > 40) {
      ctx.font = '500 5.5px monospace'; ctx.fillStyle = '#ffa94d40'; ctx.textAlign = 'right';
      ctx.fillText('RMW here', l2.x - 8, l2.y + 10);
      ctx.fillStyle = '#ffa94d20';
      ctx.fillText('~200 cyc', l2.x - 8, l2.y + 20);
    }
  }

  for (var ci = 0; ci < layout.sms.length; ci++) {
    var csm = layout.sms[ci];
    ctx.beginPath(); ctx.moveTo(csm.x+csm.w/2, csm.y+csm.h);
    ctx.lineTo(csm.x+csm.w/2, layout.bus.y);
    ctx.strokeStyle='#2a2d3a'; ctx.lineWidth=1; ctx.stroke();
  }

  if (currentArch==='hopper' && layout.sms.length>1) {
    var dsPulse = Math.sin(Date.now()/500)*0.3+0.5;
    for (var di = 0; di < layout.sms.length-1; di++) {
      var dsA=null, dsB=null;
      for (var ds1=0;ds1<layout.sms[di].sub.length;ds1++) { if(layout.sms[di].sub[ds1].type==='dsmem') dsA=layout.sms[di].sub[ds1]; }
      for (var ds2=0;ds2<layout.sms[di+1].sub.length;ds2++) { if(layout.sms[di+1].sub[ds2].type==='dsmem') dsB=layout.sms[di+1].sub[ds2]; }
      if (dsA&&dsB) {
        ctx.beginPath(); ctx.moveTo(dsA.x+dsA.w, dsA.y+dsA.h/2);
        ctx.lineTo(dsB.x, dsB.y+dsB.h/2);
        ctx.strokeStyle='rgba(34,211,238,'+(dsPulse*0.5)+')';
        ctx.lineWidth=1.5; ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }

  var bus = layout.bus;
  var busPulse = Math.sin(Date.now()/400)*0.3+0.5;
  ctx.setLineDash([5,3]);
  ctx.beginPath(); ctx.moveTo(bus.x1, bus.y); ctx.lineTo(bus.x2, bus.y);
  ctx.strokeStyle='#f0659550'; ctx.lineWidth=2; ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(bus.x1, bus.y); ctx.lineTo(bus.x2, bus.y);
  ctx.strokeStyle='rgba(240,101,149,'+(busPulse*0.15)+')'; ctx.lineWidth=8; ctx.stroke();
  ctx.font='600 '+Math.max(8,8*fs)+'px monospace';
  ctx.fillStyle='#f06595e0'; ctx.textAlign='center';
  ctx.fillText(bus.label, (bus.x1+bus.x2)/2, bus.y-9);

  ctx.beginPath(); ctx.moveTo(W/2, bus.y); ctx.lineTo(W/2, layout.l2.y);
  ctx.strokeStyle='#2a2d3a'; ctx.lineWidth=1.5; ctx.stroke();

  var l2 = layout.l2;
  rrect(l2.x, l2.y, l2.w, l2.h, 7);
  ctx.fillStyle='#1a1408'; ctx.fill();
  ctx.strokeStyle='#ffa94d60'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.font='700 '+Math.max(11,11*fs)+'px system-ui,sans-serif';
  ctx.fillStyle='#ffb55a'; ctx.textAlign='center';
  ctx.fillText(arch.blocks.l2.label, l2.x+l2.w/2, l2.y+18*fs);
  // L2 line state bars — same visual language as L1 but wider (unified across all SMs)
  var l2BarY = l2.y + 24*fs;
  var l2BarH = 8*fs;
  var l2BarGutter = 10;
  var l2BarW = (l2.w - l2BarGutter*2) / NUM_L2_LINES;
  for (var l2i = 0; l2i < NUM_L2_LINES; l2i++) {
    var lv2 = l2Lines[l2i];
    if (lv2 === 2)      ctx.fillStyle = '#ffa94d';   // dirty
    else if (lv2 === 1) ctx.fillStyle = '#339af060';  // clean
    else                ctx.fillStyle = '#1e2030';     // empty
    ctx.fillRect(l2.x + l2BarGutter + l2i*l2BarW, l2BarY, l2BarW - 1, l2BarH);
  }

  if (layout.l2Persist) {
    var p = layout.l2Persist;
    rrect(p.x,p.y,p.w,p.h,2);
    var grad = ctx.createLinearGradient(p.x,0,p.x+p.w,0);
    grad.addColorStop(0,'#ffa94d35'); grad.addColorStop(0.6,'#ffa94d18'); grad.addColorStop(1,'#ffa94d05');
    ctx.fillStyle=grad; ctx.fill();
    ctx.strokeStyle='#ffa94d35'; ctx.lineWidth=.5; ctx.stroke();
    ctx.font='600 '+Math.max(6,6*fs)+'px monospace';
    ctx.fillStyle='#ffa94da0'; ctx.textAlign='center';
    ctx.fillText('PERSIST WINDOW', p.x+p.w/2, p.y+p.h/2+2);
  }

  ctx.beginPath(); ctx.moveTo(W/2,l2.y+l2.h); ctx.lineTo(W/2,layout.crossbar.y);
  ctx.strokeStyle='#2a2d3a'; ctx.lineWidth=1.5; ctx.stroke();

  var cb = layout.crossbar;
  ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(cb.x1,cb.y); ctx.lineTo(cb.x2,cb.y);
  ctx.strokeStyle='#339af038'; ctx.lineWidth=1.5; ctx.stroke(); ctx.setLineDash([]);
  ctx.font='600 '+Math.max(7.5,7.5*fs)+'px monospace';
  ctx.fillStyle='#339af0c0'; ctx.textAlign='center';
  ctx.fillText('MEMORY CROSSBAR / NoC', (cb.x1+cb.x2)/2, cb.y-6);

  ctx.beginPath(); ctx.moveTo(W/2,cb.y); ctx.lineTo(W/2,layout.globalMem.y);
  ctx.strokeStyle='#2a2d3a'; ctx.lineWidth=1.5; ctx.stroke();

  var gm = layout.globalMem;
  rrect(gm.x,gm.y,gm.w,gm.h,7);
  ctx.fillStyle='#0d1320'; ctx.fill();
  ctx.strokeStyle='#339af050'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.font='700 '+Math.max(10,10*fs)+'px system-ui,sans-serif';
  ctx.fillStyle='#5ab0f8'; ctx.textAlign='center';
  ctx.fillText('Global Memory Interface', gm.x+gm.w/2, gm.y+14);
  for (var mci=0;mci<layout.mcs.length;mci++) {
    var mc=layout.mcs[mci];
    ctx.fillStyle='hsl(210,50%,'+(14+Math.sin(Date.now()/500+mci)*3)+'%)';
    ctx.fillRect(mc.x,mc.y,mc.w,mc.h);
    ctx.font='600 '+Math.max(6.5,6.5*fs)+'px monospace';
    ctx.fillStyle='#339af090'; ctx.textAlign='center';
    ctx.fillText('MC'+mci, mc.x+mc.w/2, mc.y+mc.h/2+2.5);
  }
  ctx.font='500 '+Math.max(6.5,6.5*fs)+'px monospace';
  ctx.fillStyle='#8890a8'; ctx.textAlign='center';
  ctx.fillText('MC → '+arch.blocks.hbm.label, gm.x+gm.w/2, gm.y+gm.h-5);

  ctx.beginPath(); ctx.moveTo(W/2,gm.y+gm.h); ctx.lineTo(W/2,layout.hbm.y);
  ctx.strokeStyle='#2a2d3a'; ctx.lineWidth=1.5; ctx.stroke();

  var hbm = layout.hbm;
  rrect(hbm.x,hbm.y,hbm.w,hbm.h,7);
  ctx.fillStyle='#0d0a18'; ctx.fill();
  ctx.strokeStyle='#845ef740'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.font='700 '+Math.max(11,11*fs)+'px system-ui,sans-serif';
  ctx.fillStyle='#a07af8'; ctx.textAlign='center';
  ctx.fillText(hbm.label, hbm.x+hbm.w/2, hbm.y+16*fs);
  var hbmStacks = mob ? 4 : 6;
  var hstW = (hbm.w-30)/hbmStacks;
  for (var hi=0;hi<hbmStacks;hi++) {
    for (var hl=0;hl<3;hl++) {
      ctx.fillStyle='hsl(260,40%,'+(12+hl*3+Math.sin(Date.now()/700+hi+hl)*2)+'%)';
      ctx.fillRect(hbm.x+15+hi*hstW, hbm.y+22*fs+hl*3.5, hstW-4, 3);
    }
  }

  // Flash effects (skip advancement if paused)
  flashEffects = flashEffects.filter(function(f) {
    if (!paused) f.t+=0.02;
    if (f.t>=f.dur) return false;
    rrect(f.x-2,f.y-2,f.w+4,f.h+4,5);
    ctx.strokeStyle=f.c+Math.round((1-f.t/f.dur)*0.3*255).toString(16).padStart(2,'0');
    ctx.lineWidth=2; ctx.stroke();
    return true;
  });

  // Bubble repulsion: pairs within 52px push each other apart gently
  if (!paused && bubbles.length > 1) {
    var REPEL_DIST = 52, REPEL_FORCE = 0.18, DAMP = 0.82;
    for (var ri = 0; ri < bubbles.length; ri++) {
      var ba = bubbles[ri];
      ba.vx *= DAMP; ba.vy *= DAMP;
      for (var rj = ri + 1; rj < bubbles.length; rj++) {
        var bb2 = bubbles[rj];
        var rdx = ba.x - bb2.x, rdy = ba.y - bb2.y;
        var dist = Math.sqrt(rdx*rdx + rdy*rdy) || 0.01;
        if (dist < REPEL_DIST) {
          var force = (REPEL_DIST - dist) / REPEL_DIST * REPEL_FORCE;
          var nx = rdx/dist, ny = rdy/dist;
          ba.vx += nx*force; ba.vy += ny*force;
          bb2.vx -= nx*force; bb2.vy -= ny*force;
        }
      }
    }
    for (var ri2 = 0; ri2 < bubbles.length; ri2++) {
      bubbles[ri2].x += bubbles[ri2].vx;
      bubbles[ri2].y += bubbles[ri2].vy;
    }
  }

  // Bubbles (skip advancement if paused)
  bubbles = bubbles.filter(function(b) {
    if (!paused) b.age+=dt;
    if (b.age>b.life) return false;
    var progress=b.age/b.life;
    var fadeIn=Math.min(b.age/0.15,1);
    var fadeOut=progress>0.7?1-(progress-0.7)/0.3:1;
    var alpha=fadeIn*fadeOut;
    var bx=b.x+Math.sin(b.age*1.5+b.wobble)*3;
    var by=b.y-b.age*b.rise;
    var scale=0.8+fadeIn*0.2;

    var isHovered = false;
    if (hoveredBlock) {
      var hr = hoveredBlock;
      if (b.x >= hr.x - 10 && b.x <= hr.x + hr.w + 10 &&
          b.y >= hr.y - 20 && b.y <= hr.y + hr.h + 20) {
        isHovered = true;
      }
    }
    var boostScale = isHovered ? 1.45 : 1.0;
    var boostAlpha = isHovered ? Math.min(alpha * 1.25, 1) : alpha;

    ctx.save();
    ctx.globalAlpha=boostAlpha;

    var fs2 = Math.max(8, 8*scale*boostScale);
    var subFs = Math.max(6.5, 6.5*scale*boostScale);
    ctx.font='700 '+fs2+'px monospace';
    var tw = ctx.measureText(b.text).width + 14;
    var subTw = 0;
    if (b.sub) {
      ctx.font='500 '+subFs+'px monospace';
      subTw = ctx.measureText(b.sub).width + 14;
    }
    var boxW = Math.max(tw, subTw);
    var lineH = fs2 + 3;
    var bh = b.sub ? (lineH + subFs + 7) : (lineH + 4);

    rrect(bx-boxW/2, by-bh/2-1, boxW, bh, 5);
    ctx.fillStyle = isHovered ? b.color + '28' : b.bg; ctx.fill();
    ctx.strokeStyle = isHovered ? b.color + 'cc' : b.color + '70';
    ctx.lineWidth = isHovered ? 1.8 : 1; ctx.stroke();

    if (isHovered) {
      rrect(bx-boxW/2-3, by-bh/2-4, boxW+6, bh+6, 7);
      ctx.strokeStyle = b.color + '30';
      ctx.lineWidth = 4; ctx.stroke();
    }

    if (progress<0.35) {
      ctx.beginPath();
      ctx.moveTo(bx-3, by+bh/2-1);
      ctx.lineTo(bx, by+bh/2+5);
      ctx.lineTo(bx+3, by+bh/2-1);
      ctx.closePath(); ctx.fillStyle = isHovered ? b.color + '28' : b.bg; ctx.fill();
    }

    ctx.font='700 '+fs2+'px monospace';
    ctx.fillStyle=b.color;
    ctx.textAlign='center';
    var textY = b.sub ? (by - bh/2 + fs2 + 3) : (by + fs2/2 - 1);
    ctx.fillText(b.text, bx, textY);

    if (b.sub) {
      ctx.font='500 '+subFs+'px monospace';
      ctx.fillStyle = isHovered ? b.color + 'cc' : b.color + '99';
      ctx.fillText(b.sub, bx, textY + subFs + 2);
    }
    ctx.restore();
    return true;
  });

  // Particles (skip advancement if paused)
  if (!paused) {
    particles.forEach(function(p) { p.update(dt); p.draw(ctx); });
    particles = particles.filter(function(p) { return p.alive; });
  } else {
    // Still draw particles frozen in place
    particles.forEach(function(p) { p.draw(ctx); });
  }

  buildParticleLabelRects();

  // Paused indicator is shown in the HTML badge only — no canvas overlay needed
}

var lastTime=0;

// Particle — supports waypoint routing so particles travel along logical wire paths
// Usage: new Particle(from, to, color, label, speed, onDone)
//   OR:  new Particle(from, to, color, label, speed, onDone, {waypoints:[{x,y}, ...]})
// Waypoints are intermediate stops; particle chains through them automatically.

