// schedules.js: the Schedules page, prompts the daemon sends an agent at a time or on a repeat, even with no terminal
// open. Each row: what it does (the prompt's first line), when in plain words, which agent, the next run, the last run
// and how it went, and Run now. Pending ones sit on top with Approve / Deny; ended ones are behind a chip. Add, edit
// and the detail (#schedules/<cid>) are sheets. A cron in words is the shell's (PL.cadence, PL.cron); Approve and
// Deny are the shell's answers to an approval (data-iact inside data-ikind/data-iid), as in the Inbox.
PL.page('schedules',{title:'Schedules',
  html:`<div class="sc-head"><h1>Schedules</h1><span class="spacer"></span>${PL.helpBtn('How schedules work','data-schelp')}<button type="button" class="btn btn-solid sm" data-scadd>${PL.icon('plus',18)}New</button></div>
<div class="chips sc-chips" id="scchips"></div>
<div id="sclist"></div>`,
  count:st=>st.schedules.filter(c=>c.status==='active'||c.status==='pending').length||'',
  render:(st,route)=>schedRender(st,route),
  // This page's sheets (detail, add, edit) belong to it: leaving the page, by a link or a tab, closes them.
  unmount:()=>{scSheet?.h.close()}});

const scHM=(h,m)=>String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
const scLocal=t=>{const d=new Date(t*1000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${scHM(d.getHours(),d.getMinutes())}`};
const scFirst=c=>plain(String(c.prompt||'').trim().split('\n')[0])||'(no prompt)';
const scLive=c=>c.status==='active'||c.status==='pending';
const SC_STATUS={active:['ok','active'],pending:['warn','needs approval'],cancelled:['mut','cancelled'],denied:['bad','denied'],expired:['mut','expired'],done:['mut','done']};
const scStatus=c=>{const [k,t]=SC_STATUS[c.status]||['mut',c.status];return PL.badge(k,t)};
// How the last run went, from the daemon's note on it.
const scResult=c=>{const n=String(c.note||'');if(!n)return '';const k=/^couldn/.test(n)?'bad':/^(sent|started)|is still/.test(n)?'ok':'warn';
  return `<span class="sc-res sc-${k}">${esc(n)}</span>`};
// Who gets it: the agent named while it runs anywhere, else the folder's agent, else a new one or none.
const scRoute=c=>c.goes_to?`goes to ${PL.agentLink(c.goes_to)}`
  :c.agent?`${esc(c.agent)} isn’t running: ${c.start?`starts it again in <span class="mono">${esc(PL.tilde(c.folder))}</span>`:'the run waits an hour for it'}`
  :c.start?'no agent is running there: starts one':'no agent is running there: waits for one';
const scTarget=c=>c.agent?PL.agentLink(c.agent):`any agent in <span class="mono">${esc(PL.tilde(c.folder))}</span>`;
const scBtn=(act,cid,label,cls='btn-soft')=>`<button type="button" class="btn ${cls} sm" data-scact="${act}" data-cid="${esc(cid)}">${label}</button>`;
// Approve and Deny are answers to the approval waiting in the Inbox: the shell's handler sends them.
const scAsk=(label,cls='btn-soft',act='approve')=>`<button type="button" class="btn ${cls} sm" data-iact="${act}">${label}</button>`;
const scApproval=c=>`data-ikind="approval" data-iid="${esc(c.id)}" data-iwho="${esc(c.requester?.name||'')}"`;

function scCard(c){const cad=PL.cadence(c),live=scLive(c);
  const meta=[live&&c.next_run?`<span><span class="sc-k">Next</span> ${esc(PL.when(c.next_run))}</span>`:'',
    c.last_run?`<span><span class="sc-k">Last</span> ${ago(c.last_run)} ago${c.note?' · '+scResult(c):''}</span>`:live&&c.status==='active'?'<span>Not run yet</span>':''].filter(Boolean).join('');
  const acts=c.status==='pending'?scAsk('Approve','btn-acc')+scAsk('Deny','btn-soft','deny')
    :c.status==='active'?scBtn('run',c.id,`${PL.icon('check',16)}Run now`,'btn-out')+scBtn('edit',c.id,'Edit')
    :['cancelled','denied','expired'].includes(c.status)?scBtn('enable',c.id,'Enable again','btn-out'):'';
  return `<article class="sc-card${c.status==='pending'?' sc-pending':''}" data-cid="${esc(c.id)}" ${c.status==='pending'?scApproval(c):''}>
  <div class="sc-main"><a class="sc-t" href="#schedules/${encodeURIComponent(c.id)}">${esc(scFirst(c))}</a>
    <div class="sc-when">${cad.words?esc(cad.text):`<span class="mono">${esc(cad.text)}</span>`} · ${scTarget(c)}${c.status!=='active'?' '+scStatus(c):''}</div>
    ${meta?`<div class="sc-meta">${meta}</div>`:''}${c.prompt_file&&c.book_err?`<div class="sc-meta"><span class="sc-res sc-warn">Its playbook couldn’t be read last run</span></div>`:''}</div>
  ${acts?`<div class="sc-acts">${acts}</div>`:''}</article>`}

function schedRender(st,rt){
  const all=st.schedules,on=all.filter(scLive),ended=all.filter(c=>!scLive(c));
  let view=PL.pref('sched.view','on');if(view==='ended'&&!ended.length)view='on';
  PL.paint($('#scchips'),ended.length?`<button type="button" class="chip" data-scview="on" aria-pressed="${view==='on'}">Active · ${on.length}</button><button type="button" class="chip" data-scview="ended" aria-pressed="${view==='ended'}">Ended · ${ended.length}</button>`:'');
  const pend=on.filter(c=>c.status==='pending'),act=on.filter(c=>c.status==='active').sort((a,b)=>(a.next_run||9e12)-(b.next_run||9e12));
  let html;
  if(view==='ended')html=`<div class="sc-list">${ended.map(scCard).join('')}</div>`;
  else if(!on.length)html=PL.empty({icon:'schedules',title:'No schedules running',text:'A schedule sends an agent a prompt at a time or on a repeat, even with no terminal open.',action:{label:'New schedule',attrs:'data-scadd'}});
  else html=(pend.length?PL.label('Waiting for your approval')+`<div class="sc-list">${pend.map(scCard).join('')}</div>`:'')
    +(act.length?(pend.length?PL.label('Active'):'')+`<div class="sc-list">${act.map(scCard).join('')}</div>`:'');
  PL.paint($('#sclist'),html);
  // The detail route opens that schedule's sheet; Back (the bare #schedules) closes it.
  if(rt.id!==scClosedFor)scClosedFor='';
  if(rt.id&&!scSheet&&rt.id!==scClosedFor)scOpenDetail(rt.id);
  else if(scSheet?.kind==='detail'){if(!rt.id)scSheet.h.close();
    // Another schedule's route (the jump box, a link): its sheet in place of this one.
    else if(rt.id!==scSheet.cid){scSheet.h.close();scOpenDetail(rt.id)}
    else{const c=all.find(x=>x.id===scSheet.cid);if(c)PL.paint(scSheet.h.body,scDetailHTML(c))}}}

// ---- Sheets: the detail, add and edit --------------------------------------------------------------------------
let scSheet=null,scClosedFor='',scPrevHash='';
window.addEventListener('hashchange',e=>{scPrevHash=new URL(e.oldURL).hash});
// A sheet of this page closing leaves its own detail route: back to the list it was opened from, or the list in its
// place. One closing because the route moved on (to another schedule, another page) leaves the route alone.
function scSheetOpen(kind,cid,opts){
  const h=PL.sheet.open({...opts,route:'page',onClose:()=>{if(scSheet?.h!==h)return;scSheet=null;
    const r=PL.route;if(r.page==='schedules'&&r.id&&r.id===cid){scClosedFor=r.id;if(scPrevHash==='#schedules')history.back();else location.replace('#schedules')}}});
  scSheet={kind,cid,h};return h}
function scDetailHTML(c){const cad=PL.cadence(c),live=scLive(c);
  const row=(icon,t,v,sub='')=>PL.row({icon,title:esc(t),sub,value:v});
  const acts=c.status==='pending'?scAsk('Approve','btn-acc')+scAsk('Deny','btn-soft','deny')
    :c.status==='active'?scBtn('run',c.id,`${PL.icon('check',16)}Run now`,'btn-solid')+scBtn('edit',c.id,'Edit','btn-out')+scBtn('cancel',c.id,'Cancel schedule','btn-danger')
    :scBtn('edit',c.id,'Edit','btn-out')+(['cancelled','denied','expired'].includes(c.status)?scBtn('enable',c.id,'Enable again','btn-solid'):'');
  return `<div class="sc-d-top">${scStatus(c)}<span class="sc-d-id">${esc(c.id)}</span></div>
  <div class="sc-d-acts" ${c.status==='pending'?scApproval(c):''}>${acts}</div>
  ${PL.group(
    row('schedules','When',cad.words?esc(cad.text):`<span class="mono">${esc(cad.text)}</span>`,cad.words&&cad.cron?`<span class="mono">${esc(cad.cron)}</span>`:'')
    +row('agents','Agent',scTarget(c),live?scRoute(c):'')
    +(live&&c.next_run?row('schedules','Next run',esc(PL.when(c.next_run)),esc(PL.date(c.next_run))):'')
    +row('check','Last run',c.last_run?`${ago(c.last_run)} ago`:'never',c.last_run?`${scResult(c)}${c.runs?` · ran ${c.runs}×`:''}`:'')
    +(c.prompt_file?row('rules','Playbook','',`<span class="mono">${esc(PL.tilde(c.prompt_file))}</span>, read fresh at each run${c.book_err?` · <span class="sc-res sc-warn">couldn’t be read last run</span>`:''}`):'')
    +row('setup','Starts it',c.start?'yes':'no','When the agent isn’t running')
    +row('messages','Asked by',PL.agentLink(c.requester?.id||c.requester?.name||'you',c.requester?.name||'you'),c.created?esc(PL.date(c.created)):''))}
  ${PL.label('Prompt')}<div class="card sc-prompt md">${md(c.prompt)}</div>`}
function scOpenDetail(cid){const c=PL.state.schedules.find(x=>x.id===cid);
  const h=scSheetOpen('detail',cid,{title:c?scFirst(c):'No such schedule',wide:true,
    body:c?scDetailHTML(c):PL.empty({icon:'schedules',title:`No schedule ${cid}`,text:'It may have been removed with Start clean.',action:{label:'All schedules',href:'#schedules'}})});
  h.el.classList.add('sc-sheet')}

// The agents a schedule can go to, by name (several can share a folder); the current one when it isn't running.
function scAgentOptions(c){const agents=livePeers.filter(x=>!x.remote).sort((a,b)=>a.name.localeCompare(b.name));const cur=c?.agent||'';
  return (!c?'<option value="">Pick an agent</option>':c.agent&&!agents.some(x=>x.name===c.agent)?`<option value="${esc(c.agent)}" selected>${esc(c.agent)} (not running)</option>`:!c.agent?`<option value="" selected>Any agent in ${esc(PL.tilde(c.folder))}</option>`:'')
    +agents.map(x=>`<option value="${esc(x.name)}"${x.name===cur?' selected':''}>${esc(x.name)} · ${esc(PL.tilde(x.cwd))}</option>`).join('')}
const SC_PRESETS=[['Weekdays 09:00','0 9 * * 1-5'],['Daily 09:00','0 9 * * *'],['Every 30 min','*/30 * * * *'],['Mondays 09:00','0 9 * * 1'],['In 1 hour','in 1h']];
const scIsCron=w=>/^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/.test(w)&&!/^in\s/i.test(w)&&!/^\d{4}-/.test(w);
const scPreview=w=>{w=w.trim();if(!w)return 'A cron repeats (minute hour day month weekday); “in 2h” or 2026-10-25 09:00 runs once.';
  if(scIsCron(w)){const t=PL.cron(w);return t?'Runs '+t+'.':'A cron: minute hour day month weekday.'}
  return /^in\s+\d+\s*[mhd]/i.test(w)||/^\d{4}-\d\d-\d\d/.test(w)?'Runs once.':'A cron like 0 9 * * 1-5, or “in 2h”, or 2026-10-25 09:00.'};
function scEdit(cid){const c=cid?PL.state.schedules.find(x=>x.id===cid):null;if(cid&&!c)return PL.toast(`No schedule ${cid}`,{kind:'bad'});
  const when=c?(c.cron||(c.at?scLocal(c.at):'')):'';
  const h=scSheetOpen('edit',cid||'',{title:c?`Edit ${c.id}`:'New schedule',saveLabel:c?'Save':'Add schedule',wide:true,
    body:`<label class="field">Agent<select name="target"${c?'':' required'}>${scAgentOptions(c)}</select><span class="hint">The prompt goes to this agent wherever it runs, never to another in its folder.</span></label>
<label class="field">When<input name="when" value="${esc(when)}" placeholder="0 9 * * 1-5, or in 2h" autocomplete="off" spellcheck="false"${c?'':' autofocus'}><span class="hint" data-scprev>${esc(scPreview(when))}</span></label>
<div class="chips sc-presets">${SC_PRESETS.map(([l,v])=>`<button type="button" class="chip" data-scpreset="${esc(v)}">${esc(l)}</button>`).join('')}</div>
<label class="field">Prompt<textarea name="prompt" rows="5" placeholder="What the agent should do when it runs">${esc(c?.prompt||'')}</textarea></label>
<label class="field">Playbook file (optional)<input name="prompt_file" value="${esc(c?.prompt_file?PL.tilde(c.prompt_file):'')}" placeholder="~/Repos/app/PLAYBOOK.md" autocomplete="off" spellcheck="false"><span class="hint">Read fresh at each run, so rules you add to it reach the next run.</span></label>
<label class="check"><input type="checkbox" name="start"${!c||c.start?' checked':''}> Start the agent when it isn’t running</label>`,
    onSave:async f=>{const v=n=>f.elements[n].value.trim(),w=v('when');
      if(!c&&!v('target'))return 'Pick an agent.';
      if(!w)return 'Say when: a cron, or “in 2h”, or a date and time.';
      const body={...(v('target')||!c?{agent:v('target')}:{}),prompt:v('prompt'),prompt_file:v('prompt_file'),...(scIsCron(w)?{cron:w}:{at:w}),start:f.elements.start.checked};
      const r=await PL.post(c?`/api/schedules/${encodeURIComponent(c.id)}`:'/api/schedules',body);
      if(r.error)return r.error;
      PL.toast(c?`Saved ${c.id}`:`Added ${r.schedule?.id||'the schedule'}`);PL.refresh()}});
  h.el.classList.add('sc-sheet');
  h.body.addEventListener('input',e=>{if(e.target.name==='when')h.body.querySelector('[data-scprev]').textContent=scPreview(e.target.value)});
  h.body.addEventListener('click',e=>{const b=e.target.closest('[data-scpreset]');if(!b)return;const i=h.body.querySelector('[name=when]');
    i.value=b.dataset.scpreset;h.body.querySelector('[data-scprev]').textContent=scPreview(i.value);i.focus()})}

// ---- Actions ----------------------------------------------------------------------------------------------------
async function scAct(b){const act=b.dataset.scact,cid=b.dataset.cid,c=PL.state.schedules.find(x=>x.id===cid);
  if(act==='edit')return scEdit(cid);
  if(act==='cancel'&&!await PL.ask(`Cancel schedule ${cid}? It stops running; Enable again turns it back on.`))return;
  b.disabled=true;let r;
  try{r=await PL.post(`/api/schedules/${encodeURIComponent(cid)}/${act}`)}catch(e){r={error:String(e.message||e)}}
  b.disabled=false;
  if(r.error){PL.toast(r.error,{kind:'bad'});return}
  const s=r.schedule||{};
  // Cancelling a repeat can be taken back: Enable again turns it on at its next time.
  const undo=act==='cancel'&&c?.status==='active'&&c.cron?async()=>{const u=await PL.post(`/api/schedules/${encodeURIComponent(cid)}/enable`);if(u.error)PL.toast(u.error,{kind:'bad'});PL.refresh()}:null;
  PL.toast(act==='run'?`Ran ${cid}: ${s.note||'sent'}`+(s.status==='done'?'. It was a one-off, so it’s done':''):
    {cancel:`Cancelled ${cid}`,enable:`${cid} is on again`}[act]||'Done',{undo});
  PL.refresh()}
document.addEventListener('click',e=>{const b=e.target.closest('[data-scact]');if(b){e.preventDefault();scAct(b)}});
document.addEventListener('click',e=>{if(e.target.closest('[data-scadd]'))scEdit('')});
document.addEventListener('click',e=>{const b=e.target.closest('[data-scview]');if(!b)return;PL.keep('sched.view',b.dataset.scview);PL.render()});
document.addEventListener('click',e=>{if(!e.target.closest('[data-schelp]'))return;
  PL.sheet.open({title:'How schedules work',body:`<p class="sc-help-p">A schedule sends one agent a prompt at a time or on a repeat, even with no terminal open. It goes to that agent wherever it runs, never to another in its folder. When the agent isn’t running, the run waits for it, or the agent is started again in its folder.</p>
<p class="sc-help-p">Agents add them with their <span class="mono">schedule</span> tool; one that may start an agent waits for your approval, here and in the Inbox. You can add, edit, run or cancel any of them here.</p>
<p class="sc-help-p">Run now sends the prompt at once; a repeat keeps its next time, and a one-off is done. There’s no pause: Cancel stops one, and Enable again turns it back on.</p>`})});
