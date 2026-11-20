document.addEventListener('change',async e=>{const t=e.target;if(!t.dataset.splead&&!t.dataset.spparent)return;
  const r=t.dataset.spparent?await post(`/api/spaces/${encodeURIComponent(t.dataset.spparent)}/parent`,{parent:t.value})
    :await post(`/api/spaces/${encodeURIComponent(t.dataset.splead)}/lead`,{cwd:t.value});
  if(r.error)tell(r.error);lastView='';refresh(true)});
// Feedback: newest first; accepting one opens a task for peerlink's maintainer.
let allFeedback=[];
function renderFeedback(){
  $('#n-feedback').textContent=allFeedback.filter(f=>f.status==='new').length||'';
  if(document.activeElement?.closest?.('#fblist'))return;
  const st=$('#fstatus').value,ty=$('#ftype').value;
  const shown=allFeedback.filter(f=>(!st||f.status===st)&&(!ty||f.type===ty)).sort((a,b)=>b.ts-a.ts);
  const btn=(s,label)=>`<button class="ghost small" data-fact="${s}">${label}</button>`;
  const fbRow=f=>{const task=allTasks.find(t=>t.id===f.task);let [head,...rest]=f.text.split('\n');
    // A long first line is cut to a headline; the rest of it reads below.
    if(head.length>120){const cut=head.lastIndexOf(' ',120)>60?head.lastIndexOf(' ',120):120;rest=[head.slice(cut).trim(),...rest];head=head.slice(0,cut)+'…'}
    return `<div class="task" data-fb="${esc(f.id)}"><div class="mh"><span class="tchip ${esc(f.type)}">${esc(f.type)}</span><span class="tchip ${esc(f.status)}">${esc(f.status)}</span><b>${esc(head)}</b><span class="when">${esc(f.id)} · ${ago(f.ts)} ago</span></div>
      <div class="small mut">${esc(f.from_name||'an agent')}${f.space?' · '+esc(f.space):''} · plugin ${esc(f.plugin||'?')}, daemon ${esc(f.daemon||'?')}${task?` · task ${esc(task.id)} ${esc(TSTATE[task.status]||task.status)} with <b>${esc(task.owner)}</b>`:''}</div>
      ${rest.join('\n').trim()?`<div class="ftext md">${md(rest.join('\n').trim())}</div>`:''}
      <div class="tact"><input class="small" data-fnote placeholder="Note (optional)" value="${esc(f.note||'')}">
      ${f.status==='new'?btn('accepted','Accept')+btn('dismissed','Dismiss'):f.status==='accepted'?btn('done','Mark done')+btn('dismissed','Dismiss'):btn('new','Back to new')}</div></div>`};
  // All statuses: a panel each, the ones that need you open. One status picked: just its list.
  const FB={new:['New','Not looked at yet','var(--acc)',true],accepted:['Accepted','Handed to the peerlink agent as a task','var(--warn)',true],done:['Done','Fixed or built','var(--ok)',false],dismissed:['Dismissed','Not acted on','var(--mut)',false]};
  $('#fblist').innerHTML=(st?shown.map(fbRow).join(''):Object.entries(FB).map(([k,[title,sub,bg,open]])=>{const l=shown.filter(f=>f.status===k);
      return l.length?grp('fb:'+k,{title,sub,bg,open,state:`<span class="pill">${l.length}</span>`},l.map(fbRow).join('')):''}).join(''))
    ||`<div class="empty">${allFeedback.length?'Nothing here.':'No feedback yet.'}</div>`}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-fact]');if(!b)return;const row=b.closest('[data-fb]');
  const r=await post('/api/issues/'+encodeURIComponent(row.dataset.fb),{status:b.dataset.fact,note:row.querySelector('[data-fnote]').value});
  if(r.error)tell(r.error);document.activeElement?.blur();refresh(true)});
document.addEventListener('change',async e=>{const t=e.target;
  if(t.id==='fstatus'||t.id==='ftype'){renderFeedback();return}
  if(t.dataset.fnote!==undefined){const r=await post('/api/issues/'+encodeURIComponent(t.closest('[data-fb]').dataset.fb),{note:t.value});if(r.error)tell(r.error);t.blur();refresh(true)}});
// -- Discord: the setup walkthrough and the channel-to-agent mapping --------
let dState=null,dGuilds=null,dDraft=null,dBusy=false;
function channelSelect(val,attrs,skip){const gs=dGuilds||[];
  return `<select ${attrs}><option value="">Pick a channel…</option>${gs.map(g=>`<optgroup label="${esc(g.name)}">${g.channels.filter(c=>!skip||!skip.has(c.id)).map(c=>`<option value="${esc(c.id)}" ${c.id===val?'selected':''}>${OTHER(g)?'':'#'}${esc(c.name)}</option>`).join('')}</optgroup>`).join('')}</select>`}
const chanName=id=>{for(const g of dGuilds||[])for(const c of g.channels)if(c.id===id)return (OTHER(g)?'':'#')+c.name;return 'channel '+id};
async function loadDiscord(check){
  dState=await api('/api/discord'+(check?'?check=1':''));
  if(dGuilds===null){const r=await api('/api/discord/channels');dGuilds=r.guilds||[]}
  if(!dDraft)dDraft={routes:JSON.parse(JSON.stringify(dState.routes||[])),dm:dState.dm||''};
  renderDiscord()}
// The Channels page's panels: open by default when there's something to do; your own opening or closing one sticks.
const panelSet=new Set();
function panels(want){for(const [id,open] of Object.entries(want)){const el=document.getElementById(id);if(!el||panelSet.has(id))continue;panelSet.add(id);
  let saved=null;try{saved=localStorage.getItem('pl.panel.'+id)}catch(e){}
  el.open=saved===null?open:saved==='1';el.addEventListener('toggle',()=>{try{localStorage.setItem('pl.panel.'+id,el.open?'1':'0')}catch(e){}})}}
const platState=(configured,state,label,user,error)=>!configured?'<span class="pill">Not set up</span>'
  :`<span class="dstate"><span class="dot ${state==='online'?'':'busy'}"></span><b>${esc(label)}</b>${user?` <span class="mut">as ${esc(user)}</span>`:''}${error?` · <span class="err">${esc(error)}</span>`:''}</span>`;
function renderDiscord(){if(!dState)return;const d=dState,invited=(dGuilds||[]).some(g=>!OTHER(g)),mapped=(d.routes||[]).some(r=>(r.agents||[]).length);
  const tgChats=(dGuilds||[]).some(g=>OTHER(g)&&g.channels.length);
  $('#n-discord').textContent=d.state==='online'?'on':'';
  const label={online:'Online',connecting:'Connecting…',error:'Error',off:'Turned off',unconfigured:'Not set up'}[d.state]||d.state;
  $('#dstatus').innerHTML=platState(d.configured,d.state,label,d.user,d.error);
  const nmap=(d.routes||[]).filter(r=>(r.agents||[]).length).length;$('#mapstatus').innerHTML=nmap?`<span class="pill">${nmap} mapped</span>`:'';
  panels({pdiscord:!d.configured||d.state==='error',pmap:true,popts:false});
  $('#dstep1').classList.toggle('done',d.configured);$('#dstep2').classList.toggle('done',d.configured&&invited);$('#dstep3').classList.toggle('done',(d.routes||[]).some(r=>platOf(r.channel_id)==='discord'&&(r.agents||[]).length));
  $('#tstep3').classList.toggle('done',(d.routes||[]).some(r=>r.channel_id.startsWith('tg:')&&(r.agents||[]).length));
  $('#sstep3').classList.toggle('done',(d.routes||[]).some(r=>r.channel_id.startsWith('slack:')&&(r.agents||[]).length));
  $('#dstep1b').innerHTML=d.configured?`<p class="meta">Token <span class="mono">${esc(d.token_hint)}</span> saved. <button class="ghost small" data-dact="forget">Disconnect</button></p>`
   :`<p class="meta">On the <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">Developer Portal ↗</a>, click <b>New Application</b> and give it a name. Open <b>Bot</b>, click <b>Reset Token</b>, and copy it. Optional: on the same page, turn on <b>Message Content Intent</b> so you can talk to it without @mentioning it every time.</p>
     <form class="addline" id="dtoken"><input type="password" class="mono grow" autocomplete="off" spellcheck="false" placeholder="Bot token" name="token"><button type="submit" ${dBusy?'disabled':''}>${dBusy?'Checking…':'Connect'}</button></form><p class="small err" id="dtokerr"></p>`;
  $('#dstep2b').innerHTML=!d.configured?'':`<p class="meta">${invited?`In ${dGuilds.filter(g=>!OTHER(g)).map(g=>esc(g.name)).join(', ')}. `:`Pick your server on Discord's page, then come back here. This step completes on its own. `}
    ${d.invite_url?`<a href="${esc(d.invite_url)}" target="_blank" rel="noreferrer">${invited?'Invite to another server ↗':'<button>Invite the bot ↗</button>'}</a>`:''}</p>`;
  // What only Discord has stays in its own panel: whether it reads every message, who and which bots can talk, on or off.
  const reading=d.reads_messages?`<p class="meta">Everything you write in a mapped channel goes to every agent that receives there. No @mention needed.</p>`
    :d.message_content_switch?`<p class="meta">The Message Content switch is on in Discord, but the bot connected before it was. <button class="ghost small" data-dact="reconnect">Reconnect now</button></p>`
    :`<p class="meta">${d.message_content_switch===false?'<b>Discord says the Message Content switch is off.</b> ':''}@mention the bot each time, or DM it. To talk without @mentioning, turn on <b>Message Content Intent</b> on the <a href="${d.app_id?`https://discord.com/developers/applications/${esc(d.app_id)}/bot`:'https://discord.com/developers/applications'}" target="_blank" rel="noreferrer">Bot page ↗</a> (under Privileged Gateway Intents) and save. <button class="ghost small" data-dact="check">I turned it on</button></p>`;
  const extra=$('#dextra');if(extra&&!extra.contains(document.activeElement))extra.innerHTML=!d.configured?'':`<h2>Messages</h2>${reading}
    <h2>People who can talk to agents</h2>
    <p class="meta">Only you can, as the bot's owner (or its team's members). Add other people's user IDs here, separated by commas: they can then message agents and answer buttons as you do. To find one, turn on Developer Mode in Discord, right-click the person and choose Copy User ID.</p>
    <div class="addline"><input id="dusers" class="mono" placeholder="e.g. 1562000000000000000" value="${esc((d.allowed_users||[]).join(', '))}" data-dusers style="flex:1;min-width:0"></div>
    <h2>Bots that can post to agents</h2>
    <p class="meta">Other bots are ignored unless listed here. Add their user IDs, separated by commas. To find one, turn on Developer Mode in Discord, right-click the bot and choose Copy User ID. List only bots you control.</p>
    <div class="addline"><input id="dbots" class="mono" placeholder="e.g. 1562000000000000000" value="${esc((d.trusted_bots||[]).join(', '))}" data-dbots style="flex:1;min-width:0"></div>
    <h2>Bot</h2>
    <label class="check"><input type="checkbox" data-dact="enabled" ${d.enabled?'checked':''}> Bot running</label>`;
  if(!(d.configured&&invited)&&!tgChats){$('#dstep3b').innerHTML='<p class="meta">Set up Discord, Telegram, Slack or Agents above; the channels and chats its bot can see are mapped to agents here.</p>';$('#dmore').innerHTML='';return}
  // A mapped channel is a card: its name, then its agents as chips you toggle. Every change saves at once.
  const online=id=>({telegram:tState,slack:sState,agents:aState,discord:d}[platOf(id)]||{}).state==='online';
  const taken=new Set(dDraft.routes.map(r=>r.channel_id).filter(Boolean));
  const rows=dDraft.routes.map((r,i)=>`<div class="mrow">
    <div class="mhead">${r.channel_id?`${platLogo(r.channel_id)}<span class="mname">${esc(chanName(r.channel_id))}</span>
      <button class="ghost small" data-dtest="${esc(r.channel_id)}" ${online(r.channel_id)?'':'disabled'}>Send a test</button>`
      :channelSelect('',`data-droute="${i}" data-dfield="channel_id"`,taken)}
      <button class="linkbtn" data-dremove="${i}" title="Stop using this channel">Remove</button></div>
    <div class="magents">${(r.agents||[]).map((a,j)=>`<span class="magent"><span class="mn" title="${esc(entryLabel(a))}">${esc(entryLabel(a))}</span>
        <button class="tog" aria-pressed="${!!a.receives}" data-dflag="${i}:${j}:receives" title="Your messages here go to it">Receives</button>
        <button class="tog" aria-pressed="${!!a.sends}" data-dflag="${i}:${j}:sends" title="It can post here">Sends</button>
        <button class="x" title="Take it off this channel" aria-label="Remove ${esc(entryLabel(a))}" data-dunagent="${i}:${j}">✕</button></span>`).join('')}
      ${r.channel_id?entrySelect(`data-daddagent="${i}"`,(r.agents||[]).length?'+ agent':'+ Add an agent'):''}</div>${delegRow(r.channel_id)}</div>`).join('');
  const dg=aState&&aState.delegation,hasAg=dDraft.routes.some(r=>String(r.channel_id).startsWith('agents:'));
  $('#dstep3b').innerHTML=`<p class="meta">Your messages go to every agent that <b>receives</b>; to reach just one, reply to its post or start with its name and a colon: <span class="mono">storefront: how's the build?</span> An agent that <b>sends</b> posts its messages and updates there. Changes save as you make them.</p>
    ${dg&&hasAg?`<div class="dgswitch"><label class="check"><input type="checkbox" data-dgswitch ${dg.switch?'checked':''}> <span><b>Outside agents may pass on your approvals.</b> Only the clients and kinds of work you tick on their mapping below, on ${dg.envs.join(' or ')} only, at most ${dg.per_hour} an hour and ${dg.per_day} a day, ${String(dg.hours[0]).padStart(2,'0')}:00–${dg.hours[1]}:00. Each one is posted to you with <b>Undo + revoke</b>. Off, none counts. Prod, money, secrets and deletions always need you.</span></label>${(dg.never_delegate||[]).length?`<div class="small mut" style="margin:6px 0 0 24px" data-dgnever>Never: ${dg.never_delegate.map(n=>`<span class="mono">${esc(n)}</span>`).join(', ')} <span title="Set from ${esc(dg.seed_file||'')} on this machine, not here">(read-only)</span></div>`:''}</div>`:''}
    <div class="mlist2">${rows||'<div class="mut small">No channels mapped yet.</div>'}</div>
    <div class="addline" style="margin-top:10px"><button class="ghost" data-dact="addroute">+ Map a channel</button><button class="ghost" data-dact="refresh" title="Look for new servers and channels">↻ Refresh channels</button><span class="small" id="dsaved"></span></div>
    ${d.configured?`<div class="addline" style="margin-top:12px"><label class="small mut">Direct messages to the Discord bot go to</label>${agentSelect(dDraft.dm,'data-ddm','Nobody (ignored)')}</div>`:''}
    <p class="small mut" style="margin-top:10px">Start a post with <span class="mono">Task:</span> to hand it over as a task, or <span class="mono">Announcement:</span> to tell the receiving agent's whole space.</p>`;
  $('#dmore').innerHTML=`<h2>Talking to your agents</h2>
    <p class="meta">A reaction on your message shows its progress:</p>
    <div class="legend"><span>👀</span><span>delivered to the agent</span><span>🤔</span><span>thinking</span><span>🛠️</span><span>using tools</span><span>❓</span><span>asked you something</span><span>✅</span><span>answered</span></div>
    <p class="meta" style="margin-top:12px">Agents can message you first, labelled with their name. If an agent isn't running, your message waits up to an hour for it.</p>
    <h2>What agents can send</h2>
    <label class="check"><input type="checkbox" data-dopt="buttons" ${d.buttons?'checked':''}> <span><b>Buttons</b> for choices: tap one and it goes back to the agent as your answer. Off, the choices are a numbered list you reply to.</span></label>
    <label class="check"><input type="checkbox" data-dopt="files_out" ${d.files_out?'checked':''}> <span><b>Files from agents:</b> an agent can attach files from this machine to its messages.</span></label>
    <label class="check"><input type="checkbox" data-dopt="files_in" ${d.files_in?'checked':''}> <span><b>Files to agents:</b> what you attach is saved here, under <span class="mono">~/.peerlink/files</span>, and the agent gets the paths.</span></label>
    <div class="addline" style="margin-top:8px"><label class="small mut" for="dmaxmb">Largest file, either way</label><input id="dmaxmb" type="number" min="1" max="500" step="1" value="${esc(d.max_file_mb)}" style="width:90px" data-dopt="max_file_mb"> <span class="small mut">MB (Discord allows 10 MB without Nitro; Telegram bots get files up to 20 MB)</span></div>`}
document.addEventListener('submit',async e=>{if(e.target.id!=='dtoken')return;e.preventDefault();const t=e.target.token.value.trim();if(!t)return;
  dBusy=true;renderDiscord();const r=await api('/api/discord',{method:'PUT',headers:J,body:JSON.stringify({token:t})});dBusy=false;
  if(r.error){renderDiscord();$('#dtokerr').textContent=r.error;return}dGuilds=null;dDraft=null;await loadDiscord()});
// The mapping saves as you change it: the channels that have an agent, and where DMs go. One still being set up
// (no channel or no agent yet) stays on the page until it's complete.
// Delegated approvals: on an Agents client's mapping, whether it may pass on your OK and for which kinds of work.
// Saved at once, from your browser only; the daemon checks every approval against its token and this mapping.
const dgPick={};
function delegRow(cid){const dg=aState&&aState.delegation;if(!dg||!String(cid).startsWith('agents:'))return'';
  const n=String(cid).slice(7),c=(dg.clients||{})[n];if(!c)return'';
  if(c.never)return `<div class="mdeleg small mut">Can't approve for you: ${esc(c.never)}.</div>`;
  const pick=c.on?c.scopes:(dgPick[n]||[]),days=c.on?Math.max(0,Math.ceil((c.expires*1000-Date.now())/86400000)):0;
  return `<div class="mdeleg"><label class="check"><input type="checkbox" data-dgon="${esc(n)}" ${c.on?'checked':''}> <span><b>Can approve for you</b>, from its own token only${c.on?` · ${days} day${days===1?'':'s'} left (ticking a kind renews it for ${dg.grant_days})`:''}${dg.switch?'':' · <span class="mut">the switch above is off</span>'}${c.linked.length?` <span class="pill warn">linked with ${esc(c.linked.join(', '))}</span>`:''}${c.problem?` <span class="pill warn">${esc(c.problem)}</span>`:''}${c.recent?` <span class="mut">${c.recent} in the last day</span>`:''}</span></label>
    <div class="scopes">${dg.scopes.map(sc=>`<label class="check small"><input type="checkbox" data-dgscope="${esc(n)}" value="${esc(sc)}" ${pick.includes(sc)?'checked':''}> <span class="mono">${esc(sc)}</span></label>`).join('')}</div></div>`}
async function dgPut(path,body){const r=await api('/api/agentchannel/delegation'+path,{method:'PUT',headers:J,body:JSON.stringify(body)});
  if(r.error)tell(r.error);await loadAgents();renderDiscord()}
document.addEventListener('change',e=>{const t=e.target;
  if(t.dataset.dgswitch!==undefined)dgPut('',{switch:t.checked});
  const scopesOf=n=>[...document.querySelectorAll(`[data-dgscope="${CSS.escape(n)}"]`)].filter(x=>x.checked).map(x=>x.value);
  if(t.dataset.dgon){const n=t.dataset.dgon,sc=scopesOf(n);
    if(t.checked&&!sc.length){t.checked=false;tell('Tick the kinds of work it may approve first.');return}
    dgPut('/'+encodeURIComponent(n),{on:t.checked,scopes:sc})}
  if(t.dataset.dgscope){const n=t.dataset.dgscope,c=((aState.delegation||{}).clients||{})[n]||{},sc=scopesOf(n);dgPick[n]=sc;
    if(c.on)dgPut('/'+encodeURIComponent(n),{on:sc.length>0,scopes:sc})}});
async function saveMap(){const routes=dDraft.routes.filter(r=>r.channel_id&&(r.agents||[]).length);
  const r=await api('/api/discord',{method:'PUT',headers:J,body:JSON.stringify({routes,dm:dDraft.dm})});
  if(!r.error&&dState){dState.routes=JSON.parse(JSON.stringify(routes));dState.dm=dDraft.dm}
  renderDiscord();const s=$('#dsaved');if(s){s.className='small '+(r.error?'err':'ok');s.textContent=r.error||'Saved'}}
document.addEventListener('change',e=>{const t=e.target;if(!dDraft)return;
  if(t.dataset.droute!==undefined){dDraft.routes[+t.dataset.droute][t.dataset.dfield]=t.value;renderDiscord()}
  if(t.dataset.daddagent!==undefined&&t.value){const r=dDraft.routes[+t.dataset.daddagent];r.agents=r.agents||[];
    // The first agent added receives and sends; after that, one that only posts here is the likelier want.
    const [cwd,name]=t.value.split('\t');
    if(!r.agents.some(a=>a.cwd===cwd&&(a.name||'').toLowerCase()===name.toLowerCase()))r.agents.push({cwd,name,receives:!r.agents.some(a=>a.receives),sends:true});saveMap()}
  if(t.dataset.ddm!==undefined){dDraft.dm=t.value;saveMap()}
  if(t.dataset.dopt){const v=t.type==='checkbox'?t.checked:Number(t.value);api('/api/discord',{method:'PUT',headers:J,body:JSON.stringify({[t.dataset.dopt]:v})}).then(()=>loadDiscord())}
  if(t.dataset.dbots!==undefined)api('/api/discord',{method:'PUT',headers:J,body:JSON.stringify({trusted_bots:t.value})}).then(()=>loadDiscord());
  if(t.dataset.dusers!==undefined)api('/api/discord',{method:'PUT',headers:J,body:JSON.stringify({allowed_users:t.value})}).then(()=>loadDiscord());
  if(t.dataset.dact==='enabled')api('/api/discord',{method:'PUT',headers:J,body:JSON.stringify({enabled:t.checked})}).then(()=>loadDiscord())});
document.addEventListener('click',async e=>{const t=e.target.closest('button');if(!t||!dDraft&&!t.dataset.dact)return;
  if(t.dataset.dremove!==undefined){const r=dDraft.routes[+t.dataset.dremove];
    if(r.channel_id&&(r.agents||[]).length&&!await ask(`Stop using ${chanName(r.channel_id)}? Its agents no longer hear or post there.`))return;
    dDraft.routes.splice(+t.dataset.dremove,1);saveMap()}
  if(t.dataset.dunagent){const [i,j]=t.dataset.dunagent.split(':').map(Number);dDraft.routes[i].agents.splice(j,1);saveMap()}
  if(t.dataset.dflag){const [i,j,f]=t.dataset.dflag.split(':');const a=dDraft.routes[+i].agents[+j];a[f]=!a[f];saveMap()}
  if(t.dataset.dtest){const r=await post('/api/discord/test',{channel_id:t.dataset.dtest});t.textContent=r.error?'Failed':'Sent ✓';if(r.error)tell(r.error)}
  const a=t.dataset.dact;if(!a)return;
  if(a==='addroute'){dDraft.routes.push({channel_id:'',agents:[]});renderDiscord()}
  if(a==='refresh'){const r=await api('/api/discord/channels?fresh=1');dGuilds=r.guilds||[];renderDiscord()}
  if(a==='forget'&&await ask('Disconnect the Discord bot? The channel mapping is kept.')){await api('/api/discord',{method:'DELETE'});dGuilds=null;await loadDiscord()}
  if(a==='reconnect'){await post('/api/discord/reconnect');setTimeout(()=>loadDiscord(),2000)}
  if(a==='check')await loadDiscord(true);
});
// -- Telegram: the bot's token, who may talk to it, and the chats it has heard from ------------------
let tState=null,tBusy=false;
async function loadTelegram(){const before=JSON.stringify(Object.keys(tState?.chats||{}));tState=await api('/api/telegram');renderTelegram();
  // A chat the bot heard from for the first time joins the mapping's picker.
  if(before!==JSON.stringify(Object.keys(tState.chats||{}))&&dState){dGuilds=null;loadDiscord()}}
let tShown=null;
function renderTelegram(){const t=tState;if(!t)return;
  const label={online:'Online',connecting:'Connecting…',error:'Error',off:'Turned off',unconfigured:'Not set up'}[t.state]||t.state;
  $('#tgstatus').innerHTML=platState(t.configured,t.state,label,t.user&&'@'+t.user,t.error)+((t.strangers||[]).length?` <span class="pill warn">${t.strangers.length} waiting</span>`:'');
  // The mapping's test buttons follow the bot's state; redrawn only when it changes, not on every poll mid-edit.
  if(dState&&t.state!==tShown){tShown=t.state;renderDiscord()}
  panels({ptelegram:!t.configured||t.state==='error'||(t.strangers||[]).length>0});
  $('#tstep1').classList.toggle('done',t.configured);$('#tstep2').classList.toggle('done',t.configured&&(t.allowed_users||[]).length>0);
  $('#tstep1b').innerHTML=t.configured?`<p class="meta">Token <span class="mono">${esc(t.token_hint)}</span> saved. <label class="small"><input type="checkbox" data-tact="enabled" ${t.enabled?'checked':''}> Bot running</label> <button class="ghost small" data-tact="forget">Disconnect</button></p>`
   :`<p class="meta">In Telegram, message <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather ↗</a>, send <span class="mono">/newbot</span>, and pick a name and a username. It answers with a token: paste it here.</p>
     <form class="addline" id="ttoken"><input type="password" class="mono grow" autocomplete="off" spellcheck="false" placeholder="123456789:AAE…" name="token"><button type="submit" ${tBusy?'disabled':''}>${tBusy?'Checking…':'Connect'}</button></form><p class="small err" id="ttokerr"></p>`;
  const strangers=(t.strangers||[]).map(x=>`<div class="addline small"><b>${esc(x.name)}</b>${x.username?` @${esc(x.username)}`:''} <span class="mono mut">${esc(x.id)}</span> <span class="mut">in ${esc(x.chat_name||x.chat)}, ${ago(x.ts)} ago</span>
      <button class="small" data-tallow="${esc(x.id)}">Allow</button><button class="ghost small" data-tdismiss="${esc(x.id)}">Dismiss</button></div>`).join('');
  $('#tstep2b').innerHTML=!t.configured?'':`<p class="meta">Open <a href="https://t.me/${esc(t.user)}" target="_blank" rel="noreferrer">@${esc(t.user)} ↗</a> and send it any message. You show up here; allow yourself, and the bot answers you from then on.</p>
    ${strangers?`<p class="meta"><b>Wrote to the bot, not allowed yet:</b></p>${strangers}`:'<p class="small mut">Nobody waiting. This updates by itself.</p>'}
    <p class="meta" style="margin-top:8px">Allowed (Telegram user ids, separated by commas): they can message agents and answer buttons as you do.</p>
    <div class="addline"><input class="mono" placeholder="e.g. 123456789" value="${esc((t.allowed_users||[]).join(', '))}" data-tusers style="flex:1;min-width:0"></div>`;
  $('#tstep3b').innerHTML=!t.configured?'':`<p class="meta">Every chat the bot has heard from, your private chat with it or a group you added it to, is listed under <b>Channel ⇄ Agent Mappings</b>, below.
    ${t.reads_messages?'In groups it reads every message.':'In groups, Telegram shows the bot only commands, @mentions and replies to it. To talk without @mentioning, send <span class="mono">/setprivacy</span> to @BotFather, choose Disable, then remove the bot from the group and add it again.'}
    Commands work too: <span class="mono">/status</span>, <span class="mono">/inbox</span>, <span class="mono">/peerlink run loop 5m check the deploy</span>.</p>`}
document.addEventListener('submit',async e=>{if(e.target.id!=='ttoken')return;e.preventDefault();const tok=e.target.token.value.trim();if(!tok)return;
  tBusy=true;renderTelegram();const r=await api('/api/telegram',{method:'PUT',headers:J,body:JSON.stringify({token:tok})});tBusy=false;
  if(r.error){renderTelegram();$('#ttokerr').textContent=r.error;return}await loadTelegram()});
document.addEventListener('change',e=>{const t=e.target;
  if(t.dataset.tusers!==undefined)api('/api/telegram',{method:'PUT',headers:J,body:JSON.stringify({allowed_users:t.value})}).then(loadTelegram);
  if(t.dataset.tact==='enabled')api('/api/telegram',{method:'PUT',headers:J,body:JSON.stringify({enabled:t.checked})}).then(loadTelegram)});
document.addEventListener('click',async e=>{const t=e.target.closest('button');if(!t)return;
  if(t.dataset.tallow){await api('/api/telegram',{method:'PUT',headers:J,body:JSON.stringify({allow:t.dataset.tallow})});loadTelegram()}
  if(t.dataset.tdismiss){await api('/api/telegram',{method:'PUT',headers:J,body:JSON.stringify({dismiss:t.dataset.tdismiss})});loadTelegram()}
  if(t.dataset.tact==='forget'&&await ask('Disconnect the Telegram bot? The chat mapping and allowed people are kept.')){await api('/api/telegram',{method:'DELETE'});loadTelegram()}});
// -- Slack: the app's two tokens, who may talk to it, and the conversations it is in --------------------
let sState=null,sBusy=false,sShown=null;
async function loadSlack(){const before=JSON.stringify(sState?.chats||{});sState=await api('/api/slack');renderSlack();
  if(before!==JSON.stringify(sState.chats||{})&&dState){dGuilds=null;loadDiscord()}}
function renderSlack(){const t=sState;if(!t)return;
  const label={online:'Online',connecting:'Connecting…',error:'Error',off:'Turned off',unconfigured:'Not set up'}[t.state]||t.state;
  $('#slstatus').innerHTML=platState(t.configured,t.state,label,t.user&&`${t.user}${t.team?' in '+t.team:''}`,t.error)+((t.strangers||[]).length?` <span class="pill warn">${t.strangers.length} waiting</span>`:'');
  if(dState&&t.state!==sShown){sShown=t.state;renderDiscord()}
  panels({pslack:t.configured&&(t.state==='error'||(t.strangers||[]).length>0)});
  $('#sstep1').classList.toggle('done',t.configured);$('#sstep2').classList.toggle('done',t.configured&&(t.allowed_users||[]).length>0);
  // The token form is left alone while it's being filled in: the page polls.
  if(t.configured||!$('#stoken')||sBusy!==($('#stoken').dataset.busy==='1'))$('#sstep1b').innerHTML=t.configured?`<p class="meta">Tokens <span class="mono">${esc(t.token_hint)}</span> and <span class="mono">${esc(t.app_token_hint)}</span> saved. <label class="small"><input type="checkbox" data-sact="enabled" ${t.enabled?'checked':''}> App running</label> <button class="ghost small" data-sact="forget">Disconnect</button></p>`
   :`<p class="meta"><a href="${esc(t.manifest_url)}" target="_blank" rel="noreferrer"><button type="button">Create the app on Slack ↗</button></a> The link fills in everything the app needs; pick your workspace and click <b>Create</b>.</p>
     <p class="meta"><b>App-level token:</b> on the app's <b>Basic Information</b> page, under <b>App-Level Tokens</b>, click <b>Generate Token and Scopes</b>, add the scope <span class="mono">connections:write</span>, and copy the token (it starts <span class="mono">xapp-</span>).</p>
     <p class="meta"><b>Bot token:</b> on <b>Install App</b>, click <b>Install to Workspace</b>, allow it, and copy the <b>Bot User OAuth Token</b> (it starts <span class="mono">xoxb-</span>).</p>
     <form class="addline" id="stoken" data-busy="${sBusy?1:0}"><input type="password" class="mono grow" autocomplete="off" spellcheck="false" placeholder="App-level token, xapp-…" name="app_token"><input type="password" class="mono grow" autocomplete="off" spellcheck="false" placeholder="Bot token, xoxb-…" name="token"><button type="submit" ${sBusy?'disabled':''}>${sBusy?'Checking…':'Connect'}</button></form><p class="small err" id="stokerr"></p>`;
  const strangers=(t.strangers||[]).map(x=>`<div class="addline small"><b>${esc(x.name)}</b> <span class="mono mut">${esc(x.id)}</span> <span class="mut">in ${esc(x.chat_name||x.chat)}, ${ago(x.ts)} ago</span>
      <button class="small" data-sallow="${esc(x.id)}">Allow</button><button class="ghost small" data-sdismiss="${esc(x.id)}">Dismiss</button></div>`).join('');
  if(document.activeElement?.dataset?.susers===undefined)$('#sstep2b').innerHTML=!t.configured?'':`<p class="meta">In Slack, find <b>${esc(t.user||'peerlink')}</b> under <b>Apps</b> and send it any message. You show up here; allow yourself, and it answers you from then on.</p>
    ${strangers?`<p class="meta"><b>Wrote to the app, not allowed yet:</b></p>${strangers}`:'<p class="small mut">Nobody waiting. This updates by itself.</p>'}
    <p class="meta" style="margin-top:8px">Allowed (Slack member ids, separated by commas): they can message agents and answer buttons as you do.</p>
    <div class="addline"><input class="mono" placeholder="e.g. U012AB3CD" value="${esc((t.allowed_users||[]).join(', '))}" data-susers style="flex:1;min-width:0"></div>`;
  $('#sstep3b').innerHTML=!t.configured?'':`<p class="meta">Your direct message with the app, and every channel it's in, is listed under <b>Channel ⇄ Agent Mappings</b>, below. To add it to a channel, type <span class="mono">/invite @${esc(t.user||'peerlink')}</span> there; it reads every message in that channel.
    Commands work too: <span class="mono">/peerlink status</span>, <span class="mono">/peerlink inbox</span>, <span class="mono">/peerlink run loop 5m check the deploy</span>.</p>`}
document.addEventListener('submit',async e=>{if(e.target.id!=='stoken')return;e.preventDefault();const tok=e.target.token.value.trim(),app=e.target.app_token.value.trim();if(!tok||!app){$('#stokerr').textContent='Paste both tokens.';return}
  sBusy=true;const r=await api('/api/slack',{method:'PUT',headers:J,body:JSON.stringify({token:tok,app_token:app})});sBusy=false;
  if(r.error){$('#stokerr').textContent=r.error;return}await loadSlack()});
document.addEventListener('change',e=>{const t=e.target;
  if(t.dataset.susers!==undefined)api('/api/slack',{method:'PUT',headers:J,body:JSON.stringify({allowed_users:t.value})}).then(()=>{t.blur();loadSlack()});
  if(t.dataset.sact==='enabled')api('/api/slack',{method:'PUT',headers:J,body:JSON.stringify({enabled:t.checked})}).then(loadSlack)});
document.addEventListener('click',async e=>{const t=e.target.closest('button');if(!t)return;
  if(t.dataset.sallow){await api('/api/slack',{method:'PUT',headers:J,body:JSON.stringify({allow:t.dataset.sallow})});loadSlack()}
  if(t.dataset.sdismiss){await api('/api/slack',{method:'PUT',headers:J,body:JSON.stringify({dismiss:t.dataset.sdismiss})});loadSlack()}
  if(t.dataset.sact==='forget'&&await ask('Disconnect the Slack app? The channel mapping and allowed people are kept.')){await api('/api/slack',{method:'DELETE'});loadSlack()}});
// Someone messaging the bot, or a chat it joins, shows up without a reload.
setInterval(()=>{if(location.hash==='#channels'&&tState?.configured&&!document.hidden)loadTelegram()},4000);
setInterval(()=>{if(location.hash==='#channels'&&!document.hidden&&(sState?.configured||!sState))loadSlack()},4000);
// -- Agents: outside agents over MCP. Clients are added with the CLI (the token never passes through here); where they
// land, the switch and the port are set here, and a client can be switched off or revoked here.
let aState=null,aShown=null;
async function loadAgents(){const before=JSON.stringify((aState?.clients||[]).map(c=>c.name));aState=await api('/api/agentchannel');renderAgents();
  if(before!==JSON.stringify((aState.clients||[]).map(c=>c.name))&&dState){dGuilds=null;loadDiscord()}}
function renderAgents(){const a=aState;if(!a||a.error===undefined&&!a.state)return;
  const label={online:'Online',off:'Turned off',error:'Error',unconfigured:'No clients'}[a.state]||a.state;
  $('#agstatus').innerHTML=platState(a.clients.length>0||a.registration,a.state,label,a.state==='online'&&`127.0.0.1:${a.port}`,a.error)+((a.pending||[]).length?` <span class="pill warn">${a.pending.length} waiting</span>`:'');
  panels({pagents:(a.pending||[]).length>0});
  if(dState&&a.state!==aShown){aShown=a.state;renderDiscord()}
  if(document.activeElement&&$('#agbody').contains(document.activeElement))return;
  const rows=a.clients.map(c=>`<div class="addline small"><b class="mono">${esc(c.name)}</b>
      <label class="small"><input type="checkbox" data-agon="${esc(c.name)}" ${c.enabled?'checked':''}> On</label>
      <label class="small">Posts per minute <input type="number" min="1" max="120" value="${c.rate_per_min}" data-agrate="${esc(c.name)}" style="width:64px"></label>
      <label class="small" title="Clients it messages straight, with post_to_client, and that message it. Nobody here reads those.">Linked with <input type="text" value="${esc((c.links||[]).join(', '))}" data-aglinks="${esc(c.name)}" placeholder="none" style="width:120px"></label>
      <span class="mut">added ${esc((c.added||'').slice(0,10))}</span>${c.mapped?'':' <span class="pill warn">no agent receives it</span>'}
      <button class="ghost small" data-agrevoke="${esc(c.name)}">Revoke</button></div>`).join('');
  $('#agbody').innerHTML=`<h2>Where new clients land</h2>
    <p class="meta">A new client is mapped to this agent, which receives its posts. Change one client's agents under <b>Channel ⇄ Agent Mappings</b>, below.</p>
    <div class="addline">${agentSelect(a.default_to,'data-agto style="flex:1;min-width:0"','Pick an agent…')}</div>
    <h2>Asking to connect</h2>
    <label class="check"><input type="checkbox" data-agact="registration" ${a.registration?'checked':''}> Accept registrations</label>
    <p class="meta">A client sends its name and its token's hash to <span class="mono">/register</span> and gets a pairing code. Approve only a request whose code its owner told you themselves.</p>
    ${(a.pending||[]).map(p=>`<div class="addline small"><b class="mono">${esc(p.name)}</b> <span class="mono">${esc(p.code)}</span>
      <span class="mut">from ${esc(p.ip)}, ${ago(p.ts)} ago</span>
      <button class="small" data-agapprove="${esc(p.code)}">Approve</button><button class="ghost small" data-agdismiss="${esc(p.code)}">Dismiss</button></div>`).join('')
      ||`<p class="small mut">${a.registration?'Nobody waiting. This updates by itself.':'Registrations are off.'}</p>`}
    <h2>Clients</h2>${rows||'<p class="small mut">None yet.</p>'}
    <p class="meta" style="margin-top:8px">Or add one in a shell. The token stays in its file, made there if it doesn't exist (mode 600), and only its hash reaches peerlink:<br>
    <span class="mono">peerlink agents add &lt;name&gt; --token-file &lt;file&gt;</span>. Revoke with <span class="mono">peerlink agents revoke &lt;name&gt;</span> or the button above.</p>
    <h2>Endpoint</h2>
    <p class="meta">MCP (Streamable HTTP) at <span class="mono">http://127.0.0.1:${a.port}/mcp</span>, health at <span class="mono">/healthz</span>, listening on this machine only: put a tunnel with its own access control in front of it. Every call is logged to <span class="mono">~/.peerlink/agents/audit.jsonl</span>.</p>
    <label class="check"><input type="checkbox" data-agact="enabled" ${a.enabled?'checked':''}> Channel on</label>`}
const agPut=(path,body)=>api('/api/agentchannel'+path,{method:'PUT',headers:J,body:JSON.stringify(body)});
document.addEventListener('change',e=>{const t=e.target;
  if(t.dataset.agto!==undefined)agPut('',{default_to:t.value}).then(()=>{t.blur();loadAgents()});
  if(t.dataset.agact==='enabled')agPut('',{enabled:t.checked}).then(loadAgents);
  if(t.dataset.agact==='registration')agPut('',{registration:t.checked}).then(loadAgents);
  if(t.dataset.agon)agPut('/clients/'+encodeURIComponent(t.dataset.agon),{enabled:t.checked}).then(loadAgents);
  if(t.dataset.aglinks)agPut('/clients/'+encodeURIComponent(t.dataset.aglinks),{links:t.value.split(',').map(x=>x.trim()).filter(Boolean)}).then(r=>{if(r.error)tell(r.error);t.blur();loadAgents()});
  if(t.dataset.agrate)agPut('/clients/'+encodeURIComponent(t.dataset.agrate),{rate_per_min:+t.value}).then(()=>{t.blur();loadAgents()})});
document.addEventListener('click',async e=>{const t=e.target.closest('button');if(!t)return;
  if(t.dataset.agapprove&&await ask(`Approve the request with code ${t.dataset.agapprove}? Only if its owner told you that code themselves.`,{ok:'Approve'})){
    const r=await agPut('',{approve:t.dataset.agapprove});if(r.error)tell(r.error);loadAgents()}
  if(t.dataset.agdismiss){await agPut('',{dismiss:t.dataset.agdismiss});loadAgents()}
  if(t.dataset.agrevoke&&await ask(`Revoke ${t.dataset.agrevoke}? Its token stops working at once, and its chat's mapping is removed.`,{ok:'Revoke'})){
    await api('/api/agentchannel/clients/'+encodeURIComponent(t.dataset.agrevoke),{method:'DELETE'});loadAgents()}});
setInterval(()=>{if(location.hash==='#channels'&&!document.hidden)loadAgents()},5000);
// Invited in another tab, or back from the Developer Portal: look again when this tab gets focus.
window.addEventListener('focus',()=>{if(location.hash==='#channels'&&dState?.configured){dGuilds=null;loadDiscord(true)}});
window.addEventListener('hashchange',()=>{if(location.hash==='#discord')location.hash='#channels';if(location.hash==='#channels'){loadDiscord();loadTelegram();loadSlack();loadAgents()}});

// Standing rules, on their own page: yours to add, change, turn off or delete; an agent's proposal to approve.
let allRules=[];
async function loadRules(){const r=await api('/api/rules');if(!r||r.error)return;allRules=r.rules||[];
  // The nav counts proposals waiting for you, highlighted, else the rules in force.
  const waiting=allRules.filter(x=>x.status==='pending').length,cnt=$('#n-rules');
  cnt.textContent=waiting||allRules.filter(x=>x.status==='active').length||'';cnt.classList.toggle('hot',!!waiting);
  const spaces=[...new Set([...livePeers.map(x=>x.space).filter(Boolean),...allRules.map(x=>x.space).filter(x=>x!=='*')])].sort();
  const sopts=sel=>`<option value="*" ${sel==='*'?'selected':''}>Every space</option>`+spaces.map(n=>`<option value="${esc(n)}" ${sel===n?'selected':''}>${esc(n)}</option>`).join('');
  const sel=$('#rulespace');if(sel&&document.activeElement!==sel){const was=sel.value||'*';sel.innerHTML=sopts(was)}
  if(document.activeElement&&document.activeElement.closest('#rulelist'))return;
  const row=x=>x.status==='pending'?`<div class="rule" data-rule="${esc(x.id)}"><span class="pill warn">needs approval</span><span class="grow"><b>${esc(x.by)}</b> proposes for <b>${esc(x.space==='*'?'every space':x.space)}</b>: ${esc(x.text)}</span><button data-ruleok="approve">Approve</button><button class="ghost" data-ruleok="deny">Deny</button></div>`
    :`<div class="rule${x.status==='off'?' off':''}" data-rule="${esc(x.id)}"><select data-rulespace aria-label="Space">${sopts(x.space)}</select><input type="text" data-ruletext value="${esc(x.text)}" maxlength="600" aria-label="Rule ${esc(x.id)}"><span class="small mut">${esc(x.id)}${x.by?' · '+esc(x.by):''}</span><button class="ghost small" data-ruleset="${x.status==='off'?'active':'off'}">${x.status==='off'?'Turn on':'Turn off'}</button><button class="ghost small danger" data-ruledel>Delete</button></div>`;
  const shown=allRules.filter(x=>['pending','active','off'].includes(x.status)).sort((a,b)=>(a.status==='pending'?0:1)-(b.status==='pending'?0:1)||a.created-b.created);
  $('#rulelist').innerHTML=shown.map(row).join('')||'<div class="empty">No rules yet.</div>'}
const ruleOf=e=>e.target.closest('[data-rule]')?.dataset.rule;
document.addEventListener('submit',async e=>{if(e.target.id!=='ruleform')return;e.preventDefault();const f=e.target;
  const r=await post('/api/rules',{space:f.elements.space.value,text:f.elements.text.value});$('#rulemsg').textContent=r.error||'';if(!r.error)f.elements.text.value='';loadRules()});
document.addEventListener('click',async e=>{const id=ruleOf(e);if(!id)return;const b=e.target.closest('button');if(!b)return;let r;
  if(b.dataset.ruleok)r=await post('/api/inbox',{kind:'approval',id,action:b.dataset.ruleok});
  else if(b.dataset.ruleset)r=await post('/api/rules/'+encodeURIComponent(id),{status:b.dataset.ruleset});
  else if(b.dataset.ruledel!==undefined){if(!await ask('Delete this rule? Agents stop getting it from their next prompt.'))return;r=await post('/api/rules/'+encodeURIComponent(id),{delete:true})}
  if(r&&r.error)tell(r.error);b.blur();loadRules();refresh(true)});
document.addEventListener('change',async e=>{const id=ruleOf(e);if(!id)return;const t=e.target;
  const r=t.dataset.ruletext!==undefined?await post('/api/rules/'+encodeURIComponent(id),{text:t.value}):t.dataset.rulespace!==undefined?await post('/api/rules/'+encodeURIComponent(id),{space:t.value}):null;
  if(r&&r.error)tell(r.error);t.blur();loadRules()});
window.addEventListener('hashchange',()=>{if(location.hash==='#rules')loadRules()});
// On the Rules page every 5s; elsewhere every minute, for the count in the nav.
let rulesAt=0;loadRules().catch(()=>{});
setInterval(()=>{if(document.hidden)return;const n=Date.now();if(location.hash==='#rules'||n-rulesAt>60000){rulesAt=n;loadRules().catch(()=>{})}},5000);
async function loadCfg(){cfg=await api('/api/config');if(cfg.error&&cfg.max_hops===undefined)throw new Error('!'+cfg.error);const f=$('#cfg');
  panels({swake:true,sctx:true,sapprove:true,ssee:false,sguide:false,slimits:false,sremote:!!(cfg.remotes||[]).length});
  for(const el of f.elements){if(!el.name)continue;const v=cfg[el.name];
    if(el.type==='checkbox')el.checked=!!v;else if(el.name==='remotes')el.value=(v||[]).join('\n');else el.value=v??''}
  $('#guidance').placeholder=cfg.default_guidance||'';
}
$('#cfg').addEventListener('submit',async e=>{e.preventDefault();const f=e.target,b={};
  for(const el of f.elements){if(!el.name)continue;
    b[el.name]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.name==='remotes'?el.value.split('\n').map(s=>s.trim()).filter(Boolean):el.value}
  const r=await api('/api/config',{method:'PUT',headers:J,body:JSON.stringify(b)});
  if(r&&r.error){$('#saved').textContent='Not saved: '+r.error;return}
  cfg=r;$('#saved').textContent='Saved '+new Date().toLocaleTimeString()});
