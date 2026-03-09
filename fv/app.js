// ─────────────────────────────────────────────
// FLASHCARD ENGINE  —  with spaced repetition
// ─────────────────────────────────────────────
// Spaced repetition strategy:
//   - Cards graded "Got It" → removed permanently from this session
//   - Cards graded "Missed" → re-inserted into the deck N positions ahead
//     (RETRY_OFFSET). They'll come back soon, but not immediately.
//   - Cards graded "Skip"   → moved to end of deck, come back last
//   - A "(⟳ retry)" badge on the card shows it's a re-attempt

const RETRY_OFFSET = 5; // missed cards return after this many cards

let deck=[], current=0, revealed=false, shuffleOn=true, activeFilter='All';
let stats={correct:0,wrong:0,skip:0}, sessionMissedIds=[], retryCount=0;

function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function buildDeck(){
  let f = ALL_QUESTIONS.filter(q => activeFilter==='All' || q.diff===activeFilter);
  // Each deck entry: { q: questionObj, retry: false }
  deck = (shuffleOn ? shuffle([...f]) : [...f]).map(q => ({q, retry:false}));
  current = 0;
  stats = {correct:0, wrong:0, skip:0};
  sessionMissedIds = [];
  retryCount = 0;
  updateStats();
  document.getElementById('done-screen').classList.remove('visible');
  document.getElementById('main-area').style.display = '';
  showCard();
}

function setFilter(f, btn){
  activeFilter = f;
  document.querySelectorAll('#filter-group .xp-btn').forEach(b => b.classList.remove('active-btn'));
  btn.classList.add('active-btn');
  buildDeck();
}

function toggleShuffle(){
  shuffleOn = !shuffleOn;
  document.getElementById('shuffle-label').textContent = '🔀 Shuffle: '+(shuffleOn?'ON':'OFF');
  buildDeck();
}
function restartDeck(){ buildDeck(); }

const DIFF_LABELS = {
  'Beginner':'🟢 Beginner','Intermediate':'🔵 Intermediate','Advanced':'🟡 Advanced',
  'Jasper':'🟣 Jasper Apps','Coverage':'📊 Coverage','CovApp':'📈 Coverage App',
  'Mutation':'🧬 Mutation','Bug':'🐛 Spot the Bug','Bug2':'🐛🐛 Spot the Bug II',
  'SVA_Deep':'🔬 SVA Deep Dive','SVA_Int':'⚙️ SVA Internals',
  'Debug':'🔧 Debug FPV','Abstraction':'🧩 Abstraction',
  'Interview':'🎤 Interview','Methodology_Adv':'📋 Sign-off & Methodology',
  'Hybrid':'🔀 Hybrid Flows','CDC':'⚡ CDC Formal','Liveness':'♾ Liveness'
};


// ─────────────────────────────────────────────
// ANSWER FORMATTER
// ─────────────────────────────────────────────
function formatAnswer(text){
  const el = document.createElement('div');
  el.className = 'answer-text';
  const blocks = text.split(/\n{2,}/);
  blocks.forEach(block => {
    block = block.trim();
    if(!block) return;
    const lines = block.split('\n');

    // ALL-CAPS section header
    if(block.length < 60 && block === block.toUpperCase() && block.match(/[A-Z]{3}/) && !block.match(/[a-z]/)){
      const hdr = document.createElement('div');
      hdr.className = 'ans-section';
      hdr.textContent = block;
      el.appendChild(hdr);
      return;
    }

    // Code block: multi-line with SVA/SV syntax
    const codeChars = (block.match(/[{};|@=><]/g)||[]).length;
    const hasSVA = /\b(assert|property|always|posedge|negedge|disable|iff|##|logic|wire|module)\b/.test(block);
    if(lines.length > 2 && codeChars > 3 && hasSVA){
      const pre = document.createElement('div');
      pre.className = 'ans-code-block';
      pre.textContent = block;
      el.appendChild(pre);
      return;
    }

    // Numbered items
    if(lines.some(l => /^\d+[).]\s/.test(l))){
      lines.forEach(line => {
        const m = line.match(/^(\d+)[).]\s+(.*)/);
        if(m){
          const row = document.createElement('div');
          row.className = 'ans-numbered';
          const num = document.createElement('div');
          num.className = 'ans-num';
          num.textContent = m[1];
          const txt = document.createElement('div');
          txt.className = 'ans-num-text';
          txt.innerHTML = inlineFormat(m[2]);
          row.appendChild(num);
          row.appendChild(txt);
          el.appendChild(row);
        } else if(line.trim()){
          const p = document.createElement('div');
          p.className = 'ans-para';
          p.style.marginLeft = '28px';
          p.innerHTML = inlineFormat(line);
          el.appendChild(p);
        }
      });
      return;
    }

    // Bullet list
    if(lines[0] && /^[-•*]\s/.test(lines[0])){
      lines.forEach(line => {
        const m = line.match(/^[-•*]\s+(.*)/);
        if(m){
          const row = document.createElement('div');
          row.className = 'ans-bullet';
          const dot = document.createElement('div');
          dot.className = 'ans-bullet-dot';
          dot.textContent = '\u25b8';
          const txt = document.createElement('div');
          txt.className = 'ans-bullet-text';
          txt.innerHTML = inlineFormat(m[1]);
          row.appendChild(dot);
          row.appendChild(txt);
          el.appendChild(row);
        }
      });
      return;
    }

    // Plain paragraph
    const p = document.createElement('div');
    p.className = 'ans-para';
    p.innerHTML = inlineFormat(block.replace(/\n/g,' '));
    el.appendChild(p);
  });
  return el;
}

function inlineFormat(text){
  text = text.replace(/`([^`]+)`/g,'<span class="ans-inline-code">$1</span>');
  text = text.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  return text;
}


function showCard(){
  // Skip any already-completed slots (null = done)
  while(current < deck.length && deck[current] === null) current++;

  if(current >= deck.length){ endSession(); return; }

  revealed = false;
  const entry = deck[current];
  const q = entry.q;
  const isBug = q.diff==='Bug' || q.diff==='Bug2';

  document.getElementById('q-num').textContent = 'Q'+q.id;

  // Retry badge
  const qnum = document.getElementById('q-num');
  if(entry.retry){
    qnum.textContent = 'Q'+q.id+' ⟳';
    qnum.style.color = '#cc6600';
  } else {
    qnum.textContent = 'Q'+q.id;
    qnum.style.color = '';
  }

  const dt = document.getElementById('diff-tag');
  dt.textContent = DIFF_LABELS[q.diff] || q.diff;
  dt.className = 'diff-tag '+q.diff;
  document.getElementById('cat-tag').textContent = q.cat;

  const cb = document.getElementById('card-body');
  cb.className = 'card-body';

  // Question
  const qc = document.getElementById('question-container');
  qc.innerHTML = '';
  if(isBug){
    const lbl = document.createElement('div');
    lbl.className = 'bug-label-banner';
    lbl.textContent = q.diff==='Bug2'
      ? '⚠ FIND THE BUG(S) — multi-bug SVA scenario'
      : '⚠ FIND THE BUG — what is wrong with this SVA?';
    qc.appendChild(lbl);
  }
  const qt = document.createElement('div');
  qt.className = 'question-text';
  qt.textContent = q.q;
  qc.appendChild(qt);
  if(q.code){
    const pre = document.createElement('div');
    pre.className = 'code-block';
    pre.textContent = q.code;
    qc.appendChild(pre);
  }

  // Answer
  const al = document.getElementById('answer-label');
  al.textContent = isBug ? 'BUGS FOUND:' : 'ANSWER:';
  al.className = 'answer-label'+(isBug?' bug-al':'');

  const ac = document.getElementById('answer-container');
  ac.innerHTML = '';
  ac.appendChild(formatAnswer(q.a));

  document.getElementById('answer-block').classList.remove('visible');
  document.getElementById('action-row-reveal').style.display = '';
  document.getElementById('action-row-grade').style.display = 'none';
  updateProgress();
  updateStats();
}

function revealAnswer(){
  if(revealed) return;
  revealed = true;
  document.getElementById('answer-block').classList.add('visible');
  document.getElementById('action-row-reveal').style.display = 'none';
  document.getElementById('action-row-grade').style.display = '';
}

function grade(result){
  const cb = document.getElementById('card-body');
  const entry = deck[current];

  if(result === 'correct'){
    stats.correct++;
    cb.classList.add('flash-ok');
    // Mark done
    deck[current] = null;
  } else if(result === 'wrong'){
    // Only count as a new miss if this isn't already a retry
    if(!entry.retry){
      stats.wrong++;
      sessionMissedIds.push(entry.q.id);
    }
    cb.classList.add('flash-bad');
    // Re-insert as a retry card N positions ahead
    const insertAt = Math.min(current + RETRY_OFFSET + 1, deck.length);
    deck.splice(insertAt, 0, {q: entry.q, retry: true});
    retryCount++;
    deck[current] = null;
  } else { // skip
    stats.skip++;
    // Move to end
    deck.push({q: entry.q, retry: false});
    deck[current] = null;
  }

  updateStats();
  current++;
  setTimeout(showCard, result==='skip' ? 0 : 280);
}

function updateStats(){
  // Count remaining non-null entries from current position onward
  const remaining = deck.slice(current).filter(e => e !== null).length;
  const total = stats.correct + stats.wrong + stats.skip + remaining;
  document.getElementById('s-correct').textContent = stats.correct;
  document.getElementById('s-wrong').textContent = stats.wrong;
  document.getElementById('s-skip').textContent = stats.skip;
  document.getElementById('s-remain').textContent = remaining;
  document.getElementById('s-total').textContent = total;
}

function updateProgress(){
  const done = stats.correct + stats.wrong + stats.skip;
  const total = done + deck.slice(current).filter(e => e !== null).length;
  const pct = total ? (done/total)*100 : 0;
  document.getElementById('progress-fill').style.width = pct+'%';
  document.getElementById('progress-text').textContent = done+' / '+total;
}

function endSession(){
  document.getElementById('main-area').style.display = 'none';
  document.getElementById('done-screen').classList.add('visible');
  updateProgress();
  const g = stats.correct + stats.wrong;
  const pct = g > 0 ? Math.round((stats.correct/g)*100) : 0;
  document.getElementById('final-score').textContent = pct+'%';

  let sub = stats.correct+' correct · '+stats.wrong+' missed · '+stats.skip+' skipped';
  if(retryCount > 0) sub += ' · '+retryCount+' retry attempts';
  document.getElementById('final-sub').textContent = sub;

  const ml = document.getElementById('missed-list');
  const uniqueMissed = ALL_QUESTIONS.filter(q => sessionMissedIds.includes(q.id));
  if(uniqueMissed.length > 0){
    ml.innerHTML = '<h4>Missed Questions ('+uniqueMissed.length+')</h4>'
      + uniqueMissed.map(q =>
          '<div class="missed-item" onclick="jumpTo('+q.id+')">'
          +'<div class="mi-q">Q'+q.id+' ['+q.diff+']: '+q.q.substring(0,80)+'…</div>'
          +'<div class="mi-a">'+q.a.substring(0,100)+'…</div>'
          +'</div>'
        ).join('');
  } else {
    ml.innerHTML = '<p style="color:#007000;font-size:11px;margin-top:12px;font-weight:bold;">✔ No missed questions — clean run!</p>';
  }
}

function reviewMissed(){
  if(!sessionMissedIds.length) return;
  const m = ALL_QUESTIONS.filter(q => sessionMissedIds.includes(q.id));
  deck = (shuffleOn ? shuffle([...m]) : [...m]).map(q => ({q, retry:false}));
  current = 0;
  stats = {correct:0, wrong:0, skip:0};
  sessionMissedIds = [];
  retryCount = 0;
  document.getElementById('done-screen').classList.remove('visible');
  document.getElementById('main-area').style.display = '';
  showCard();
}

function jumpTo(id){
  const q = ALL_QUESTIONS.find(x => x.id===id);
  if(!q) return;
  deck = [{q, retry:false}];
  current = 0;
  stats = {correct:0, wrong:0, skip:0};
  sessionMissedIds = [];
  retryCount = 0;
  document.getElementById('done-screen').classList.remove('visible');
  document.getElementById('main-area').style.display = '';
  showCard();
}

// ─────────────────────────────────────────────
// TAB SWITCHING
// ─────────────────────────────────────────────
let currentTab = 'cards';

function switchTab(tab){
  if(currentTab === tab) return;
  currentTab = tab;
  ['cards','learn','tcl'].forEach(t => {
    document.getElementById('page-'+t).style.display = t===tab ? 'flex' : 'none';
    const btn = document.getElementById('tab-'+t);
    if(btn) btn.classList.toggle('tab-active', t===tab);
  });
  if(tab === 'learn') renderLearn();
  if(tab === 'tcl')   renderTcl();
}

// ─────────────────────────────────────────────
// LEARN / TCL PAGE RENDERERS
// ─────────────────────────────────────────────
let learnInit = false;
function renderLearn(){
  if(learnInit) return; learnInit = true;
  buildRefPage('learn-sidebar','learn-content','learn-topics-grid', LEARN_SECTIONS,'learn');
}

let tclInit = false;
function renderTcl(){
  if(tclInit) return; tclInit = true;
  buildRefPage('tcl-sidebar','tcl-content','tcl-topics-grid', TCL_SECTIONS,'tcl');
}

function buildRefPage(sidebarId, contentId, gridId, sections, ns){
  const sidebar = document.getElementById(sidebarId);
  const content = document.getElementById(contentId);
  sidebar.innerHTML = '';
  sections.forEach(sec => {
    const btn = document.createElement('button');
    btn.className = 'sidebar-item';
    btn.textContent = sec.icon+' '+sec.title;
    btn.id = ns+'-nav-'+sec.id;
    btn.onclick = () => showSection(sec, sidebarId, contentId, ns);
    sidebar.appendChild(btn);
  });
  const grid = document.getElementById(gridId);
  if(grid){
    grid.innerHTML = '';
    sections.forEach(sec => {
      const card = document.createElement('div');
      card.className = 'topic-card';
      card.innerHTML = '<span class="tc-icon">'+sec.icon+'</span>'
        +'<div class="tc-title">'+sec.title+'</div>'
        +'<div class="tc-sub">'+sec.subsections.length+' topics</div>';
      card.onclick = () => showSection(sec, sidebarId, contentId, ns);
      grid.appendChild(card);
    });
  }
}

function showSection(sec, sidebarId, contentId, ns){
  document.querySelectorAll('#'+sidebarId+' .sidebar-item').forEach(b => b.classList.remove('active-nav'));
  const btn = document.getElementById(ns+'-nav-'+sec.id);
  if(btn) btn.classList.add('active-nav');
  const content = document.getElementById(contentId);
  let html = '<div class="ref-section-title">'+sec.icon+' '+sec.title+'</div>';
  sec.subsections.forEach(sub => {
    html += '<div class="ref-subsection">'
      +'<div class="ref-subsec-title">'+sub.title+'</div>'
      +'<div class="ref-subsec-body">'+sub.content+'</div>'
      +'</div>';
  });
  content.innerHTML = html;
  content.scrollTop = 0;
}

// ─────────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if(currentTab !== 'cards') return;
  if(e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA') return;
  if(e.code==='Space'){ e.preventDefault(); if(!revealed) revealAnswer(); }
  if(e.key==='1' && revealed) grade('correct');
  if(e.key==='2' && revealed) grade('wrong');
  if(e.key==='3') grade('skip');
});

// ─────────────────────────────────────────────
// TASKBAR CLOCK
// ─────────────────────────────────────────────
function updateClock(){
  const now = new Date();
  document.getElementById('taskbar-clock').textContent =
    now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
}
updateClock(); setInterval(updateClock, 10000);

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
document.getElementById('page-cards').style.display = 'flex';
buildDeck();

// ─────────────────────────────────────────────
// WINDOW MANAGEMENT
// ─────────────────────────────────────────────
const WIN = () => document.querySelector('.xp-window');
let isMaximized = false;
let isMinimized  = false;
let isClosed     = false;

function minimizeWindow(){
  const w = WIN();
  if(isClosed) return;
  if(isMinimized){
    // Restore
    w.classList.remove('minimized');
    isMinimized = false;
    document.getElementById('taskbar-app-btn').classList.add('active-task');
  } else {
    w.classList.remove('maximized');
    w.classList.add('minimized');
    isMinimized  = true;
    isMaximized  = false;
    document.getElementById('taskbar-app-btn').classList.remove('active-task');
  }
}

function maximizeWindow(){
  const w = WIN();
  if(isClosed || isMinimized) return;
  if(isMaximized){
    w.classList.remove('maximized');
    isMaximized = false;
    document.getElementById('maximize-btn').title = 'Maximize';
    document.getElementById('maximize-btn').textContent = '□';
  } else {
    w.classList.remove('minimized');
    w.classList.add('maximized');
    isMaximized = true;
    isMinimized = false;
    document.getElementById('maximize-btn').title = 'Restore';
    document.getElementById('maximize-btn').textContent = '❐';
  }
}

function closeWindow(){
  const w = WIN();
  w.style.display = 'none';
  isClosed    = true;
  isMinimized = false;
  isMaximized = false;
  document.getElementById('taskbar-app-btn').classList.remove('active-task');
  document.getElementById('taskbar-app-btn').style.opacity = '0.5';
  document.getElementById('closed-screen').style.display = 'flex';
}

function openWindow(){
  const w = WIN();
  w.style.display = '';
  w.classList.remove('minimized','maximized');
  isClosed    = false;
  isMinimized = false;
  isMaximized = false;
  document.getElementById('taskbar-app-btn').classList.add('active-task');
  document.getElementById('taskbar-app-btn').style.opacity = '';
  document.getElementById('closed-screen').style.display = 'none';
  document.getElementById('maximize-btn').textContent = '□';
}

function toggleWindow(){
  if(isClosed)     { openWindow(); return; }
  if(isMinimized)  { minimizeWindow(); return; } // restores
  minimizeWindow(); // minimize it
}

// ─────────────────────────────────────────────
// START MENU
// ─────────────────────────────────────────────
function toggleStartMenu(){
  const sm = document.getElementById('start-menu');
  const isOpen = sm.style.display !== 'none';
  sm.style.display = isOpen ? 'none' : 'block';
  document.getElementById('start-btn').classList.toggle('active-start', !isOpen);
}

function closeStartMenu(){
  document.getElementById('start-menu').style.display = 'none';
  document.getElementById('start-btn').classList.remove('active-start');
}

// Close start menu when clicking outside
document.addEventListener('click', e => {
  const sm = document.getElementById('start-menu');
  const sb = document.getElementById('start-btn');
  if(sm.style.display !== 'none' && !sm.contains(e.target) && e.target !== sb){
    closeStartMenu();
  }
});

function switchTabFromMenu(tab){
  openWindow();
  switchTab(tab);
}