// setup.js: the Setup page. What you set up once and rarely visit: Spaces, Rules, Channels, Settings, Controls and
// Feedback. #setup is an overview, one card per section, each row with its current value; #setup/<section> is the
// section. On a phone the overview and a section are two screens with a Back; from 900px a rail lists the sections.
// Everything here lives inside this one function, so no top-level name reaches the other pages' scripts.
(()=>{
const SECS=[['spaces','Spaces'],['rules','Rules'],['channels','Channels'],['settings','Settings'],['controls','Controls'],['feedback','Feedback']];
const SUB={spaces:'Who leads each space, and which space it sits inside',rules:'What every agent in a space is told for good',
  channels:'Talk to your agents from Discord, Telegram, Slack or other agents',settings:'Changes reach every agent within a few seconds',
  controls:'The daemon, its key and the browsers signed in',feedback:'Bugs and ideas agents report about peerlink'};
// Page state: the section shown, data not in the snapshot (rules, channels), the feedback filters, the open sheet.
const S={sec:null,rules:[],rulesAt:0,ch:{d:null,g:null,t:null,s:null,a:null,at:0,sig:''},
  fb:{st:PL.pref('setup.fbst','needs'),ty:PL.pref('setup.fbty','')},sheet:null,live:null,dgPick:{}};
const enc=encodeURIComponent,C=()=>PL.state?.cfg||cfg;
const ACT={},TOG={};  // click handlers by data-su name, switch handlers by data-su-tog name

PL.page('setup',{title:'Setup',sections:SECS,
  icons:{spaces:'spaces',rules:'rules',channels:'channels',settings:'settings',controls:'controls',feedback:'feedback'},
  html:`<div class="su"><nav class="su-rail" id="su-rail" aria-label="Setup sections"></nav><div class="su-main">
<header class="su-head" id="su-head"></header>
<div class="su-sec" data-sec="" id="su-over"></div>
<div class="su-sec" data-sec="spaces" id="su-spaces" hidden></div>
<div class="su-sec" data-sec="rules" id="su-rules" hidden></div>
<div class="su-sec" data-sec="channels" id="su-channels" hidden></div>
<div class="su-sec" data-sec="settings" id="su-settings" hidden></div>
<div class="su-sec" data-sec="controls" id="su-controls" hidden></div>
<div class="su-sec" data-sec="feedback" id="su-feedback" hidden></div>
<div class="su-sec" data-sec="?" id="su-none" hidden></div></div></div>`,
  // The gear's count: rule proposals and new feedback, both waiting on you.
  count:st=>(S.rules.filter(x=>x.status==='pending').length+st.issues.filter(f=>f.status==='new').length)||'',
  render:(st,route)=>renderSetup(st,route),
  unmount(){if(S.sheet&&PL.sheet.isOpen())S.sheet.close();S.sec=null}});

// ---- Small builders ----------------------------------------------------------------------------------------------
// The shell's switch (PL.switch): a button, so it never holds a region the way a changed field does.
const sw=PL.switch;
// A grouped-list row (PL.row): a link (href), a button that runs ACT[act] (act), or a plain row. title/sub/value are HTML.
const row=({act,arg,chev,attrs='',...r})=>PL.row({...r,button:!!act,chevron:chev??!!(r.href||act),
  attrs:(act?`data-su="${esc(act)}"${arg!=null?` data-arg="${esc(arg)}"`:''} `:'')+attrs});
// A row whose whole width flips a switch (TOG[tog]), the shell's PL.switchRow.
const togRow=({tog,arg='',...r})=>PL.switchRow({...r,attrs:`data-su-tog="${esc(tog)}" data-arg="${esc(arg)}"`});
const card=(label,rows,extra='')=>`<section class="su-card">${label?`<div class="su-card-h">${PL.label(label)}${extra}</div>`:''}${PL.group(rows)}</section>`;
const plural=PL.plural;
const logoTile=plat=>{const [,color,logo]=PLAT[plat];return `<span class="tile su-logo" style="background:${color}">${logo}</span>`};
// Opens a sheet and remembers it: the page closes it when you leave Setup, and a sheet with live parts is repainted
// (S.live) when the data behind it changes.
function sheet(opts){const h=PL.sheet.open({...opts,onClose:()=>{if(S.sheet===h){S.sheet=null;S.live=null}opts.onClose?.()}});S.sheet=h;S.live=null;return h}
const field=PL.field;
async function put(path,body){const r=await PL.put(path,body);if(r&&r.error)PL.toast(r.error,{kind:'bad'});return r}

// ---- The frame: rail, header, sections ---------------------------------------------------------------------------
function renderSetup(st,route){const known=!route.id||SECS.some(([k])=>k===route.id),sec=known?route.id:'?';
  if(sec!==S.sec){const was=S.sec;S.sec=sec;
    if(sec==='channels'||sec==='')chLoad(true).catch(()=>{});
    if(sec==='rules'||sec==='')loadRules().catch(()=>{});
    if(was!==null)scrollTo(0,0)}
  document.querySelectorAll('#page-setup .su-sec').forEach(d=>d.hidden=d.dataset.sec!==sec);
  PL.paint($('#su-rail'),rail(st));head(st);
  ({'':overview,spaces:renderSpaces,rules:renderRules,channels:renderChannels,settings:renderSettings,controls:renderControls,feedback:renderFeedback,
    '?':()=>PL.paint($('#su-none'),PL.empty({icon:'setup',title:'No such section',text:'Setup has Spaces, Rules, Channels, Settings, Controls and Feedback.',action:{label:'Back to Setup',href:'#setup'}}))})[sec](st)}
const waiting=()=>{const c=S.ch;return (c.t?.strangers||[]).length+(c.s?.strangers||[]).length+(c.a?.pending||[]).length};
const secCount=(k,st)=>k==='rules'?S.rules.filter(r=>r.status==='pending').length:k==='feedback'?st.issues.filter(f=>f.status==='new').length:k==='channels'?waiting():0;
const rail=st=>`<a class="su-ni${S.sec===''?' on':''}" href="#setup"${S.sec===''?' aria-current="page"':''}>${PL.icon('setup',18)}<span>Overview</span></a>`
  +SECS.map(([k,t])=>`<a class="su-ni${S.sec===k?' on':''}" href="#setup/${k}"${S.sec===k?' aria-current="page"':''}>${PL.icon(k,18)}<span>${t}</span><span class="count${secCount(k,st)?' su-hot':''}">${secCount(k,st)||''}</span></a>`).join('');
function head(st){const sec=S.sec,t=sec==='?'?'Setup':sec?SECS.find(x=>x[0]===sec)[1]:'Setup';
  const sub=sec&&sec!=='?'?SUB[sec]:`${st.status.host} · daemon ${st.status.version}`;
  const acts=(sec==='rules'?`<button type="button" class="btn btn-out sm" data-su="ruleadd">${PL.icon('plus',18)}Add rule</button>`:'')
    +(sec==='?'?'':PL.helpBtn(`How ${t} works`,`data-su="help" data-arg="${sec}"`));
  PL.paint($('#su-head'),`${sec?`<a class="icon-btn su-back" href="#setup" aria-label="Back to Setup">${PL.icon('back',22)}</a>`:''}<div class="su-ht"><h1>${esc(t)}</h1><p>${esc(sub)}</p></div><div class="su-hact">${acts}</div>`)}

// ---- Overview ----------------------------------------------------------------------------------------------------
function overview(st){const sp=spaceInfo(st),c=S.ch,set=C();
  const nested=sp.list.filter(x=>x.parent).map(x=>`${x.name} inside ${x.parent}`),un=(sp.groups.default||[]).length;
  const rAct=S.rules.filter(r=>r.status==='active').length,rOff=S.rules.filter(r=>r.status==='off').length,rPend=S.rules.filter(r=>r.status==='pending').length;
  const fbNew=st.issues.filter(f=>f.status==='new').length,fbAcc=st.issues.filter(f=>f.status==='accepted').length;
  const spaces=card('Spaces',row({href:'#setup/spaces',icon:'spaces',title:'Spaces',sub:esc([...nested,un?plural(un,'agent')+' unassigned':''].filter(Boolean).join(' · ')||'Which agents can see and message each other'),value:esc(plural(sp.list.length,'space'))}));
  const rules=card('Rules',row({href:'#setup/rules',icon:'rules',title:'Rules',sub:rPend?`<span class="su-warn">${plural(rPend,'proposal')} waiting for approval</span>`:'What every agent in a space is told for good',
    value:(rPend?PL.badge('warn',rPend+' to approve')+' ':'')+esc(plural(rAct,'rule')+(rOff?` · ${rOff} off`:''))}));
  const chans=card('Channels',c.d?PLATS.map(p=>row({href:'#setup/channels',tile:logoTile(p),title:PNAME[p],sub:esc(platSub(p)),value:platBadge(p)})).join('')
    :row({href:'#setup/channels',icon:'channels',title:'Channels',sub:'Discord, Telegram, Slack and outside agents',value:'<span class="mut">Loading…</span>'}));
  const sets=card('Settings',togRow({tog:'cfg',arg:'auto_wake_idle',on:set.auto_wake_idle,title:'Wake idle agents when a message arrives'})
    +togRow({tog:'cfg',arg:'clear_between_tasks',on:set.clear_between_tasks,title:'Clear context after each task'})
    +togRow({tog:'cfg',arg:'auto_approve_all',on:set.auto_approve_all,title:'Agents start agents and schedules without asking'})
    +alertsRow()
    +row({href:'#setup/settings',icon:'settings',title:'All settings',sub:esc(`Wake for ${set.wake_for==='all'?'every message':'questions, tasks and answers'} · ${set.wake_delay_s??0} s wait · context nudge ${set.clear_nudge_tokens?fmtNum(set.clear_nudge_tokens)+' tokens':'off'}`)}));
  const fb=card('Feedback',row({href:'#setup/feedback',icon:'feedback',title:'Feedback',sub:esc(fbAcc?`${fbAcc} accepted, with the peerlink agent`:'Bugs and ideas agents report about peerlink'),value:fbNew?PL.badge('warn',fbNew+' new'):'<span class="mut">None new</span>'}));
  const ctl=card('Controls',row({href:'#setup/controls',icon:'controls',title:'Daemon',sub:esc(st.status.host),value:`<span class="mono">${esc(st.status.version)}</span>`})
    +row({href:'#setup/controls',icon:'key',title:'Key',value:`<span class="mono su-ell">${esc(keyPath(st))}</span>`})
    +row({href:'#setup/controls',icon:'agents',title:'Browsers',value:esc(st.status.browsers+' signed in')}));
  PL.paint($('#su-over'),`<div class="su-cards">${spaces}${rules}${chans}${sets}${fb}${ctl}</div>`)}
// The key's file, with the home folder as ~ (a Windows home too).
const keyPath=st=>String(st.status.home||'').replace(/\\/g,'/').replace(/^([a-z]:)?\/Users\/[^/]+/i,'~')+'/key';
const fmtNum=n=>Number(n)>=10000&&Number(n)%1000===0?Number(n)/1000+'k':Number(n).toLocaleString();

// ---- Spaces ------------------------------------------------------------------------------------------------------
// Every named space in tree order (a space after the one it sits inside), from the shared org tree.
function spaceInfo(st){const o=PL.org(st),groups=o.groups,leads=st.leads||{};
  const names=[...new Set([...Object.keys(groups),...Object.keys(leads)])].filter(n=>n&&n!=='default').sort();
  const parentOf=n=>(groups[n]||[]).find(x=>x.space_parent)?.space_parent||leads[n]?.parent||'';
  const kids={};for(const n of names){const p=parentOf(n);if(p&&p!==n&&names.includes(p))(kids[p]??=[]).push(n)}
  const list=[],seen=new Set(),walk=(n,d)=>{if(seen.has(n))return;seen.add(n);list.push({name:n,depth:d,parent:parentOf(n)});for(const k of kids[n]||[])walk(k,d+1)};
  for(const n of names)if(!names.includes(parentOf(n)))walk(n,0);
  for(const n of names)walk(n,0);  // spaces caught in a loop of parents
  return {o,groups,leads,names,list,parentOf,kids}}
function renderSpaces(st){const info=spaceInfo(st),{groups,leads,o,kids}=info;
  const card1=x=>{const n=x.name,l=leads[n],live=(groups[n]||[]).filter(a=>a.leads);
    const lead=l?(live.length?live.map(a=>PL.agentLink(a.id,a.name)).join(', '):`${esc(l.name)} ${PL.badge('mut','offline')}`)+` <span class="mut">· ${l.how==='set'?'you picked it':'the only agent in it'}</span>`
      :`<span class="su-warn">No lead</span> <span class="mut">· work sent to ${esc(n)} has nobody to go to</span>`;
    const mem=[...(groups[n]||[]).filter(a=>!a.leads).map(a=>PL.agentLink(a.id,a.name)),...(o.joined[n]||[]).map(a=>`${PL.agentLink(a.id,a.name)} <span class="mut">(from ${esc(a.space==='default'?'unassigned':a.space)})</span>`)];
    return `<article class="card su-space${x.depth?' nested':''}" style="--d:${x.depth}">
      <div class="su-sp-h"><span class="tile">${PL.icon('spaces')}</span><div class="su-sp-t"><b>${esc(n)}</b>${x.parent?PL.badge('info','inside '+x.parent):PL.badge('mut','top level')}</div>
      <button type="button" class="btn btn-out sm" data-su="space" data-arg="${esc(n)}">Edit</button></div>
      <dl class="su-kv"><dt>Lead</dt><dd>${lead}</dd><dt>Members</dt><dd>${mem.join(', ')||'<span class="mut">none besides the lead</span>'}</dd>
      ${(kids[n]||[]).length?`<dt>Inside it</dt><dd>${kids[n].map(k=>esc(k)).join(', ')}</dd>`:''}</dl></article>`};
  const un=groups.default||[];
  const unCard=`<article class="card su-space su-un"><div class="su-sp-h"><span class="tile">${PL.icon('agents')}</span><div class="su-sp-t"><b>Unassigned</b>${PL.badge('mut','no space')}</div></div>
    <dl class="su-kv"><dt>Agents</dt><dd>${un.map(a=>PL.agentLink(a.id,a.name)).join(', ')||'<span class="mut">none live</span>'}</dd></dl>
    <p class="small mut su-un-p">Agents whose folder has no space. Put one in a space from its page on Agents.</p></article>`;
  PL.paint($('#su-spaces'),(info.list.length?`<div class="su-spaces">${info.list.map(card1).join('')}</div>`
    :PL.empty({icon:'spaces',title:'No spaces yet',text:'A space starts when you put an agent in it, from the agent’s page on Agents.',action:{label:'Open Agents',href:'#agents'}}))
    +`<div class="su-spaces su-un-wrap">${unCard}</div>`)}
ACT.space=n=>{const st=PL.state,info=spaceInfo(st),l=info.leads[n],agents=(info.groups[n]||[]).filter(a=>!a.remote);
  const cur=l?agents.find(a=>a.cwd===l.cwd&&a.name===l.name)||agents.find(a=>a.cwd===l.cwd):null;
  const curVal=cur?cur.cwd+'\t'+cur.id:l?'keep':'';
  const same=a=>agents.filter(b=>b.name===a.name).length>1;
  const opts=`<option value="">No lead</option>`+agents.map(a=>`<option value="${esc(a.cwd+'\t'+a.id)}"${cur&&cur.id===a.id?' selected':''}>${esc(a.name)}${same(a)?' · '+esc(PL.tilde(a.cwd)):''}</option>`).join('')
    +(l&&!cur?`<option value="keep" selected>${esc(l.name)} (offline)</option>`:'');
  const up=info.parentOf(n),others=[...new Set([...info.names,...Object.keys(info.leads)])].filter(o=>o!==n&&o!=='default').sort();
  sheet({title:n,saveLabel:'Save',body:field('Lead',`<select name="lead">${opts}</select>`,`Work sent to ${esc(n)} goes to its lead, which decides who does it. Any live agent in the space can lead it.`)
    +field('Sits inside',`<select name="parent"><option value="">Top level</option>${others.map(o=>`<option${o===up?' selected':''}>${esc(o)}</option>`).join('')}</select>`,'Its lead then sits with that space’s agents and speaks for it there.')
    +`<div class="dz"><button type="button" class="btn btn-danger sm" data-su="spacedel" data-arg="${esc(n)}">Delete ${esc(n)}</button><span class="hint">Its agents go back to their .peerlink space or unassigned, and spaces inside it move to the top.</span></div>`,
    onSave:async f=>{const lv=f.elements.lead.value,pv=f.elements.parent.value,done=[];
      if(lv!=='keep'&&lv!==curVal){const [cwd,id]=lv.split('\t');const r=await post(`/api/spaces/${enc(n)}/lead`,lv?{cwd,id}:{cwd:''});if(r.error)return r.error;
        done.push(lv?`${agents.find(a=>a.id===id)?.name||'it'} leads ${n}`:`${n} has no lead`)}
      if(pv!==up){const r=await post(`/api/spaces/${enc(n)}/parent`,{parent:pv});if(r.error)return r.error;done.push(pv?`${n} sits inside ${pv}`:`${n} is at the top level`)}
      if(done.length){PL.toast(done.join(' · '));refresh(true)}}})};
ACT.spacedel=async n=>{if(!await ask(`Delete the ${n} space? Its agents go back to their .peerlink space or unassigned, and spaces inside it move to the top.`))return;
  const r=await post(`/api/spaces/${enc(n)}/delete`);if(r.error)return tell(r.error);S.sheet?.close();
  const f=r.still_in_files||[];
  if(f.length)tell(`Deleted. The .peerlink in ${f.join(', ')} still name${f.length===1?'s':''} ${n}, so the agents there stay in it until you change ${f.length===1?'that file':'those files'}.`);
  else PL.toast(`Deleted the ${n} space`);refresh(true)};

// ---- Rules -------------------------------------------------------------------------------------------------------
async function loadRules(){const r=await api('/api/rules');if(!r||r.error)return;S.rulesAt=Date.now();
  const had=JSON.stringify(S.rules);S.rules=r.rules||[];if(had!==JSON.stringify(S.rules))PL.render()}
const scopeName=s=>s==='*'?'Every space':s;
const ruleSpaces=()=>[...new Set([...PL.state.peers.map(x=>x.space),...Object.keys(PL.state.leads||{}),...S.rules.map(x=>x.space)])].filter(n=>n&&n!=='*'&&n!=='default').sort();
function renderRules(){const pend=S.rules.filter(r=>r.status==='pending').sort((a,b)=>a.created-b.created),
    list=S.rules.filter(r=>r.status==='active'||r.status==='off').sort((a,b)=>a.created-b.created);
  const prop=r=>`<article class="card su-prop"><div class="su-meta">${PL.badge('warn','Proposed')}<span><b>${PL.agentLink(r.by)}</b> for <b>${esc(scopeName(r.space))}</b> · ${PL.ago(r.created)} ago</span></div>
    <p class="su-prop-t">${esc(r.text)}</p><div class="su-acts"><button type="button" class="btn btn-solid sm" data-su="ruleok" data-arg="${esc(r.id)}" data-ok="approve">Approve</button><button type="button" class="btn btn-soft sm" data-su="ruleok" data-arg="${esc(r.id)}" data-ok="deny">Deny</button></div></article>`;
  const one=r=>`<div class="row su-rule${r.status==='off'?' off':''}"><span class="row-main"><span class="row-t">${esc(r.text)}</span>
    <span class="row-s">${PL.badge(r.space==='*'?'acc':'mut',scopeName(r.space))} · ${r.by?`by ${PL.agentLink(r.by)} · `:''}${PL.ago(r.created)} ago${r.status==='off'?' · off':''} · <button type="button" class="su-link" data-su="ruleedit" data-arg="${esc(r.id)}">Edit</button></span></span>
    <span class="row-v">${sw(r.status==='active',`Rule ${r.id} on`,`data-su-tog="rule" data-arg="${esc(r.id)}"`)}</span></div>`;
  PL.paint($('#su-rules'),(pend.length?`${PL.label('Waiting for your approval')}<div class="su-stack">${pend.map(prop).join('')}</div>`:'')
    +(list.length?(pend.length?PL.label('Rules'):'')+PL.group(list.map(one).join(''))
      :pend.length?'':PL.empty({icon:'rules',title:'No rules yet',text:'A rule reaches every agent in its space and the spaces inside it, even after it clears its context.',action:{label:'Add a rule',attrs:'data-su="ruleadd"'}})))}
ACT.ruleok=async(id,b)=>{const ok=b.dataset.ok;const r=await post('/api/inbox',{kind:'approval',id,action:ok});
  if(r.error)PL.toast(r.error,{kind:'bad'});else PL.toast(ok==='approve'?`Rule ${id} approved: agents get it from their next prompt`:`Rule ${id} denied`);
  await loadRules();refresh(true)};
TOG.rule=async(id,on)=>{const set=async v=>{const r=await post('/api/rules/'+enc(id),{status:v?'active':'off'});if(r.error)PL.toast(r.error,{kind:'bad'});await loadRules();return !r.error};
  return await set(on)&&!!PL.toast(on?`Rule ${id} on`:`Rule ${id} off: agents stop getting it`,{undo:()=>set(!on)})};
const ruleForm=(r={space:'*',text:''})=>field('Rule',`<textarea name="text" maxlength="600" rows="4" required placeholder="Never merge to main on a Friday">${esc(r.text)}</textarea>`,'A sentence or two. Every agent it reaches has it in its instructions.')
  +field('For',`<select name="space"><option value="*"${r.space==='*'?' selected':''}>Every space</option>${ruleSpaces().map(n=>`<option${r.space===n?' selected':''}>${esc(n)}</option>`).join('')}</select>`,'A space’s rule also reaches the spaces inside it.');
ACT.ruleadd=()=>sheet({title:'Add a rule',saveLabel:'Add rule',body:ruleForm(),onSave:async f=>{
  const r=await post('/api/rules',{space:f.elements.space.value,text:f.elements.text.value});if(r.error)return r.error;
  PL.toast('Rule added: agents get it from their next prompt');await loadRules()}});
ACT.ruleedit=id=>{const r=S.rules.find(x=>x.id===id);if(!r)return;
  sheet({title:`Rule ${id}`,body:ruleForm(r)+`<div class="dz"><button type="button" class="btn btn-danger sm" data-su="ruledel" data-arg="${esc(id)}">Delete rule</button><span class="hint">To stop it for a while, turn it off instead.</span></div>`,
    onSave:async f=>{const b={};if(f.elements.text.value.trim()!==r.text)b.text=f.elements.text.value;if(f.elements.space.value!==r.space)b.space=f.elements.space.value;
      if(!Object.keys(b).length)return;const x=await post('/api/rules/'+enc(id),b);if(x.error)return x.error;PL.toast(`Rule ${id} saved`);await loadRules()}})};
ACT.ruledel=async id=>{if(!await ask('Delete this rule? Agents stop getting it from their next prompt.'))return;
  const r=await post('/api/rules/'+enc(id),{delete:true});if(r.error)return tell(r.error);S.sheet?.close();PL.toast(`Rule ${id} deleted`);await loadRules()};

// ---- Channels ----------------------------------------------------------------------------------------------------
// The chat platforms' state isn't in the snapshot: it's fetched on entering the section (and the overview) and polled
// while it's open. Their chats, and Discord's servers, come from /api/discord/channels.
const PLATS=['discord','telegram','slack','agents'],PNAME={discord:'Discord',telegram:'Telegram',slack:'Slack',agents:'Outside agents'};
const PSTATE={online:['ok','Online'],connecting:['info','Connecting…'],error:['bad','Error'],off:['mut','Turned off'],unconfigured:['mut','Not set up']};
const pst=p=>({discord:S.ch.d,telegram:S.ch.t,slack:S.ch.s,agents:S.ch.a})[p]||{};
const pConfigured=p=>p==='agents'?!!((pst(p).clients||[]).length||pst(p).registration):!!pst(p).configured;
const routes=()=>S.ch.d?.routes||[];
const mappedOn=p=>routes().filter(r=>platOf(r.channel_id)===p&&(r.agents||[]).length).length;
const invited=()=>(S.ch.g||[]).some(g=>!OTHER(g));
function platBadge(p){const x=pst(p);if(!S.ch.d)return '';const [k,t]=pConfigured(p)?PSTATE[x.state]||['mut',x.state]:['mut',p==='agents'?'No clients':'Not set up'];
  // Someone waiting is what needs you: then that's the one badge, so a phone row keeps room for its name.
  const w=(x.strangers||x.pending||[]).length;return w?PL.badge('warn',w+' waiting'):PL.badge(k,t)}
function platSub(p){const x=pst(p),n=mappedOn(p);if(!pConfigured(p))return {discord:'Channels in your server',telegram:'A private chat or a group',slack:'A channel or a direct message',agents:'Other AI agents, over MCP'}[p];
  const who=p==='discord'?x.user&&'as '+x.user:p==='telegram'?x.user&&'as @'+x.user:p==='slack'?x.user&&`as ${x.user}${x.team?' in '+x.team:''}`:plural((x.clients||[]).length,'client');
  return [who,plural(n,p==='telegram'?'chat':'channel')+' mapped',x.error].filter(Boolean).join(' · ')}
async function chLoad(guilds){const c=S.ch;
  const [d,t,s,a]=await Promise.all(['/api/discord','/api/telegram','/api/slack','/api/agentchannel'].map(p=>api(p)));
  const chats=x=>JSON.stringify([Object.keys(x.t?.chats||{}),Object.keys(x.s?.chats||{}),(x.a?.clients||[]).map(k=>k.name),x.d?.configured]);
  const before=c.d?chats(c):'';Object.assign(c,{d,t,s,a,at:Date.now()});
  if(guilds||c.g===null||before!==chats(c)){const r=await api('/api/discord/channels'+(guilds==='fresh'?'?fresh=1':''));c.g=r.guilds||[];if(r.error&&guilds==='fresh')PL.toast(r.error,{kind:'bad'})}
  const sig=JSON.stringify([d,t,s,a,c.g]);if(sig!==c.sig){c.sig=sig;PL.render();S.live?.()}}
const chanName=id=>{for(const g of S.ch.g||[])for(const c of g.channels)if(c.id===id)return (OTHER(g)?'':'#')+c.name;return 'channel '+id};
const online=id=>pst(platOf(id)).state==='online';
function renderChannels(){const c=S.ch;if(!c.d){PL.paint($('#su-channels'),`<div class="su-load">Loading…</div>`);return}
  const d=c.d,anySet=PLATS.some(pConfigured),hasChats=invited()||(c.g||[]).some(g=>OTHER(g)&&g.channels.length);
  // People who wrote to a bot and outside agents asking to connect: answered right here.
  const wait=[...(c.t?.strangers||[]).map(x=>({p:'telegram',x})),...(c.s?.strangers||[]).map(x=>({p:'slack',x}))].map(({p,x})=>`<div class="row su-wrow">${logoTile(p)}<span class="row-main"><span class="row-t">${esc(x.name)}${x.username?` <span class="mut">@${esc(x.username)}</span>`:''}</span>
      <span class="row-s">wrote to the ${PNAME[p]} ${p==='slack'?'app':'bot'} in ${esc(x.chat_name||x.chat)} · ${PL.ago(x.ts)} ago · id <span class="mono">${esc(x.id)}</span></span></span>
      <span class="su-acts"><button type="button" class="btn btn-solid sm" data-su="stranger" data-p="${p}" data-arg="${esc(x.id)}" data-do="allow">Allow</button><button type="button" class="btn btn-soft sm" data-su="stranger" data-p="${p}" data-arg="${esc(x.id)}" data-do="dismiss">Dismiss</button></span></div>`)
    .concat((c.a?.pending||[]).map(x=>`<div class="row su-wrow">${logoTile('agents')}<span class="row-main"><span class="row-t mono">${esc(x.name)}</span><span class="row-s">asks to connect · code <span class="mono">${esc(x.code)}</span> · from ${esc(x.ip)}, ${PL.ago(x.ts)} ago</span></span>
      <span class="su-acts"><button type="button" class="btn btn-solid sm" data-su="agapprove" data-arg="${esc(x.code)}">Approve</button><button type="button" class="btn btn-soft sm" data-su="agdismiss" data-arg="${esc(x.code)}">Dismiss</button></span></div>`));
  const mapRows=routes().filter(r=>(r.agents||[]).length).map(r=>row({act:'map',arg:r.channel_id,tile:logoTile(platOf(r.channel_id)),title:esc(chanName(r.channel_id)),
    sub:r.agents.map(a=>`${esc(entryName(a))} <span class="mut">${[a.receives&&'receives',a.sends&&'sends'].filter(Boolean).join(', ')||'neither'}</span>`).join(' · ')})).join('');
  const dg=c.a?.delegation,hasAg=routes().some(r=>String(r.channel_id).startsWith('agents:'));
  PL.paint($('#su-channels'),(wait.length?card('Waiting for you',wait.join('')):'')
    +card('Platforms',PLATS.map(p=>row({act:'plat',arg:p,tile:logoTile(p),title:PNAME[p],sub:esc(platSub(p)),value:platBadge(p)})).join(''))
    +(anySet?card('Channel ⇄ agent mappings',(hasChats?mapRows||row({title:'<span class="mut">No channels mapped yet</span>',sub:'Map one to pick which agents hear you there, and which post there.'})
        :row({title:'<span class="mut">No channels yet</span>',sub:esc(pst('discord').configured&&!invited()?'Invite the Discord bot to a server, or message a Telegram or Slack bot, and its channels show up here.':'Channels and chats show up here once a bot can see them.')}))
      +(hasChats?row({act:'mapadd',icon:'plus',title:'Map a channel',chev:false}):'')
      +(d.configured?row({act:'dm',icon:'messages',title:'Direct messages to the Discord bot',value:esc(d.dm?folderLabel(d.dm):'Nobody (ignored)')}):'')
      +(dg&&hasAg?togRow({tog:'dgswitch',on:dg.switch,title:'Outside agents may pass on your approvals',sub:esc(`Only the clients and kinds of work you tick on their mapping, on ${dg.envs.join(' or ')}, at most ${dg.per_hour} an hour and ${dg.per_day} a day, ${String(dg.hours[0]).padStart(2,'0')}:00–${dg.hours[1]}:00. Prod, money, secrets and deletions always need you.`)}):''),
      `<button type="button" class="btn btn-ghost sm" data-su="chrefresh">Refresh channels</button>`)
      +card('What agents can send',togRow({tog:'dopt',arg:'buttons',on:d.buttons,title:'Buttons for choices',sub:'Tap one and it goes back to the agent as your answer. Off, choices are a numbered list.'})
        +togRow({tog:'dopt',arg:'files_out',on:d.files_out,title:'Files from agents',sub:'An agent can attach files from this machine to its messages'})
        +togRow({tog:'dopt',arg:'files_in',on:d.files_in,title:'Files to agents',sub:'What you attach is saved under ~/.peerlink/files and the agent gets the paths'})
        +row({act:'maxmb',icon:'file',title:'Largest file, either way',value:esc(d.max_file_mb+' MB')})):''))}
// An agent on a mapping is named by folder and name; one that isn't running says so.
const entryName=e=>{const a=liveAgents().find(x=>x.cwd===e.cwd&&x.name.toLowerCase()===String(e.name||'').toLowerCase());return a?a.name:e.name?e.name+' (not running)':folderLabel(e.cwd)};
// The mapping saves whole, with Undo: the channels that have an agent, and where Discord DMs go.
async function saveMap(next,msg,undo=true){const prev=JSON.parse(JSON.stringify({routes:routes(),dm:S.ch.d.dm||''}));
  const body={routes:next.routes.filter(r=>r.channel_id&&(r.agents||[]).length),dm:next.dm??prev.dm};
  const r=await PL.put('/api/discord',body);if(r.error){PL.toast(r.error,{kind:'bad'});return false}
  Object.assign(S.ch.d,JSON.parse(JSON.stringify(body)));PL.render();S.live?.();
  if(msg)PL.toast(msg,undo?{undo:()=>saveMap(prev,'Put back',false)}:{});return true}
const cloneRoutes=()=>JSON.parse(JSON.stringify(routes()));
// One channel's sheet: its agents, each receiving and sending, a test post, and for an outside agent's chat whether it
// may approve for you. Changes apply at once; the sheet redraws itself from the saved mapping.
ACT.map=id=>{const body=()=>{const r=routes().find(x=>x.channel_id===id);if(!r)return '<p class="mut">This channel is no longer mapped.</p>';
    return `<div class="su-sh-h">${platLogo(id)}<b>${esc(chanName(id))}</b><button type="button" class="btn btn-out sm" data-su="maptest" data-arg="${esc(id)}"${online(id)?'':' disabled'}>Send a test</button></div>
    <p class="hint">Your messages go to every agent that <b>receives</b>. To reach one, reply to its post or start with its name and a colon. An agent that <b>sends</b> posts its messages and updates here.</p>
    <div class="su-magents">${(r.agents||[]).map((a,j)=>`<div class="su-magent"><span class="su-mn">${esc(entryName(a))}</span>
      <span class="su-chips"><button type="button" class="chip" aria-pressed="${!!a.receives}" data-su="mapflag" data-arg="${esc(id)}" data-j="${j}" data-f="receives">Receives</button><button type="button" class="chip" aria-pressed="${!!a.sends}" data-su="mapflag" data-arg="${esc(id)}" data-j="${j}" data-f="sends">Sends</button>
      <button type="button" class="icon-btn" data-su="mapun" data-arg="${esc(id)}" data-j="${j}" aria-label="Take ${esc(entryName(a))} off this channel">${PL.icon('x',18)}</button></span></div>`).join('')}</div>
    ${field('Add an agent',entrySelect(`data-su-pick="mapadd1" data-arg="${esc(id)}"`,'Pick an agent…'))}${delegBox(id)}
    <div class="dz"><button type="button" class="btn btn-danger sm" data-su="mapdel" data-arg="${esc(id)}">Stop using this channel</button><span class="hint">Its agents no longer hear or post there.</span></div>`};
  const h=sheet({title:'Channel',body:'<div data-live></div>'}),box=h.body.querySelector('[data-live]');
  S.live=()=>PL.paint(box,body());S.live()};
ACT.mapflag=async(id,b)=>{const next=cloneRoutes(),a=next.find(r=>r.channel_id===id)?.agents?.[+b.dataset.j];if(!a)return;a[b.dataset.f]=!a[b.dataset.f];
  await saveMap({routes:next},`${a.name||'It'} ${a[b.dataset.f]?'now':'no longer'} ${b.dataset.f==='receives'?'receives':'sends'} in ${chanName(id)}`)};
ACT.mapun=async(id,b)=>{const next=cloneRoutes(),r=next.find(x=>x.channel_id===id);if(!r)return;const [a]=r.agents.splice(+b.dataset.j,1);
  if(!r.agents.length&&!await ask(`Stop using ${chanName(id)}? It has no other agents, so it's unmapped.`,{ok:'Stop'}))return;
  if(await saveMap({routes:next},`${a.name||'It'} is off ${chanName(id)}`)&&!r.agents.length)S.sheet?.close()};
ACT.mapdel=async id=>{if(!await ask(`Stop using ${chanName(id)}? Its agents no longer hear or post there.`))return;
  if(await saveMap({routes:cloneRoutes().filter(r=>r.channel_id!==id)},`${chanName(id)} unmapped`))S.sheet?.close()};
ACT.maptest=async(id,b)=>{b.disabled=true;const r=await post('/api/discord/test',{channel_id:id});b.disabled=false;
  r.error?PL.toast(r.error,{kind:'bad'}):PL.toast(`Test sent to ${chanName(id)}`)};
// The first agent on a channel receives and sends; after that, one that only posts there is the likelier want.
async function addAgent(id,val){const [cwd,name]=val.split('\t'),next=cloneRoutes();let r=next.find(x=>x.channel_id===id);if(!r)next.push(r={channel_id:id,agents:[]});
  if(r.agents.some(a=>a.cwd===cwd&&(a.name||'').toLowerCase()===name.toLowerCase()))return true;
  r.agents.push({cwd,name,receives:!r.agents.some(a=>a.receives),sends:true});return saveMap({routes:next},`${name} added to ${chanName(id)}`)}
const PICK={mapadd1:(id,el)=>{const v=el.value;el.blur();el.value='';PL.settle(el);if(v)addAgent(id,v)}};
ACT.mapadd=()=>{const taken=new Set(routes().filter(r=>(r.agents||[]).length).map(r=>r.channel_id));
  const opts=(S.ch.g||[]).map(g=>{const cs=g.channels.filter(c=>!taken.has(c.id));return cs.length?`<optgroup label="${esc(g.name)}">${cs.map(c=>`<option value="${esc(c.id)}">${OTHER(g)?'':'#'}${esc(c.name)}</option>`).join('')}</optgroup>`:''}).join('');
  sheet({title:'Map a channel',saveLabel:'Map it',body:opts?field('Channel',`<select name="ch" required><option value="">Pick a channel…</option>${opts}</select>`,'Every channel and chat a bot of yours can see.')
      +field('First agent',entrySelect('name="ag" required','Pick an agent…'),'It receives your messages there and can post there. Add more agents after.')
    :`<p class="mut">Every channel the bots can see is mapped already. Invite a bot somewhere new, then Refresh channels.</p>`,
    onSave:opts?async f=>{const ch=f.elements.ch.value,ag=f.elements.ag.value;if(!ch||!ag)return 'Pick a channel and an agent.';
      if(!await addAgent(ch,ag))return false;S.sheet?.close();ACT.map(ch)}:null})};
ACT.dm=()=>{const d=S.ch.d;sheet({title:'Discord direct messages',body:field('Direct messages to the Discord bot go to',agentSelect(d.dm||'','name="dm"','Nobody (ignored)'),'Only you, and the people you allow, can DM it.'),
  onSave:async f=>{if(f.elements.dm.value===(d.dm||''))return;await saveMap({routes:routes(),dm:f.elements.dm.value},'Direct messages now go to '+(f.elements.dm.value?folderLabel(f.elements.dm.value):'nobody'))}})};
ACT.maxmb=()=>{const d=S.ch.d;sheet({title:'Largest file',body:field('Largest file, either way (MB)',`<input type="number" name="mb" min="1" max="500" step="1" value="${esc(d.max_file_mb)}" required>`,'Discord allows 10 MB without Nitro; Telegram bots get files up to 20 MB.'),
  onSave:async f=>{const v=Number(f.elements.mb.value),was=d.max_file_mb;if(v===was)return;const r=await PL.put('/api/discord',{max_file_mb:v});if(r.error)return r.error;
    await chLoad();PL.toast(`Largest file: ${v} MB`,{undo:async()=>{await PL.put('/api/discord',{max_file_mb:was});chLoad()}})}})};
TOG.dopt=async(k,on)=>{const set=async v=>{const r=await put('/api/discord',{[k]:v});await chLoad();return !r.error};
  return await set(on)&&!!PL.toast(`${{buttons:'Buttons',files_out:'Files from agents',files_in:'Files to agents'}[k]} ${on?'on':'off'}`,{undo:()=>set(!on)})};
TOG.dgswitch=async(_,on)=>{const set=async v=>{const r=await put('/api/agentchannel/delegation',{switch:v});await chLoad();return !r.error};
  return await set(on)&&!!PL.toast(on?'Outside agents may pass on your approvals':'Outside agents can no longer approve for you',{undo:()=>set(!on)})};
ACT.chrefresh=async(_,b)=>{b.disabled=true;await chLoad('fresh').catch(()=>{});b.disabled=false;PL.toast('Channels refreshed')};
// Delegated approvals on an outside agent's mapping: whether it may pass on your OK, and for which kinds of work.
function delegBox(id){const dg=S.ch.a?.delegation;if(!dg||!String(id).startsWith('agents:'))return '';
  const n=String(id).slice(7),c=(dg.clients||{})[n];if(!c)return '';
  if(c.never)return `<div class="su-dg"><b>Can’t approve for you</b><p class="hint">${esc(c.never)}</p></div>`;
  const pick=c.on?c.scopes:(S.dgPick[n]||[]),days=c.on?Math.max(0,Math.ceil((c.expires*1000-Date.now())/86400000)):0;
  return `<div class="su-dg"><div class="row switch-row" data-su-tog="dgon" data-arg="${esc(n)}"><span class="row-main"><span class="row-t">Can approve for you</span><span class="row-s">${esc([`From its own token only`,c.on&&`${plural(days,'day')} left (ticking a kind renews it for ${dg.grant_days})`,!dg.switch&&'the switch on Channels is off',c.recent&&`${c.recent} in the last day`].filter(Boolean).join(' · '))}</span></span><span class="row-v">${sw(c.on,'Can approve for you')}</span></div>
    ${(c.linked||[]).length?PL.badge('warn','linked with '+c.linked.join(', ')):''}${c.problem?PL.badge('warn',c.problem):''}
    <div class="su-chips su-scopes" role="group" aria-label="Kinds of work">${dg.scopes.map(sc=>`<button type="button" class="chip mono" aria-pressed="${pick.includes(sc)}" data-su="dgscope" data-arg="${esc(n)}" data-sc="${esc(sc)}">${esc(sc)}</button>`).join('')}</div></div>`}
async function dgPut(n,body){const r=await put('/api/agentchannel/delegation/'+enc(n),body);await chLoad();S.live?.();return !r.error}
TOG.dgon=async(n,on)=>{const c=(S.ch.a.delegation.clients||{})[n]||{},sc=c.on?c.scopes:(S.dgPick[n]||[]);
  if(on&&!sc.length){tell('Tick the kinds of work it may approve first.');return false}
  return await dgPut(n,{on,scopes:sc})&&!!PL.toast(on?`${n} can approve for you`:`${n} can no longer approve for you`,{undo:()=>dgPut(n,{on:!on,scopes:sc})})};
ACT.dgscope=async(n,b)=>{const c=(S.ch.a.delegation.clients||{})[n]||{},cur=c.on?[...c.scopes]:[...(S.dgPick[n]||[])],sc=b.dataset.sc;
  const next=cur.includes(sc)?cur.filter(x=>x!==sc):[...cur,sc];S.dgPick[n]=next;
  if(c.on)await dgPut(n,{on:next.length>0,scopes:next});else{b.setAttribute('aria-pressed',String(next.includes(sc)))}};
// People who wrote to a Telegram bot or a Slack app, waiting to be allowed; outside agents asking to connect.
ACT.stranger=async(id,b)=>{const p=b.dataset.p,r=await PL.put('/api/'+p,{[b.dataset.do]:id});
  if(r.error)PL.toast(r.error,{kind:'bad'});else PL.toast(b.dataset.do==='allow'?'Allowed: they can message your agents now':'Dismissed');chLoad()};
ACT.agapprove=async code=>{if(!await ask(`Approve the request with code ${code}? Only if its owner told you that code themselves.`,{ok:'Approve'}))return;
  const r=await PL.put('/api/agentchannel',{approve:code});if(r.error)tell(r.error);else PL.toast('Approved');chLoad()};
ACT.agdismiss=async code=>{await PL.put('/api/agentchannel',{dismiss:code});PL.toast('Dismissed');chLoad()};

// A platform's sheet. Not set up: the steps and the token. Set up: its state, who may talk to it, and Disconnect.
// Its live parts repaint as the state is polled; fields you're changing are left alone (PL.paint).
ACT.plat=p=>{const set=pConfigured(p)||p==='agents';
  const h=sheet({title:PNAME[p],wide:p==='agents',body:'<div data-live></div>',saveLabel:set?'Save':'Connect',onSave:f=>platSave(p,f,set)});
  const box=h.body.querySelector('[data-live]');S.live=()=>{if(pConfigured(p)!==set&&p!=='agents'){ACT.plat(p);return}PL.paint(box,platBody(p))};S.live()};
const stateLine=(p)=>{const x=pst(p),[k,t]=p==='agents'&&!pConfigured(p)?['mut','No clients']:PSTATE[x.state]||['mut',x.state||''];
  return `<div class="su-state">${PL.badge(k,t)}${x.user?`<span class="mut">as ${esc(p==='telegram'?'@'+x.user:x.user)}${x.team?' in '+esc(x.team):''}</span>`:''}${x.error?`<span class="err">${esc(x.error)}</span>`:''}</div>`};
const step=(n,title,body,done)=>`<li class="step${done?' done':''}"><span class="step-n">${done?PL.icon('check',16):n}</span><div><div class="step-t">${title}</div>${body}</div></li>`;
const ext=(href,label,cls='btn btn-out sm')=>`<a class="${cls}" href="${esc(href)}" target="_blank" rel="noreferrer">${label} ↗</a>`;
const strangers=p=>{const l=pst(p).strangers||[];return l.length?`<div class="su-list">${l.map(x=>`<div class="su-li"><span><b>${esc(x.name)}</b>${x.username?` @${esc(x.username)}`:''} <span class="mono mut">${esc(x.id)}</span><br><span class="small mut">in ${esc(x.chat_name||x.chat)}, ${PL.ago(x.ts)} ago</span></span>
  <span class="su-acts"><button type="button" class="btn btn-solid sm" data-su="stranger" data-p="${p}" data-arg="${esc(x.id)}" data-do="allow">Allow</button><button type="button" class="btn btn-soft sm" data-su="stranger" data-p="${p}" data-arg="${esc(x.id)}" data-do="dismiss">Dismiss</button></span></div>`).join('')}</div>`
  :'<p class="hint">Nobody waiting. This updates by itself.</p>'};
const runRow=(p,label)=>togRow({tog:'prun',arg:p,on:pst(p).enabled,title:label,sub:'Off, it stops answering until you turn it on'});
const idsField=(label,name,vals,ph,hint)=>field(label,`<input type="text" class="mono" name="${name}" value="${esc((vals||[]).join(', '))}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false">`,hint);
const disc=(p,text)=>`<div class="dz"><button type="button" class="btn btn-danger sm" data-su="pforget" data-arg="${p}">Disconnect</button><span class="hint">${text}</span></div>`;
function platBody(p){const x=pst(p);
  if(p==='discord'){const d=x,inv=invited(),servers=(S.ch.g||[]).filter(g=>!OTHER(g)).map(g=>g.name);
    if(!d.configured)return `<p class="hint">Each channel you map has agents: ones that <b>receive</b> get your messages there, ones that <b>send</b> can post there. Only you, the bot’s owner, can talk to them.</p><ol class="steps">
      ${step(1,'Create the bot and paste its token',`<p class="hint">On the Developer Portal, click <b>New Application</b> and give it a name. Open <b>Bot</b>, click <b>Reset Token</b>, and copy it. Optional: on the same page, turn on <b>Message Content Intent</b> so you can talk to it without @mentioning it.</p>${ext('https://discord.com/developers/applications','Developer Portal')}
        ${field('Bot token','<input type="password" class="mono" name="token" autocomplete="off" spellcheck="false" placeholder="Bot token" required>')}`)}
      ${step(2,'Invite it to your server','<p class="hint">Next, once it’s connected.</p>')}${step(3,'Map channels to agents','<p class="hint">On Channels, under mappings.</p>')}</ol>`;
    const reading=d.reads_messages?'<p class="hint">Everything you write in a mapped channel goes to every agent that receives there. No @mention needed.</p>'
      :d.message_content_switch?'<p class="hint">The Message Content switch is on in Discord, but the bot connected before it was.</p><button type="button" class="btn btn-out sm" data-su="dreconnect">Reconnect now</button>'
      :`<p class="hint">${d.message_content_switch===false?'<b>Discord says the Message Content switch is off.</b> ':''}@mention the bot each time, or DM it. To talk without @mentioning, turn on <b>Message Content Intent</b> on the Bot page (under Privileged Gateway Intents) and save.</p><div class="su-acts">${ext(d.app_id?`https://discord.com/developers/applications/${d.app_id}/bot`:'https://discord.com/developers/applications','Bot page')}<button type="button" class="btn btn-out sm" data-su="dcheck">I turned it on</button></div>`;
    return `${stateLine(p)}<p class="hint">Token <span class="mono">${esc(d.token_hint)}</span> saved.</p>${PL.group(runRow(p,'Bot running'))}
      <ol class="steps">${step(2,'Invite it to your server',`<p class="hint">${inv?`In ${esc(servers.join(', '))}.`:'Pick your server on Discord’s page, then come back here. This step completes on its own.'}</p>${d.invite_url?ext(d.invite_url,inv?'Invite to another server':'Invite the bot',inv?'btn btn-out sm':'btn btn-solid sm'):''}`,inv)}
      ${step(3,'Map channels to agents','<p class="hint">Close this and pick <b>Map a channel</b>.</p>',mappedOn('discord')>0)}</ol>
      ${PL.label('Messages')}${reading}
      ${PL.label('Who can talk to agents')}${idsField('People, by Discord user id','allowed_users',d.allowed_users,'e.g. 1562000000000000000','Only you can, as the bot’s owner (or its team’s members). People listed here can message agents and answer buttons as you do. To find an id, turn on Developer Mode in Discord, right-click the person and choose Copy User ID. Separate with commas.')}
      ${idsField('Bots that can post to agents','trusted_bots',d.trusted_bots,'e.g. 1562000000000000000','Other bots are ignored unless listed here. List only bots you control.')}
      ${disc(p,'The channel mapping is kept.')}`}
  if(p==='telegram'){const t=x;
    if(!t.configured)return `<p class="hint">A private chat with your bot, or a group it’s in, works like a Discord channel. Telegram bots answer anyone who finds them, so peerlink ignores everyone until you allow them.</p><ol class="steps">
      ${step(1,'Create the bot and paste its token',`<p class="hint">In Telegram, message @BotFather, send <span class="mono">/newbot</span>, and pick a name and a username. It answers with a token: paste it here.</p>${ext('https://t.me/BotFather','Open @BotFather')}
        ${field('Bot token','<input type="password" class="mono" name="token" autocomplete="off" spellcheck="false" placeholder="123456789:AAE…" required>')}`)}
      ${step(2,'Message it, then allow yourself','<p class="hint">Next, once it’s connected.</p>')}${step(3,'Map chats to agents','<p class="hint">On Channels, under mappings.</p>')}</ol>`;
    return `${stateLine(p)}<p class="hint">Token <span class="mono">${esc(t.token_hint)}</span> saved.</p>${PL.group(runRow(p,'Bot running'))}
      <ol class="steps">${step(2,'Message it, then allow yourself',`<p class="hint">Open the bot and send it any message. You show up here; allow yourself, and the bot answers you from then on.</p>${t.user?ext('https://t.me/'+t.user,'Open @'+t.user):''}${strangers(p)}`,(t.allowed_users||[]).length>0)}
      ${step(3,'Map chats to agents',`<p class="hint">Every chat the bot has heard from is listed under <b>Map a channel</b>. ${t.reads_messages?'In groups it reads every message.':'In groups, Telegram shows the bot only commands, @mentions and replies to it. To talk without @mentioning, send <span class="mono">/setprivacy</span> to @BotFather, choose Disable, then remove the bot from the group and add it again.'} Commands work too: <span class="mono">/status</span>, <span class="mono">/inbox</span>, <span class="mono">/peerlink run loop 5m check the deploy</span>.</p>`,mappedOn('telegram')>0)}</ol>
      ${idsField('Allowed people, by Telegram user id','allowed_users',t.allowed_users,'e.g. 123456789','They can message agents and answer buttons as you do. Separate with commas.')}
      ${disc(p,'The chat mapping and allowed people are kept.')}`}
  if(p==='slack'){const t=x;
    if(!t.configured)return `<p class="hint">A channel your Slack app is in, or a direct message with it, works like a Discord channel. Everyone in the workspace can message the app, so peerlink ignores everyone until you allow them.</p><ol class="steps">
      ${step(1,'Create the app and paste its two tokens',`<p class="hint">The link fills in everything the app needs; pick your workspace and click <b>Create</b>.</p>${ext(t.manifest_url,'Create the app on Slack','btn btn-solid sm')}
        <p class="hint"><b>App-level token:</b> on the app’s <b>Basic Information</b> page, under <b>App-Level Tokens</b>, click <b>Generate Token and Scopes</b>, add the scope <span class="mono">connections:write</span>, and copy the token (it starts <span class="mono">xapp-</span>).</p>
        ${field('App-level token','<input type="password" class="mono" name="app_token" autocomplete="off" spellcheck="false" placeholder="xapp-…" required>')}
        <p class="hint"><b>Bot token:</b> on <b>Install App</b>, click <b>Install to Workspace</b>, allow it, and copy the <b>Bot User OAuth Token</b> (it starts <span class="mono">xoxb-</span>).</p>
        ${field('Bot token','<input type="password" class="mono" name="token" autocomplete="off" spellcheck="false" placeholder="xoxb-…" required>')}`)}
      ${step(2,'Message it, then allow yourself','<p class="hint">Next, once it’s connected.</p>')}${step(3,'Map channels to agents','<p class="hint">On Channels, under mappings.</p>')}</ol>`;
    return `${stateLine(p)}<p class="hint">Tokens <span class="mono">${esc(t.token_hint)}</span> and <span class="mono">${esc(t.app_token_hint)}</span> saved.</p>${PL.group(runRow(p,'App running'))}
      <ol class="steps">${step(2,'Message it, then allow yourself',`<p class="hint">In Slack, find <b>${esc(t.user||'peerlink')}</b> under <b>Apps</b> and send it any message. You show up here; allow yourself, and it answers you from then on.</p>${strangers(p)}`,(t.allowed_users||[]).length>0)}
      ${step(3,'Map channels to agents',`<p class="hint">Your direct message with the app, and every channel it’s in, is listed under <b>Map a channel</b>. To add it to a channel, type <span class="mono">/invite @${esc(t.user||'peerlink')}</span> there; it reads every message in that channel. Commands work too: <span class="mono">/peerlink status</span>, <span class="mono">/peerlink inbox</span>.</p>`,mappedOn('slack')>0)}</ol>
      ${idsField('Allowed people, by Slack member id','allowed_users',t.allowed_users,'e.g. U012AB3CD','They can message agents and answer buttons as you do. Separate with commas.')}
      ${disc(p,'The channel mapping and allowed people are kept.')}`}
  // Outside agents (MCP clients): added with the CLI, so the token never passes through here.
  const a=x,clients=(a.clients||[]).map(c=>`<div class="su-client"><div class="su-client-h"><b class="mono">${esc(c.name)}</b><span class="small mut">added ${esc((c.added||'').slice(0,10))}</span>${c.mapped?'':PL.badge('warn','no agent receives it')}
      <span class="su-grow"></span>${sw(c.enabled,`${c.name} on`,`data-su-tog="agon" data-arg="${esc(c.name)}"`)}</div>
    <div class="su-client-f">${field('Posts per minute',`<input type="number" min="1" max="120" name="rate:${esc(c.name)}" value="${esc(c.rate_per_min)}">`)}${field('Linked with',`<input type="text" name="links:${esc(c.name)}" value="${esc((c.links||[]).join(', '))}" placeholder="none">`,'Clients it messages straight, with post_to_client. Nobody here reads those.')}</div>
    <button type="button" class="btn btn-danger sm" data-su="agrevoke" data-arg="${esc(c.name)}">Revoke</button></div>`).join('');
  return `${stateLine(p)}<p class="hint">An agent outside this machine (any MCP client) can post to the agent you pick and read its replies, and nothing else: <span class="mono">post_message</span> and <span class="mono">read_replies</span>. Each client is a chat of its own, with its own token; only the token’s hash is kept here. Your agents can answer a client but never start a conversation with it, and your approvals and questions never go there.</p>
    ${PL.group(togRow({tog:'agact',arg:'enabled',on:a.enabled,title:'Channel on',sub:esc(`MCP at http://127.0.0.1:${a.port}/mcp, this machine only`)})+togRow({tog:'agact',arg:'registration',on:a.registration,title:'Accept registrations',sub:'A client sends its name and its token’s hash to /register and gets a pairing code'}))}
    ${field('Where new clients land',agentSelect(a.default_to,'name="default_to"','Pick an agent…'),'A new client is mapped to this agent, which receives its posts. Change one client’s agents on its mapping.')}
    ${PL.label('Asking to connect')}${(a.pending||[]).map(q=>`<div class="su-li"><span><b class="mono">${esc(q.name)}</b> <span class="mono">${esc(q.code)}</span><br><span class="small mut">from ${esc(q.ip)}, ${PL.ago(q.ts)} ago</span></span><span class="su-acts"><button type="button" class="btn btn-solid sm" data-su="agapprove" data-arg="${esc(q.code)}">Approve</button><button type="button" class="btn btn-soft sm" data-su="agdismiss" data-arg="${esc(q.code)}">Dismiss</button></span></div>`).join('')
      ||`<p class="hint">${a.registration?'Nobody waiting. This updates by itself.':'Registrations are off.'} Approve only a request whose code its owner told you themselves.</p>`}
    ${PL.label('Clients')}${clients||'<p class="hint">None yet.</p>'}
    <p class="hint">Or add one in a shell. The token stays in its file, made there if it doesn’t exist (mode 600), and only its hash reaches peerlink: <span class="mono">peerlink agents add &lt;name&gt; --token-file &lt;file&gt;</span>. Revoke with <span class="mono">peerlink agents revoke &lt;name&gt;</span>.</p>
    <p class="hint">Health at <span class="mono">/healthz</span>. Put a tunnel with its own access control in front of it. Every call is logged to <span class="mono">~/.peerlink/agents/audit.jsonl</span>.</p>`}
async function platSave(p,f,set){const v=n=>f.elements[n]?.value?.trim()??'';
  if(!set){const body=p==='slack'?{token:v('token'),app_token:v('app_token')}:{token:v('token')};
    if(!body.token||p==='slack'&&!body.app_token)return p==='slack'?'Paste both tokens.':'Paste the token.';
    const r=await PL.put('/api/'+p,body);if(r.error)return r.error;PL.toast(`${PNAME[p]} connected`);await chLoad(true);return}
  if(p==='agents'){const a=S.ch.a,jobs=[];
    if(f.elements.default_to&&f.elements.default_to.value!==(a.default_to||''))jobs.push(PL.put('/api/agentchannel',{default_to:f.elements.default_to.value}));
    for(const c of a.clients||[]){const rate=Number(v('rate:'+c.name)),links=v('links:'+c.name).split(',').map(s=>s.trim()).filter(Boolean);
      if(rate&&rate!==c.rate_per_min)jobs.push(PL.put('/api/agentchannel/clients/'+enc(c.name),{rate_per_min:rate}));
      if(links.join(',')!==(c.links||[]).join(','))jobs.push(PL.put('/api/agentchannel/clients/'+enc(c.name),{links}))}
    const errs=(await Promise.all(jobs)).filter(r=>r.error).map(r=>r.error);await chLoad();if(errs.length)return errs.join('; ');if(jobs.length)PL.toast('Saved');return}
  const x=pst(p),b={};
  for(const k of ['allowed_users','trusted_bots'])if(f.elements[k]&&v(k)!==(x[k]||[]).join(', '))b[k]=v(k);
  if(!Object.keys(b).length)return;const r=await PL.put('/api/'+p,b);if(r.error)return r.error;await chLoad();PL.toast('Saved')}
TOG.prun=async(p,on)=>{const set=async v=>{const r=await put('/api/'+p,{enabled:v});await chLoad();return !r.error};
  return await set(on)&&!!PL.toast(`${PNAME[p]} ${on?'on':'turned off'}`,{undo:()=>set(!on)})};
TOG.agact=async(k,on)=>{const set=async v=>{const r=await put('/api/agentchannel',{[k]:v});await chLoad();return !r.error};
  return await set(on)&&!!PL.toast(`${k==='enabled'?'Outside agents channel':'Registrations'} ${on?'on':'off'}`,{undo:()=>set(!on)})};
TOG.agon=async(n,on)=>{const set=async v=>{const r=await put('/api/agentchannel/clients/'+enc(n),{enabled:v});await chLoad();return !r.error};
  return await set(on)&&!!PL.toast(`${n} ${on?'on':'off'}`,{undo:()=>set(!on)})};
ACT.agrevoke=async n=>{if(!await ask(`Revoke ${n}? Its token stops working at once, and its chat's mapping is removed.`,{ok:'Revoke'}))return;
  const r=await PL.del('/api/agentchannel/clients/'+enc(n));if(r.error)tell(r.error);else PL.toast(`${n} revoked`);chLoad()};
ACT.pforget=async p=>{if(!await ask(`Disconnect the ${PNAME[p]} ${p==='slack'?'app':'bot'}? ${p==='discord'?'The channel mapping is kept.':'The mapping and allowed people are kept.'}`))return;
  await PL.del('/api/'+p);S.sheet?.close();PL.toast(`${PNAME[p]} disconnected`);chLoad(true)};
ACT.dcheck=async()=>{S.ch.d=await api('/api/discord?check=1');S.ch.sig='';PL.render();S.live?.()};
ACT.dreconnect=async()=>{await post('/api/discord/reconnect');PL.toast('Reconnecting…');setTimeout(()=>chLoad().catch(()=>{}),2000)};
// Invited in another tab, or back from the Developer Portal: look again when this tab gets focus.
window.addEventListener('focus',()=>{if(PL.route.page==='setup'&&S.sec==='channels'&&S.ch.d?.configured)chLoad(true).then(()=>ACT.dcheck()).catch(()=>{})});

// ---- Settings ----------------------------------------------------------------------------------------------------
// Switches apply at once, with Undo; every other value opens a sheet of its own. There's no Save for the page.
const SETS=[
  ['Waking and delivery',[{k:'auto_wake_idle',t:'Wake idle agents when a message arrives',type:'bool'},{k:'inject_while_busy',t:'Deliver into a running turn',type:'bool'},
    {k:'wake_for',t:'Wake an idle agent for',type:'choice',opts:[['needed','Questions, tasks, your messages and answers','Saves tokens: other messages wait for its next turn','What needs it'],['all','Every message','Each wake-up is a full turn that re-reads its context','Every message']]},
    {k:'wake_delay_s',t:'Wait before waking for another agent’s message',type:'num',unit:'s',min:0,max:120,hint:'Messages that arrive together then share one turn. Your own messages never wait.'}]],
  ['Context and usage',[{k:'clear_between_tasks',t:'Clear context after each task',sub:'Agents save notes to memory first',type:'bool'},
    {k:'task_nudge_h',t:'Ask a task’s owner where it stands after',type:'num',unit:'h',zero:'Never',min:0,step:12,hint:'Hours without an update. 0 for never.'},
    {k:'clear_nudge_tokens',t:'Ask an agent to save and clear past',type:'num',unit:'tokens',zero:'Never',min:0,step:50000,hint:'A large context is re-read on every turn and drains the usage limit fast. The ask arrives with its next prompt, so it clears at a stopping point. 0 for never.'}]],
  ['Approvals',[{k:'auto_approve_all',t:'Agents start agents and schedules without asking',sub:'You’re still told on Discord. To allow only some agents, leave this off and turn it on on an agent’s page.',type:'bool'},
    {k:'ask_defaults',t:'A question may name a default',sub:'What the agent goes with when you don’t answer in time; a later answer still wins',type:'bool'},
    {k:'ask_default_min_m',t:'Shortest wait an agent may give you',type:'num',unit:'min',min:0,step:5}]],
  ['What agents see',[{k:'roster_in_prompt',t:'Show each agent the live agent list when it changes',type:'bool'},{k:'auto_summary',t:'Keep agent summaries current',type:'bool'},
    {k:'summary_model',t:'Summary model',type:'text'},
    {k:'feedback',t:'Agents report bugs and ideas about peerlink',sub:'For people developing peerlink. Agents started after a change get the report_issue tool, or lose it.',type:'bool'}]],
  ['Guidance',[{k:'guidance',t:'What every agent is told about working with its peers',type:'long'}]],
  ['Limits and timing',[{k:'poll_interval_ms',t:'Poll interval',unit:'ms',type:'num',min:500},{k:'peer_ttl_s',t:'Agent timeout',unit:'s',type:'num',min:5},
    {k:'max_hops',t:'Max reply hops',type:'num',min:1},{k:'rate_limit_per_min',t:'Messages per minute per agent',type:'num',min:1}]],
  ['Other machines',[{k:'remotes',t:'Their daemons',type:'list',hint:'One URL per line.'},{k:'listen_host',t:'Listen host',type:'text',hint:'0.0.0.0 accepts other machines. Needs a restart.'},
    {k:'token',t:'Shared token',type:'secret'},{k:'local_name',t:'This machine’s web UI name',type:'text',hint:'Like peerlink.local; empty is off. Needs a restart.'}]]];
const SETK=Object.fromEntries(SETS.flatMap(([,l])=>l.map(s=>[s.k,s])));
function setVal(s,v){if(s.type==='choice'){const o=s.opts.find(o=>o[0]===v);return esc(o?o[3]||o[1]:v)}
  if(s.type==='num')return v===0&&s.zero?s.zero:esc(fmtNum(v??0)+(s.unit?' '+s.unit:''));
  if(s.type==='secret')return v?'Set':'<span class="mut">Not set</span>';
  if(s.type==='list')return (v||[]).length?esc(plural(v.length,'machine')):'<span class="mut">None</span>';
  if(s.type==='long')return v?'Your own':'Default';
  return v?esc(v):'<span class="mut">Not set</span>'}
const setRow=s=>{const v=C()[s.k];if(s.type==='bool')return togRow({tog:'cfg',arg:s.k,on:v,title:esc(s.t),sub:esc(s.sub||'')});
  return row({act:'set',arg:s.k,title:esc(s.t),sub:s.type==='long'?esc(v?PL.plain(v).slice(0,90)+(v.length>90?'…':''):'Empty: agents get the default'):s.type==='list'&&(v||[]).length?esc(v.join(', ')):'',value:setVal(s,v)})};
// Desktop alerts belong to this browser, not the daemon: the permission and the preference ('notify') the shell
// reads to alert. This switch is the one place they're turned on or off.
const alertsRow=()=>{const has=!!window.Notification,blocked=has&&Notification.permission==='denied';
  return togRow({tog:'alerts',on:PL.notifyOn(),title:'Desktop alerts',sub:!has?'This browser has no desktop notifications':blocked?'Blocked for this page: allow them in the browser’s site settings':'A notification for each new Inbox item while this tab is in the background'})};
function renderSettings(){PL.paint($('#su-settings'),`<div class="su-cards">${SETS.map(([g,l])=>card(g,l.map(setRow).join(''))).join('')}${card('This browser',alertsRow())}</div>`)}
async function setCfg(k,v){const r=await PL.put('/api/config',{[k]:v});if(r.error){PL.toast(r.error,{kind:'bad'});return false}PL.setCfg(r);return true}
TOG.cfg=async(k,on)=>{return await setCfg(k,on)&&!!PL.toast(`${(SETK[k]||{}).t||k}: ${on?'on':'off'}`,{undo:()=>setCfg(k,!on)})};
TOG.alerts=async(_,on,quiet)=>{
  if(on){if(!window.Notification){tell('This browser has no desktop notifications.');return false}
    if(await Notification.requestPermission()!=='granted'){tell('Notifications are blocked for this page. Allow them in the browser’s site settings.');return false}
    PL.keep('notify','1')}else PL.keep('notify','');
  PL.render();if(!quiet)PL.toast(`Desktop alerts ${on?'on':'off'}`,{undo:()=>TOG.alerts(_,!on,true)});return true};
ACT.set=k=>{const s=SETK[k],v=C()[k];let input;
  if(s.type==='num')input=field(s.t+(s.unit?` (${s.unit})`:''),`<input type="number" name="v" value="${esc(v??0)}"${s.min!=null?` min="${s.min}"`:''}${s.max!=null?` max="${s.max}"`:''}${s.step?` step="${s.step}"`:''} required>`,esc(s.hint||''));
  else if(s.type==='choice')input=`<fieldset class="radios"><legend class="sr-only">${esc(s.t)}</legend>${s.opts.map(([o,t,h])=>`<label class="radio"><input type="radio" name="v" value="${o}"${o===v?' checked':''}><span><b>${esc(t)}</b>${h?`<span class="hint">${esc(h)}</span>`:''}</span></label>`).join('')}</fieldset>`;
  else if(s.type==='long')input=field(s.t,`<textarea name="v" class="su-guide" placeholder="${esc(C().default_guidance||'')}">${esc(v||'')}</textarea>`,'Leave it empty to use the default, shown in grey.');
  else if(s.type==='list')input=field(s.t,`<textarea name="v" rows="4" placeholder="http://other-machine.local:7899">${esc((v||[]).join('\n'))}</textarea>`,esc(s.hint||''));
  else input=field(s.t,`<input type="${s.type==='secret'?'password':'text'}" name="v" value="${esc(v??'')}" autocomplete="off" spellcheck="false">`,esc(s.hint||''));
  sheet({title:s.t.length>40?SETS.find(([,l])=>l.includes(s))[0]:s.t,wide:s.type==='long',body:input,onSave:async f=>{const raw=f.querySelector('[name=v]:checked')?.value??f.elements.v.value;
    const nv=s.type==='num'?Number(raw):s.type==='list'?String(raw).split('\n').map(x=>x.trim()).filter(Boolean):raw;
    if(JSON.stringify(nv)===JSON.stringify(v??(s.type==='list'?[]:'')))return;
    const r=await PL.put('/api/config',{[k]:nv});if(r.error)return r.error;PL.setCfg(r);
    PL.toast(`${s.t.length>40?'Saved':s.t+' saved'}`,{undo:()=>setCfg(k,v)})}})};

// ---- Controls ----------------------------------------------------------------------------------------------------
function renderControls(st){const s=st.status;
  PL.paint($('#su-controls'),`<div class="su-cards">${card('This daemon',row({icon:'controls',title:'Daemon',sub:esc(`${s.host} · port ${s.port}`),value:`<span class="mono">${esc(s.version)}</span>`})
    +row({icon:'key',title:'Key',sub:'Agents and sign-in links use it',value:`<span class="mono su-ell">${esc(keyPath(st))}</span>`})
    +row({icon:'agents',title:'Browsers',sub:'Sign-in links work once and expire after 60 s',value:esc(s.browsers+' signed in')})
    +row({act:'logout',icon:'signout',title:'Sign out of this browser',sub:'Run /peerlink web in any agent to sign in again',chev:false}))}
    ${card('Careful',row({act:'restart',icon:'controls',title:'Restart the daemon',sub:'Agents reconnect by themselves. Queued messages are kept.',chev:false,cls:'danger'})
      +row({act:'logoutall',icon:'agents',title:'Sign out every browser',sub:'This one included',chev:false,cls:'danger'})
      +row({act:'rotate',icon:'key',title:'Rotate the key',sub:'Signs out every browser; agents pick up the new key by themselves',chev:false,cls:'danger'})
      +row({act:'clean',icon:'trash',title:'Start clean',sub:'Clear spaces, offline agents, history, tasks or schedules. Backed up first.',cls:'danger'}))}</div>`)}
ACT.logout=async()=>{await post('/api/web/logout');location.reload()};
ACT.logoutall=async()=>{if(!await ask('Sign out every browser, including this one?'))return;await post('/api/web/logout',{all:true});location.reload()};
ACT.rotate=async()=>{if(!await ask('Rotate the key? Every browser is signed out; agents pick up the new key by themselves.'))return;await post('/api/key/rotate');location.reload()};
ACT.restart=async()=>{if(!await ask('Restart the peerlink daemon? Agents reconnect by themselves, and queued messages are kept.',{ok:'Restart'}))return;
  await post('/api/restart');PL.toast('Restarting…');setTimeout(()=>location.reload(),2500)};
const CLEAN=[['spaces','Spaces, leads and links'],['agents','Offline agents'],['history','Message history'],['tasks','Tasks'],['schedules','Schedules']];
ACT.clean=()=>sheet({title:'Start clean',danger:true,saveLabel:'Clear',body:`<p class="hint">Clear what you tick. Rules, settings, chat channels, outside clients and the key stay. Running agents stay, and the files are copied to a backup first.</p>
  <fieldset class="radios"><legend>Clear</legend>${CLEAN.map(([k,t])=>`<label class="check"><input type="checkbox" name="part" value="${k}"> ${esc(t)}</label>`).join('')}</fieldset>`,
  onSave:async f=>{const parts=[...f.querySelectorAll('[name=part]:checked')].map(c=>c.value);if(!parts.length)return 'Tick what to clear first.';
    if(!await ask(`Clear ${parts.map(p=>CLEAN.find(c=>c[0]===p)[1].toLowerCase()).join(', ')}? Rules and running agents stay; the files are backed up first.`,{ok:'Clear'}))return false;
    const r=await post('/api/clean',{parts});if(r.error)return 'Not cleared: '+r.error;
    tell('Cleared '+Object.entries(r.cleared).map(([k,v])=>`${k} (${v})`).join(', ')+'. Backup: '+r.backup);refresh(true)}});

// ---- Feedback ----------------------------------------------------------------------------------------------------
const FBST=[['needs','Needs you'],['new','New'],['accepted','Accepted'],['done','Done'],['dismissed','Dismissed'],['all','All']];
const FBNAME={new:'New',accepted:'Accepted',done:'Done',dismissed:'Dismissed'},FBBADGE={new:'warn',accepted:'info',done:'ok',dismissed:'mut'};
function renderFeedback(st){const all=st.issues,f=S.fb,ty=x=>!f.ty||x.type===f.ty;
  const inSt=(x,s)=>s==='all'||(s==='needs'?x.status==='new'||x.status==='accepted':x.status===s);
  const shown=all.filter(x=>ty(x)&&inSt(x,f.st)).sort((a,b)=>b.ts-a.ts);
  const one=x=>{const task=st.tasks.find(t=>t.id===x.task);let [h,...rest]=String(x.text).split('\n');
    // A long first line is cut to a headline; the rest of it reads below.
    if(h.length>120){const cut=h.lastIndexOf(' ',120)>60?h.lastIndexOf(' ',120):120;rest=[h.slice(cut).trim(),...rest];h=h.slice(0,cut)+'…'}
    const b=(s,label,cls='btn-soft')=>`<button type="button" class="btn ${cls} sm" data-su="fbset" data-arg="${esc(x.id)}" data-s="${s}">${label}</button>`;
    const acts=x.status==='new'?b('accepted','Accept','btn-solid')+b('dismissed','Dismiss'):x.status==='accepted'?b('done','Done','btn-solid')+b('dismissed','Dismiss'):b('new','Back to new');
    return `<article class="card su-fb"><div class="su-meta">${PL.badge(x.type==='bug'?'bad':'acc',x.type==='bug'?'Bug':'Idea')}${PL.badge(FBBADGE[x.status]||'mut',FBNAME[x.status]||x.status)}<span>${esc(x.id)} · ${PL.ago(x.ts)} ago</span></div>
      <p class="su-fb-t">${esc(h)}</p>${rest.join('\n').trim()?`<div class="md su-fb-b">${md(rest.join('\n').trim())}</div>`:''}
      <p class="small mut su-fb-m">from ${PL.agentLink(x.from_name||'an agent')}${x.space?' · '+esc(x.space):''} · plugin ${esc(x.plugin||'?')}, daemon ${esc(x.daemon||'?')}${task?` · task ${PL.taskLink(task.id)} ${esc(TSTATE[task.status]||task.status)} with ${PL.agentLink(task.owner)}`:''}</p>
      ${x.note?`<div class="su-note"><span class="label">Your note</span>${esc(x.note)}</div>`:''}
      <div class="su-acts">${acts}<button type="button" class="btn btn-ghost sm" data-su="fbnote" data-arg="${esc(x.id)}">${x.note?'Edit note':'Add a note'}</button></div></article>`};
  const cnt=s=>all.filter(x=>ty(x)&&inSt(x,s)).length;
  const bar=`<div class="su-fbbar"><div class="chips" role="group" aria-label="Status">${FBST.map(([k,t])=>`<button type="button" class="chip" aria-pressed="${f.st===k}" data-su="fbst" data-arg="${k}">${t}<span class="su-n">${cnt(k)}</span></button>`).join('')}</div>
    <div class="seg" role="group" aria-label="Type">${[['','All'],['bug','Bugs'],['idea','Ideas']].map(([k,t])=>`<button type="button" class="${f.ty===k?'on':''}" aria-pressed="${f.ty===k}" data-su="fbty" data-arg="${k}">${t}</button>`).join('')}</div></div>`;
  const groups=f.st==='needs'||f.st==='all'?Object.keys(FBNAME).filter(s=>inSt({status:s},f.st)).map(s=>{const l=shown.filter(x=>x.status===s);return l.length?PL.label(`${FBNAME[s]} · ${l.length}`)+`<div class="su-stack">${l.map(one).join('')}</div>`:''}).join('')
    :`<div class="su-stack">${shown.map(one).join('')}</div>`;
  PL.paint($('#su-feedback'),bar+(shown.length?groups:PL.empty({icon:'feedback',title:all.length?'Nothing here':'No feedback yet',text:all.length?'Nothing matches these filters.':'Agents report bugs and ideas about peerlink here, when Settings lets them.',action:all.length&&f.st!=='all'?{label:'Show all',attrs:'data-su="fbst" data-arg="all"'}:null})))}
ACT.fbst=k=>{S.fb.st=k;PL.keep('setup.fbst',k);PL.render()};
ACT.fbty=k=>{S.fb.ty=k;PL.keep('setup.fbty',k);PL.render()};
ACT.fbset=async(id,b)=>{const x=PL.state.issues.find(i=>i.id===id),was=x?.status,s=b.dataset.s;b.disabled=true;
  const r=await post('/api/issues/'+enc(id),{status:s});b.disabled=false;if(r.error)return tell(r.error);await refresh(true);
  // Accepting hands it to the peerlink agent as a task, which can't be taken back; the rest can.
  if(s==='accepted')PL.toast(`${id} accepted: task ${r.feedback?.task||''} for the peerlink agent`);
  else PL.toast(`${id} ${s==='new'?'back to new':s==='done'?'done':'dismissed'}`,{undo:async()=>{await post('/api/issues/'+enc(id),{status:was});refresh(true)}})};
ACT.fbnote=id=>{const x=PL.state.issues.find(i=>i.id===id);if(!x)return;
  sheet({title:`Note on ${id}`,body:field('Note',`<textarea name="note" rows="4" placeholder="What you decided, or what to look at">${esc(x.note||'')}</textarea>`,x.status==='new'?'Accepting it later sends the note with the task.':''),
    onSave:async f=>{if(f.elements.note.value.trim()===(x.note||''))return;const r=await post('/api/issues/'+enc(id),{note:f.elements.note.value});if(r.error)return r.error;PL.toast('Note saved');refresh(true)}})};

// ---- Help: one ? per section, in a sheet --------------------------------------------------------------------------
const HELP={
  '':`<p>Setup is what you set up once and rarely visit. Each card shows what’s set now; open one to change it.</p><p>The gear’s number counts what waits on you here: rule proposals and new feedback.</p>`,
  spaces:`<p>An agent only sees and messages agents in its own space. Put an agent in a space from its page on Agents; a folder you haven’t placed takes the space in the nearest <span class="mono">.peerlink</span> file at or above it, else it’s <b>unassigned</b>.</p>
    <p>Work sent to a space goes to its <b>lead</b>: the agent you pick here, or else the one that was alone in it. The lead decides who does it.</p>
    <p>A space can sit <b>inside</b> another. Its lead then sits with that space’s agents and speaks for it there; a rule for the outer space reaches it too.</p>
    <p>Deleting a space drops every setting that names it. Its agents go back to their <span class="mono">.peerlink</span> space or unassigned.</p>`,
  rules:`<p>A rule is something you’ve told your agents for good. It reaches every agent in its space and the spaces inside it, in its instructions, so a cleared context still has it.</p>
    <p>An agent can propose one for its own space: it waits here, and in your Inbox, until you approve it. Turn a rule off to stop it for a while without losing it.</p>`,
  channels:`<p>Talk to your agents from outside the terminal. Each platform’s row opens its setup; once it’s connected, map its channels to agents.</p>
    <p>On a mapping, agents that <b>receive</b> get your messages there and agents that <b>send</b> post their messages there. To reach one agent, reply to its post or start with its name and a colon: <span class="mono">storefront: how’s the build?</span></p>
    <p>Start a post with <span class="mono">Task:</span> to hand it over as a task, or <span class="mono">Announcement:</span> to tell the receiving agent’s whole space. If an agent isn’t running, your message waits up to an hour for it. Agents can message you first, labelled with their name.</p>
    <p>A reaction on your message shows its progress:</p><div class="su-legend"><span>👀</span><span>delivered to the agent</span><span>🤔</span><span>thinking</span><span>🛠️</span><span>using tools</span><span>❓</span><span>asked you something</span><span>✅</span><span>answered</span></div>`,
  settings:`<p>Settings are the daemon’s, for every agent; a change reaches them within a few seconds. Switches apply at once, with Undo. Other values open a sheet.</p>
    <p>Each wake-up is a full turn that re-reads the agent’s context, so waking for every message, and a large context, cost usage. <b>Desktop alerts</b> is this browser’s alone.</p>`,
  controls:`<p>The daemon runs on this machine and keeps every agent, message and task. Restarting it is safe: agents reconnect by themselves.</p>
    <p>The key in peerlink’s folder signs agents and sign-in links. Rotating it signs out every browser. <b>Start clean</b> backs up the files it clears.</p>`,
  feedback:`<p>Agents report bugs and ideas about peerlink itself here, when <b>Settings › What agents see</b> lets them.</p>
    <p><b>Accept</b> hands one to the peerlink agent as a task, with your note. Mark it <b>Done</b> when it’s fixed or built, or <b>Dismiss</b> it.</p>`};
ACT.help=sec=>sheet({title:sec?`How ${SECS.find(x=>x[0]===sec)[1].toLowerCase()} work`:'About Setup',body:`<div class="su-help-b">${HELP[sec]||''}</div>`});

// ---- Events ------------------------------------------------------------------------------------------------------
document.addEventListener('click',e=>{const b=e.target.closest('[data-su]');
  if(b&&ACT[b.dataset.su]&&!b.disabled){e.preventDefault();Promise.resolve(ACT[b.dataset.su](b.dataset.arg,b)).catch(x=>PL.toast(String(x.message||x),{kind:'bad'}))}});
// Switches apply at once (TOG[name](arg, on) says whether it took), each with Undo in its toast.
PL.onSwitch('[data-su-tog]',(t,on)=>TOG[t.dataset.suTog]?.(t.dataset.arg,on));
document.addEventListener('change',e=>{const t=e.target.closest?.('[data-su-pick]');if(t&&PICK[t.dataset.suPick])PICK[t.dataset.suPick](t.dataset.arg,t)});

// Rules: every 5 s on Rules, 15 s on the overview, every minute elsewhere (for the gear's count). Channels: every
// 5 s on Channels, 20 s on the overview, for the platforms' state and anyone waiting.
loadRules().catch(()=>{});
setInterval(()=>{if(document.hidden)return;const on=PL.route.page==='setup',sec=on?S.sec:null,now=Date.now();
  if(now-S.rulesAt>(sec==='rules'?4000:sec===''?15000:60000))loadRules().catch(()=>{});
  if(sec==='channels'||(sec===''&&now-S.ch.at>20000))chLoad().catch(()=>{})},5000);
})();
