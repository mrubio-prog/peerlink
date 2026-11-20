// Schedules: what's active or waiting first; the ones that ended fold away. Each says who'd get it now.
let allSched=[],schedEdit='';
const openSched=new Set(),SCHED_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2"/></svg>';
document.addEventListener('toggle',e=>{const d=e.target;if(!d.matches?.('details.sched'))return;d.open?openSched.add(d.dataset.sched):openSched.delete(d.dataset.sched)},true);
function renderSchedules(force){
  const live=c=>c.status==='active'||c.status==='pending';
  $('#n-sched').textContent=allSched.filter(live).length||'';
  // Pick an agent, by name: several can share a folder.
  const agents=livePeers.filter(x=>!x.remote).sort((a,b)=>a.name.localeCompare(b.name));
  const opts=(cur,extra='')=>extra+agents.map(x=>`<option value="${esc(x.name)}" ${x.name===cur?'selected':''}>${esc(x.name)} · ${esc(tilde(x.cwd))}</option>`).join('');
  const pick=$('#schedagents');if(document.activeElement!==pick){const was=pick.value;pick.innerHTML=opts(was,'<option value="">Pick an agent</option>')}
  // Never redraw a schedule under someone editing it.
  if(schedEdit&&!force)return;
  const when=t=>t?new Date(t*1000).toLocaleString([], {weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
  const local=t=>{const d=new Date(t*1000),z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`};
  const btn=(attr,id,label,cls='')=>`<button class="ghost small ${cls}" ${attr}="${esc(id)}">${label}</button>`;
  const actions=c=>btn('data-schededit',c.id,'Edit')+(c.status==='pending'?`<button class="ghost small" data-schedok="${esc(c.id)}" data-act="approve">Approve</button><button class="ghost small" data-schedok="${esc(c.id)}" data-act="deny">Deny</button>`
    :c.status==='active'?btn('data-schedcancel',c.id,'Cancel','danger'):['cancelled','denied','expired'].includes(c.status)?btn('data-schedon',c.id,'Enable again'):'');
  // Who gets it: the agent named while it runs in the folder, else the folder's agent, else a new one or none.
  const route=c=>c.goes_to?`goes to <b>${esc(c.goes_to)}</b>`
    :c.agent?`<span style="color:var(--warn)">${esc(c.agent)} isn't running</span>: ${c.start?`starts it again in ${esc(tilde(c.folder))}`:'the run waits an hour for it'}`
    :c.start?`no agent running there: starts one`:`no agent running there: waits for one`;
  const card=c=>schedEdit===c.id?`<form class="card" data-schedform="${esc(c.id)}"><div class="addline"><b>${esc(c.id)}</b><span class="chip">${esc(c.status)}</span>
      <select name="target" class="grow">${opts(c.agent,c.agent&&!agents.some(x=>x.name===c.agent)?`<option value="${esc(c.agent)}" selected>${esc(c.agent)} (not running)</option>`:!c.agent?`<option value="" selected>Any agent in ${esc(tilde(c.folder))}</option>`:'')}</select>
      <input name="when" type="text" value="${esc(c.cron||local(c.at))}" placeholder="0 9 * * 1-5, or in 2h" style="width:190px"></div>
    <textarea name="prompt" rows="4" style="margin-top:8px;width:100%">${esc(c.prompt)}</textarea>
    <input name="prompt_file" type="text" value="${esc(c.prompt_file?tilde(c.prompt_file):'')}" placeholder="Playbook file, read fresh at each run (optional)" style="margin-top:8px">
    <div class="addline" style="margin-top:8px"><label class="check small"><input type="checkbox" name="start" ${c.start?'checked':''}> Start it when it isn&#39;t running</label>
      <button type="submit">Save</button><button type="button" class="ghost" data-schededit="">Cancel</button><span class="small err" data-schedmsg></span></div></form>`
    :`<details class="plat sched" data-sched="${esc(c.id)}" ${openSched.has(c.id)||c.status==='pending'?'open':''}><summary>
      <span class="plogo" style="background:${c.status==='active'?'var(--acc)':c.status==='pending'?'var(--warn)':'var(--mut)'}">${SCHED_ICON}</span>
      <span class="ptitle"><b>${esc(c.agent||tilde(c.folder))} <span class="mut" style="font-weight:400">· ${esc(c.when_text)}</span></b><span class="psub">${esc(c.prompt.replace(/\s+/g,' ').slice(0,160))}</span></span>
      <span class="pstate">${c.status==='active'?'':`<span class="pill${c.status==='pending'?' warn':''}">${esc(c.status==='pending'?'needs approval':c.status)}</span>`}<span class="small mut">${c.next_run&&live(c)?'next '+when(c.next_run):c.runs?'last '+when(c.last_run):''}</span></span><span class="chev" aria-hidden="true"></span></summary>
    <div class="pbody" style="padding-top:12px"><div class="md">${md(c.prompt)}</div>${c.prompt_file?`<div class="small" style="margin-top:6px">Playbook <span class="mono">${esc(tilde(c.prompt_file))}</span>, read fresh at each run${c.book_err?` · <span style="color:var(--warn)">couldn't be read last run</span>`:''}</div>`:''}
    <div class="small mut" style="margin-top:8px">${esc(c.id)} · ${live(c)?route(c)+' · ':''}by ${esc(c.requester?.name||'you')}${c.agent?` · in <span class="mono">${esc(tilde(c.folder))}</span>`:''}${c.runs?` · ran ${c.runs}×, last ${when(c.last_run)}${c.note?': '+esc(c.note):''}`:''}${c.status==='pending'?' · waiting for your approval':''}</div>
    <div class="addline" style="margin-top:10px">${actions(c)}</div></div></details>`;
  const on=allSched.filter(live),ended=allSched.filter(c=>!live(c));
  $('#schedlist').innerHTML=(on.map(card).join('')||'<div class="empty">No schedules running.</div>')
    +(ended.length?`<details ${ended.some(c=>c.id===schedEdit)?'open':''}><summary class="small mut" style="cursor:pointer;margin-top:4px">Ended (${ended.length})</summary><div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">${ended.map(card).join('')}</div></details>`:'')}
document.addEventListener('click',e=>{const b=e.target.closest('[data-schededit]');if(!b)return;schedEdit=b.dataset.schededit;renderSchedules(true)});
document.addEventListener('submit',async e=>{const f=e.target.closest('[data-schedform]');if(!f)return;e.preventDefault();const v=n=>f.elements[n].value.trim();
  const w=v('when'),cron=/^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/.test(w)&&!/^in\s/i.test(w)&&!/^\d{4}-/.test(w);
  const r=await post(`/api/schedules/${encodeURIComponent(f.dataset.schedform)}`,{...(v('target')?{agent:v('target')}:{}),prompt:v('prompt'),prompt_file:v('prompt_file'),...(cron?{cron:w}:{at:w}),start:f.elements.start.checked});
  if(r.error){f.querySelector('[data-schedmsg]').textContent=r.error;return}
  schedEdit='';refresh(true)});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-schedok]');if(!b)return;
  const r=await post('/api/inbox',{kind:'approval',id:b.dataset.schedok,action:b.dataset.act});if(r.error)tell(r.error);refresh(true)});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-schedon]');if(!b)return;
  const r=await post(`/api/schedules/${encodeURIComponent(b.dataset.schedon)}/enable`);if(r.error)tell(r.error);refresh(true)});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-schedcancel]');if(!b)return;
  if(!await ask(`Cancel ${b.dataset.schedcancel}?`))return;const r=await post(`/api/schedules/${encodeURIComponent(b.dataset.schedcancel)}/cancel`);if(r.error)tell(r.error);refresh(true)});
document.addEventListener('submit',async e=>{if(e.target.id!=='schedform')return;e.preventDefault();const f=e.target,v=n=>f.elements[n].value.trim();
  const w=v('when'),cron=/^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/.test(w)&&!/^in\s/i.test(w)&&!/^\d{4}-/.test(w);
  const r=await post('/api/schedules',{agent:v('target'),prompt:v('prompt'),prompt_file:v('prompt_file'),...(cron?{cron:w}:{at:w}),start:f.elements.start.checked});
  const out=$('#schedmsg');out.className='small '+(r.error?'err':'ok');out.textContent=r.error||`Added ${r.schedule.id}`;
  if(!r.error){f.elements.prompt.value='';f.elements.prompt_file.value='';f.elements.when.value=''}refresh(true)});
