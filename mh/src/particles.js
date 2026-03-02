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
    var hasInfo = !!INSTRUCTION_INFO[this.label];
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
function flash(b,c) { flashEffects.push({x:b.x,y:b.y,w:b.w,h:b.h,c:c,t:0,dur:.5}); }

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

