tx.fillText(b.sub, bx, textY + subFs + 2);
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
  drawCallouts(ctx);
  drawL2ProgressBars();
}

var lastTime=0;

// Particle — supports waypoint routing so particles travel along logical wire paths
// Usage: new Particle(from, to, color, label, speed, onDone)
//   OR:  new Particle(from, to, color, label, speed, onDone, {waypoints:[{x,y}, ...]})
// Waypoints are intermediate stops; particle chains through them automatically.

// ── particles.js ──────────────────────────────────────────
// particles.js — GPU Cache Coherency Demo
// Particle animation, coordinate helpers, flash

function Particle(from, to, color, label, speed, onDone, opts) {
  this.color=color; this.label=label||''; this.speed=(speed||2)*SPEED_SCALE; this.alive=true; this.onDone=onDone;
  this.trail=[];
  // Build segment list from waypoints
  var pts = [{x:from.x,y:from.y}];
  if (opts && opts.waypoints) { for (var wi=0;wi<opts.waypoints.length;wi++) pts.push(opts.waypoints[wi]); }
  pts.push({x:to.x,y:to.y});
  this.pts = pts;
  this.segIdx = 0;  // current segment index
  this.segT = 0;    // progress within current segment [0..1]
  // Compute segment lengths for proportional speed
  this.segLens = [];
  this.totalLen = 0;
  for (var si=0;si<pts.length-1;si++) {
    var dx=pts[si+1].x-pts[si].x, dy=pts[si+1].y-pts[si].y;
    var len=Math.sqrt(dx*dx+dy*dy)||1;
    this.segLens.push(len); this.totalLen+=len;
  }
  this.from={x:from.x,y:from.y}; this.to={x:to.x,y:to.y}; // kept for compat
  // passthrough callbacks: {t:0..1, fn:function} — fire when particle crosses that fraction of total path
  this.passthroughs = opts && opts.passthroughs ? opts.passthroughs : [];
  this._ptFired = [];
  for (var pi=0;pi<this.passthroughs.length;pi++) this._ptFired.push(false);
  // compute elapsed fraction
  this._frac = 0;
}
Particle.prototype._getPos = function() {
  var pts=this.pts, segIdx=this.segIdx, segT=this.segT;
  if (segIdx>=pts.length-1) return {x:pts[pts.length-1].x,y:pts[pts.length-1].y};
  var a=pts[segIdx], b=pts[segIdx+1];
  return {x:a.x+(b.x-a.x)*segT, y:a.y+(b.y-a.y)*segT};
};
Particle.prototype.update = function(dt) {
  var step = (this.speed*dt*60)/Math.max(this.segLens[this.segIdx]||1,1);
  this.segT += step;
  // Advance through segments
  while (this.segT >= 1 && this.segIdx < this.pts.length-2) {
    this.segT -= 1; this.segIdx++;
    // Recompute step rate for new segment
  }
  if (this.segIdx >= this.pts.length-2 && this.segT >= 1) {
    this.segT=1; this.alive=false; if (this.onDone) this.onDone(); return;
  }
  // Compute overall fraction for passthrough callbacks
  var elapsed=0;
  for (var si=0;si<this.segIdx;si++) elapsed+=this.segLens[si];
  elapsed+=this.segLens[this.segIdx]*this.segT;
  this._frac = elapsed/this.totalLen;
  // Fire passthroughs
  for (var pi=0;pi<this.passthroughs.length;pi++) {
    if (!this._ptFired[pi] && this._frac >= this.passthroughs[pi].t) {
      this._ptFired[pi]=true;
      this.passthroughs[pi].fn();
    }
  }
  var pos=this._getPos();
  this.trail.push({x:pos.x,y:pos.y}); if(this.trail.length>18) this.trail.shift();
};
Particle.prototype.draw = function(ctx) {
  for (var i=0;i<this.trail.length;i++) {
    var p=this.trail[i], a=(1-i/this.trail.length)*0.5, r=2.5-i/this.trail.length*1.5;
    ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(r,.5),0,Math.PI*2);
    ctx.fillStyle=this.color+Math.round(a*255).toString(16).padStart(2,'0'); ctx.fill();
  }
  var pos=this._getPos();
  var cx=pos.x, cy=pos.y;
  ctx.beginPath(); ctx.arc(cx,cy,4,0,Math.PI*2); ctx.fillStyle=this.color; ctx.fill();
  ctx.beginPath(); ctx.arc(cx,cy,7,0,Math.PI*2); ctx.fillStyle=this.color+'28'; ctx.fill();
  if (this.label) {
    var _baseKey = this.label ? this.label.replace(/\(.*$/, '').replace(/#\d+$/, '') : '';
    var hasInfo = !!INSTRUCTION_INFO[_baseKey];
    var lFont = (hasInfo ? '700' : '500') + ' 9px monospace';
    ctx.font = lFont;
    var lw = ctx.measureText(this.label).width;
    var lx = cx, ly = cy - 12;
    if (hasInfo) {
      var pw = lw + 10, ph = 13;
      rrect(lx - pw/2, ly - ph + 3, pw, ph, 3);
      ctx.fillStyle = this.color + '28'; ctx.fill();
      ctx.strokeStyle = this.color + '70'; ctx.lineWidth = 0.8; ctx.stroke();
    }
    ctx.font = lFont; ctx.fillStyle = this.color; ctx.textAlign = 'center';
    ctx.fillText(this.label, lx, ly);
  }
};

// Convenience: spawn a particle that routes through waypoints automatically
function spawnParticle(from, to, color, label, speed, onDone, waypoints, passthroughs) {
  var opts = {};
  if (waypoints && waypoints.length) opts.waypoints = waypoints;
  if (passthroughs && passthroughs.length) opts.passthroughs = passthroughs;
  var p = new Particle(from, to, color, label, speed, onDone, opts);
  particles.push(p);
  return p;
}

function l1Pos(i) { var l1=layout.sms[i].l1; return {x:l1.x+l1.w/2,y:l1.y+l1.h/2}; }
function busP(i) { var s=layout.sms[i]; return {x:s.x+s.w/2,y:layout.bus.y}; }
function l2Top() { return {x:layout.l2.x+layout.l2.w/2,y:layout.l2.y}; }
function l2Bot() { return {x:layout.l2.x+layout.l2.w/2,y:layout.l2.y+layout.l2.h}; }
function cbP() { return {x:W/2,y:layout.crossbar.y}; }
function gmTop() { return {x:layout.globalMem.x+layout.globalMem.w/2,y:layout.globalMem.y}; }
function gmBot() { return {x:layout.globalMem.x+layout.globalMem.w/2,y:layout.globalMem.y+layout.globalMem.h}; }
function hbmTop() { return {x:layout.hbm.x+layout.hbm.w/2,y:layout.hbm.y}; }
function flash(b,c,opts) {
  var o = opts||{};
  flashEffects.push({x:b.x,y:b.y,w:b.w,h:b.h,c:c,t:0,dur:o.dur||0.5,fill:o.fill||false});
}
function flashFill(b,c,dur) { flash(b,c,{fill:true,dur:dur||0.45}); }

// Per-slot flash — lights up the specific cache line slot bar when a line is installed/evicted/dirtied.
// smIdx: SM index, addr: address index (-1 = flash last occupied slot), color: hex color
var slotFlashEffects = [];

// ── Callout / annotation system ───────────────────────────────────────────
// Each callout: { id, ax, ay, text, sub, color, alpha, targetAlpha, side,
//                 offsetX, offsetY, permanent, age, fadeDelay, life }
// ax/ay = arrow tip on the block, box positioned by side + offsets
var callouts = [];
var calloutIdleShown = false;
// L2 processing progress bars for atomic ops — array of {seq, startTime, duration, done}
var l2ProgressBars = [];
var calloutIdleDismissed = false; // persists until explicit Reset — prevents auto-restore

function clearCallouts(filterFn) {
  if (!filterFn) { callouts = []; return; }
  callouts = callouts.filter(function(c) { return !filterFn(c); });
}

// Smoothly fade out all idle callouts (called on canvas click anywhere)
function dismissIdleCallouts() {
  if (!calloutIdleShown) return;
  callouts.forEach(function(c) {
    if (c.id && c.id.indexOf('-idle') !== -1) {
      c.targetAlpha = 0;   // draw loop fades it out
      c.life = 0.6;        // die after 0.6s
    }
  });
  calloutIdleShown = false;
  calloutIdleDismissed = true; // block any auto-restore until next Reset
}

function clearReactiveCallouts() {
  clearCallouts(function(c) { return !c.permanent; });
}

function addCallout(id, ax, ay, text, sub, color, opts) {
  var o = opts || {};
  callouts = callouts.filter(function(c) { return c.id !== id; });
  callouts.push({
    id: id, ax: ax, ay: ay,
    text: text, sub: sub || '',
    color: color || '#aaa',
    alpha: 0, targetAlpha: o.alpha !== undefined ? o.alpha : 0.9,
    side: o.side || 'right',
    offsetX: o.offsetX || 0, offsetY: o.offsetY || 0,
    permanent: !!o.permanent,
    age: 0, fadeDelay: o.fadeDelay || 0,
    life: o.life || 9999,
    smIdx: o.smIdx !== undefined ? o.smIdx : -1  // -1 = global (no SM routing)
  });
}

function tickCallouts(dt) {
  var hadCallouts = callouts.length > 0;
  callouts = callouts.filter(function(c) {
    c.age += dt;
    var active = c.age - c.fadeDelay;
    if (active < 0) return true;
    // Fade in
    c.alpha += (c.targetAlpha - c.alpha) * Math.min(dt * 5, 1);
    // Fade out in last 1.2s of life
    if (!c.permanent && c.life < 9000) {
      var remaining = c.life - active;
      if (remaining < 1.2) c.targetAlpha = 0;
      if (c.alpha < 0.015 && c.targetAlpha === 0) return false;
    }
    return true;
  });
  // If all callouts just disappeared and no scenario is running, restore idle
  var nowEmpty = callouts.length === 0;
  if (hadCallouts && nowEmpty && !autoMode && !programMode && !calloutIdleDismissed) {
    setTimeout(showIdleCallouts, 800);
  }
}


// ── L2 atomic progress bars — PCB-style on right side of L2 ─────────────────
// One bar per SEQ#, stacked vertically, filling left-to-right over processing time.
// Done bars stay filled (green); active bars animate; all fade after atomic completes.
function drawL2ProgressBars() {
  if (!l2ProgressBars.length || !layout.l2 || !ctx) return;

  var l2 = layout.l2;
  var BAR_W   = 68;   // width of the progress track
  var BAR_H   = 8;    // height of each bar
  var BAR_GAP = 5;    // vertical gap between bars
  var PAD_X   = 8;    // gap between L2 right edge and trace start
  var TRACE   = 18;   // length of PCB L-trace before box
  var BOX_PAD = 6;    // padding inside label box
  var LABEL_W = 24;   // width of "SEQ#N" label
  var now     = Date.now();

  // Total height of all bars
  var totalH = l2ProgressBars.length * (BAR_H + BAR_GAP) - BAR_GAP;
  // Center the stack vertically on L2
  var startY  = l2.y + l2.h/2 - totalH/2;
  // Anchor X: right edge of L2
  var anchorX = l2.x + l2.w;
  // Trace goes right then box starts
  var traceEndX = anchorX + PAD_X + TRACE;

  ctx.save();

  l2ProgressBars.forEach(function(bar, i) {
    var barY = startY + i * (BAR_H + BAR_GAP);
    var barCenterY = barY + BAR_H / 2;

    // Alpha — fade out if all bars done
    var allDone = l2ProgressBars.every(function(b){ return b.done; });
    var alpha = 1.0;
    if (allDone) {
      // Start fading 1s after last bar completes
      // Use bar 0 done time as proxy (already marked)
      alpha = Math.max(0, 1.0 - (now - bar._doneAt) / 2000);
    }
    if (alpha <= 0.01) return;
    ctx.globalAlpha = alpha;

    // Track done time for fade
    if (bar.done && !bar._doneAt) bar._doneAt = now;

    // Progress fraction
    var frac;
    if (bar.done) {
      frac = 1.0;
    } else {
      frac = Math.min(1.0, (now - bar.startTime) / bar.duration);
      // Ease in: slow start, accelerate toward end
      frac = frac * frac * (3 - 2 * frac); // smoothstep
    }

    // Color: done=green, active=amber→cyan gradient
    var trackColor  = bar.done ? '#51cf6640' : '#f59e0b20';
    var fillColor   = bar.done ? '#51cf66'   : (frac > 0.7 ? '#22d3ee' : '#f59e0b');
    var borderColor = bar.done ? '#51cf6699' : '#f59e0b60';
    var textColor   = bar.done ? '#51cf66'   : '#f59e0bcc';

    // ── PCB trace: L-shaped from L2 right edge to box ──────────────────────
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(anchorX, barCenterY);
    ctx.lineTo(anchorX + PAD_X, barCenterY);
    ctx.lineTo(anchorX + PAD_X, barCenterY - 0.5); // tiny vertical nub
    ctx.lineTo(traceEndX, barCenterY - 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Label: "SEQ#N" ──────────────────────────────────────────────────────
    var labelX = traceEndX;
    var labelBoxW = LABEL_W + BOX_PAD;
    ctx.fillStyle = '#0d0f1a';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.8;
    _calloutRRect(labelX, barY - 1, labelBoxW, BAR_H + 2, 2);
    ctx.fill(); ctx.stroke();
    ctx.font = '600 6px ui-monospace,monospace';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.fillText('#'+bar.seq, labelX + labelBoxW/2, barY + BAR_H - 2);

    // ── Progress track ─────────────────────────────────────────────────────
    var trackX = labelX + labelBoxW + 3;
    // Track background
    ctx.fillStyle = trackColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.8;
    _calloutRRect(trackX, barY, BAR_W, BAR_H, 2);
    ctx.fill(); ctx.stroke();

    // Fill bar
    if (frac > 0.005) {
      ctx.fillStyle = fillColor;
      ctx.save();
      ctx.beginPath();
      // Clip to track bounds then draw fill
      ctx.rect(trackX + 1, barY + 1, (BAR_W - 2) * frac, BAR_H - 2);
      ctx.clip();
      _calloutRRect(trackX + 1, barY + 1, BAR_W - 2, BAR_H - 2, 1.5);
      ctx.fill();
      ctx.restore();
    }

    // Pulse dot at fill tip if active
    if (!bar.done && frac > 0.02 && frac < 0.99) {
      var tipX = trackX + 1 + (BAR_W - 2) * frac;
      var pulse = 0.5 + 0.5 * Math.sin(now / 200 + i);
      ctx.fillStyle = fillColor;
      ctx.globalAlpha = alpha * pulse;
      ctx.beginPath();
      ctx.arc(tipX, barY + BAR_H/2, 2, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = alpha;
    }

    // Pct text inside track
    ctx.font = '500 5.5px ui-monospace,monospace';
    ctx.fillStyle = bar.done ? '#51cf66cc' : '#f59e0b99';
    ctx.textAlign = 'left';
    var pctStr = bar.done ? '✓ done' : Math.round(frac * 100) + '%';
    ctx.fillText(pctStr, trackX + 4, barY + BAR_H - 2);

    // Dot on L2 edge anchor
    ctx.fillStyle = textColor;
    ctx.globalAlpha = alpha * 0.7;
    ctx.beginPath();
    ctx.arc(anchorX, barCenterY, 2, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = alpha;
  });

  // Clean up once all faded
  if (l2ProgressBars.length && l2ProgressBars.every(function(b){ return b._doneAt && (now - b._doneAt) > 2500; })) {
    l2ProgressBars = [];
  }

  ctx.restore();
}

function drawCallouts() {
  if (!callouts.length || !ctx) return;
  var TRACE_LEN = 24;
  var BOX_PAD_X = 9, BOX_PAD_Y = 5, MAX_W = 130;
  var SM_TOP_MARGIN = 8; // px above SM block for detour routing
  var BOX_GAP = 4; // minimum vertical gap between adjacent callout boxes

  // ── Pre-pass: compute natural box heights and push apart boxes that overlap ──
  // We compute each callout's boxH, natural by, then sort by side+anchor-y and
  // push boxes apart so they never overlap. The result is stored as c._by offset.
  (function pushApart() {
    ctx.font = '700 8.5px ui-monospace,monospace';
    // Group by (side, smIdx) — callouts on the same side & SM share a column
    var groups = {};
    callouts.forEach(function(c) {
      if (c.alpha < 0.01) return;
      var tw = Math.min(ctx.measureText(c.text).width, MAX_W);
      ctx.font = '500 7px ui-monospace,monospace';
      var sw = c.sub ? Math.min(ctx.measureText(c.sub).width, MAX_W) : 0;
      ctx.font = '700 8.5px ui-monospace,monospace';
      c._boxH = c.sub ? BOX_PAD_Y*2 + 8.5 + 3 + 7 : BOX_PAD_Y*2 + 8.5;
      c._naturalBy = c.ay - c._boxH/2 + (c.offsetY || 0);
      c._by = c._naturalBy; // will be adjusted below
      var key = c.side + '|' + (c.smIdx !== undefined ? c.smIdx : -1);
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    // For each group, sort by natural Y and push down any that overlap
    Object.keys(groups).forEach(function(key) {
      var grp = groups[key].slice().sort(function(a,b){ return a._naturalBy - b._naturalBy; });
      for (var gi = 1; gi < grp.length; gi++) {
        var prev = grp[gi-1], cur = grp[gi];
        var minBy = prev._by + prev._boxH + BOX_GAP;
        if (cur._by < minBy) cur._by = minBy;
      }
    });
  })();

  callouts.forEach(function(c) {
    if (c.alpha < 0.01) return;
    ctx.save();
    ctx.globalAlpha = c.alpha;

    ctx.font = '700 8.5px ui-monospace,monospace';
    var tw = Math.min(ctx.measureText(c.text).width, MAX_W);
    ctx.font = '500 7px ui-monospace,monospace';
    var sw = c.sub ? Math.min(ctx.measureText(c.sub).width, MAX_W) : 0;
    var boxW = Math.max(tw, sw) + BOX_PAD_X * 2;
    var boxH = c.sub ? BOX_PAD_Y*2 + 8.5 + 3 + 7 : BOX_PAD_Y*2 + 8.5;

    var bx, by;
    var tracePoints = [];

    // ── PCB detour routing ──────────────────────────────────────────────────
    // For SM-anchored callouts (smIdx >= 0) going to the left margin:
    //   SM0: straight left   anchor → left → box
    //   SM1: detour around SM0: anchor → up above SMs → left past SM0 → down → box
    // For right margin:
    //   SM3: straight right  anchor → right → box
    //   SM2: detour around SM3: anchor → up above SMs → right past SM3 → down → box
    // For global callouts (smIdx === -1): simple L-trace as before

    var smIdx = c.smIdx !== undefined ? c.smIdx : -1;
    var smCount = layout.sms ? layout.sms.length : 4;
    var needsDetour = false;
    var detourSM = null; // the SM we're routing around

    if (smIdx === 1 && c.side === 'left') {
      needsDetour = true;
      detourSM = layout.sms ? layout.sms[0] : null;
    } else if (smIdx === smCount - 2 && c.side === 'right') {
      needsDetour = true;
      detourSM = layout.sms ? layout.sms[smCount - 1] : null;
    }

    if (needsDetour && detourSM) {
      // Route: anchor → up to above-SM level → across past detourSM → down to box level → box
      var smTop = layout.sms[0].y - SM_TOP_MARGIN; // above all SMs
      var MARGIN = 8; // gap from SM edge to trace

      if (c.side === 'left') {
        // SM1 detours left around SM0
        var exitX = detourSM.x - MARGIN; // left of SM0
        bx = Math.max(4, exitX - TRACE_LEN - boxW);
        // Use pushApart-adjusted _by; clamp only to canvas top (not smTop)
        by = (c._by !== undefined ? c._by : c.ay - boxH/2 + (c.offsetY||0));
        by = Math.max(4, by);
        var boxMidY = by + boxH/2;
        // Route: anchor → up to smTop → left to exitX → down to this box's midY → into box
        tracePoints = [
          {x: c.ax,   y: c.ay},       // anchor on SM left edge
          {x: c.ax,   y: smTop},       // go up above SM row
          {x: exitX,  y: smTop},       // across leftward past SM0
          {x: exitX,  y: boxMidY},     // drop to THIS box's centre (varies per callout)
          {x: bx + boxW, y: boxMidY}   // horizontal into box right edge
        ];
      } else {
        // SM2 detours right around SM3
        var exitX2 = detourSM.x + detourSM.w + MARGIN; // right of SM3
        bx = Math.min(W - boxW - 4, exitX2 + TRACE_LEN);
        by = (c._by !== undefined ? c._by : c.ay - boxH/2 + (c.offsetY||0));
        by = Math.max(4, by);
        var boxMidY2 = by + boxH/2;
        tracePoints = [
          {x: c.ax,          y: c.ay},
          {x: c.ax,          y: smTop},
          {x: exitX2,        y: smTop},
          {x: exitX2,        y: boxMidY2},
          {x: bx,            y: boxMidY2}
        ];
      }
    } else if (c.side === 'right') {
      bx = Math.min(W - boxW - 4, c.ax + TRACE_LEN + c.offsetX);
      by = (c._by !== undefined ? c._by : c.ay - boxH/2 + (c.offsetY||0));
      bx = Math.max(4, bx);
      by = Math.max(4, Math.min(H - boxH - 4, by));
      var bmY = by + boxH/2;
      tracePoints = [
        {x: c.ax, y: c.ay},
        {x: bx,   y: c.ay},
        {x: bx,   y: bmY}
      ];
    } else if (c.side === 'left') {
      bx = Math.max(4, c.ax - TRACE_LEN - boxW + c.offsetX);
      by = (c._by !== undefined ? c._by : c.ay - boxH/2 + (c.offsetY||0));
      by = Math.max(4, Math.min(H - boxH - 4, by));
      var bmY2 = by + boxH/2;
      tracePoints = [
        {x: c.ax,       y: c.ay},
        {x: bx + boxW,  y: c.ay},
        {x: bx + boxW,  y: bmY2}
      ];
    } else if (c.side === 'up') {
      bx = c.ax - boxW/2 + c.offsetX;
      bx = Math.max(4, Math.min(W - boxW - 4, bx));
      by = Math.max(4, c.ay - TRACE_LEN - boxH + c.offsetY);
      var bmX = bx + boxW/2;
      tracePoints = [
        {x: c.ax, y: c.ay},
        {x: c.ax, y: by + boxH},
        {x: bmX,  y: by + boxH}
      ];
    } else { // down
      bx = c.ax - boxW/2 + c.offsetX;
      bx = Math.max(4, Math.min(W - boxW - 4, bx));
      by = Math.min(H - boxH - 4, c.ay + TRACE_LEN + c.offsetY);
      var bmX2 = bx + boxW/2;
      tracePoints = [
        {x: c.ax,  y: c.ay},
        {x: c.ax,  y: by},
        {x: bmX2,  y: by}
      ];
    }

    // ── Draw PCB trace ──────────────────────────────────────────────────────
    ctx.strokeStyle = c.color + 'aa';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(tracePoints[0].x, tracePoints[0].y);
    for (var ti = 1; ti < tracePoints.length; ti++) {
      ctx.lineTo(tracePoints[ti].x, tracePoints[ti].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Anchor via pad
    ctx.fillStyle = c.color;
    ctx.fillRect(c.ax - 1.5, c.ay - 1.5, 3, 3);

    // Corner junction dots at each bend (skip first and last point)
    for (var bi2 = 1; bi2 < tracePoints.length - 1; bi2++) {
      ctx.beginPath();
      ctx.arc(tracePoints[bi2].x, tracePoints[bi2].y, 1.5, 0, Math.PI*2);
      ctx.fillStyle = c.color + 'bb';
      ctx.fill();
    }

    // ── Box ─────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#0b0d1af2';
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = c.color + '60';
    ctx.lineWidth = 0.75;
    ctx.strokeRect(bx + 0.375, by + 0.375, boxW - 0.75, boxH - 0.75);

    // Accent bar
    ctx.fillStyle = c.color + 'cc';
    if (c.side === 'right' || c.side === 'left' || needsDetour) {
      var accentOnRight = (c.side === 'left' || needsDetour);
      ctx.fillRect(accentOnRight ? bx + boxW - 2 : bx, by + 2, 2, boxH - 4);
    } else {
      ctx.fillRect(bx + 2, c.side === 'up' ? by + boxH - 2 : by, boxW - 4, 2);
    }

    // ── Text ────────────────────────────────────────────────────────────────
    var tx = bx + BOX_PAD_X;
    var mainY = c.sub ? by + BOX_PAD_Y + 8 : by + boxH/2 + 3;
    ctx.font = '700 8.5px ui-monospace,monospace';
    ctx.fillStyle = c.color; ctx.textAlign = 'left';
    ctx.fillText(c.text, tx, mainY);
    if (c.sub) {
      ctx.font = '500 7px ui-monospace,monospace';
      ctx.fillStyle = c.color + '99';
      ctx.fillText(c.sub, tx, mainY + 11);
    }
    ctx.restore();
  });
}

function _calloutRRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

// ── Idle callouts: annotate the hierarchy in rest state ────────────────────
function showIdleCallouts() {
  if (!layout.sms || !layout.sms.length || !initialized) return;
  if (calloutIdleDismissed) return; // user dismissed — don't restore until Reset
  clearCallouts();
  calloutIdleShown = true;
  var mob = W < 500;
  var sm0   = layout.sms[0];
  var lastSM = layout.sms[layout.sms.length - 1];

  // Regs — LEFT s
