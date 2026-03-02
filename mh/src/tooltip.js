// tooltip.js — GPU Cache Coherency Demo

// Hit testing, block selection, tooltip rendering

function buildHitRects() {
  hitRects = [];
  for (var si = 0; si < layout.sms.length; si++) {
    var sm = layout.sms[si];
    for (var bi = 0; bi < sm.sub.length; bi++) {
      var b = sm.sub[bi];
      hitRects.push({ type: b.type, x: b.x, y: b.y, w: b.w, h: b.h, smIdx: si, label: b.label });
    }
  }
  if (layout.l2) hitRects.push({ type: 'l2', x: layout.l2.x, y: layout.l2.y, w: layout.l2.w, h: layout.l2.h });
  if (layout.l2Persist) hitRects.push({ type: 'l2Persist', x: layout.l2Persist.x, y: layout.l2Persist.y, w: layout.l2Persist.w, h: layout.l2Persist.h });
  if (layout.arbiter) hitRects.push({ type: 'arbiter', x: layout.arbiter.x, y: layout.arbiter.y, w: layout.arbiter.w, h: layout.arbiter.h });
  if (layout.cohDir) hitRects.push({ type: 'cohDir', x: layout.cohDir.x, y: layout.cohDir.y, w: layout.cohDir.w, h: layout.cohDir.h });
  if (layout.bus) hitRects.push({ type: 'bus', x: layout.bus.x1, y: layout.bus.y - 12, w: layout.bus.x2 - layout.bus.x1, h: 24 });
  if (layout.globalMem) hitRects.push({ type: 'globalMem', x: layout.globalMem.x, y: layout.globalMem.y, w: layout.globalMem.w, h: layout.globalMem.h });
  if (layout.hbm) hitRects.push({ type: 'hbm', x: layout.hbm.x, y: layout.hbm.y, w: layout.hbm.w, h: layout.hbm.h });
}

function hitTest(mx, my) {
  for (var i = hitRects.length - 1; i >= 0; i--) {
    var r = hitRects[i];
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return r;
  }
  return null;
}

function getBlockCenter(type, smIdx) {
  if (type === 'l2') return { x: layout.l2.x + layout.l2.w/2, y: layout.l2.y + layout.l2.h/2 };
  if (type === 'l2Persist') return { x: layout.l2Persist.x + layout.l2Persist.w/2, y: layout.l2Persist.y + layout.l2Persist.h/2 };
  if (type === 'arbiter' && layout.arbiter) return { x: layout.arbiter.x + layout.arbiter.w/2, y: layout.arbiter.y + layout.arbiter.h/2 };
  if (type === 'cohDir' && layout.cohDir) return { x: layout.cohDir.x + layout.cohDir.w/2, y: layout.cohDir.y + layout.cohDir.h/2 };
  if (type === 'bus') return { x: (layout.bus.x1 + layout.bus.x2)/2, y: layout.bus.y };
  if (type === 'globalMem') return { x: layout.globalMem.x + layout.globalMem.w/2, y: layout.globalMem.y + layout.globalMem.h/2 };
  if (type === 'hbm') return { x: layout.hbm.x + layout.hbm.w/2, y: layout.hbm.y + layout.hbm.h/2 };
  var targetSmIdx = (smIdx !== undefined && smIdx !== null) ? smIdx : 0;
  for (var si = 0; si < layout.sms.length; si++) {
    var sm = layout.sms[si];
    for (var bi = 0; bi < sm.sub.length; bi++) {
      var b = sm.sub[bi];
      if (b.type === type && si === targetSmIdx) return { x: b.x + b.w/2, y: b.y + b.h/2 };
    }
  }
  for (var si2 = 0; si2 < layout.sms.length; si2++) {
    for (var bi2 = 0; bi2 < layout.sms[si2].sub.length; bi2++) {
      if (layout.sms[si2].sub[bi2].type === type) {
        var bb = layout.sms[si2].sub[bi2];
        return { x: bb.x + bb.w/2, y: bb.y + bb.h/2 };
      }
    }
  }
  return null;
}

function getBlockRect(type, smIdx) {
  for (var i = 0; i < hitRects.length; i++) {
    var r = hitRects[i];
    if (r.type === type && (smIdx === undefined || r.smIdx === smIdx)) return r;
  }
  return null;
}

var connLineAnim = 0;
var SM_LOCAL_TYPES = { regs:1, l1:1, texCache:1, smem:1, tma:1, dsmem:1, async:1 };

function buildConnLines(blockType, smIdx) {
  var info = BLOCK_INFO[blockType];
  if (!info || !info.connects) return;
  connLines = [];
  var from = getBlockCenter(blockType, smIdx);
  if (!from) return;
  for (var i = 0; i < info.connects.length; i++) {
    var conn = info.connects[i];
    var isGlobal = !SM_LOCAL_TYPES[conn.to];
    if (isGlobal) {
      var tc = getBlockCenter(conn.to, smIdx);
      if (tc) connLines.push({ from: from, to: tc, why: conn.why, arrow: conn.arrow, color: info.color });
    } else {
      var tc2 = getBlockCenter(conn.to, smIdx);
      if (tc2) connLines.push({ from: from, to: tc2, why: conn.why, arrow: conn.arrow, color: info.color });
    }
  }
  connLineAnim = 0;
}

canvas.addEventListener('mousemove', function(e) {
  var r = canvas.getBoundingClientRect();
  mouseX = e.clientX - r.left;
  mouseY = e.clientY - r.top;
  lastClientX = e.clientX;
  lastClientY = e.clientY;

  var pHit = hitTestParticleLabels(mouseX, mouseY);
  if (pHit && INSTRUCTION_INFO[pHit.key]) {
    showInstrTooltip(pHit.key, pHit.clientX, pHit.clientY - 20);
    hoveredBlock = null;
    hideTooltip();
    canvas.style.cursor = 'help';
    return;
  }
  hideInstrTooltip();

  var hit = hitTest(mouseX, mouseY);
  hoveredBlock = hit;
  canvas.style.cursor = hit ? 'pointer' : 'default';
  updateTooltip(hit, e.clientX, e.clientY);
});

canvas.addEventListener('mouseleave', function() {
  hoveredBlock = null;
  hideTooltip();
  hideInstrTooltip();
});

canvas.addEventListener('click', function(e) {
  var r = canvas.getBoundingClientRect();
  var mx = e.clientX - r.left;
  var my = e.clientY - r.top;
  var hit = hitTest(mx, my);
  if (hit) {
    if (selectedBlock && selectedBlock.type === hit.type && selectedBlock.smIdx === hit.smIdx) {
      clearSelection();
    } else {
      selectBlock(hit);
    }
  } else {
    clearSelection();
  }
});

function selectBlock(hit) {
  selectedBlock = hit;
  buildConnLines(hit.type, hit.smIdx);
  updateSelPanel(hit);
}

function clearSelection() {
  selectedBlock = null;
  connLines = [];
  document.getElementById('sel-panel').classList.remove('visible');
}

function updateSelPanel(hit) {
  var info = BLOCK_INFO[hit.type];
  if (!info) return;
  var panel = document.getElementById('sel-panel');
  panel.classList.add('visible');
  document.getElementById('sel-name').innerHTML = '<span style="color:' + info.color + '">' + info.name + '</span>';
  var descEl = document.getElementById('sel-desc');
  if (info.descHTML) {
    descEl.innerHTML = info.descHTML;
  } else {
    descEl.textContent = info.desc;
  }
  var connList = document.getElementById('conn-list');
  connList.innerHTML = '';
  if (!info.connects || info.connects.length === 0) {
    connList.innerHTML = '<div style="font-size:.75rem;color:var(--dim);padding:6px 0">No direct connections defined.</div>';
    return;
  }
  for (var i = 0; i < info.connects.length; i++) {
    var c = info.connects[i];
    var targetInfo = BLOCK_INFO[c.to] || {};
    var el = document.createElement('div');
    el.className = 'conn-item';
    el.innerHTML = '<span class="ci-arrow" style="color:' + (targetInfo.color||'#6b7094') + '">' + c.arrow + '</span><div class="ci-body"><span class="ci-target" style="color:' + (targetInfo.color||'#aaa') + '">' + (targetInfo.name || c.to) + '</span><span class="ci-why">' + c.why + '</span></div>';
    (function(connTo) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var targetHit = getBlockRect(connTo, hit.smIdx) || getBlockRect(connTo);
        if (targetHit) selectBlock(targetHit);
      });
    })(c.to);
    connList.appendChild(el);
  }
}

var tooltipEl = document.getElementById('block-tooltip');
var ttName = document.getElementById('tt-name');
var ttDot = document.getElementById('tt-dot');
var ttDesc = document.getElementById('tt-desc');
var ttMeta = document.getElementById('tt-meta');
var ttHint = document.getElementById('tt-hint');

var instrTooltipEl = null;
var instrHovered = null;

function getInstrEl() {
  if (!instrTooltipEl) instrTooltipEl = document.getElementById('instr-tooltip');
  return instrTooltipEl;
}

function showInstrTooltip(key, clientX, clientY) {
  var info = INSTRUCTION_INFO[key];
  if (!info) return;
  var el = getInstrEl();
  if (!el) return;
  if (instrHovered === key) { positionInstrTooltip(clientX, clientY); return; }
  instrHovered = key;
  document.getElementById('it-dot').style.background = info.color;
  el.style.borderColor = info.color + '40';
  document.getElementById('it-name').textContent = info.name;
  document.getElementById('it-what').textContent = info.what;
  document.getElementById('it-why').textContent = info.why;
  el.querySelector('.it-why-box').style.borderColor = info.color + '30';
  positionInstrTooltip(clientX, clientY);
  el.classList.add('visible');
}

function hideInstrTooltip() {
  instrHovered = null;
  var el = getInstrEl();
  if (el) el.classList.remove('visible');
}

function positionInstrTooltip(clientX, clientY) {
  var el = getInstrEl();
  if (!el) return;
  var tw = 320, th = 220;
  var vw = window.innerWidth, vh = window.innerHeight;
  var tx = clientX + 18;
  var ty = clientY - 24;
  if (tx + tw > vw - 10) tx = clientX - tw - 18;
  if (ty + th > vh - 10) ty = clientY - th + 10;
  if (ty < 8) ty = 8;
  el.style.left = tx + 'px';
  el.style.top  = ty + 'px';
}

var particleLabelRects = [];

function buildParticleLabelRects() {
  particleLabelRects = [];
  var cr = canvas.getBoundingClientRect();
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    if (!p.label || !p.alive) continue;
    var ppos = p._getPos ? p._getPos() : { x: p.from.x + (p.to.x - p.from.x) * (p.t||0), y: p.from.y + (p.to.y - p.from.y) * (p.t||0) };
    var cx2 = ppos.x, cy2 = ppos.y;
    var clientX = cr.left + cx2;
    var clientY = cr.top  + cy2;
    particleLabelRects.push({ key: p.label, cx: cx2, cy: cy2, clientX: clientX, clientY: clientY });
  }
}

function hitTestParticleLabels(mx, my) {
  var HIT_R = 36;
  for (var i = 0; i < particleLabelRects.length; i++) {
    var r = particleLabelRects[i];
    var dx = mx - r.cx;
    var dy = my - (r.cy - 12);
    if (dx*dx + dy*dy < HIT_R*HIT_R) return r;
  }
  return null;
}

var _lastTooltipType = null;

function updateTooltip(hit, clientX, clientY) {
  if (!hit) { hideTooltip(); return; }
  var info = BLOCK_INFO[hit.type];
  if (!info) { hideTooltip(); return; }

  // Clear skeleton when block type changes so stale DOM nodes don't leak between types
  var typeKey = hit.type + (hit.smIdx !== undefined ? '-' + hit.smIdx : '');
  if (typeKey !== _lastTooltipType) {
    ttMeta.innerHTML = '';
    _lastTooltipType = typeKey;
  }

  ttName.textContent = info.name;
  ttDot.style.background = info.color;
  tooltipEl.style.borderColor = info.color + '50';
  ttDesc.textContent = info.desc;

  var isCacheBlock = (hit.type === 'l1' || hit.type === 'smem') && hit.smIdx !== undefined;
  var isRegsBlock  = hit.type === 'regs' && hit.smIdx !== undefined;
  var isL2Block = hit.type === 'l2';
  var isArbiterBlock = hit.type === 'arbiter';
  var isCohDirBlock = hit.type === 'cohDir';

  if (isL2Block) {
    tooltipEl.classList.remove('tt-wide');
    // Build skeleton once — recognised by sentinel id
    if (!document.getElementById('tt-l2-fill-label')) {
      var arch = ARCHS[currentArch];
      var smStateRows = '';
      for (var ssi = 0; ssi < layout.sms.length; ssi++) {
        smStateRows +=
          '<div id="tt-l2-sm-' + ssi + '" style="display:flex;align-items:center;gap:4px;padding:2px 0">' +
            '<span style="font-family:JetBrains Mono,monospace;font-size:.58rem;color:#6b7090;min-width:28px">SM' + ssi + '</span>' +
            '<span id="tt-l2-sm-dot-' + ssi + '" style="display:inline-block;width:8px;height:8px;border-radius:50%"></span>' +
            '<span id="tt-l2-sm-state-' + ssi + '" style="font-family:JetBrains Mono,monospace;font-size:.6rem"></span>' +
            '<span id="tt-l2-sm-tag-' + ssi + '" style="font-family:JetBrains Mono,monospace;font-size:.56rem;color:#3a3d55;margin-left:auto"></span>' +
          '</div>';
      }
      // Build N line cells for the grid
      var gridCells = '';
      for (var gi = 0; gi < NUM_L2_LINES; gi++) {
        gridCells += '<div id="tt-l2-cell-' + gi + '" style="flex:1;border-radius:2px;transition:background .15s"></div>';
      }
      ttMeta.innerHTML =
        // ── Line grid header ──
        '<div style="margin-bottom:6px">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">' +
            '<span style="font-family:JetBrains Mono,monospace;font-size:.6rem;color:#9095b0;text-transform:uppercase;letter-spacing:1px">L2 Lines (' + arch.blocks.l2.size + ')</span>' +
            '<span id="tt-l2-fill-label" style="font-family:JetBrains Mono,monospace;font-size:.68rem;font-weight:700;color:#ffa94d"></span>' +
            '<span id="tt-l2-dirty-label" style="font-family:JetBrains Mono,monospace;font-size:.62rem;color:#ffa94d;margin-left:2px"></span>' +
          '</div>' +
          // Live line grid
          '<div style="display:flex;gap:2px;height:10px;margin-bottom:4px">' + gridCells + '</div>' +
          // Legend
          '<div style="display:flex;gap:10px;font-family:JetBrains Mono,monospace;font-size:.56rem;margin-bottom:5px">' +
            '<span style="color:#339af0">■ clean</span>' +
            '<span style="color:#ffa94d">■ dirty</span>' +
            '<span style="color:#4a5080">■ empty</span>' +
          '</div>' +
          // Occupancy bar
          '<div style="height:3px;background:#1e2030;border-radius:2px;margin-bottom:8px">' +
            '<div id="tt-l2-occ-bar" style="height:3px;border-radius:2px;transition:width .2s,background .2s"></div>' +
          '</div>' +

          // ── Lifecycle section ──
          '<div style="border-top:1px solid #1e2030;padding-top:7px;margin-bottom:6px">' +
            '<div style="font-family:JetBrains Mono,monospace;font-size:.56rem;color:#9095b0;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Cache Line Lifecycle</div>' +
            // How lines go clean
            '<div style="margin-bottom:4px">' +
              '<div style="font-family:JetBrains Mono,monospace;font-size:.58rem;font-weight:700;color:#339af0;margin-bottom:1px">Clean (blue)</div>' +
              '<div style="font-family:JetBrains Mono,monospace;font-size:.56rem;color:#6b7090;line-height:1.5">Filled on SM read miss (RdReq → L2 → DATA). Shared read-only across SMs — any number of SMs can hold a Shared copy simultaneously.</div>' +
            '</div>' +
            // How lines go dirty
            '<div style="margin-bottom:4px">' +
              '<div style="font-family:JetBrains Mono,monospace;font-size:.58rem;font-weight:700;color:#ffa94d;margin-bottom:1px">Dirty (orange)</div>' +
              '<div style="font-family:JetBrains Mono,monospace;font-size:.56rem;color:#6b7090;line-height:1.5">Marked dirty on SM write (write-evict policy on Volta+) or write-back from L1. Dirty means L2 has the most recent value — DRAM is stale. Must be flushed before eviction.</div>' +
            '</div>' +
            // Eviction
            '<div style="margin-bottom:4px">' +
              '<div style="font-family:JetBrains Mono,monospace;font-size:.58rem;font-weight:700;color:#845ef7;margin-bottom:1px">Eviction → DRAM</div>' +
              '<div style="font-family:JetBrains Mono,monospace;font-size:.56rem;color:#6b7090;line-height:1.5">When L2 is &gt;75% full, the LRU victim is evicted. Clean lines are simply discarded. Dirty lines must be written to DRAM first (EVICT → NoC → MC → HBM) — adds ~400 cycles.</div>' +
            '</div>' +
            // Write policy
            '<div style="margin-bottom:6px">' +
              '<div style="font-family:JetBrains Mono,monospace;font-size:.58rem;font-weight:700;color:#6b7090;margin-bottom:1px">Write policy: <span id="tt-l2-writepolicy" style="color:#aaa"></span></div>' +
              '<div style="font-family:JetBrains Mono,monospace;font-size:.56rem;color:#6b7090;line-height:1.5"><span id="tt-l2-writepolicy-desc"></span></div>' +
            '</div>' +
          '</div>' +

          // ── Latency row ──
          '<div style="display:flex;gap:8px;margin-bottom:8px;font-family:JetBrains Mono,monospace;font-size:.56rem">' +
            '<span style="color:#6b7090">Hit latency:</span>' +
            '<span id="tt-l2-latency" style="color:#aaa"></span>' +
            '<span style="color:#6b7090;margin-left:auto">Miss → DRAM:</span>' +
            '<span style="color:#ff6b6b">~400 cycles</span>' +
          '</div>' +

          // ── Per-SM coherency state ──
          '<div style="font-family:JetBrains Mono,monospace;font-size:.58rem;color:#9095b0;letter-spacing:.5px;margin-bottom:3px;text-transform:uppercase">Coherency state (L1 per SM)</div>' +
          smStateRows +
        '</div>';

      // Set static content
      var wpEl = document.getElementById('tt-l2-writepolicy');
      var wpdEl = document.getElementById('tt-l2-writepolicy-desc');
      var latEl = document.getElementById('tt-l2-latency');
      if (wpEl) wpEl.textContent = currentArch === 'pascal' ? 'write-through' : 'write-evict / write-back';
      if (wpdEl) wpdEl.textContent = currentArch === 'pascal'
        ? 'Pascal L1 is read-only — stores bypass it and go straight to L2. L2 always has the authoritative copy, so L1 never needs to be invalidated on a write.'
        : 'Volta+: stores hit L1, which becomes Modified. L2 gets the data only when L1 evicts the dirty line (write-back) or on capacity pressure. Other SMs\' L1 copies are invalidated via INV.';
      if (latEl) latEl.textContent = '~' + (currentArch === 'pascal' ? '80' : currentArch === 'ampere' || currentArch === 'hopper' ? '50' : '60') + ' cycles';
    }
    refreshTooltipL2Data();
    ttHint.style.display = (selectedBlock && selectedBlock.type === 'l2') ? 'none' : 'flex';
    positionTooltip(clientX, clientY);
    tooltipEl.classList.add('visible');
    return;
  }

  if (isArbiterBlock) {
    tooltipEl.classList.add('tt-wide');
    // Render rich arbiter state in tooltip
    var arbQ = arbiterState.queue;
    var arbROB = arbiterState.rob;
    var arbOps = arbiterState.activeOps;
    var arbGrants = arbiterState.recentGrants;
    var latFracTT = arbiterState.contentionLevel;
    var cycTT = Math.round(2 + latFracTT * 30);
    var statusTT = arbQ.length >= QUEUE_CAPACITY - 2 ? 'SATURATED'
      : arbiterState.active ? 'ACTIVE'
      : arbiterState.passthroughCount > 0 ? 'PASSTHROUGH'
      : 'IDLE';
    var statusColor = arbQ.length >= QUEUE_CAPACITY - 2 ? '#ff6b6b'
      : arbiterState.active ? '#fbbf24'
      : arbiterState.passthroughCount > 0 ? '#22d3ee'
      : '#4a5080';

    // ── Live ops table — what each in-flight op is doing RIGHT NOW ──
    var liveOpsHtml = '';
    if (arbOps.length === 0) {
      liveOpsHtml = '<div style="color:#4a5080;font-size:.6rem;padding:2px 0">No ops in flight</div>';
    } else {
      for (var tao = 0; tao < Math.min(arbOps.length, 6); tao++) {
        var aop = arbOps[tao];
        var ph = ARB_PHASES[aop.phase] || ARB_PHASES.queued;
        var elapsed = Math.round((Date.now() - aop.phaseStart) / 10); // in ~cycles (10ms ≈ 1 notional cycle)
        var phaseBar = '';
        // 5-step pipeline indicator
        var phases = ['queued','granted','rmw','ack','retiring'];
        var curPhaseIdx = phases.indexOf(aop.phase);
        for (var pp = 0; pp < phases.length; pp++) {
          var ppActive = pp === curPhaseIdx;
          var ppDone = pp < curPhaseIdx;
          var ppColor = ppDone ? '#51cf6660' : ppActive ? ph.color : '#2a2d3a';
          phaseBar += '<span style="display:inline-block;width:14px;height:4px;border-radius:2px;background:'+ppColor+';margin-right:2px"></span>';
        }
        liveOpsHtml +=
          '<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid #1e2030">' +
            '<span style="font-family:JetBrains Mono,monospace;font-size:.58rem;color:#f59e0b;min-width:28px">#'+aop.seq+'</span>' +
            '<span style="font-family:JetBrains Mono,monospace;font-size:.58rem;color:#e0e2ec;min-width:22px">SM'+aop.smIdx+'</span>' +
            '<span style="font-family:JetBrains Mono,monospace;font-size:.58rem;font-weight:700;color:'+ph.color+';min-width:64px">'+ph.label+'</span>' +
            '<span style="flex:1">'+phaseBar+'</span>' +
            '<span style="font-family:JetBrains Mono,monospace;font-size:.54rem;color:#6b7090">'+elapsed+'τ</span>' +
          '</div>';
      }
    }

    // ── ROB slots ──
    var robSlots = '';
    for (var trs = 0; trs < 6; trs++) {
      var tre = trs < arbROB.length ? arbROB[trs] : null;
      var rstate = tre ? tre.state : '';
      var rcls = 'tt-arb-rob-slot' + (rstate==='pending'?' pend':rstate==='complete'?' comp':rstate==='retiring'?' retr':rstate==='done'?' done':'');
      var robLabel = tre ? '#'+tre.seq : '—';
      robSlots += '<div class="'+rcls+'" title="'+rstate+'">'+robLabel+'</div>';
    }

    // ── Queue slots ──
    var qSlots = '';
    for (var tqs = 0; tqs < 6; tqs++) {
      var tqe = tqs < arbQ.length ? arbQ[tqs] : null;
      var cls = tqe ? 'tt-arb-slot occ' : 'tt-arb-slot';
      qSlots += '<div class="'+cls+'">'+(tqe ? '#'+tqe.seq : '—')+'</div>';
    }

    // ── Grant log ──
    var grantHtml = '';
    if (arbGrants.length === 0) {
      grantHtml = '<span style="color:#4a5080">No grants yet — run atomicAdd scenario</span>';
    } else {
      for (var tgi = 0; tgi < Math.min(arbGrants.length, 3); tgi++) {
        var tge = arbGrants[tgi];
        grantHtml += '→ <span class="gs">#'+tge.seq+'</span> retired in <span class="gc">'+tge.cycles+' cyc</span><br>';
      }
    }

    var latBarPct = Math.round(latFracTT * 100);
    var latColor = latFracTT > 0.6 ? '#ff6b6b' : latFracTT > 0.3 ? '#f59e0b' : '#51cf66';

    ttMeta.innerHTML =
      // Status header
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">' +
        '<span style="font-family:JetBrains Mono,monospace;font-size:.58rem;color:#6b7090">STATUS</span>' +
        '<span style="font-family:JetBrains Mono,monospace;font-size:.64rem;font-weight:700;letter-spacing:.5px;color:'+statusColor+'">● '+statusTT+'</span>' +
      '</div>' +
      // Live ops — the star of the show
      '<div class="tt-arb-section">' +
        '<div class="tt-arb-label">Live In-Flight Operations <span style="float:right;color:#f59e0b">SEQ#'+String(arbiterState.seqCounter).padStart(3,'0')+'</span></div>' +
        liveOpsHtml +
      '</div>' +
      // Queue + ROB side by side
      '<div class="tt-arb-section" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div>' +
          '<div class="tt-arb-label">Wait Queue</div>' +
          '<div class="tt-arb-queue">'+qSlots+'</div>' +
        '</div>' +
        '<div>' +
          '<div class="tt-arb-label">ROB</div>' +
          '<div class="tt-arb-rob">'+robSlots+'</div>' +
        '</div>' +
      '</div>' +
      // Contention bar
      '<div class="tt-arb-section">' +
        '<div class="tt-arb-label">Bus Contention <span style="float:right;color:'+latColor+'">~'+cycTT+' cyc/grant</span></div>' +
        '<div class="tt-arb-bar-bg"><div class="tt-arb-bar-fill" style="width:'+latBarPct+'%"></div></div>' +
        '<div style="font-family:JetBrains Mono,monospace;font-size:.54rem;color:#4a5080;margin-top:2px">'+
          'Idle: 2 cyc · Contended: up to 32 cyc' +
        '</div>' +
      '</div>' +
      // Grant log
      '<div class="tt-arb-section">' +
        '<div class="tt-arb-label">Recent Completions <span style="float:right;color:#6b7090">'+arbiterState.grantCount+' total</span></div>' +
        '<div class="tt-arb-grant-log">'+grantHtml+'</div>' +
      '</div>';
    ttHint.style.display = 'none';
    positionTooltip(clientX, clientY);
    tooltipEl.classList.add('visible');
    return;
  } else {
    tooltipEl.classList.remove('tt-wide');
  }

  if (isRegsBlock) {
    tooltipEl.classList.remove('tt-wide');
    if (!document.getElementById('tt-regs-bar')) {
      // Build regs skeleton once
      ttMeta.innerHTML =
        '<div>' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
            '<span style="font-family:JetBrains Mono,monospace;font-size:.6rem;color:#9095b0;text-transform:uppercase;letter-spacing:1px">Register Occupancy</span>' +
            '<span id="tt-regs-pct" style="font-family:JetBrains Mono,monospace;font-size:.68rem;font-weight:700"></span>' +
          '</div>' +
          // Occupancy bar
          '<div style="height:8px;background:#141620;border-radius:3px;margin-bottom:5px;position:relative;overflow:hidden">' +
            '<div id="tt-regs-bar" style="height:100%;border-radius:3px;transition:width .15s,background .15s"></div>' +
            // Danger line at 100%
            '<div style="position:absolute;right:0;top:0;bottom:0;width:1.5px;background:#fb923c44"></div>' +
          '</div>' +
          '<div id="tt-regs-state" style="font-family:JetBrains Mono,monospace;font-size:.62rem;margin-bottom:8px"></div>' +
          // Explanation
          '<div style="border-top:1px solid #1e2030;padding-top:7px">' +
            '<div style="font-family:JetBrains Mono,monospace;font-size:.56rem;color:#9095b0;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">How registers work</div>' +
            '<div style="margin-bottom:4px;font-family:JetBrains Mono,monospace;font-size:.56rem;color:#6b7090;line-height:1.5">' +
              'Each resident warp has a fixed register allocation decided at compile time. The register file is never empty — all resident warps\' registers are live simultaneously. Bars show current occupancy across all warps.' +
            '</div>' +
            '<div style="margin-bottom:4px;font-family:JetBrains Mono,monospace;font-size:.56rem">' +
              '<span style="color:#5a7ad0;font-weight:700">Normal (≤85%)</span>' +
              '<span style="color:#6b7090"> — all warp registers fit in the physical file. No spilling.</span>' +
            '</div>' +
            '<div style="margin-bottom:4px;font-family:JetBrains Mono,monospace;font-size:.56rem">' +
              '<span style="color:#fb923c;font-weight:700">Overflow (>100%)</span>' +
              '<span style="color:#6b7090"> — compiler inserted SPILL/RELOAD instructions. The warp stalls while values are written/read from L1 cache.</span>' +
            '</div>' +
            '<div style="font-family:JetBrains Mono,monospace;font-size:.56rem;color:#6b7090">Reducing registers per thread (–maxrregcount) lets more warps fit simultaneously, improving occupancy and latency hiding.</div>' +
          '</div>' +
        '</div>';
    }
    refreshTooltipRegsData(hit.smIdx);
    ttHint.style.display = 'none';
    positionTooltip(clientX, clientY);
    tooltipEl.classList.add('visible');
    return;
  }

  if (isCacheBlock) {
    if (!document.getElementById('tt-line-grid')) {
      // Build L1/SMEM skeleton with lifecycle info
      var isL1 = hit.type === 'l1';
      ttMeta.innerHTML =
        '<div style="margin-bottom:2px">' +
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">' +
            '<span style="font-family:JetBrains Mono,monospace;font-size:.6rem;color:#9095b0;text-transform:uppercase;letter-spacing:1px">Cache Lines</span>' +
            '<span id="tt-fill-label" style="font-family:JetBrains Mono,monospace;font-size:.68rem;font-weight:700;color:'+info.color+'"></span>' +
            '<span id="tt-dirty-label" style="font-family:JetBrains Mono,monospace;font-size:.62rem;color:#51cf66"></span>' +
          '</div>' +
          '<div id="tt-line-grid" style="display:flex;gap:2px;height:10px;margin-bottom:5px"></div>' +
          '<div id="tt-state-label" style="font-size:.66rem;font-family:JetBrains Mono,monospace;margin-bottom:8px"></div>' +
          (isL1 ? (
            '<div style="border-top:1px solid #1e2030;padding-top:7px">' +
              '<div style="font-family:JetBrains Mono,monospace;font-size:.56rem;color:#9095b0;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">L1 Cache Line States</div>' +
              '<div style="margin-bottom:3px;font-family:JetBrains Mono,monospace;font-size:.56rem">' +
                '<span style="color:#339af0;font-weight:700">Shared</span>' +
                '<span style="color:#6b7090"> — clean copy. Filled on read miss (RdReq → L2 → DATA). Multiple SMs can hold Shared simultaneously. Instantly invalidated if another SM writes to the same address.</span>' +
              '</div>' +
              '<div style="margin-bottom:3px;font-family:JetBrains Mono,monospace;font-size:.56rem">' +
                '<span style="color:#51cf66;font-weight:700">Modified</span>' +
                '<span style="color:#6b7090"> — dirty. Set when SM writes to this line (write-evict). This SM has the only valid copy — all other SMs\' copies are invalidated. Line must be written back to L2 before eviction.</span>' +
              '</div>' +
              '<div style="font-family:JetBrains Mono,monospace;font-size:.56rem">' +
                '<span style="color:#6b7090;font-weight:700">Invalid</span>' +
                '<span style="color:#6b7090"> — empty. Either never loaded, or dropped by an INV message. Next access causes a miss — RdReq goes to L2 to refill.</span>' +
              '</div>' +
            '</div>'
          ) : (
            '<div style="border-top:1px solid #1e2030;padding-top:7px;font-family:JetBrains Mono,monospace;font-size:.56rem;color:#6b7090;line-height:1.5">' +
              'SMEM is software-managed scratchpad. No coherency protocol — the programmer controls all reads and writes. Access via LDS (load) and STS (store). 32 memory banks; simultaneous access to different banks costs 0 extra cycles.' +
            '</div>'
          )) +
        '</div>';
    }
    refreshTooltipCacheData(hit, info);
  } else {
    ttMeta.innerHTML = '';
    if (info.chips) {
      for (var i = 0; i < info.chips.length; i++) {
        var chip = info.chips[i];
        var span = document.createElement('span');
        span.className = 'tt-chip';
        span.style.background = chip.c + '20';
        span.style.color = chip.c;
        span.textContent = chip.t;
        ttMeta.appendChild(span);
      }
    }
  }

  ttHint.style.display = (selectedBlock && selectedBlock.type === hit.type) ? 'none' : 'flex';
  positionTooltip(clientX, clientY);
  tooltipEl.classList.add('visible');
}

// Live in-place refresh for register file tooltip
function refreshTooltipRegsData(smIdx) {
  var cs = cacheState[smIdx];
  var pressure = cs ? cs.regsPressure : 0.75;
  var visualPct = Math.round(Math.min(pressure, 1.15) * 100);
  var barFill = Math.min(100, visualPct);

  var pctEl = document.getElementById('tt-regs-pct');
  var barEl = document.getElementById('tt-regs-bar');
  var stateEl = document.getElementById('tt-regs-state');

  var color, stateText;
  if (pressure >= 1.0) {
    color = '#fb923c';
    stateText = '⚠ OVERFLOW — register spill active. Warp is stalled, values spilling to L1.';
  } else if (pressure >= 0.88) {
    color = '#f59e0b';
    stateText = '● High load — near capacity. Compiler may have inserted preventive spills.';
  } else {
    color = '#5a7ad0';
    stateText = '● Normal — all registers fit in the physical file.';
  }

  if (pctEl) { pctEl.textContent = visualPct + '%'; pctEl.style.color = color; }
  if (barEl)  { barEl.style.width = barFill + '%'; barEl.style.background = color; }
  if (stateEl) { stateEl.style.color = color; stateEl.textContent = stateText; }
}

// Live in-place refresh for L2 tooltip — called every frame while L2 is hovered.
// Only touches .style properties and .textContent — never rebuilds innerHTML.
function refreshTooltipL2Data() {
  var l2Filled = 0, l2Dirty = 0;
  for (var i = 0; i < NUM_L2_LINES; i++) {
    if (l2Lines[i] === 1) l2Filled++;
    else if (l2Lines[i] === 2) { l2Filled++; l2Dirty++; }
  }
  var l2Empty = NUM_L2_LINES - l2Filled;
  var l2OccPct = Math.round(l2Filled / NUM_L2_LINES * 100);

  // Fill / dirty labels
  var fillEl = document.getElementById('tt-l2-fill-label');
  if (fillEl) fillEl.textContent = l2Filled + '/' + NUM_L2_LINES + ' filled';
  var dirtyEl = document.getElementById('tt-l2-dirty-label');
  if (dirtyEl) dirtyEl.textContent = l2Dirty > 0 ? l2Dirty + ' dirty' : '';

  // Line cells — update background in-place so CSS transition fires
  for (var gi = 0; gi < NUM_L2_LINES; gi++) {
    var cell = document.getElementById('tt-l2-cell-' + gi);
    if (!cell) continue;
    var lv = l2Lines[gi];
    cell.style.background = lv === 2 ? '#ffa94d' : lv === 1 ? '#339af060' : '#1e2030';
  }

  // Occupancy bar
  var bar = document.getElementById('tt-l2-occ-bar');
  if (bar) {
    bar.style.width = l2OccPct + '%';
    bar.style.background = l2OccPct > 80 ? '#ff6b6b' : '#ffa94d';
  }

  // Per-SM coherency state rows
  for (var ssi = 0; ssi < layout.sms.length; ssi++) {
    var st = layout.sms[ssi].l1.state;
    var sc = st === 'modified' ? '#51cf66' : st === 'shared' ? '#339af0' : '#4a5080';
    var sl = st === 'modified' ? '[M]' : st === 'shared' ? '[S]' : '[I]';
    var dotEl = document.getElementById('tt-l2-sm-dot-' + ssi);
    var stEl  = document.getElementById('tt-l2-sm-state-' + ssi);
    var tagEl = document.getElementById('tt-l2-sm-tag-' + ssi);
    if (dotEl) dotEl.style.background = sc;
    if (stEl)  { stEl.style.color = sc; stEl.textContent = st; }
    if (tagEl) tagEl.textContent = sl;
  }
}

function refreshTooltipCacheData(hit, info) {
  if (!hit) return;
  var inf = info || BLOCK_INFO[hit.type];
  if (!inf) return;
  var kind = hit.type === 'l1' ? 'l1' : 'smem';
  if (hit.type !== 'l1' && hit.type !== 'smem') return;

  var cs = getCacheStats(hit.smIdx, kind);
  var arr = cacheState[hit.smIdx] ? cacheState[hit.smIdx][kind] : [];

  var fillLbl = document.getElementById('tt-fill-label');
  if (fillLbl) fillLbl.textContent = cs.filled + '/' + NUM_LINES + ' filled';

  var dirtyLbl = document.getElementById('tt-dirty-label');
  if (dirtyLbl) dirtyLbl.textContent = cs.dirty > 0 ? cs.dirty + ' dirty' : '';

  var grid = document.getElementById('tt-line-grid');
  if (grid) {
    if (grid.children.length !== NUM_LINES) {
      grid.innerHTML = '';
      for (var li = 0; li < NUM_LINES; li++) {
        var sq = document.createElement('div');
        sq.style.cssText = 'flex:1;border-radius:2px;transition:background .12s';
        grid.appendChild(sq);
      }
    }
    for (var li2 = 0; li2 < NUM_LINES; li2++) {
      var lv = arr[li2] || 0;
      var lc;
      if (lv === 2)      lc = '#51cf66';
      else if (lv === 1) lc = hit.type === 'l1' ? inf.color + 'cc' : '#51cf6688';
      else               lc = '#1e2030';
      grid.children[li2].style.background = lc;
    }
  }

  var stateLbl = document.getElementById('tt-state-label');
  if (stateLbl && hit.type === 'l1') {
    var l1b = null;
    if (layout.sms[hit.smIdx]) {
      for (var bi = 0; bi < layout.sms[hit.smIdx].sub.length; bi++) {
        if (layout.sms[hit.smIdx].sub[bi].type === 'l1') { l1b = layout.sms[hit.smIdx].sub[bi]; break; }
      }
    }
    var st = l1b ? l1b.state : 'invalid';
    var stateLabel, stateColor;
    if (st === 'modified')      { stateLabel = '● Modified — has dirty data';  stateColor = '#51cf66'; }
    else if (st === 'shared')   { stateLabel = '● Shared — clean copy';        stateColor = '#5ab0f8'; }
    else                        { stateLabel = '● Invalid — empty';            stateColor = '#6b7090'; }
    stateLbl.style.color = stateColor;
    stateLbl.textContent = stateLabel;
  } else if (stateLbl && hit.type === 'smem') {
    var smFilled = cs.filled;
    stateLbl.style.color = smFilled > 0 ? '#6ee09a' : '#6b7090';
    stateLbl.textContent = smFilled > 0 ? '● Active — ' + smFilled + ' slots used' : '● Empty — no data loaded';
  }
}

function positionTooltip(clientX, clientY) {
  var vizRect = canvas.parentElement.getBoundingClientRect();
  var tx = clientX - vizRect.left + 14;
  var ty = clientY - vizRect.top - 12;
  var tw = 250, th = 160;
  if (tx + tw > vizRect.width - 10)  tx = clientX - vizRect.left - tw - 14;
  if (ty + th > vizRect.height - 10) ty = clientY - vizRect.top - th - 12;
  if (ty < 4) ty = 4;
  tooltipEl.style.left = tx + 'px';
  tooltipEl.style.top  = ty + 'px';
}

function hideTooltip() {
  tooltipEl.classList.remove('visible');
  _lastTooltipType = null;
}

