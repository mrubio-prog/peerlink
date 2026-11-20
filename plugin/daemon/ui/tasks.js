// tasks.js: the Tasks page, a board (or list) of work handed between agents. #tasks/<tid> opens that task's card.
PL.page('tasks',{title:'Tasks',
  html:`<h1>Tasks</h1><p class="lead">Work handed between agents. Click a card for details, or drag it.</p>
<details class="how"><summary>How tasks work</summary><ul>
<li>An agent hands out a task with <span class="mono">kind: task</span>. On Discord, start a post with <span class="mono">Task:</span>. A task stays open until its owner marks it done or failed, and whoever asked gets the owner's note.</li>
<li>A task sent to a lead is the lead's to split up. Its subtasks count toward it.</li>
<li>Drag a card to Cancelled to cancel it, from Done, Failed or Cancelled to Open to reopen it, or onto an agent to hand it over. Only the owner moves a task to In progress, Done or Failed. If the owner changed a task after the board was drawn, your move is refused.</li></ul></details>
<div class="msgbar"><button class="small" data-newtask>+ New task</button><span class="seg" role="group" aria-label="Layout"><button class="ghost small" data-tlayout="board">Board</button><button class="ghost small" data-tlayout="list">List</button></span>
<span id="tstatusw" class="fl"><label class="small mut" for="tstatus">Show</label><select id="tstatus"><option value="live">Open and in progress</option><option value="done">Done</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option><option value="">All</option></select></span>
<span class="fl"><label class="small mut" for="towner">Owner</label><select id="towner"><option value="">Everyone</option></select></span>
<span class="fl"><label class="small mut" for="treq">Asked by</label><select id="treq"><option value="">Anyone</option></select></span>
<span class="fl"><label class="small mut" for="tspace">Space</label><select id="tspace"><option value="">All spaces</option></select></span>
<span id="tgroupw" class="fl"><label class="small mut" for="tgroup">Rows</label><select id="tgroup"><option value="">One board</option><option value="space">By space</option><option value="owner">By owner</option></select></span></div>
<form id="newtask" class="card sendbox" hidden><label>To<select name="to" required></select></label>
<label>Task<textarea name="text" rows="3" placeholder="First line is the title. Add details below it." required></textarea></label>
<div class="addline"><button type="submit">Send task</button><button type="button" class="ghost" data-newtask>Cancel</button><span class="small" id="newtaskmsg"></span></div></form>
<div id="tdrop" class="tdrop"></div>
<div class="mlist" id="tasklist"></div>`,
  count:st=>st.tasks.filter(isLive).length||'',
  mount(){document.body.classList.add('wide')},
  unmount(){document.body.classList.remove('wide')},
  render:(st,route)=>renderTasks(route)});
let shownTask='';
const withSubs=list=>{const ids=new Set(list.map(t=>t.id));return byLive(list.filter(t=>!t.parent||!ids.has(t.parent))).map(t=>taskRow(t,false)+byLive(list.filter(k=>k.parent===t.id)).map(k=>taskRow(k,true)).join('')).join('')};
let tLayout=pref('tlayout','board'),dragging=null;const openCards=new Set();
$('#tgroup').value=pref('tgroup','');
const COLS=[['open','Open'],['in_progress','In progress'],['done','Done'],['failed','Failed'],['cancelled','Cancelled']];
// What a drop on a column does: only what the web UI could already do. The owner's own statuses are never set from here.
const dropAction=(t,col)=>col==='cancelled'&&isLive(t)?'cancelled':col==='open'&&!isLive(t)?'open':'';
const reqName=t=>t.requester?.name||'?';
function taskCard(t){const kids=allTasks.filter(x=>x.parent===t.id),done=kids.filter(k=>k.status==='done').length;
  return `<div class="tcard${openCards.has(t.id)?' open':''}" draggable="true" data-task="${esc(t.id)}" data-st="${esc(t.status)}" tabindex="0" aria-label="${esc(t.title)}, ${TSTATE[t.status]}, owner ${esc(t.owner)}">
    <div class="tt">${esc(t.title)}</div>
    <div class="meta by"><span><b>${PL.agentLink(t.owner)}</b> · asked by ${PL.agentLink(t.requester?.id||reqName(t),reqName(t))}</span><span class="age" title="${new Date(t.created*1000).toLocaleString()}">${ago(t.created)}</span></div>
    ${t.parent?`<div class="meta">↳ part of ${PL.taskLink(t.parent)}</div>`:''}${t.blocked&&isLive(t)?`<div class="meta" style="color:var(--warn)">blocked</div>`:''}
    ${kids.length?`<div class="meta">${done} of ${kids.length} subtasks done</div><div class="bar"><i style="width:${Math.round(100*done/kids.length)}%"></i></div>`:''}
    <div class="more">${t.space?`<div class="meta">${esc(t.id)} · ${esc(t.space)}</div>`:`<div class="meta">${esc(t.id)}</div>`}${t.note?`<div class="note md">${md(t.note)}</div>`:''}${taskLog(t)}
    <div class="tact">${isLive(t)?'<button class="ghost small" data-tact="cancelled">Cancel</button>':'<button class="ghost small" data-tact="open">Reopen</button>'}${agentSelect('','data-treassign','Reassign to…')}</div></div></div>`}
function board(list){const shut=!openCards.has('col:cancelled');
  return `<div class="board">${COLS.map(([k,label])=>{const cards=list.filter(t=>t.status===k).sort((a,b)=>b.created-a.created);
    return `<div class="col${k==='cancelled'?' shut'+(shut?'':' open'):''}" data-col="${k}"><div class="col-h">${k==='cancelled'?`<button data-tcol="cancelled" aria-expanded="${!shut}">${shut?'▸':'▾'} ${label}</button>`:label}<span>${cards.length}</span></div>${cards.map(taskCard).join('')||(k==='cancelled'?'':'<div class="none">None</div>')}</div>`}).join('')}</div>`}
function renderTasks(route=PL.route){
  // The route's task opens in place, once, and comes into view.
  if(route.id&&shownTask!==route.id&&allTasks.some(t=>t.id===route.id)){openCards.add(route.id);if(allTasks.find(t=>t.id===route.id).status==='cancelled')openCards.add('col:cancelled')}
  const opts=(el,all,vals)=>{if(document.activeElement===el)return;const keep=el.value;el.innerHTML=`<option value="">${all}</option>`+vals.map(n=>`<option ${n===keep?'selected':''}>${esc(n)}</option>`).join('')};
  opts($('#towner'),'Everyone',[...new Set(allTasks.map(t=>t.owner))].sort());
  opts($('#treq'),'Anyone',[...new Set(allTasks.map(reqName))].sort());
  opts($('#tspace'),'All spaces',[...new Set(allTasks.map(t=>t.space).filter(Boolean))].sort());
  const st=$('#tstatus').value,ow=$('#towner').value,rq=$('#treq').value,sp=$('#tspace').value,grp=$('#tgroup').value;
  const picked=allTasks.filter(t=>(!ow||t.owner===ow)&&(!rq||reqName(t)===rq)&&(!sp||t.space===sp));
  document.querySelectorAll('[data-tlayout]').forEach(b=>b.classList.toggle('on',b.dataset.tlayout===tLayout));
  $('#tstatusw').hidden=tLayout!=='list';$('#tgroupw').hidden=tLayout!=='board';
  // Never redraw under an open reassign menu or a card being dragged.
  if(dragging||document.activeElement?.matches?.('#tasklist [data-treassign]'))return;
  const none=`<div class="empty">${allTasks.length?'No tasks match.':'No tasks yet.'}</div>`;
  if(tLayout==='list')PL.paint($('#tasklist'),withSubs(picked.filter(t=>st==='live'?isLive(t):!st||t.status===st))||none);
  else if(!picked.length)PL.paint($('#tasklist'),none);
  else{const key=grp==='space'?t=>t.space||'no space':grp==='owner'?t=>t.owner:null;
  PL.paint($('#tasklist'),key?[...new Set(picked.map(key))].sort().map(g=>`<div class="lane-h">${esc(g)}</div>${board(picked.filter(t=>key(t)===g))}`).join(''):board(picked))}
  if(route.id&&shownTask!==route.id){const c=document.querySelector(`#tasklist [data-task="${CSS.escape(route.id)}"]`);if(c){shownTask=route.id;c.classList.add('focus');c.scrollIntoView({block:'center'})}}
  if(!route.id)shownTask=''}
// A board card opens in place to show its note and the same buttons as a list row, so nothing needs a drag.
document.addEventListener('click',e=>{const h=e.target.closest('[data-tcol]');if(h){const k='col:'+h.dataset.tcol;openCards.has(k)?openCards.delete(k):openCards.add(k);renderTasks();return}
  const c=e.target.closest('.tcard');if(!c||e.target.closest('.tact,a'))return;
  openCards.has(c.dataset.task)?openCards.delete(c.dataset.task):openCards.add(c.dataset.task);c.classList.toggle('open')});
document.addEventListener('keydown',e=>{const c=e.target.closest?.('.tcard');if(c&&e.target===c&&(e.key==='Enter'||e.key===' ')){e.preventDefault();c.click()}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-tlayout]');if(!b)return;tLayout=b.dataset.tlayout;keep('tlayout',tLayout);renderTasks()});
// Dragging: the columns and agents a card may go to light up; anything else refuses the drop.
document.addEventListener('dragstart',e=>{const c=e.target.closest?.('.tcard');if(!c)return;
  dragging=allTasks.find(t=>t.id===c.dataset.task);if(!dragging)return;c.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragging.id);
  document.querySelectorAll('.col').forEach(col=>col.classList.toggle('can',!!dropAction(dragging,col.dataset.col)));
  const agents=agentFolders().filter(a=>a.cwd!==dragging.owner_cwd);
  $('#tdrop').innerHTML=agents.length?'Hand it to: '+agents.map(a=>`<span class="agent" data-dropcwd="${esc(a.cwd)}">${esc(a.name)}</span>`).join(''):'';$('#tdrop').classList.toggle('on',agents.length>0)});
const target=e=>{if(!dragging)return null;const a=e.target.closest?.('[data-dropcwd]');if(a)return a;const col=e.target.closest?.('.col');return col&&dropAction(dragging,col.dataset.col)?col:null};
document.addEventListener('dragover',e=>{const t=target(e);document.querySelectorAll('.over').forEach(x=>x!==t&&x.classList.remove('over'));if(!t)return;e.preventDefault();t.classList.add('over')});
document.addEventListener('dragend',()=>{dragging=null;$('#tdrop').classList.remove('on');document.querySelectorAll('.can,.over,.dragging').forEach(x=>x.classList.remove('can','over','dragging'));renderTasks()});
document.addEventListener('drop',async e=>{const t=target(e),task=dragging;if(!t||!task)return;e.preventDefault();dragging=null;
  let body;
  if(t.dataset.dropcwd){if(!await ask(`Hand task ${task.id} to ${t.textContent}? ${task.owner} is told to stop.`))return;body={owner:t.dataset.dropcwd}}
  else{const st=dropAction(task,t.dataset.col);if(st==='cancelled'&&!await ask(`Cancel task ${task.id}? Its owner is told to stop.`))return;body={status:st}}
  // expect: refused if the owner changed the task since the board was drawn, so its own update is never overridden.
  const r=await post('/api/tasks/'+encodeURIComponent(task.id),{...body,expect:task.status});if(r.error)tell(r.error);refresh(true)});
// You, to an agent or a space's lead: the New task form.
document.addEventListener('submit',async e=>{const f=e.target;if(f.id!=='newtask')return;e.preventDefault();
  const text=f.elements.text.value.trim(),out=$('#newtaskmsg');if(!text)return;
  const r=await post('/api/web/send',{to:f.elements.to.value,text,kind:'task'});
  if(r.error){out.className='small err';out.textContent=r.error;return}
  f.elements.text.value='';PL.settle(f);out.className='small ok';out.textContent=`Sent to ${r.to}${r.task?` as task ${r.task}`:''}.`;
  setTimeout(()=>{f.hidden=true;out.textContent=''},1500);refresh(true)});
document.addEventListener('change',e=>{const t=e.target;if(['tstatus','towner','treq','tspace','tgroup'].includes(t.id)){if(t.id==='tgroup')keep('tgroup',t.value);renderTasks()}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-newtask]');if(!b)return;const f=$('#newtask');f.hidden=!f.hidden;if(f.hidden)return;
  // Agents by name, and each space that has a lead, which hands the work on.
  const spaces=Object.entries(leadOf).filter(([n])=>n!=='default').sort();
  f.elements.to.innerHTML=`<option value="">Choose who it's for…</option>`+(spaces.length?`<optgroup label="A space's lead">${spaces.map(([n,l])=>`<option value="space:${esc(n)}">${esc(n)} (lead: ${esc(l.name)}${l.live?'':', offline'})</option>`).join('')}</optgroup>`:'')
    +`<optgroup label="An agent">${livePeers.filter(x=>!x.remote).sort((a,b)=>a.name.localeCompare(b.name)).map(x=>`<option value="${esc(x.id)}">${esc(x.name)} · ${esc(x.space||'default')}</option>`).join('')}</optgroup>`;
  f.elements.text.focus()});
