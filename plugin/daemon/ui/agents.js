let editing=false,sel='';
// Leaving Agents, or Escape, closes the agent panel: it should never linger over another page.
const closePanel=()=>{if(!sel)return;sel='';editing=false;refresh(true)};
// A page starts at its top: the browser would otherwise scroll to the section the link names, hiding its heading.
window.addEventListener('hashchange',()=>{show();closePanel();scrollTo(0,0)});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePanel()});
function agentPanel(x,others=[]){const sc=cfg.sessions?.[x.id]||{};const setSpace=x.space_source==='agent'||x.space_source==='set'?(x.space==='default'?'unassigned':x.space):'';
  const wake=sc.auto_wake===true?'on':sc.auto_wake===false?'off':'default';
  const why=x.space_source==='started'?'the agent that started it asked for it':x.space_source==='agent'?'you put it here':x.space_source==='set'?'you put its folder here':x.space_source==='file'?'from '+tilde(x.space_from):'no space set';
  const how={set:'you picked it',only:'it was the only agent in the space'}[x.leads]||'';
  const led=leadOf[x.space];
  const role=x.leads?`Leads the <b>${esc(x.space)}</b> space${x.parent?` inside <b>${esc(x.parent)}</b>`:''} <span class="mut">· ${how}</span>`:`Member${led?` · led by ${esc(led.name)}${led.live?'':' (offline)'}`:''}`;
  // Only you, here, pick a lead: the daemon refuses it from agents and bots.
  const leadBtn=x.remote||!x.space||x.space==='default'?'':x.leads?`<button class="ghost small" data-clearlead="${esc(x.space)}">Clear lead</button>`:`<button class="ghost small" data-makelead="${esc(x.space)}" data-cwd="${esc(x.cwd)}" data-id="${esc(x.id)}">${led?'Make lead instead of '+esc(led.name):'Make lead of '+esc(x.space)}</button>`;
  const opt=(v,t)=>`<option value="${v}" ${wake===v?'selected':''}>${t}</option>`;
  const tab=x.remote?'about':panelTab;
  return `<div class="card panel${x.leads?' is-lead':''}">
   <div class="top"><span class="phead"><span class="plogo" style="background:${x.leads?'var(--acc)':'var(--mut)'}"><b style="color:#fff">${initial(x.name)}</b></span>
     <span class="ptitle"><span><span class="name">${esc(x.name)}</span>${x.remote?` <span class="mut small">@${esc(x.host)}</span>`:''}</span>
     <span class="psub"><span class="dot ${x.busy?'busy':''}"></span>${x.busy?'working':'idle'}${x.busy_since?' '+ago(x.busy_since):''} · <span class="pill">${esc(x.space||'default')}</span>${x.leads?' <span class="pill acc">lead</span>':''}</span></span></span><button class="ghost x" data-close title="Close">✕</button></div>
   <div class="pwhere"><span class="mono">${esc(tilde(x.cwd))}${x.branch?' · ⎇ '+esc(x.branch):''}</span><button class="ghost small copy" data-copy="${esc(x.cwd)}" title="Copy the folder path">Copy</button></div>
   ${x.role?`<div class="role"><span class="k">Role</span> ${esc(x.role)}</div>`:''}
   <div class="pnow"><div class="k small">Now${x.summary_ts&&x.summary?` · set ${ago(x.summary_ts)} ago${oldSummary(x)?', may be out of date':''}`:''}</div>${oldSummary(x)?`<span class="mut">${esc(x.summary)}</span>`:esc(x.summary)||'<span class="mut">no summary yet</span>'}</div>
   ${x.remote?'':`<div class="ptiles"><div><span class="k small">Context</span><b>${x.context??'?'}%</b>${x.context!=null?`<span class="cmeter${x.context>=80?' hi':x.context>=50?' mid':''}"><i style="width:${Math.min(100,x.context)}%"></i></span>`:''}</div>
     <div><span class="k small">Sent / hour</span><b${x.sent_hour>=20?' style="color:var(--warn)"':''}>${x.sent_hour||0}</b></div><div><span class="k small">Open tasks</span><b>${x.open_tasks||0}</b></div></div>`}
   ${x.remote?'':`<div class="ptabs">${[['about','Agent'],['tasks','Tasks'+(x.open_tasks?' · '+x.open_tasks:'')],['details','Details'],['controls','Controls']].map(([k,t])=>`<button class="${tab===k?'on':''}" data-ptab="${k}">${t}</button>`).join('')}</div>`}
   ${tab==='tasks'?panelTasks(x):tab==='details'?`<form id="agentform" data-id="${esc(x.id)}" data-nick="${esc(sc.nickname||'')}" data-space="${esc(setSpace)}" data-role="${esc(sc.role||'')}" data-cwd="${esc(x.cwd)}" data-who="${esc(x.name)}" data-lead="${x.leads?esc(x.space):''}" data-also="${esc((x.also||[]).join(', '))}" data-links="${esc((x.links||[]).join(', '))}">
    <label>Name<input name="nickname" type="text" value="${esc(sc.nickname||'')}" placeholder="${esc(x.name)}"><span class="hint">What other agents call it. Kept for this folder.</span></label>
    <label>Role<textarea name="role" rows="3" placeholder="${x.folder_role?'From the folder: '+esc(x.folder_role):'What this agent is here for, e.g. Owns the billing API: invoices, payments, the Stripe webhook.'}">${esc(sc.role||'')}</textarea><span class="hint">For this agent only, kept across /clear and resume. The agent gets it as its brief, and other agents see it.${x.folder_role?' Leave it empty to use the role: in its folder\'s .peerlink.':' A role: line in a folder\'s .peerlink is the role of every agent there without one of its own.'}</span></label>
    <label>Space<input name="space" type="text" list="spacenames" value="${esc(setSpace)}" placeholder="${x.space_source==='file'?esc(x.space)+' (from its .peerlink)':x.space_source==='started'?esc(x.space)+' (started for it)':'unassigned'}"><span class="hint">For this agent only: others in its folder stay where they are. It keeps it after /clear and restarts.${x.space_source==='agent'?' Leave it empty to go back to its folder\'s space.':''}</span>
    ${x.space&&x.space!=='default'?`<button type="button" class="ghost small" data-unassign="${esc(x.id)}" data-who="${esc(x.name)}" data-lead="${x.leads?esc(x.space):''}" data-folder="${esc(x.cwd)}" style="margin-top:6px">Unassign from ${esc(x.space)}</button>`:''}</label>
    <details class="adv"${(x.also||[]).length?' open':''}><summary>Also in other spaces</summary>
    <label>Also a member of<input name="also" type="text" value="${esc((x.also||[]).join(', '))}" placeholder="none"><span class="hint">Rarely needed: more spaces it sees and messages, on top of its own. For this agent only. Separate with commas.</span></label></details>
    <details class="adv"${(x.links||[]).length?' open':''}><summary>Linked with other agents</summary>
    <label>Linked with<input name="links" type="text" value="${esc((x.links||[]).join(', '))}" placeholder="none"><span class="hint">Agents it sees and messages, and that see and message it, whatever spaces they're in. Nobody else's reach changes. Separate names with commas.</span></label></details>
    <datalist id="spacenames">${Object.keys(leadOf).concat(livePeers.map(p=>p.space)).filter((n,i,a)=>n&&n!=='default'&&a.indexOf(n)===i).sort().map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
    <div><button type="submit">Save</button> <span id="agentmsg" class="small"></span></div></form>`:tab==='controls'?`<form id="agentform" data-id="${esc(x.id)}" data-wake="${wake}" data-muted="${x.muted?'1':''}" data-auto="${x.auto_approve?'1':''}">
    <label>When a message arrives<select name="wake">${opt('default','Use the default')}${opt('on','Start a turn')}${opt('off','Wait for the next prompt')}</select></label>
    <label class="check"><input name="muted" type="checkbox" ${x.muted?'checked':''}> Mute: hold every message for this agent</label>
    <label class="check"><input name="auto_approve" type="checkbox" ${x.auto_approve||cfg.auto_approve_all?'checked':''} ${cfg.auto_approve_all?'disabled title="On for every agent in Settings"':''}> Let it start agents and schedules without asking me (its folder keeps this)</label>
    <div><button type="submit">Save</button> <span id="agentmsg" class="small"></span></div></form>
    ${leadBtn?`<div class="threads"><div class="k small">Lead</div><div class="small mut">${role}</div><div>${leadBtn}</div></div>`:''}
    <div class="threads"><div class="k small">Clear its context</div><div class="small mut">Runs /clear once its current turn ends: a fresh conversation in the same folder, keeping its name, space and role. What it still owes peers is given back to it.</div>
    <div><button class="ghost small" data-clearctx="${esc(x.id)}">Clear context</button> <span class="small ok" id="clearmsg"></span></div></div>
    <div class="threads"><div class="k small">End this agent</div><div class="small mut">It finishes its current turn, then closes. If it's still running a minute later, it's stopped.</div>
    <div><button class="ghost small danger" data-terminate="${esc(x.id)}" ${x.terminating?'disabled':''}>${x.terminating?'Ending…':'Terminate'}</button></div></div>`:`<div class="facts">${x.muted?'<span class="k">Status</span><span>muted</span>':''}
    <span class="k">Space</span><span><span class="pill">${esc(x.space||'default')}</span> <span class="mut">${esc(why)}</span>${(x.also||[]).length?` <span class="mut">· also in</span> ${x.also.map(n=>`<span class="pill">${esc(n)}</span>`).join(' ')}`:''}</span>
    <span class="k">Role</span><span>${role}</span>
    ${x.sent_hour>=20?'<span class="k">Messages</span><span style="color:var(--warn)">chatty: each one can cost its recipient a turn</span>':''}
    ${x.context>=80?'<span class="k">Context</span><span style="color:var(--warn)">close to compacting</span>':''}
    <span class="k">Plugin</span><span>${esc(x.plugin||'older than 0.6.6')}${x.stale&&!x.remote?` · <span style="color:var(--warn)">${x.reload_queued?`reload queued ${ago(x.reload_queued)} ago and not run yet: `:''}run /reload-plugins in this agent</span>`:''}</span></div>
   ${others.length?`<div class="threads"><div class="k small">Other sessions in this folder</div>${others.map(o=>`<button class="ghost small" data-sel="${esc(o.id)}" style="text-align:left">${esc(o.name)} · ${o.busy?'working':'idle'}${o.summary?' · '+esc(o.summary.slice(0,60)):''}</button>`).join('')}</div>`:''}
   ${(x.threads&&(x.threads.owes.length||x.threads.waiting.length))?`<div class="threads"><div class="k small">Open requests</div>
    ${x.threads.owes.map(t=>`<div class="small">owes <b>${esc(t.with)}</b> a reply · <span class="mut">${esc(t.id)}: ${esc(t.text.slice(0,90))}</span></div>`).join('')}
    ${x.threads.waiting.map(t=>`<div class="small">waiting on <b>${esc(t.with)}</b> · <span class="mut">${esc(t.id)}: ${esc(t.text.slice(0,90))}</span></div>`).join('')}</div>`:''}
   ${x.remote?'':`<form id="msgform" class="sendbox" data-to="${esc(x.id)}"><label>Message ${esc(x.name)}<textarea name="text" rows="3" placeholder="It arrives as a message from you; its reply shows in Messages."></textarea></label>
    <div class="addline"><label class="check"><input type="checkbox" name="astask"> Send as a task</label><button type="submit">Send</button><span class="small ${sentNote.err?'err':'ok'}" id="sendmsg">${sentNote.to===x.id?esc(sentNote.text):''}</span></div></form>`}
   ${x.remote?'<div class="small mut">This agent runs on another machine; change it there.</div>':''}`}</div>`}
// The Agents page (and, until the next step, the Spaces chart, which shares its org tree): drawn from refresh().
function drawAgents(p,m){
  const groups={};for(const x of p.peers)(groups[x.space||'default']??=[]).push(x);
  const lbl=n=>n==='default'?'unassigned':n;
  const names=[...new Set(p.peers.map(x=>x.space||'default'))];
  // An org chart. A space is a box of its own agents; the lead of a space inside it sits in that box too, with
  // its team's box hanging beneath it. Charts with teams in them come first, so the top of the org is at the top.
  // Two sessions open in a lead's folder are both leads: all sit in the parent's box, the team under the first.
  // A lead that's offline keeps its place at the top of its space, greyed, so you can see who work waits for.
  leadOf=p.leads||{};
  const ghost=(n,l)=>({id:'',name:l.name,cwd:l.cwd,space:n,parent:l.parent&&l.parent!==n?l.parent:'',leads:l.how,offline:true,summary:'offline; work for the space waits for it'});
  const ghosts=Object.entries(leadOf).filter(([n,l])=>!l.live).map(([n,l])=>ghost(n,l));
  const inside={},kids={},leads={};for(const x of [...p.peers,...ghosts])if(x.parent){(leads[x.space]??=[]).push(x);if(!inside[x.space]){inside[x.space]={parent:x.parent,lead:x.name,peer:x};(kids[x.parent]??=[]).push(x.space)}}
  for(const n in inside)inside[n].lead=leads[n].map(x=>x.name).join(', ');
  // A nested space whose only agent is its offline lead has no live members, but it still gets a box.
  for(const n of [...Object.keys(kids),...Object.keys(inside)])if(!groups[n])groups[n]=[];
  // An agent you added to other spaces shows once, in its own space, with a badge for each space it also joined.
  // The Spaces chart still names it in each of them, with its own space beside it.
  const joined={};for(const x of p.peers)for(const n of x.also||[])(joined[n]??=[]).push(x);
  const size=(n,seen=new Set())=>{if(seen.has(n))return 0;seen.add(n);return (groups[n]||[]).length+(kids[n]||[]).reduce((t,c)=>t+size(c,seen),0)};
  const order=(a,b)=>a==='default'?1:b==='default'?-1:((kids[b]||[]).length>0)-((kids[a]||[]).length>0)||size(b)-size(a)||a.localeCompare(b);
  const roots=Object.keys(groups).filter(n=>!inside[n]||n===inside[n].parent).sort(order);
  // A lead of a space at the top sits pinned above its members, who hang beneath it.
  const tops=n=>[...(groups[n]||[]).filter(x=>x.leads&&!x.parent),...ghosts.filter(x=>x.space===n&&!x.parent)].sort(rank);
  // A space's box: its members, then the leads of the spaces under it.
  const isLead=(x,n)=>!!(inside[n]&&inside[n].parent!==n&&x.parent&&x.space===n);
  const members=n=>[...(groups[n]||[]).filter(x=>!isLead(x,n)&&!(x.leads&&!x.parent)).sort(rank).sort((a,b)=>a.name.localeCompare(b.name)),
    ...(kids[n]||[]).filter(c=>c!==n).sort().map(c=>inside[c].peer)];
  const short=d=>{const t=tilde(d).split('/');return t.length>3?'…/'+t.slice(-2).join('/'):t.join('/')};
  const state=x=>(x.busy?'working':'idle')+(x.busy_since?' '+ago(x.busy_since):'');
  // Messages sent in the last hour, flagged from 20: each one can cost its recipient a turn.
  const rate=x=>x.sent_hour?`<span class="${x.sent_hour>=20?'hot':'mut'}" title="messages sent in the last hour">${x.sent_hour}/h</span>`:'';
  // Context as a small meter: how full the agent's window is, its number on hover.
  // The list shows a few words; the side panel the whole summary. Older plugins send no headline: the first sentence, cut.
  const headline=x=>{if(x.headline)return x.headline;const first=String(x.summary||'').split(/(?<=[.;!?])\s|\s[—–-]\s/)[0].trim().replace(/[;:,]$/,'');
    return first.length>80?first.slice(0,first.lastIndexOf(' ',78)>40?first.lastIndexOf(' ',78):78)+'…':first};
  const ctx=x=>x.context==null?'':`<span class="cmeter${x.context>=80?' hi':x.context>=50?' mid':''}" title="${x.context}% of its context window in use"><i style="width:${Math.min(100,x.context)}%"></i></span>`;
  // A lead is told apart by its outline (and says which team on hover), so every card keeps its context in one place.
  // The badge sits in the name row, left of the context; an offline lead's clear link goes beneath.
  // An implicit lead (it was alone in the space) has a dashed badge, and says so on hover, so the name keeps its room.
  const alsoBadges=x=>(x.also||[]).map(n=>`<span class="badge guest" title="Also a member of ${esc(n)}">+${esc(n)}</span>`).join('')
    +(x.links||[]).map(n=>`<span class="badge guest" title="Linked with ${esc(n)}">↔${esc(n)}</span>`).join('');
  const leadBadge=x=>x.leads?`<span class="badge${x.leads==='only'?' only':''}" title="${x.leads==='only'?'Lead (only agent): it was the only agent in the space':'Lead'}">Lead</span>`:'';
  const badge=x=>alsoBadges(x)+leadBadge(x);
  // An offline lead stays pinned until you pick another, or remove it here (its agent is then under Offline agents).
  const offBtn=x=>x.leads&&x.offline?`<button class="ghost small" data-clearlead="${esc(x.space)}" data-off="${esc(x.name)}" data-offcwd="${esc(x.cwd)}" title="Delete this offline agent, or else clear it as the space's lead">Remove</button>`:'';
  const clearOff=x=>x.leads&&x.offline?`<div>${offBtn(x)}</div>`:'';
  const node=x=>`<${x.offline?'div':'button'} class="node${x.leads?' is-lead':''}${x.offline?' off':''}${x.id&&x.id===sel?' sel':''}"${x.offline?'':` data-sel="${esc(x.id)}"`}${x.leads?` title="Leads the ${esc(x.space)} space${x.offline?' (offline)':''}"`:''}>
    <div class="nm"><span title="${esc(x.name)}">${x.offline?'':`<span class="dot ${x.busy?'busy':''}"></span>`}${esc(x.name)}</span><span class="rt">${badge(x)}</span></div>${clearOff(x)}
    <div class="dir" title="${esc(tilde(x.cwd))}${x.branch?' · '+esc(x.branch):''}">${esc(short(x.cwd))}${x.branch?` · ⎇ ${esc(x.branch)}`:''}</div><div class="sum" title="${esc(x.summary||x.role||'')}">${esc(headline(x)||x.role)||'no summary yet'}</div>${x.offline?'':`<div class="state"><span>${state(x)}${x.sent_hour?' · '+rate(x):''}${x.open_tasks?` · <span style="color:var(--acc)">${x.open_tasks} task${x.open_tasks>1?'s':''}</span>`:''}</span>${ctx(x)}</div>`}</${x.offline?'div':'button'}>`;
  // Every live agent gets its own card, two sessions in one folder included: a hidden one can't be found to message.
  const rank=(a,b)=>(b.busy-a.busy)||(a.last_seen_s-b.last_seen_s);
  const unit=(n,seen)=>{if(seen.has(n))return '';seen.add(n);
    const list=members(n),branches=list.some(x=>x.parent&&x.space!==n);
    const top=tops(n);
    const count=top.filter(x=>!x.offline).length+list.reduce((t,x)=>t+(x.parent&&x.space!==n?leads[x.space].filter(l=>!l.offline).length:x.offline?0:1),0);
    const cols=list.map(x=>x.parent&&x.space!==n&&!seen.has(x.space)
      ?`<div class="ocol"><div class="orow stack">${leads[x.space].slice().sort(rank).map(node).join('')}</div><div class="down"></div>${unit(x.space,seen)}</div>`:`<div class="ocol">${node(x)}</div>`);
    // A team with no teams under it stacks, so each lead's column stays one card wide.
    const stack=inside[n]&&inside[n].parent!==n&&!branches;
    const row=`<div class="orow${stack?' stack':''}">${cols.join('')||'<span class="mut small">no other live agents</span>'}</div>`;
    return `<div class="unit"><div class="unit-h">${esc(lbl(n))} · ${count}</div>${top.length?`<div class="orow stack">${top.map(node).join('')}</div>${cols.length?`<div class="under">${row}</div>`:''}`:row}</div>`};
  // Each space's box picks its lead and where it sits. The lead is any folder with a live agent in the space.
  const pick=(n)=>{if(n==='default')return '';const cur=leadOf[n];const folders=[...new Map((groups[n]||[]).map(x=>[x.cwd,x.name])).entries()];
    if(cur&&!folders.some(([c])=>c===cur.cwd))folders.unshift([cur.cwd,cur.name+' (offline)']);
    const others=names.concat(Object.keys(leadOf)).filter((s,i,a)=>s!==n&&s!=='default'&&a.indexOf(s)===i).sort();const up=(groups[n]||[])[0]?.space_parent??leadOf[n]?.parent??'';
    return `<div class="spick"><label>Lead<select data-splead="${esc(n)}"><option value="">${cur?'no lead':'none yet'}</option>${folders.map(([c,nm])=>`<option value="${esc(c)}" ${cur&&cur.cwd===c?'selected':''}>${esc(nm)}${cur&&cur.cwd===c&&cur.how==='only'?' (was alone)':''}</option>`).join('')}</select></label>
      <label>Inside<select data-spparent="${esc(n)}"><option value="">top level</option>${others.map(o=>`<option ${o===up?'selected':''}>${esc(o)}</option>`).join('')}</select></label></div>`};
  const sunit=(n,seen)=>{if(seen.has(n))return '';seen.add(n);
    const own=[...(groups[n]||[]).filter(x=>!isLead(x,n)&&!(x.leads&&!x.parent)).map(x=>esc(x.name)),...(joined[n]||[]).map(x=>esc(x.name)+` <span class="mut">(${esc(x.space||'default')})</span>`)];
    const ledBy=inside[n]?inside[n].lead:tops(n).map(x=>x.name+(x.offline?' (offline)':'')).join(', ');
    const ch=(kids[n]||[]).filter(c=>c!==n&&!seen.has(c)).sort();
    return `<div class="ocol"><div class="sbox${ledBy?' led':''}"><div class="name">${esc(lbl(n))}</div>
      ${ledBy?`<div class="small" style="color:var(--acc)">led by ${esc(ledBy)}</div>`:''}
      <div class="small mut">${own.join(', ')||'no other agents'}</div>${pick(n)}${n!=='default'?`<button class="ghost small" data-delspace="${esc(n)}">Delete space</button>`:''}</div>
      ${ch.length?`<div class="down"></div><div class="branch">${ch.map(c=>sunit(c,seen)).join('')}</div>`:''}</div>`};
  $('#n-agents').textContent=p.peers.length||'';$('#n-spaces').textContent=names.length||'';$('#n-msgs').textContent=m.messages.length||'';
  // Spaces caught in a parent loop have no root; they are shown at the top level after the rest.
  const all=(fn)=>{const seen=new Set();let out=roots.map(n=>fn(n,seen)).join('');for(const n of Object.keys(groups).sort())if(!seen.has(n))out+=fn(n,seen);return out};
  // The list view: the same tree as the chart, one row per agent, each space indented under the lead that speaks for it.
  const lrow=x=>{const where=[short(x.cwd),x.branch?'⎇ '+x.branch:''].filter(Boolean).map(esc).join(' · ');
    return `<${x.offline?'div':'button'} class="lrow${x.leads?' is-lead':''}${x.offline?' off':''}${x.id&&x.id===sel?' sel':''}"${x.offline?'':` data-sel="${esc(x.id)}"`}>
      <span class="lid"><span class="ln"><span title="${esc(x.name)}">${x.offline?'':`<span class="dot ${x.busy?'busy':''}"></span>`}${esc(x.name)}</span>${leadBadge(x)}</span><span class="lwhere mono" title="${esc(tilde(x.cwd))}">${where}</span></span>
      <span class="lw${oldSummary(x)?' old':''}" title="${esc((x.summary||x.role||'')+(oldSummary(x)?` (set ${ago(x.summary_ts)} ago)`:''))}">${esc(headline(x)||x.role||(x.offline?'offline':''))}</span>
      <span class="lr">${offBtn(x)}${alsoBadges(x)}${x.busy&&!x.offline?`<span class="lbusy">${state(x)}</span>`:''}${x.sent_hour>=20?rate(x):''}${x.open_tasks?`<span class="pill acc">${x.open_tasks} task${x.open_tasks>1?'s':''}</span>`:''}${ctx(x)}</span></${x.offline?'div':'button'}>`};
  const lspace=(n,seen)=>{if(seen.has(n))return '';seen.add(n);
    const nested=inside[n]&&inside[n].parent!==n;
    const head=nested?(leads[n]||[]):tops(n);
    const own=[...(groups[n]||[]).filter(x=>!isLead(x,n)&&!(x.leads&&!x.parent)).sort(rank).sort((a,b)=>a.name.localeCompare(b.name))];
    const ch=(kids[n]||[]).filter(c=>c!==n&&!seen.has(c)).sort();
    const body=own.map(lrow).join('')+ch.map(c=>lspace(c,seen)).join('');
    // Counted as the chart counts: a top-level lead and the leads of teams inside sit with this space; a team's own lead sits with its parent.
    const count=own.length+(nested?0:head.filter(x=>!x.offline).length)+ch.reduce((t,c)=>t+(leads[c]||[]).filter(x=>!x.offline).length,0);
    return `<div class="lspace"><div class="lspace-h">${esc(lbl(n))} · ${count}${nested?` <span class="small">inside ${esc(inside[n].parent)}</span>`:''}</div>
      ${head.slice().sort(rank).map(lrow).join('')}${!body?'':head.length?`<div class="lsub led">${body}</div>`:`<div class="lflat">${body}</div>`}</div>`};
  document.querySelectorAll('[data-alayout]').forEach(b=>b.classList.toggle('on',b.dataset.alayout===aLayout));
  $('#peers').classList.toggle('charts',aLayout==='chart'&&!($('#asearch').value||'').trim());
  // A search shows the matching agents as a flat list, whichever view is on.
  const aq=($('#asearch').value||'').trim().toLowerCase();
  const hits=aq?p.peers.filter(x=>[x.name,x.cwd,x.branch,x.summary,x.space].join(' ').toLowerCase().includes(aq)):null;
  $('#peers').innerHTML=!p.peers.length?'<div class="empty">No live agents. Start Claude Code with the peerlink plugin.</div>'
    :hits?`<div class="lspace-h">${hits.length} match${hits.length===1?'':'es'}</div><div class="lflat">${hits.map(lrow).join('')||'<div class="empty">No agent matches.</div>'}</div>`
    :aLayout==='list'?`<div class="ltree">${all(lspace)}</div>`
    :all((n,seen)=>{const u=unit(n,seen);return u?`<div class="chart">${u}</div>`:''});
  // Agents not running now: kept 60 days, unless you delete them here. A running one can't be: it registers again.
  const off=offList=p.offline||[],offOpen=$('#offagents details')?.open;
  $('#offagents').innerHTML=off.length?`<details class="how"${offOpen?' open':''}><summary>Offline agents (${off.length})</summary><div class="mlist">${off.map(a=>`<div class="mrow"><span><b>${esc(a.name)}</b> <span class="mut small">${esc(tilde(a.cwd))} · last seen ${a.seen?ago(a.seen)+' ago':'never'}</span></span> <button class="ghost small" data-delagent="${esc(a.id)}" data-name="${esc(a.name)}">Delete</button></div>`).join('')}</div></details>`:'';
  // Agents still on older plugin code: they keep working, but get fixes only after /reload-plugins. The daemon runs
  // the newest peerlink installed, so the fix is a reload, not an update. Each reloads itself when next idle; one
  // whose queued reload hasn't run in 5 minutes is stuck (a dialog open in its terminal, or no turn ever ending).
  const behind=p.peers.filter(x=>x.stale&&!x.remote);
  const stuck=behind.filter(x=>!x.reload_queued||Date.now()/1000-x.reload_queued>300);
  // One line, the names behind a click. Dismissed, it stays away until the set of agents on an old plugin changes.
  const staleKey=stuck.map(x=>x.name).sort().join(','),bar=$('#stalebar');let gone='';try{gone=localStorage.getItem('pl.stale.dismissed')||''}catch(e){}
  bar.style.display=stuck.length&&gone!==staleKey?'flex':'none';bar.dataset.key=staleKey;
  if(stuck.length&&bar.dataset.shown!==staleKey){bar.dataset.shown=staleKey;
    bar.innerHTML=`<details><summary><b>${stuck.length} agent${stuck.length>1?'s':''} need${stuck.length>1?'':'s'} <span class="mono">/reload-plugins</span></b> <span class="mut">for the newer peerlink plugin · show which</span></summary>
      <div class="small">${stuck.map(x=>esc(x.name)+(x.reload_queued?` <span class="mut">(reload waiting ${ago(x.reload_queued)})</span>`:'')).join(', ')}. Run <span class="mono">/reload-plugins</span> in ${stuck.length>1?'each':'it'}, or terminate it.</div></details>
      <button class="ghost small" data-stalehide title="Hide until another agent needs it">Dismiss</button>`}
  const picked=p.peers.find(x=>x.id===sel);
  const panel=picked?agentPanel(picked,p.peers.filter(y=>y.id!==picked.id&&y.cwd===picked.cwd&&y.space===picked.space)):'';
  // Never redraw the panel under someone editing it.
  if(panel!==lastPanel&&!(editing&&picked&&$('#agentform')?.dataset.id===picked.id)){
    // A section you opened stays open when the panel is drawn again (a busy agent's record changes every few seconds).
    const opened=[...document.querySelectorAll('#detail details[open] > summary')].map(s=>s.textContent);
    $('#detail').innerHTML=panel;lastPanel=panel;
    for(const d of document.querySelectorAll('#detail details'))if(opened.includes(d.querySelector(':scope > summary')?.textContent))d.open=true}
  // The open panel takes room beside the chart rather than covering part of it.
  document.body.classList.toggle('drawer',!!picked);
  // The default space is always listed: it's where every agent with no space set lands.
  const dflt=groups.default?'':`<div class="chart"><div class="orow" style="justify-content:flex-start"><div class="ocol"><div class="sbox" style="min-height:0"><div class="name">unassigned</div><div class="small mut">agents whose folder has no space · none live</div></div></div></div></div>`;
  $('#spacelist').innerHTML=`<div class="sgrid">${all((n,seen)=>{const u=sunit(n,seen);return u?`<div class="chart">${u}</div>`:''})}</div>`+dflt;
}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-makelead],[data-clearlead]');if(!b)return;e.stopPropagation();
  const space=b.dataset.makelead||b.dataset.clearlead;
  // An offline lead: delete its agent, which takes the lead with it; one with no record left just stops leading.
  const gone=b.dataset.off&&(offList.find(a=>a.cwd===b.dataset.offcwd&&a.name===b.dataset.off)||offList.find(a=>a.cwd===b.dataset.offcwd));
  if(gone){if(!await ask(`Delete ${gone.name}? It's offline: it stops leading ${space}, and its settings and the spaces you set for it go.`))return;
    const r=await post(`/api/agents/${encodeURIComponent(gone.id)}/delete`);if(r.error)tell(r.error);refresh(true);return}
  if(b.dataset.clearlead&&!await ask(b.dataset.off?`Remove ${b.dataset.off}, offline, as the lead of ${space}? The space has no lead until you pick one.`:`Clear the lead of ${space}? Work sent to the space won't reach anyone until you pick a new lead.`,{ok:b.dataset.off?'Remove':'Clear'}))return;
  const r=await post(`/api/spaces/${encodeURIComponent(space)}/lead`,{cwd:b.dataset.cwd||'',id:b.dataset.makelead?b.dataset.id||'':''});if(r.error)tell(r.error);refresh(true)});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-clearctx]');if(!b)return;
  const x=livePeers.find(p=>p.id===b.dataset.clearctx);if(!await ask(`Clear ${x?x.name:'this agent'}'s context? It starts a fresh conversation after the turn it's in.`))return;
  const r=await post(`/api/sessions/${encodeURIComponent(b.dataset.clearctx)}/clear`);if(r.error)tell(r.error);else{const m=$('#clearmsg');if(m)m.textContent='Asked: it clears after its current turn.'}});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-terminate]');if(!b)return;
  const x=livePeers.find(p=>p.id===b.dataset.terminate);if(!await ask(`End ${x?x.name:'this agent'}? Its session closes after the turn it's in.`))return;
  const r=await post(`/api/sessions/${encodeURIComponent(b.dataset.terminate)}/terminate`);if(r.error)tell(r.error);refresh(true)});
var aLayout=pref('alayout','list');
// Out of its space, whatever its folder's is: it joins the agents in no space.
// Moving an agent that leads its space hands the lead on, and agents sharing a folder look alike: say which one moves.
const sureToMove=(d,to)=>{const lead=d.lead,where=to&&to!=='unassigned'?`to ${to}`:'out of every space';
  return ask(lead?`Move ${d.who} ${where}? It leads ${lead}: another agent will lead it instead, and ${d.who} loses its peers there.`:`Move ${d.who} (${d.folder||d.cwd}) ${where}? Other agents in its folder stay where they are.`)};
document.addEventListener('click',async e=>{const b=e.target.closest('[data-unassign]');if(!b)return;e.preventDefault();
  if(!await sureToMove(b.dataset,'unassigned'))return;
  const r=await post('/api/folders/space',{id:b.dataset.unassign,space:'unassigned'});if(r.error)tell(r.error);editing=false;lastPanel='';refresh(true)});
document.addEventListener('click',e=>{const b=e.target.closest('[data-alayout]');if(!b)return;aLayout=b.dataset.alayout;try{localStorage.setItem('peerlink.alayout',aLayout)}catch{};show();refresh(true)});
function panelTasks(x){
  const mine=allTasks.filter(t=>t.owner_cwd&&t.owner_cwd===x.cwd),asked=allTasks.filter(t=>t.requester?.id===x.id||(x.cwd&&t.requester?.cwd===x.cwd));
  const sec=(title,list,none)=>`<div class="k small">${title}</div>${list.length?byLive(list).map(t=>taskRow(t,false)).join(''):`<div class="small mut">${none}</div>`}`;
  // Its schedules: named for it, or for its folder with no agent named.
  const sched=allSched.filter(c=>(c.status==='active'||c.status==='pending')&&(c.goes_to?c.goes_to===x.name:c.folder===x.cwd));
  const srow=c=>`<div class="small" style="margin:4px 0"><b>${esc(c.id)}</b> ${esc(c.when_text)}${c.agent?'':' <span class="mut">(its folder)</span>'}: ${esc(c.prompt.length>120?c.prompt.slice(0,119)+'…':c.prompt)}${c.status==='pending'?` <span class="mut">waiting for your approval</span> <button class="ghost small" data-schedok="${esc(c.id)}" data-act="approve">Approve</button><button class="ghost small" data-schedok="${esc(c.id)}" data-act="deny">Deny</button>`:''}</div>`;
  return `<div class="ptasks">${sec('Owns',mine,'No tasks for this agent.')}${sec('Asked for',asked,'It hasn\'t handed out any tasks.')}<div class="k small">Schedules</div>${sched.length?sched.map(srow).join(''):'<div class="small mut">None. Add one on the Schedules page.</div>'}</div>`}
// You, to an agent or a space's lead, from the panel's message box or the Tasks page's New task form.
// The panel's note outlives the redraw a send causes.
let sentNote={};
document.addEventListener('submit',async e=>{const f=e.target;if(f.id!=='msgform'&&f.id!=='newtask')return;e.preventDefault();
  const text=f.elements.text.value.trim(),out=f.id==='msgform'?$('#sendmsg'):$('#newtaskmsg');if(!text)return;
  const body=f.id==='msgform'?{to:f.dataset.to,text,kind:f.elements.astask.checked?'task':'message'}:{to:f.elements.to.value,text,kind:'task'};
  const r=await post('/api/web/send',body);
  const note=r.error||`Sent to ${r.to}${r.task?` as task ${r.task}`:''}.`;
  if(f.id==='msgform'){sentNote={to:body.to,text:note,err:!!r.error};setTimeout(()=>{if(sentNote.text===note){sentNote={};refresh(true,lastSnap||undefined)}},4000)}
  if(r.error){out.className='small err';out.textContent=r.error;return}
  f.elements.text.value='';editing=false;out.className='small ok';out.textContent=note;
  if(f.id==='newtask')setTimeout(()=>{f.hidden=true;out.textContent=''},1500);refresh(true)});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-copy]');if(!b)return;e.stopPropagation();
  try{await navigator.clipboard.writeText(b.dataset.copy);b.textContent='Copied'}catch{b.textContent='Copy failed'}setTimeout(()=>{b.textContent='Copy'},1200)});
document.addEventListener('input',e=>{if(e.target.closest('#agentform,#msgform'))editing=true;
  if(e.target.id==='asearch'&&lastSnap)refresh(true,lastSnap);if(e.target.id==='msgq')renderMessages(lastMsgs)});
document.addEventListener('change',e=>{if(e.target.closest('#agentform,#msgform'))editing=true});
// Save applies only what changed, in one go, and says what happened. Details and Controls each show part of the
// agent's settings in this one form, so a field the open tab doesn't show is left alone.
document.addEventListener('submit',async e=>{if(e.target.id!=='agentform')return;e.preventDefault();
  const f=e.target,d=f.dataset,id=d.id,msg=$('#agentmsg'),has=n=>!!f.elements[n],v=n=>f.elements[n].value.trim();
  const patch={},errs=[];
  if(has('nickname')&&v('nickname')!==d.nick)patch.nickname=v('nickname');
  if(has('wake')&&f.elements.wake.value!==d.wake)patch.auto_wake=f.elements.wake.value==='default'?null:f.elements.wake.value==='on';
  if(has('muted')&&f.elements.muted.checked!==!!d.muted)patch.muted=f.elements.muted.checked;
  if(has('auto_approve')&&!f.elements.auto_approve.disabled&&f.elements.auto_approve.checked!==!!d.auto)patch.auto_approve=f.elements.auto_approve.checked;
  if(has('role')&&v('role')!==d.role)patch.role=v('role');
  msg.className='small';msg.textContent='Saving…';
  if(Object.keys(patch).length){const r=await post(`/api/sessions/${encodeURIComponent(id)}/config`,patch);if(r.error)errs.push(r.error);else cfg.sessions=r.sessions}
  if(has('space')&&v('space')!==d.space&&!await sureToMove(d,v('space')||'its folder\'s space')){msg.textContent='Not saved';return}
  if(has('space')&&v('space')!==d.space){const r=await post('/api/folders/space',{cwd:d.cwd,id,space:v('space')});if(r.error)errs.push(r.error)}
  const also=has('also')?v('also').split(',').map(t=>t.trim()).filter(Boolean):[];
  if(has('also')&&also.join(', ')!==d.also){const r=await post('/api/members',{cwd:d.cwd,id,spaces:also});if(r.error)errs.push(r.error)}
  const links=has('links')?v('links').split(',').map(t=>t.trim()).filter(Boolean):[];
  if(has('links')&&links.join(', ')!==d.links){const r=await post('/api/links',{id,names:links});if(r.error)errs.push(r.error)}
  editing=false;lastPanel='';await refresh(true);
  const m2=$('#agentmsg');if(m2){m2.className='small '+(errs.length?'err':'ok');m2.textContent=errs.length?errs.join(' '):'Saved'}});
document.addEventListener('click',async e=>{const t=e.target.closest('button');if(!t)return;
  if(t.dataset.delagent){if(!await ask(`Delete ${t.dataset.name}? Its settings and the spaces you set for it go; messages queued for it wait for its folder's next agent.`))return;
    const r=await post(`/api/agents/${encodeURIComponent(t.dataset.delagent)}/delete`);if(r.error)tell(r.error);refresh(true);return}
  if(t.dataset.delspace){const n=t.dataset.delspace;if(!await ask(`Delete the ${n} space? Its agents go back to their .peerlink space or unassigned, and spaces inside it move to the top.`))return;
    const r=await post(`/api/spaces/${encodeURIComponent(n)}/delete`);if(r.error)tell(r.error);
    else if(r.still_in_files.length){const f=r.still_in_files;tell(`Deleted. The .peerlink in ${f.join(', ')} still name${f.length===1?'s':''} ${n}, so the agents there stay in it until you change ${f.length===1?'that file':'those files'}.`)};refresh(true);return}
  if(t.dataset.sel!==undefined){sel=sel===t.dataset.sel?'':t.dataset.sel;editing=false;refresh(true);return}
  if(t.dataset.close!==undefined){sel='';editing=false;refresh(true);return}
  const act=t.dataset.act;if(!act)return;
  if(act==='logout'){await post('/api/web/logout');location.reload()}
  if(act==='logout-all'&&await ask('Sign out every browser, including this one?')){await post('/api/web/logout',{all:true});location.reload()}
  if(act==='rotate'&&await ask('Rotate the key? Every browser is signed out; agents pick up the new key by themselves.')){await post('/api/key/rotate');location.reload()}
  if(act==='clean'){const parts=[...document.querySelectorAll('[data-clean]:checked')].map(c=>c.dataset.clean);
    if(!parts.length){$('#ctlmsg').textContent='Tick what to clear first.';return}
    if(!await ask(`Clear ${parts.join(', ')}? Rules and running agents stay; the files are backed up first.`,{ok:'Clear'}))return;
    const r=await post('/api/clean',{parts});
    $('#ctlmsg').textContent=r.error?'Not cleared: '+r.error:'Cleared '+Object.entries(r.cleared).map(([k,v])=>`${k} (${v})`).join(', ')+'. Backup: '+r.backup;
    document.querySelectorAll('[data-clean]').forEach(c=>c.checked=false);refresh(true);return}
  if(act==='restart'){await post('/api/restart');$('#ctlmsg').textContent='Restarting…';setTimeout(()=>location.reload(),2500)}});
