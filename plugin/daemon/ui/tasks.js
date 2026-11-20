// tasks.js: the Tasks page. Work handed between agents, as a board (Open, In progress, Done, Failed; Cancelled behind
// a chip) or a list grouped by status (always the list on a phone). #tasks/<tid> opens that task in a sheet: on the
// right from 900px, from the bottom on a phone, so the board never moves under it.
// shell.js owns the shared task pieces this page uses: TSTATE, isLive, taskLog (the record), PL.taskBadge, and the
// handlers behind [data-tact] (Cancel / Reopen) and [data-treassign] (hand to another agent).
PL.page('tasks',{title:'Tasks',
  html:`<div class="tk-head"><h1>Tasks</h1><span class="tk-gap"></span>
<span class="seg tk-layout" role="group" aria-label="Layout"><button type="button" data-tk-layout="board">Board</button><button type="button" data-tk-layout="list">List</button></span>
${PL.helpBtn('How tasks work','data-tk-help')}
<button type="button" class="btn btn-acc sm" data-tk-new>${PL.icon('plus',18)}New task</button></div>
<div class="chips tk-chips" id="tk-chips" role="toolbar" aria-label="Filters"></div>
<div class="tk-drop" id="tk-drop"></div>
<div id="tk-body"></div>`,
  count:st=>st.tasks.filter(isLive).length||'',
  mount(){document.body.classList.add('wide')},
  unmount(){document.body.classList.remove('wide');tkCloseSheet()},
  render:(st,route)=>tkRender(st,route)});

// What the page shows. The who/space/owner/asked-by filters last for this visit; layout, board rows and Cancelled are kept.
const TK={scope:'all',space:'',owner:'',req:'',cancelled:pref('tk.cancelled','')==='1',layout:pref('tlayout','board'),rows:pref('tgroup',''),
  kids:new Map(),sheet:null,drag:null,bare:false};
const TK_COLS=[['open','Open'],['in_progress','In progress'],['done','Done'],['failed','Failed'],['cancelled','Cancelled']];
const tkPhone=matchMedia('(max-width:639px)');
tkPhone.addEventListener?.('change',()=>{if(PL.route.page==='tasks')PL.render()});
const tkLayoutNow=()=>tkPhone.matches?'list':TK.layout;

// ---- What a task is to you ----------------------------------------------------------------------------------------
const tkIsBlocked=t=>!!(t.blocked&&isLive(t));
// Yours to answer: a task given to you, or one you asked for whose owner is blocked (it waits on whoever asked).
const tkMine=t=>isLive(t)&&(!!t.user||(t.requester?.id==='user'&&!!t.blocked));
const tkReqName=t=>t.requester?.id==='user'?'you':String(t.requester?.name||'?').replace(/ \(web UI\)$/,'');
const tkWho=(id,name)=>PL.agentLink(id&&PL.findAgent(id)?id:name,name);
const tkOwner=t=>t.user?'you':tkWho(t.owner_id,t.owner);
const tkAsker=t=>t.requester?.id==='user'?'you':tkWho(t.requester?.id,tkReqName(t));
const tkStatus=t=>PL.taskBadge(t);
const tkKidsOf=id=>TK.kids.get(id)||[];
// Every open task under this one that's blocked, however deep: a parent's card says so, so the blocker can't hide.
function tkBlockedBelow(t,seen=new Set([t.id])){let out=[];
  for(const k of tkKidsOf(t.id)){if(seen.has(k.id))continue;seen.add(k.id);if(tkIsBlocked(k))out.push(k);out=out.concat(tkBlockedBelow(k,seen))}
  return out}
const tkPlural=PL.plural;
const tkProgress=t=>{const kids=tkKidsOf(t.id);if(!kids.length)return '';const done=kids.filter(k=>k.status==='done').length;
  return `<div class="tk-prog"><span>${done} of ${tkPlural(kids.length,'subtask','subtasks')} done</span><span class="tk-bar"><i style="width:${Math.round(100*done/kids.length)}%"></i></span></div>`};
// Why it's blocked, on the card itself: its own reason, and how many of its subtasks are blocked (with the first's reason).
function tkBlockers(t){if(!isLive(t))return '';const below=tkBlockedBelow(t);let h='';
  if(tkIsBlocked(t))h+=`<div class="tk-why">${PL.badge('warn','Blocked')}<span class="tk-why-t">${esc(t.blocked)}</span></div>`;
  if(below.length)h+=`<div class="tk-why">${PL.badge('warn',tkPlural(below.length,'subtask blocked','subtasks blocked'))}<span class="tk-why-t">${PL.taskLink(below[0].id)}: ${esc(below[0].blocked)}</span></div>`;
  return h}

// ---- Filters: one row of chips ------------------------------------------------------------------------------------
function tkPicked(){return allTasks.filter(t=>(TK.scope==='all'||(TK.scope==='mine'?tkMine(t):tkIsBlocked(t)))
  &&(!TK.space||t.space===TK.space)&&(!TK.owner||t.owner===TK.owner)&&(!TK.req||tkReqName(t)===TK.req))}
function tkChips(){
  const chip=(attrs,label,on,n,x)=>`<button type="button" class="chip" ${attrs} aria-pressed="${!!on}">${esc(label)}${n!=null?`<span class="tk-n">${n}</span>`:''}${x?PL.icon('x',16):''}</button>`;
  const spaces=[...new Set(allTasks.map(t=>t.space).filter(Boolean).concat(TK.space?[TK.space]:[]))].sort();
  const cancelled=allTasks.filter(t=>t.status==='cancelled').length,sep='<span class="tk-sep" aria-hidden="true"></span>';
  return chip('data-tk-scope="all"','Everyone',TK.scope==='all')
    +chip('data-tk-scope="mine"','Mine to answer',TK.scope==='mine',allTasks.filter(tkMine).length)
    +chip('data-tk-scope="blocked"','Blocked',TK.scope==='blocked',allTasks.filter(tkIsBlocked).length)
    +(spaces.length?sep+spaces.map(s=>chip(`data-tk-space="${esc(s)}"`,s,TK.space===s)).join(''):'')
    +sep+chip('data-tk-cancelled','Cancelled',TK.cancelled,cancelled)
    +(TK.owner?chip('data-tk-clear="owner" aria-label="Clear the owner filter"','Owner: '+TK.owner,true,null,1):'')
    +(TK.req?chip('data-tk-clear="req" aria-label="Clear the asked-by filter"','Asked by: '+TK.req,true,null,1):'')
    +(TK.rows&&tkLayoutNow()==='board'?chip('data-tk-clear="rows" aria-label="Back to one board"','Rows: by '+TK.rows,true,null,1):'')
    +`<button type="button" class="chip tk-more" data-tk-more>More filters</button>`}

// ---- Board and list -----------------------------------------------------------------------------------------------
const tkNewest=(a,b)=>b.created-a.created;
const tkCols=()=>TK_COLS.filter(([k])=>k!=='cancelled'||TK.cancelled);
function tkCard(t){const sel=PL.route.id===t.id;
  return `<article class="tk-card${sel?' sel':''}" draggable="true" data-task="${esc(t.id)}" tabindex="0" aria-label="${esc(t.title)}, ${esc(TSTATE[t.status]||t.status)}${tkIsBlocked(t)?', blocked':''}">
    <div class="tk-ct">${esc(t.title)}</div>
    <div class="tk-cm"><b>${tkOwner(t)}</b> · asked by ${tkAsker(t)}</div>
    ${tkBlockers(t)}${tkProgress(t)}
    <div class="tk-cf"><span class="mono">${esc(t.id)}</span>${t.parent?`<span>· part of ${PL.taskLink(t.parent)}</span>`:''}<span class="tk-age">${ago(t.created)} ago</span></div></article>`}
function tkBoard(list){const cols=tkCols();
  return `<div class="tk-board" style="--tk-cols:${cols.length}">${cols.map(([k,label])=>{const cards=list.filter(t=>t.status===k).sort(tkNewest);
    return `<section class="tk-col" data-col="${k}" aria-label="${label}"><h3 class="tk-col-h"><span>${label}</span><span class="tk-n">${cards.length}</span></h3>${cards.map(tkCard).join('')||'<div class="tk-none">None</div>'}</section>`}).join('')}</div>`}
function tkRow(t){
  return `<div class="row tk-row${PL.route.id===t.id?' sel':''}" data-task="${esc(t.id)}" tabindex="0" role="link" aria-label="${esc(t.title)}">
    <span class="row-main"><span class="row-t">${esc(t.title)}</span>
    <span class="row-s"><b>${tkOwner(t)}</b> · asked by ${tkAsker(t)} · <span class="mono">${esc(t.id)}</span>${t.parent?` · part of ${PL.taskLink(t.parent)}`:''} · ${ago(t.created)} ago</span>
    ${tkBlockers(t)}${tkProgress(t)}</span><span class="chev">${PL.icon('chev',18)}</span></div>`}
function tkList(list){
  return tkCols().map(([k,label])=>{const rows=list.filter(t=>t.status===k).sort(tkNewest);
    return rows.length?`<section class="tk-grp" data-col="${k}"><h3 class="sticky-h tk-gh">${label}<span class="tk-n">${rows.length}</span></h3><div class="group">${rows.map(tkRow).join('')}</div></section>`:''}).join('')}

function tkRender(st,route){
  TK.kids=new Map();for(const t of allTasks)if(t.parent){if(!TK.kids.has(t.parent))TK.kids.set(t.parent,[]);TK.kids.get(t.parent).push(t)}
  PL.el('tasks').querySelectorAll('[data-tk-layout]').forEach(b=>b.classList.toggle('on',b.dataset.tkLayout===TK.layout));
  PL.paint($('#tk-chips'),tkChips());
  // Never redraw under a card being dragged.
  if(!TK.drag){const picked=tkPicked(),shown=TK.cancelled?picked:picked.filter(t=>t.status!=='cancelled'),layout=tkLayoutNow();let html;
    if(!allTasks.length)html=PL.empty({icon:'tasks',title:'No tasks yet',text:'An agent hands one out with kind: task, or send one yourself with New task.'});
    else if(!shown.length)html=PL.empty({icon:'tasks',title:'No tasks match',text:TK.scope==='mine'?'Nothing waits on you.':TK.scope==='blocked'?'No open task is blocked.':'Nothing matches these filters.',action:{label:'Show everyone',attrs:'data-tk-reset'}});
    else if(layout==='list')html=tkList(shown);
    else{const key=TK.rows==='space'?t=>t.space||'no space':TK.rows==='owner'?t=>t.user?'you':t.owner:null;
      html=key?[...new Set(shown.map(key))].sort().map(g=>`<h2 class="tk-lane">${esc(g)}</h2>${tkBoard(shown.filter(t=>key(t)===g))}`).join(''):tkBoard(shown)}
    PL.paint($('#tk-body'),html)}
  tkSyncSheet(route)}

// ---- The task sheet: #tasks/<tid> -----------------------------------------------------------------------------------
// The route owns it: opening a task is a route change, so Back closes it. Closed with ✕ or Escape, it goes back to the
// board (a step back in history when the board is where it came from).
function tkSyncSheet(route){const id=route.page==='tasks'?route.id:'';
  if(!id){tkCloseSheet();TK.bare=route.page==='tasks';return}
  if(!TK.sheet||TK.sheet.id!==id)tkOpenSheet(id,TK.bare);
  TK.bare=false;tkPaintSheet()}
function tkOpenSheet(id,fromBoard){
  const tok={id,fromBoard};openLogs.add(id);  // its record shows open, without a click
  tok.h=PL.sheet.open({title:'Task '+id,route:'page',body:`<div class="tk-sheet" data-task="${esc(id)}"><div class="tk-info"></div><div class="tk-acts"></div></div>`,
    onClose:()=>{if(TK.sheet!==tok)return;TK.sheet=null;if(PL.route.page==='tasks'&&PL.route.id===id){if(tok.fromBoard)history.back();else PL.go('#tasks')}}});
  tok.info=tok.h.body.querySelector('.tk-info');tok.acts=tok.h.body.querySelector('.tk-acts');TK.sheet=tok}
function tkCloseSheet(){const s=TK.sheet;if(!s)return;TK.sheet=null;s.h.close()}
function tkPaintSheet(){const s=TK.sheet,t=allTasks.find(x=>x.id===s.id);
  if(!t){PL.paint(s.info,PL.empty({icon:'tasks',title:'No such task',text:`There's no task ${s.id}. It may have been cleared, or be older than the newest 500.`,action:{label:'Back to the board',href:'#tasks'}}));PL.paint(s.acts,'');return}
  PL.paint(s.info,tkDetail(t));
  PL.paint(s.acts,tkActions(t))}
// The task's text without its first line when that's the title, which the sheet already shows.
const tkBody=t=>{const lines=String(t.text||'').split('\n'),i=lines.findIndex(l=>l.trim());
  return (i>=0&&lines[i].trim().replace(/^task\s*:\s*/i,'').startsWith(t.title)?lines.slice(i+1):lines).join('\n').trim()};
function tkDetail(t){const kids=tkKidsOf(t.id).slice().sort((a,b)=>a.created-b.created),below=isLive(t)?tkBlockedBelow(t):[],parent=allTasks.find(x=>x.id===t.parent);
  const fact=(k,v)=>`<div class="row tk-fact"><span class="tk-k">${k}</span><span class="tk-v">${v}</span></div>`;
  const why=(head,text)=>PL.callout(head,`<div class="md">${md(text)}</div>`);
  return `<div class="tk-top">${tkStatus(t)}${tkIsBlocked(t)?PL.badge('warn','Blocked'):''}<span class="tk-age">opened ${ago(t.created)} ago</span></div>
    <h3 class="tk-title">${esc(t.title)}</h3>
    ${tkIsBlocked(t)?why(`Blocked, says ${tkOwner(t)}`,t.blocked):''}
    ${below.map(k=>why(`Subtask ${PL.taskLink(k.id)} is blocked, says ${tkOwner(k)}`,k.blocked)).join('')}
    <div class="group">${fact('Owner',tkOwner(t))}${fact('Asked by',tkAsker(t))}${t.space?fact('Space',esc(t.space)):''}
      ${t.parent?fact('Part of',`${PL.taskLink(t.parent)}${parent?' · '+esc(parent.title):''}`):''}
      ${fact('Opened',esc(PL.time(t.created)))}${fact(isLive(t)?'Updated':'Closed',esc(PL.time(t.updated)))}</div>
    ${kids.length?`${PL.label(`Subtasks · ${kids.filter(k=>k.status==='done').length} of ${kids.length} done`)}<div class="group">${kids.map(k=>`<div class="row tk-sub"><span class="row-main"><span class="row-t">${PL.taskLink(k.id)} ${esc(k.title)}</span><span class="row-s">${tkOwner(k)}${tkIsBlocked(k)?` · <span class="tk-warn">blocked: ${esc(k.blocked)}</span>`:''}</span></span><span class="row-v">${tkStatus(k)}</span></div>`).join('')}</div>`:''}
    ${t.note?`${PL.label('Latest note')}<div class="md tk-note">${md(t.note)}</div>`:''}
    ${tkBody(t)?`${PL.label('Details')}<div class="md tk-text">${md(tkBody(t))}</div>`:''}
    ${(t.log||[]).length?`<div class="tk-record">${taskLog(t)}</div>`:''}`}
// What you can do from here. Only a task given to you is marked done or failed here (as in the Inbox); an agent's own
// task is its to close. A note to its owner goes on the task's record and reaches every owner under it.
function tkActions(t){const live=isLive(t);let h=PL.label('Actions');
  if(live&&t.user)h+=`<label class="field">Your note<textarea name="tknote" rows="3" placeholder="What you did, or why you couldn't"></textarea></label>
    <div class="tk-btns"><button type="button" class="btn btn-solid sm" data-tk-inbox="done">${PL.icon('check',18)}Done</button><button type="button" class="btn btn-out sm" data-tk-inbox="failed">Couldn't do it</button></div>`;
  else if(live)h+=`<label class="field">Note to ${esc(t.owner)}<textarea name="tknote" rows="3" placeholder="It goes on ${esc(t.id)}'s record, to ${esc(t.owner)} and everyone working under it"></textarea></label>
    <div class="tk-btns"><button type="button" class="btn btn-solid sm" data-tk-note>Send note</button></div>`;
  const pick=agentSelect('','data-treassign','Choose an agent…');
  h+=`<label class="field">Hand it to another agent${pick}<span class="hint">${!live?'It reopens for the agent you pick.':t.user?'It leaves your Inbox.':esc(t.owner)+' is told to stop.'}</span></label>
    <div class="tk-btns">${live?'<button type="button" class="btn btn-danger sm" data-tact="cancelled">Cancel task</button>':'<button type="button" class="btn btn-out sm" data-tact="open">Reopen</button>'}</div>`;
  return h}

// ---- Sheets: new task, more filters, how it works -----------------------------------------------------------------
function tkNewSheet(){
  // Each space that has a lead, which hands the work on, and every agent by name.
  const spaces=Object.entries(leadOf).filter(([n])=>n!=='default').sort(),pick=TK.space&&leadOf[TK.space]?'space:'+TK.space:'';
  const to=`<option value="" ${pick?'':'selected'}>Choose who it's for…</option>`+(spaces.length?`<optgroup label="A space's lead">${spaces.map(([n,l])=>`<option value="space:${esc(n)}" ${'space:'+n===pick?'selected':''}>${esc(n)} (lead: ${esc(l.name)}${l.live?'':', offline'})</option>`).join('')}</optgroup>`:'')
    +`<optgroup label="An agent">${livePeers.filter(x=>!x.remote).sort((a,b)=>a.name.localeCompare(b.name)).map(x=>`<option value="${esc(x.id)}">${esc(x.name)} · ${esc(x.space||'default')}</option>`).join('')}</optgroup>`;
  PL.sheet.open({title:'New task',saveLabel:'Send task',
    body:`<div class="tk-form"><label class="field">To<select name="to">${to}</select><span class="hint">A space's lead splits the work up for its team.</span></label>
      <label class="field">Task<textarea name="text" rows="6" placeholder="First line is the title. Add details below it." autofocus></textarea></label></div>`,
    async onSave(f){const text=f.elements.text.value.trim(),who=f.elements.to.value;
      if(!who)return 'Choose who it’s for.';if(!text)return 'Write the task first.';
      const r=await post('/api/web/send',{to:who,text,kind:'task'});if(r.error)return r.error;
      PL.toast(`Sent to ${r.to}${r.task?` as task ${r.task}`:''}`);refresh(true)}})}
function tkMoreSheet(){
  const opt=(vals,cur,all)=>`<option value="" ${cur?'':'selected'}>${all}</option>`+vals.map(v=>`<option value="${esc(v)}" ${v===cur?'selected':''}>${esc(v)}</option>`).join('');
  const owners=[...new Set(allTasks.map(t=>t.owner).filter(Boolean))].sort(),askers=[...new Set(allTasks.map(tkReqName))].sort();
  const rows=[['','One board'],['space','A row per space'],['owner','A row per owner']].map(([v,l])=>`<option value="${v}" ${TK.rows===v?'selected':''}>${l}</option>`).join('');
  PL.sheet.open({title:'More filters',saveLabel:'Apply',
    body:`<div class="tk-form"><label class="field">Owner<select name="owner">${opt(owners,TK.owner,'Everyone')}</select></label>
      <label class="field">Asked by<select name="req">${opt(askers,TK.req,'Anyone')}</select></label>
      ${tkPhone.matches?'':`<label class="field">Board rows<select name="rows">${rows}</select><span class="hint">Splits the board into a row of columns for each space or owner. The list keeps one list.</span></label>`}</div>`,
    onSave(f){TK.owner=f.elements.owner.value;TK.req=f.elements.req.value;if(f.elements.rows){TK.rows=f.elements.rows.value;keep('tgroup',TK.rows)}PL.render()}})}
function tkHelpSheet(){
  PL.sheet.open({title:'How tasks work',body:`<div class="tk-help-t md"><ul>
<li>An agent hands out a task with <code>kind: task</code>. On Discord, start a post with <code>Task:</code>. You send one with <b>New task</b>. A task stays open until its owner marks it done or failed, and whoever asked gets the owner's note.</li>
<li>A task sent to a space's lead is the lead's to split up. Its subtasks count toward it, and a blocked subtask shows on its card.</li>
<li><b>Blocked</b> means the owner is waiting on something, usually on whoever asked. The card says why; open the task to send its owner a note. <b>Mine to answer</b> is a task given to you, or one you asked for that's blocked.</li>
<li>Only the owner moves a task to In progress, Done or Failed. A task given to you, you mark Done or Couldn't do it in its sheet (or in the Inbox).</li>
<li>Drag a card onto an agent in the strip above the board to hand it over, onto Cancel it to cancel it, or from Done or Failed to Open to reopen it. Each is also a button in the task's sheet. If the owner changed a task after the board was drawn, your move is refused.</li></ul></div>`})}

// ---- Clicks -------------------------------------------------------------------------------------------------------
document.addEventListener('click',e=>{const el=e.target;let b;
  if(!el.closest?.('#page-tasks'))return;
  if((b=el.closest('[data-tk-layout]'))){TK.layout=b.dataset.tkLayout;keep('tlayout',TK.layout);PL.render();return}
  if((b=el.closest('[data-tk-scope]'))){TK.scope=b.dataset.tkScope;PL.render();return}
  if((b=el.closest('[data-tk-space]'))){TK.space=TK.space===b.dataset.tkSpace?'':b.dataset.tkSpace;PL.render();return}
  if(el.closest('[data-tk-cancelled]')){TK.cancelled=!TK.cancelled;keep('tk.cancelled',TK.cancelled?'1':'');PL.render();return}
  if((b=el.closest('[data-tk-clear]'))){const k=b.dataset.tkClear;TK[k]='';if(k==='rows')keep('tgroup','');PL.render();return}
  if(el.closest('[data-tk-reset]')){Object.assign(TK,{scope:'all',space:'',owner:'',req:''});PL.render();return}
  if(el.closest('[data-tk-more]'))return tkMoreSheet();
  if(el.closest('[data-tk-new]'))return tkNewSheet();
  if(el.closest('[data-tk-help]'))return tkHelpSheet();
  // A card or row opens its task; a link inside it goes where the link says.
  const c=el.closest('.tk-card,.tk-row');if(c&&!el.closest('a,button,select,input,textarea'))PL.go('#tasks/'+encodeURIComponent(c.dataset.task))});
document.addEventListener('keydown',e=>{const c=e.target.closest?.('.tk-card,.tk-row');if(c&&e.target===c&&(e.key==='Enter'||e.key===' ')){e.preventDefault();PL.go('#tasks/'+encodeURIComponent(c.dataset.task))}});
// In the sheet: Done / Couldn't do it (a task given to you) and Send note (on the task's record, to its owner).
document.addEventListener('click',async e=>{const b=e.target.closest?.('.tk-sheet [data-tk-inbox],.tk-sheet [data-tk-note]');if(!b||!TK.sheet)return;
  const s=TK.sheet,id=s.id,t=allTasks.find(x=>x.id===id);if(!t)return;
  const ta=s.h.body.querySelector('[name=tknote]'),text=(ta?.value||'').trim(),act=b.dataset.tkInbox;s.h.setError('');
  if(!act&&!text){s.h.setError('Write the note first.');ta?.focus();return}
  b.disabled=true;let r;
  try{r=act?await post('/api/inbox',{kind:'task',id,action:act,text})
    :await post(`/api/tasks/${encodeURIComponent(id)}/note`,{text})}
  catch(x){r={error:String(x?.message||x)}}
  b.disabled=false;if(r.error){s.h.setError(r.error);return}
  if(ta){ta.value='';PL.settle(ta)}
  PL.toast(act?`${id} marked ${act==='done'?'done':'failed'}`:`Note added to ${id}`+((r.told||[]).length?`: sent to ${r.told.join(', ')}`:''));refresh(true)});

// ---- Dragging: the columns and agents a card may go to light up; anything else refuses the drop -------------------
// What a drop on a column does: only what the web UI could already do. The owner's own statuses are never set here.
const tkDropAction=(t,col)=>col==='cancelled'&&isLive(t)?'cancelled':col==='open'&&!isLive(t)?'open':'';
document.addEventListener('dragstart',e=>{const c=e.target.closest?.('#page-tasks .tk-card');if(!c)return;
  const t=allTasks.find(x=>x.id===c.dataset.task);if(!t)return;TK.drag=t;
  c.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',t.id);
  document.querySelectorAll('#page-tasks .tk-col').forEach(col=>col.classList.toggle('can',!!tkDropAction(t,col.dataset.col)));
  const agents=agentFolders().filter(a=>a.cwd!==t.owner_cwd);
  // With the Cancelled column hidden, Cancel is a target in the strip instead.
  const cancel=isLive(t)&&!TK.cancelled?`<span class="tk-target bad" data-tk-dropcol="cancelled">${PL.icon('x',16)}Cancel it</span>`:'';
  const strip=(agents.length?'<span>Hand it to</span>'+agents.map(a=>`<span class="tk-target" data-tk-dropcwd="${esc(a.cwd)}">${esc(a.name)}</span>`).join(''):'')+cancel;
  const d=$('#tk-drop');d.innerHTML=strip;d.classList.toggle('on',!!strip)});
const tkTarget=e=>{if(!TK.drag)return null;const a=e.target.closest?.('#page-tasks [data-tk-dropcwd],#page-tasks [data-tk-dropcol]');if(a)return a;
  const col=e.target.closest?.('#page-tasks .tk-col');return col&&tkDropAction(TK.drag,col.dataset.col)?col:null};
document.addEventListener('dragover',e=>{const t=tkTarget(e);document.querySelectorAll('#page-tasks .over').forEach(x=>x!==t&&x.classList.remove('over'));if(!t)return;e.preventDefault();t.classList.add('over')});
document.addEventListener('dragend',()=>{if(!TK.drag&&!document.querySelector('#page-tasks .dragging'))return;TK.drag=null;$('#tk-drop').classList.remove('on');
  document.querySelectorAll('#page-tasks .can,#page-tasks .over,#page-tasks .dragging').forEach(x=>x.classList.remove('can','over','dragging'));PL.render()});
document.addEventListener('drop',async e=>{const t=tkTarget(e),task=TK.drag;if(!t||!task)return;e.preventDefault();TK.drag=null;
  let body,done;
  if(t.dataset.tkDropcwd){const who=t.textContent;if(!await ask(`Hand task ${task.id} to ${who}? ${task.owner} is told to stop.`,{ok:'Hand over'}))return;body={owner:t.dataset.tkDropcwd};done=`${task.id} handed to ${who}`}
  else{const st=tkDropAction(task,t.dataset.tkDropcol||t.dataset.col);if(!st)return;
    if(st==='cancelled'&&!await ask(`Cancel task ${task.id}? Its owner is told to stop.`))return;body={status:st};done=`${task.id} ${st==='open'?'reopened':'cancelled'}`}
  // expect: refused if the owner changed the task since the board was drawn, so its own update is never overridden.
  const r=await post('/api/tasks/'+encodeURIComponent(task.id),{...body,expect:task.status});
  if(r.error)tell(r.error);else PL.toast(done);refresh(true)});
