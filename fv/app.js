let deck=[],current=0,revealed=false,shuffleOn=true,activeFilter='All';
let stats={correct:0,wrong:0,skip:0},missedIds=[];

function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

function buildDeck(){
  let f=ALL_QUESTIONS.filter(q=>activeFilter==='All'||q.diff===activeFilter);
  deck=shuffleOn?shuffle([...f]):[...f];
  current=0;stats={correct:0,wrong:0,skip:0};missedIds=[];
  updateStats();
  document.getElementById('done-screen').classList.remove('visible');
  document.getElementById('main-area').style.display='';
  showCard();
}

function setFilter(f,btn){
  activeFilter=f;
  document.querySelectorAll('#filter-group .xp-btn').forEach(b=>b.classList.remove('active-btn'));
  btn.classList.add('active-btn');
  buildDeck();
}

function toggleShuffle(){
  shuffleOn=!shuffleOn;
  document.getElementById('shuffle-label').textContent='🔀 Shuffle: '+(shuffleOn?'ON':'OFF');
  buildDeck();
}
function restartDeck(){buildDeck();}

function showCard(){
  if(current>=deck.length){endSession();return;}
  revealed=false;
  const q=deck[current];
  const isBug=q.diff==='Bug'||q.diff==='Bug2';
  document.getElementById('q-num').textContent='Q'+q.id;
  const dt=document.getElementById('diff-tag');
  dt.textContent=isBug?(q.diff==='Bug2'?'🐛🐛 Spot the Bug II':'🐛 Spot the Bug'):
    q.diff==='SVA_Deep'?'SVA Deep Dive':
    q.diff==='Methodology_Adv'?'Sign-off & Methodology':
    q.diff==='Interview'?'🎤 Interview':
    q.diff==='Debug'?'🔧 Debug FPV':
    q.diff==='CDC'?'⚡ CDC Formal':
    q.diff==='Liveness'?'♾ Liveness':
    q.diff;
  dt.className='diff-tag '+q.diff;
  document.getElementById('cat-tag').textContent=q.cat;
  const cb=document.getElementById('card-body');
  cb.className='card-body';
  // Render question
  const qc=document.getElementById('question-container');
  qc.innerHTML='';
  if(isBug){
    const lbl=document.createElement('div');
    lbl.className='bug-label-banner';
    lbl.textContent=q.diff==='Bug2'?'⚠ FIND THE BUG(S) — multi-bug SVA scenario':'⚠ FIND THE BUG — what is wrong with this SVA?';
    qc.appendChild(lbl);
  }
  const qt=document.createElement('div');
  qt.className='question-text';
  qt.textContent=q.q;
  qc.appendChild(qt);
  if(q.code){
    const pre=document.createElement('div');
    pre.className='code-block';
    pre.textContent=q.code;
    qc.appendChild(pre);
  }
  // Answer label
  const al=document.getElementById('answer-label');
  al.textContent=isBug?'BUGS FOUND:':'ANSWER:';
  al.className='answer-label'+(isBug?' bug-al':'');
  // Render answer
  const ac=document.getElementById('answer-container');
  ac.innerHTML='';
  const at=document.createElement('div');
  at.className='answer-text';
  at.textContent=q.a;
  ac.appendChild(at);
  document.getElementById('answer-block').classList.remove('visible');
  document.getElementById('reveal-hint').style.display='';
  document.getElementById('action-row-reveal').style.display='';
  document.getElementById('action-row-grade').style.display='none';
  updateProgress();updateStats();
}

function revealAnswer(){
  if(revealed)return;
  revealed=true;
  document.getElementById('answer-block').classList.add('visible');
  document.getElementById('reveal-hint').style.display='none';
  document.getElementById('action-row-reveal').style.display='none';
  document.getElementById('action-row-grade').style.display='';
}

function grade(result){
  const cb=document.getElementById('card-body');
  if(result==='correct'){stats.correct++;cb.classList.add('flash-ok');}
  else if(result==='wrong'){stats.wrong++;missedIds.push(deck[current].id);cb.classList.add('flash-bad');}
  else{stats.skip++;}
  updateStats();current++;
  setTimeout(showCard,result==='skip'?0:280);
}

function updateStats(){
  document.getElementById('s-correct').textContent=stats.correct;
  document.getElementById('s-wrong').textContent=stats.wrong;
  document.getElementById('s-skip').textContent=stats.skip;
  document.getElementById('s-remain').textContent=Math.max(0,deck.length-current);
  document.getElementById('s-total').textContent=deck.length;
}

function updateProgress(){
  const pct=deck.length?(current/deck.length)*100:0;
  document.getElementById('progress-fill').style.width=pct+'%';
  document.getElementById('progress-text').textContent=current+' / '+deck.length;
}

function endSession(){
  document.getElementById('main-area').style.display='none';
  document.getElementById('done-screen').classList.add('visible');
  updateProgress();
  const g=stats.correct+stats.wrong;
  const pct=g>0?Math.round((stats.correct/g)*100):0;
  document.getElementById('final-score').textContent=pct+'%';
  document.getElementById('final-sub').textContent=
    stats.correct+' correct · '+stats.wrong+' missed · '+stats.skip+' skipped of '+deck.length+' cards';
  const ml=document.getElementById('missed-list');
  if(missedIds.length>0){
    const missed=ALL_QUESTIONS.filter(q=>missedIds.includes(q.id));
    ml.innerHTML='<h4>Missed Questions ('+missed.length+')</h4>'+
      missed.map(q=>'<div class="missed-item" onclick="jumpTo('+q.id+')"><div class="mi-q">Q'+q.id+' ['+q.diff+']: '+q.q+'</div><div class="mi-a">'+q.a.substring(0,100)+'…</div></div>').join('');
  } else {
    ml.innerHTML='<p style="color:#007000;font-size:11px;margin-top:12px;font-weight:bold;">✔ No missed questions — clean run!</p>';
  }
}

function reviewMissed(){
  if(!missedIds.length)return;
  const m=ALL_QUESTIONS.filter(q=>missedIds.includes(q.id));
  deck=shuffleOn?shuffle([...m]):[...m];
  current=0;stats={correct:0,wrong:0,skip:0};missedIds=[];
  document.getElementById('done-screen').classList.remove('visible');
  document.getElementById('main-area').style.display='';
  showCard();
}

function jumpTo(id){
  deck=ALL_QUESTIONS.filter(q=>q.id===id);
  current=0;stats={correct:0,wrong:0,skip:0};missedIds=[];
  document.getElementById('done-screen').classList.remove('visible');
  document.getElementById('main-area').style.display='';
  showCard();
}

document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT')return;
  if(e.code==='Space'){e.preventDefault();if(!revealed)revealAnswer();}
  if(e.key==='1'&&revealed)grade('correct');
  if(e.key==='2'&&revealed)grade('wrong');
  if(e.key==='3')grade('skip');
});

buildDeck();
