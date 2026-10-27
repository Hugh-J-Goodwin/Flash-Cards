import './style.css';
import {createClient} from '@supabase/supabase-js';
import {id,empty,validate,removeSubject,score,dueCards,rateCard,topicStats} from './model.js';
import {LibraryStore,SyncEngine,supabaseRemote,libraryKey} from './sync.js';
import {registerSW} from 'virtual:pwa-register';
const $ = s=>document.querySelector(s);
const esc = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store = new LibraryStore(localStorage);
let data=store.snapshot.data, storageError=store.error;
let subject='',topic='',tab='cards',index=0,flipped=false,session=null,user=null,reviewOnly=false;
let syncMessage='Saved on this device', conflict=null, installPrompt=null, authReady=false;
const cloud=import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY ? createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY):null;
function notify(message){ const target=$('#form-error') || $('#notice'); if(target) target.textContent=message; }
function refreshLibrary(redraw=true){
 data=store.snapshot.data; storageError=store.error;
 if(redraw && !$('#modal')?.open && !session) render();
}
const engine = cloud ? new SyncEngine({store,remote:supabaseRemote(cloud),changed:refreshLibrary,
 canApply:()=>!$('#modal')?.open && !session,
 status:(text,problem)=>{syncMessage=text;conflict=problem;updateSyncStatus();}}) : null;
function updateSyncStatus(){
 if($('#account-status')) $('#account-status').textContent=syncMessage;
 if($('#sync-status')) $('#sync-status').textContent=syncMessage;
 if($('#conflict-actions')) $('#conflict-actions').hidden=!conflict;
 if($('#sync-alert')) { $('#sync-alert').hidden=!conflict; $('#sync-alert').textContent=conflict?'Another device has changes. Open Sync & backups to choose which library to keep.':''; }
}
function persist(next=data){
 try{if(cloud&&!authReady)throw Error('Checking your sign-in. Please wait before editing.');store.save(next);refreshLibrary(false);engine?.schedule();return true;}
 catch(e){notify(e.message.includes('quota')?'Device storage is full. Export a backup and reduce image sizes.':e.message);return false;}
}
function commit(next){if(persist(next)){render();return true;}return false;}
function selectedTopics(){return data.topics.filter(t=>t.subjectId===subject);}
function cards(){const all=data.cards.filter(c=>c.topicId===topic);return reviewOnly?dueCards(all):all;}
function reset(){index=0;flipped=false;session=null;}
function render(){
 if(!data.subjects.some(s=>s.id===subject)) subject=data.subjects[0]?.id||'';
 if(!selectedTopics().some(t=>t.id===topic)) topic=selectedTopics()[0]?.id||'';
 const deck=cards();index=Math.max(0,Math.min(index,deck.length-1));
 $('#app').innerHTML=`<aside><a class="brand" href="#">✦ <span>Study Space<small>A little focus. A lot of progress.</small></span></a><div class="side-label">YOUR LIBRARY <button id="add-subject" aria-label="Add subject">＋</button></div><nav>${data.subjects.map(s=>`<button class="subject ${s.id===subject?'active':''}" data-subject="${esc(s.id)}"><span>▤</span> ${esc(s.name)} <small>${data.topics.filter(t=>t.subjectId===s.id).length}</small></button>`).join('')||'<p class="muted">Add your first subject to begin.</p>'}</nav><div class="side-bottom"><p>Make room for what you’ll know tomorrow.</p><button id="settings">☁ &nbsp; Sync & backups</button><small><span id="account-status">${esc(syncMessage)}</span></small></div></aside><main><header><div><div class="eyebrow">YOUR PERSONAL STUDY DESK</div><h1>${esc(data.subjects.find(s=>s.id===subject)?.name||'Let’s learn something.')}</h1><p class="muted">Build your knowledge, one good study session at a time.</p></div><button id="manage" ${!subject?'disabled':''}>Manage subject</button></header><div id="notice" role="status" aria-live="polite">${esc(storageError)}</div><div id="sync-alert" role="status" ${conflict?'':'hidden'}>${conflict?'Another device has changes. Open Sync & backups to choose which library to keep.':''}</div><section class="toolbar"><div class="topics">${selectedTopics().map(t=>`<button data-topic="${esc(t.id)}" class="pill ${t.id===topic?'selected':''}">${esc(t.name)}</button>`).join('')}<button id="add-topic" class="pill dashed" ${!subject?'disabled':''}>＋ Topic</button></div>${topic?'<button id="delete-topic" class="text-button">Delete topic</button>':''}</section><div class="workspace-head"><div class="tabs"><button data-tab="cards" class="${tab==='cards'?'chosen':''}">▣ &nbsp; Flashcards <small>${deck.length}</small></button><button data-tab="quizzes" class="${tab==='quizzes'?'chosen':''}">☑ &nbsp; Quizzes <small>${data.quizzes.filter(q=>q.topicId===topic).length}</small></button><button data-tab="progress" class="${tab==='progress'?'chosen':''}">↗ Progress</button></div><button class="primary" id="create" ${!topic?'disabled':''} ${tab==='progress'?'hidden':''}>＋ ${tab==='cards'?'New flashcard':'New quiz'}</button></div>${tab==='cards'?cardView(deck):tab==='quizzes'?quizView():progressView()}<footer><span class="dot"></span> ${navigator.onLine?'Study anywhere. Your progress stays with you.':'Offline · changes will sync when you reconnect.'}<span>STAY CURIOUS ✦</span></footer></main><dialog id="modal"></dialog>`;
 bind();
}
function cardView(deck){const c=deck[index];return `<section class="study-area"><div class="review-toolbar"><span>${dueCards(data.cards.filter(c=>c.topicId===topic)).length} cards due in this topic</span><button id="review-mode" aria-pressed="${reviewOnly}">${reviewOnly?'Browse all cards':'Review due cards'}</button></div><div class="study-caption"><span>✦ &nbsp; FOCUS MODE</span><span>${c?`${index+1} / ${deck.length} CARDS`:'YOUR NEXT CHAPTER STARTS HERE'}</span></div>${c?`<button class="flashcard ${flipped?'back':''}" id="flip" aria-label="Flip flashcard"><div class="card-label">${flipped?'ANSWER':'QUESTION'} <span>↻</span></div><div class="card-content">${esc(c[flipped?'back':'front']).replace(/\n/g,'<br>')}${c[flipped?'backImage':'frontImage']?`<img src="${esc(c[flipped?'backImage':'frontImage'])}" alt="${flipped?'Answer':'Question'} image">`:''}</div><div class="card-hint">${flipped?'Make it stick. You’ve got this.':'Think it through, then flip to reveal.'}</div></button><div class="card-controls"><button id="prev" aria-label="Previous card">←</button><span><kbd>space</kbd> to flip <i>·</i> <kbd>←</kbd> <kbd>→</kbd> to navigate</span><button id="next" aria-label="Next card">→</button></div>${flipped?`<div class="rating-controls" aria-label="Rate your recall"><p>How well did you remember?</p><button data-rate="again">Again <small>10 min</small></button><button data-rate="hard">Hard <small>${reviewLabel(c,'hard')}</small></button><button data-rate="easy">Easy <small>${reviewLabel(c,'easy')}</small></button></div>`:''}<div class="card-actions"><button id="edit-card">✎ Edit card</button><button id="shuffle">⤨ Shuffle</button><button id="delete-card" class="danger">Delete</button></div>`:`<div class="empty"><div class="empty-icon">▣</div><h2>${reviewOnly?'You’re all caught up':topic?'A fresh stack of possibilities':'Organise your next big idea'}</h2><p>${reviewOnly?'Come back when your next cards are due, or browse all cards.':topic?'Add a flashcard with a question, an answer, or an image.':'Create a subject and topic to start building your study library.'}</p><button class="primary" id="${reviewOnly?'browse-all':'empty-create'}">${reviewOnly?'Browse all cards':'＋ ' + (topic?'Create your first card':subject?'Add a topic':'Add a subject')}</button></div>`}<div class="tip"><span>✧</span><div><strong>A small study tip</strong><p>Try recalling the answer before you flip. Active recall helps knowledge last.</p></div></div></section>`;}
function quizView(){if(session){let q=data.quizzes.find(x=>x.id===session.id);if(!q){session=null;return quizView();}if(session.done)return `<section class="empty"><div class="empty-icon">✦</div><h2>${score(q.questions,session.answers)} / ${q.questions.length}</h2><p>Quiz complete. Review your answers below.</p>${q.questions.map((x,i)=>`<div class="review"><strong>${esc(x.prompt)}</strong><p class="${session.answers[i]===x.correct?'good':'wrong'}">Your answer: ${esc(x.options[session.answers[i]])}</p><p>Correct answer: ${esc(x.options[x.correct])}</p></div>`).join('')}<button id="finish-quiz" class="primary">Back to quizzes</button></section>`;let x=q.questions[session.at];return `<section class="quiz-run"><div class="eyebrow">QUESTION ${session.at+1} OF ${q.questions.length}</div><h2>${esc(q.title)}</h2><h3>${esc(x.prompt)}</h3><div class="answer-options">${x.options.map((o,i)=>`<button data-answer="${i}" class="${session.answers[session.at]===i?'picked':''}"><b>${'ABCD'[i]}</b>${esc(o)}</button>`).join('')}</div><button id="quiz-next" class="primary" ${session.answers[session.at]===undefined?'disabled':''}>${session.at===q.questions.length-1?'Finish quiz':'Next question →'}</button><button id="finish-quiz">Exit quiz</button></section>`;}
return `<section class="quiz-list">${data.quizzes.filter(q=>q.topicId===topic).map(q=>`<article><div class="quiz-icon">☑</div><h2>${esc(q.title)}</h2><p>${q.questions.length} questions · Multiple choice</p><div><button data-run="${esc(q.id)}" class="primary">Start quiz →</button><button data-edit-quiz="${esc(q.id)}">Edit</button><button data-delete-quiz="${esc(q.id)}" class="danger">Delete</button></div></article>`).join('')||`<div class="empty"><div class="empty-icon">☑</div><h2>Put your knowledge to the test</h2><p>Create a quiz with four choices for each question.</p></div>`}</section>`;}
function on(s,event,fn){$(s)?.addEventListener(event,fn);}
function bind(){
 on('#browse-all','click',()=>{reviewOnly=false;reset();render();});
 on('#review-mode','click',()=>{reviewOnly=!reviewOnly;reset();render();});
 document.querySelectorAll('[data-rate]').forEach(b=>b.onclick=()=>{
  const c=cards()[index]; if(!c)return;
  const next=rateCard(c,b.dataset.rate); const oldIndex=index;
  if(persist({...data,cards:data.cards.map(x=>x.id===c.id?next:x)})){
   flipped=false; index=reviewOnly?oldIndex:(oldIndex+1)%cards().length;render();
  }
 });
 document.querySelectorAll('[data-subject]').forEach(b=>b.onclick=()=>{subject=b.dataset.subject;topic='';reset();render();});
 document.querySelectorAll('[data-topic]').forEach(b=>b.onclick=()=>{topic=b.dataset.topic;reset();render();});
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;session=null;render();});
 on('#add-subject','click',()=>nameDialog('New subject','',name=>commit({...data,subjects:[...data.subjects,{id:id(),name}]})));
 on('#add-topic','click',()=>nameDialog('New topic','',name=>{let t={id:id(),name,subjectId:subject};if(commit({...data,topics:[...data.topics,t]})){topic=t.id;reset();render();}}));
 on('#manage','click',()=>nameDialog('Rename subject',data.subjects.find(s=>s.id===subject).name,name=>commit({...data,subjects:data.subjects.map(s=>s.id===subject?{...s,name}:s)}),()=>{if(confirm('Delete this subject and ALL of its topics, cards and quizzes?')){commit(removeSubject(data,subject));reset();}}));
 on('#delete-topic','click',()=>{if(confirm('Delete this topic and all its cards and quizzes?'))commit({...data,topics:data.topics.filter(t=>t.id!==topic),cards:data.cards.filter(c=>c.topicId!==topic),quizzes:data.quizzes.filter(q=>q.topicId!==topic)});});
 on('#create','click',()=>tab==='cards'?cardDialog():quizDialog());
 on('#empty-create','click',()=>topic?cardDialog():$(subject?'#add-topic':'#add-subject').click());
 on('#flip','click',()=>{flipped=!flipped;render();});on('#prev','click',()=>move(-1));on('#next','click',()=>move(1));
 on('#edit-card','click',()=>cardDialog(cards()[index]));
 on('#delete-card','click',()=>{if(confirm('Delete this flashcard?'))commit({...data,cards:data.cards.filter(c=>c.id!==cards()[index].id)});});
 on('#shuffle','click',()=>{const shuffled=[...cards()];for(let i=shuffled.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}reset();commit({...data,cards:[...data.cards.filter(c=>c.topicId!==topic),...shuffled]});});
 let touch;on('#flip','touchstart',e=>{touch=[e.changedTouches[0].clientX,e.changedTouches[0].clientY];});on('#flip','touchend',e=>{if(!touch)return;let dx=e.changedTouches[0].clientX-touch[0],dy=e.changedTouches[0].clientY-touch[1];if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)){e.preventDefault();move(dx<0?1:-1);}touch=null;});
 document.querySelectorAll('[data-run]').forEach(b=>b.onclick=()=>{session={id:b.dataset.run,at:0,answers:[],done:false};render();});
 document.querySelectorAll('[data-edit-quiz]').forEach(b=>b.onclick=()=>quizDialog(data.quizzes.find(q=>q.id===b.dataset.editQuiz)));
 document.querySelectorAll('[data-delete-quiz]').forEach(b=>b.onclick=()=>{if(confirm('Delete quiz?'))commit({...data,quizzes:data.quizzes.filter(q=>q.id!==b.dataset.deleteQuiz)});});
 document.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>{session.answers[session.at]=Number(b.dataset.answer);render();});
 on('#quiz-next','click',()=>{
 const q=data.quizzes.find(q=>q.id===session.id);
 if(session.at===q.questions.length-1){
  const attempt={id:id(),quizId:q.id,topicId:q.topicId,title:q.title,correct:score(q.questions,session.answers),total:q.questions.length,at:Date.now()};
  if(!persist({...data,attempts:[...(data.attempts||[]),attempt]}))return;
  session.done=true;
 } else session.at++;render();
 });
 on('#finish-quiz','click',()=>{session=null;render();});on('#settings','click',settings);
}
function move(n){if(!cards().length)return;index=(index+n+cards().length)%cards().length;flipped=false;render();}
window.addEventListener('keydown',e=>{if($('#modal')?.open||/INPUT|TEXTAREA|SELECT|BUTTON|A/.test(document.activeElement.tagName)||document.activeElement.isContentEditable||tab!=='cards')return;if(e.code==='Space'){e.preventDefault();$('#flip')?.click();}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}});
function modal(html){$('#modal').innerHTML=`<button class="close" aria-label="Close dialog">×</button>${html}<p id="form-error" role="alert"></p>`;$('#modal').showModal();$('.close').onclick=()=>$('#modal').close();}
function nameDialog(title,value,save,del){modal(`<h2>${title}</h2><form id="name-form"><label>Name<input name="name" maxlength="80" required value="${esc(value)}"></label><button class="primary">Save</button>${del?'<button type="button" id="remove-subject" class="danger">Delete subject</button>':''}</form>`);on('#remove-subject','click',del);on('#name-form','submit',e=>{e.preventDefault();let name=new FormData(e.target).get('name').trim();if(name&&save(name))$('#modal').close();});}
async function readImage(file){if(!file?.size)return '';if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw Error('Choose a PNG, JPEG, WebP or GIF image.');if(file.size>8*1024*1024)throw Error('Choose an image smaller than 8 MB.');let bitmap=await createImageBitmap(file);let canvas=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return canvas.toDataURL('image/webp',.8);}
function cardDialog(card){modal(`<h2>${card?'Edit':'New'} flashcard</h2><form id="card-form">${['front','back'].map(side=>`<fieldset><legend>${side==='front'?'Front · question':'Back · answer'}</legend><label>Text<textarea name="${side}" maxlength="5000">${esc(card?.[side]||'')}</textarea></label><label>Image<input type="file" name="${side}Image" accept="image/png,image/jpeg,image/webp,image/gif"></label>${card?.[side+'Image']?`<img class="image-preview" src="${esc(card[side+'Image'])}" alt="Current ${side} image"><label class="inline"><input type="checkbox" name="remove${side}"> Remove existing image</label>`:''}</fieldset>`).join('')}<button class="primary">Save flashcard</button></form>`);on('#card-form','submit',async e=>{e.preventDefault();let button=e.submitter;const owner=store.owner;button.disabled=true;try{let fd=new FormData(e.target),c={id:card?.id||id(),topicId:topic,...(card?.review?{review:card.review}:{})};for(let side of ['front','back']){c[side]=fd.get(side).trim();c[side+'Image']=await readImage(fd.get(side+'Image'))||(fd.has('remove'+side)?'':card?.[side+'Image']||'');if(!c[side]&&!c[side+'Image'])throw Error('Add text or an image to both sides.');}if(owner!==store.owner)throw Error('Account changed. Reopen this editor.');if(commit({...data,cards:card?data.cards.map(x=>x.id===card.id?c:x):[...data.cards,c]}))return;}catch(err){notify(err.message);}button.disabled=false;});}
function quizDialog(quiz){let questions=structuredClone(quiz?.questions||[{prompt:'',options:['','','',''],correct:0}]);let title=quiz?.title||'';
 function draw(){modal(`<h2>${quiz?'Edit':'New'} quiz</h2><form id="quiz-form"><label>Quiz title<input name="title" value="${esc(title)}" maxlength="150" required></label><div>${questions.map((q,i)=>`<fieldset><legend>Question ${i+1}</legend><label>Question<textarea name="prompt${i}" required maxlength="2000">${esc(q.prompt)}</textarea></label>${q.options.map((o,j)=>`<div class="option-editor"><input type="radio" name="correct${i}" value="${j}" ${q.correct===j?'checked':''} aria-label="Mark option ${j+1} correct for question ${i+1}"><input name="option${i}-${j}" value="${esc(o)}" required maxlength="1000" aria-label="Option ${j+1} for question ${i+1}" placeholder="Option ${'ABCD'[j]}"></div>`).join('')}<small>Select the circle beside the correct answer.</small>${questions.length>1?`<button type="button" data-remove-question="${i}" class="danger">Remove question</button>`:''}</fieldset>`).join('')}</div><button type="button" id="add-question">＋ Add question</button><button class="primary">Save quiz</button></form>`);
 function collect(){let fd=new FormData($('#quiz-form'));title=fd.get('title');questions=questions.map((q,i)=>({prompt:fd.get('prompt'+i),options:[0,1,2,3].map(j=>fd.get(`option${i}-${j}`)),correct:Number(fd.get('correct'+i))}));}
 on('#add-question','click',()=>{collect();questions.push({prompt:'',options:['','','',''],correct:0});draw();});document.querySelectorAll('[data-remove-question]').forEach(b=>b.onclick=()=>{collect();questions.splice(Number(b.dataset.removeQuestion),1);draw();});
 on('#quiz-form','submit',e=>{e.preventDefault();collect();if(!title.trim()||questions.some(q=>!q.prompt.trim()||q.options.some(o=>!o.trim()))){$('#form-error').textContent='Fill in the title, questions and every answer.';return;}let q={id:quiz?.id||id(),topicId:topic,title:title.trim(),questions};commit({...data,quizzes:quiz?data.quizzes.map(x=>x.id===quiz.id?q:x):[...data.quizzes,q]});});}draw();}
function downloadJSON(value,name='study-space-backup'){
 const raw=typeof value==='string'?value:JSON.stringify(value,null,2);
 const url=URL.createObjectURL(new Blob([raw||'{}'],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=`${name}-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function settings(){modal(`<h2>Sync & backups</h2><p class="muted">${user?'Changes save automatically to your account when online. Offline edits stay on this device until synced.':'This is your device-only library. Sign in to use your private account library.'}</p><h3>Backup your library</h3><button id="export">↓ Export JSON</button><label>Restore backup (replaces the current library)<input id="import" type="file" accept="application/json,.json"></label>
 ${user?'<button id="import-device">Import pre-update / device-only library</button><p class="muted">Older local cards are kept separately. Import them only if they are yours; export this account first.</p>':''}
 <h3>Across your devices</h3>${cloud?user?`<p>Signed in as ${esc(user.email)}</p><button id="sync-now" class="primary">Sync now</button><button id="signout">Sign out</button>`:`<form id="login"><label>Email<input type="email" name="email" required autocomplete="email"></label><button class="primary">Send sign-in link</button></form>`:'<p>Cloud sync needs Supabase. Follow the README to configure the public URL and key.</p>'}
 <p id="sync-status" role="status">${esc(syncMessage)}</p><section id="conflict-actions" ${conflict?'':'hidden'}><h3>Two versions need your attention</h3><p>Automatic sync paused to protect both libraries. Export both before choosing. The replaced versions are also backed up on this device.</p><button id="export-cloud">Export cloud version</button><button id="keep-cloud">Use cloud version</button><button id="keep-local" class="danger">Use this device’s version</button></section>
 <button id="conflict-backup">Export last conflict backup</button><h3>Install & study offline</h3><p class="muted">${installPrompt?'Install Study Space for quick access from your home screen.':'On iPhone, use Safari → Share → Add to Home Screen. On Android or desktop, use your browser’s Install app option when available.'} Open the app online once after each update to prepare offline access. Cloud sign-in and sync need an internet connection.</p>${installPrompt?'<button id="install" class="primary">Install Study Space</button>':''}<p id="install-status" role="status"></p>`);
 on('#export','click',()=>downloadJSON(store.error?localStorage.getItem(libraryKey(store.owner)):data));
 on('#conflict-backup','click',()=>{const backup=localStorage.getItem(`study-space-conflict:${store.owner}`);if(backup)downloadJSON(backup,'study-space-conflict');else notify('No conflict backup on this device yet.');});
 on('#import','change',async e=>{const owner=store.owner;try{let file=e.target.files[0];if(!file)return;if(file.size>20*1024*1024)throw Error('Backup exceeds the 20 MB import limit.');let next=validate(JSON.parse(await file.text()));if(owner!==store.owner)return;if(confirm('Replace the current library with this backup? It will sync to your account. Export first to keep your current library.')){if(store.error)throw Error('Saved metadata is damaged. Export your raw data first and contact support before restoring.');commit(next);}}catch(err){notify(err.message);}});
 on('#import-device','click',()=>{try{const raw=localStorage.getItem(libraryKey(null));const legacy=localStorage.getItem('study-space-v1');const next=validate(raw?JSON.parse(raw).data:legacy?JSON.parse(legacy):empty());if(confirm('Replace your account library with the device-only library? Export your account library first.'))commit(next);}catch(e){notify(e.message);}});
 on('#login','submit',async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{let {error}=await cloud.auth.signInWithOtp({email:new FormData(e.target).get('email'),options:{emailRedirectTo:location.origin}});if(error)throw error;if($('#sync-status'))$('#sync-status').textContent='Check your email for the sign-in link.';}catch(err){notify(err.message);}finally{button.disabled=false;}});
 on('#signout','click',async()=>{
  if(store.snapshot.dirty&&!confirm('Some changes are not synced yet. They will remain saved for this account on this device. Sign out anyway?'))return;
  const {error}=await cloud.auth.signOut({scope:'local'});if(error)notify(error.message);
 });
 on('#sync-now','click',()=>engine?.run());
 on('#export-cloud','click',()=>{if(conflict)downloadJSON(conflict.data,'study-space-cloud');});
 for(const choice of ['cloud','local'])on('#keep-'+choice,'click',async()=>{
  if(confirm(`Use the ${choice==='cloud'?'cloud':'device'} library and replace the other version? Backups will be saved on this device.`)){
   await engine.resolve(choice);if(!conflict){$('#modal')?.close();render();settings();}
  }
 });
 on('#install','click',async()=>{const prompt=installPrompt;if(!prompt)return;await prompt.prompt();const result=await prompt.userChoice;installPrompt=null;if($('#install-status'))$('#install-status').textContent=result.outcome==='accepted'?'Installation requested.':'You can install later from your browser menu.';});
}
function reviewLabel(card,rating){const next=rateCard(card,rating);return `${Math.round(next.review.interval/86400000)} days`;}
function progressView(){
 const topics=selectedTopics(), attempts=(data.attempts||[]).filter(a=>topics.some(t=>t.id===a.topicId)).slice().sort((a,b)=>b.at-a.at);
 const stats=topics.map(t=>({...topicStats(data,t.id),topic:t}));
 const due=stats.reduce((n,s)=>n+s.due,0),reviewed=stats.reduce((n,s)=>n+s.reviewed,0);
 return `<section class="progress-panel"><div class="metric-grid"><article><strong>${due}</strong><span>Cards due now</span></article><article><strong>${reviewed}</strong><span>Cards reviewed at least once</span></article><article><strong>${attempts.length}</strong><span>Completed quizzes</span></article></div><h2>Your topics</h2><div class="topic-progress">${stats.map(s=>`<article><div><strong>${esc(s.topic.name)}</strong><p>${s.due} / ${s.cards} cards due · ${s.attempts} quiz attempts</p></div><span>${s.accuracy===null?'No quiz results':s.accuracy+'% accuracy'}</span></article>`).join('')||'<p class="muted">Create a topic to start tracking your progress.</p>'}</div><h2>Quiz history</h2><p class="muted">Accuracy uses all completed questions, including repeat attempts. History starts with quizzes completed after this update.</p>${attempts.slice(0,50).map(a=>`<article class="history-row"><div><strong>${esc(a.title)}</strong><small>${esc(topics.find(t=>t.id===a.topicId)?.name)} · ${esc(new Date(a.at).toLocaleString())}</small></div><span>${a.correct} / ${a.total} · ${Math.round(a.correct/a.total*100)}%</span></article>`).join('')||'<p class="muted">Complete a quiz to see your first result.</p>'}${attempts.length>50?'<p class="muted">Showing the latest 50 attempts. All attempts are included in accuracy and backups.</p>':''}</section>`;
}
render();
function accountChanged(nextUser){
 const owner=nextUser?.id||null;
 if(authReady&&owner===store.owner){user=nextUser;return;}
 authReady=true;user=nextUser;subject='';topic='';reviewOnly=false;reset();$('#modal')?.close();
 engine.switchAccount(owner);render();
}
if(cloud){
 // Auth callbacks only switch local state; network sync runs on the next event loop turn.
 cloud.auth.onAuthStateChange((_event,s)=>accountChanged(s?.user||null));
 cloud.auth.getSession().then(({data:s,error})=>{if(error){syncMessage=error.message;updateSyncStatus();}else if(!authReady)accountChanged(s.session?.user||null);});
}else authReady=true;
window.addEventListener('online',()=>{engine?.schedule(0);updateSyncStatus();});
window.addEventListener('offline',()=>{syncMessage='Offline · saved on this device';updateSyncStatus();});
window.addEventListener('focus',()=>engine?.schedule(0));
window.addEventListener('storage',e=>{
 if(e.key===libraryKey(store.owner)){
  if($('#modal')?.open||session){syncMessage='Another tab changed this library. Finish editing, then refresh.';updateSyncStatus();return;}
  store.load(store.owner);refreshLibrary();engine?.schedule(0);
 }
});
let dueSignature='';
setInterval(()=>{if(!document.hidden){engine?.run();const signature=dueCards(data.cards).map(c=>c.id).join(',');if(signature!==dueSignature&&!$('#modal')?.open&&!session){dueSignature=signature;render();}}},15000);
window.addEventListener('beforeunload',e=>{if(store.owner&&store.snapshot.dirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
const updateSW=registerSW({
 onNeedRefresh(){
  // Do not interrupt an editor, quiz, or offline changes. Offer a controlled reload.
  const bar=document.createElement('div');bar.className='update-bar';
  const text=document.createElement('span');text.textContent='A new Study Space version is ready. ';
  const button=document.createElement('button');button.textContent='Update app';button.onclick=()=>{
   if($('#modal')?.open||session){notify('Finish your editor or quiz before updating.');return;}
   if(store.owner&&store.snapshot.dirty){notify('Sync your pending changes before updating.');return;}
   updateSW(true);
  };bar.append(text,button);document.body.append(bar);
 },
 onOfflineReady(){syncMessage=user?'Ready offline · automatic sync enabled':'Ready for offline study';updateSyncStatus();},
 onRegisterError(e){console.warn('Offline setup unavailable',e);}
});
