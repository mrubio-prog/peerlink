// Tasks: one row each, its subtasks under it. The Tasks page and an agent's Tasks tab share the row.
let allTasks=[],panelTab='about';
const TSTATE={open:'open',in_progress:'in progress',done:'done',failed:'failed',cancelled:'cancelled'};
const isLive=t=>t.status==='open'||t.status==='in_progress';
// A task's record: what its owner reported, what it's blocked on, notes from above and what you decided.
const TKIND={progress:'progress',blocked:'blocked',note:'note',decision:'decision',closed:'closed'};
const taskLog=t=>(t.blocked&&isLive(t)?`<div class="tblocked"><b>Blocked:</b> ${esc(t.blocked)}</div>`:'')
  +((t.log||[]).length?`<details class="tlog" data-tlog="${esc(t.id)}" ${openLogs.has(t.id)?'open':''}><summary>Record (${t.log.length})</summary>${t.log.slice().reverse().map(e=>`<div class="te ${esc(e.kind)}"><span class="k">${esc(TKIND[e.kind]||e.kind)} · ${esc(e.by)} · ${ago(e.ts)} ago</span><div class="md">${md(e.text)}</div></div>`).join('')}</details>`:'');
const openLogs=new Set();
document.addEventListener('toggle',e=>{const d=e.target;if(!d.dataset||!d.dataset.tlog)return;d.open?openLogs.add(d.dataset.tlog):openLogs.delete(d.dataset.tlog)},true);
function taskRow(t,sub){const kids=allTasks.filter(x=>x.parent===t.id);
  return `<div class="task${sub?' sub':''}" data-task="${esc(t.id)}"><div class="mh"><span class="tchip ${esc(t.status)}">${TSTATE[t.status]||esc(t.status)}</span><b>${esc(t.title)}</b><span class="when">${esc(t.id)} · ${ago(t.created)} ago</span></div>
    <div class="small mut">${esc(t.requester?.name||'?')} → <b>${esc(t.owner)}</b>${t.space?' · '+esc(t.space):''}${kids.length?` · ${kids.filter(k=>k.status==='done').length} of ${kids.length} subtasks done`:''}${!isLive(t)?' · closed '+ago(t.updated)+' ago':''}</div>
    ${t.note?`<div class="note md">${md(t.note)}</div>`:''}${taskLog(t)}
    <div class="tact">${isLive(t)?'<button class="ghost small" data-tact="cancelled">Cancel</button>':'<button class="ghost small" data-tact="open">Reopen</button>'}${agentSelect('','data-treassign','Reassign to…')}</div></div>`}
// Open and in-progress first, then the rest, newest first within each.
const byLive=list=>list.slice().sort((a,b)=>(isLive(b)-isLive(a))||(b.created-a.created));
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
    <div class="meta by"><span><b>${esc(t.owner)}</b> · asked by ${esc(reqName(t))}</span><span class="age" title="${new Date(t.created*1000).toLocaleString()}">${ago(t.created)}</span></div>
    ${t.parent?`<div class="meta">↳ part of ${esc(t.parent)}</div>`:''}${t.blocked&&isLive(t)?`<div class="meta" style="color:var(--warn)">blocked</div>`:''}
    ${kids.length?`<div class="meta">${done} of ${kids.length} subtasks done</div><div class="bar"><i style="width:${Math.round(100*done/kids.length)}%"></i></div>`:''}
    <div class="more">${t.space?`<div class="meta">${esc(t.id)} · ${esc(t.space)}</div>`:`<div class="meta">${esc(t.id)}</div>`}${t.note?`<div class="note md">${md(t.note)}</div>`:''}${taskLog(t)}
    <div class="tact">${isLive(t)?'<button class="ghost small" data-tact="cancelled">Cancel</button>':'<button class="ghost small" data-tact="open">Reopen</button>'}${agentSelect('','data-treassign','Reassign to…')}</div></div></div>`}
function board(list){const shut=!openCards.has('col:cancelled');
  return `<div class="board">${COLS.map(([k,label])=>{const cards=list.filter(t=>t.status===k).sort((a,b)=>b.created-a.created);
    return `<div class="col${k==='cancelled'?' shut'+(shut?'':' open'):''}" data-col="${k}"><div class="col-h">${k==='cancelled'?`<button data-tcol="cancelled" aria-expanded="${!shut}">${shut?'▸':'▾'} ${label}</button>`:label}<span>${cards.length}</span></div>${cards.map(taskCard).join('')||(k==='cancelled'?'':'<div class="none">None</div>')}</div>`}).join('')}</div>`}
function renderTasks(){
  const opts=(el,all,vals)=>{const keep=el.value;el.innerHTML=`<option value="">${all}</option>`+vals.map(n=>`<option ${n===keep?'selected':''}>${esc(n)}</option>`).join('')};
  opts($('#towner'),'Everyone',[...new Set(allTasks.map(t=>t.owner))].sort());
  opts($('#treq'),'Anyone',[...new Set(allTasks.map(reqName))].sort());
  opts($('#tspace'),'All spaces',[...new Set(allTasks.map(t=>t.space).filter(Boolean))].sort());
  const st=$('#tstatus').value,ow=$('#towner').value,rq=$('#treq').value,sp=$('#tspace').value,grp=$('#tgroup').value;
  const picked=allTasks.filter(t=>(!ow||t.owner===ow)&&(!rq||reqName(t)===rq)&&(!sp||t.space===sp));
  $('#n-tasks').textContent=allTasks.filter(isLive).length||'';
  document.querySelectorAll('[data-tlayout]').forEach(b=>b.classList.toggle('on',b.dataset.tlayout===tLayout));
  $('#tstatusw').hidden=tLayout!=='list';$('#tgroupw').hidden=tLayout!=='board';
  // Never redraw under an open reassign menu or a card being dragged.
  if(dragging||document.activeElement?.matches?.('#tasklist [data-treassign]'))return;
  const none=`<div class="empty">${allTasks.length?'No tasks match.':'No tasks yet.'}</div>`;
  if(tLayout==='list'){$('#tasklist').innerHTML=withSubs(picked.filter(t=>st==='live'?isLive(t):!st||t.status===st))||none;return}
  if(!picked.length){$('#tasklist').innerHTML=none;return}
  const key=grp==='space'?t=>t.space||'no space':grp==='owner'?t=>t.owner:null;
  $('#tasklist').innerHTML=key?[...new Set(picked.map(key))].sort().map(g=>`<div class="lane-h">${esc(g)}</div>${board(picked.filter(t=>key(t)===g))}`).join(''):board(picked)}
// A board card opens in place to show its note and the same buttons as a list row, so nothing needs a drag.
document.addEventListener('click',e=>{const h=e.target.closest('[data-tcol]');if(h){const k='col:'+h.dataset.tcol;openCards.has(k)?openCards.delete(k):openCards.add(k);renderTasks();return}
  const c=e.target.closest('.tcard');if(!c||e.target.closest('.tact'))return;
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
document.addEventListener('click',async e=>{const b=e.target.closest('[data-ptab],[data-tact]');if(!b)return;
  if(b.dataset.ptab){panelTab=b.dataset.ptab;editing=false;refresh(true);return}
  const id=b.closest('[data-task]').dataset.task,was=allTasks.find(t=>t.id===id)?.status;
  if(b.dataset.tact==='cancelled'&&!await ask(`Cancel task ${id}? Its owner is told to stop.`))return;
  const r=await post('/api/tasks/'+encodeURIComponent(id),{status:b.dataset.tact,expect:was});if(r.error)tell(r.error);refresh(true)});
document.addEventListener('change',async e=>{const t=e.target;
  if(['tstatus','towner','treq','tspace','tgroup'].includes(t.id)){if(t.id==='tgroup')keep('tgroup',t.value);renderTasks();return}
  if(t.dataset.treassign!==undefined&&t.value){const id=t.closest('[data-task]').dataset.task;
    const r=await post('/api/tasks/'+encodeURIComponent(id),{owner:t.value});if(r.error)tell(r.error);t.blur();refresh(true)}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-newtask]');if(!b)return;const f=$('#newtask');f.hidden=!f.hidden;if(f.hidden)return;
  // Agents by name, and each space that has a lead, which hands the work on.
  const spaces=Object.entries(leadOf).filter(([n])=>n!=='default').sort();
  f.elements.to.innerHTML=`<option value="">Choose who it's for…</option>`+(spaces.length?`<optgroup label="A space's lead">${spaces.map(([n,l])=>`<option value="space:${esc(n)}">${esc(n)} (lead: ${esc(l.name)}${l.live?'':', offline'})</option>`).join('')}</optgroup>`:'')
    +`<optgroup label="An agent">${livePeers.filter(x=>!x.remote).sort((a,b)=>a.name.localeCompare(b.name)).map(x=>`<option value="${esc(x.id)}">${esc(x.name)} · ${esc(x.space||'default')}</option>`).join('')}</optgroup>`;
  f.elements.text.focus()});
