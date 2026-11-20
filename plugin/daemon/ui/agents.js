// agents.js: the Agents page. Every live agent by space (a list, or the org chart) beside the selected agent's detail,
// #agents/<name> (or <id> when two live agents share a name). From 900px the two sit side by side; below, they are two
// screens and Back (a route change) goes from the detail to the list. The detail is one scroll, no tabs: header,
// numbers, what it's doing, what it waits on you for, a message box, its tasks, its messages and its setup. Every edit
// happens in a sheet. Everything here is inside one function, so no name leaks into the other pages' scripts.
(()=>{
const AG={layout:pref('alayout','list')==='chart'?'chart':'list',off:pref('agoff','')==='1',mode:'message',shown:undefined,
  drafts:new Map(),answers:new Map(),moreClosed:new Set(),sheet:null,lastHash:location.hash,reverting:false,listSel:''};

PL.page('agents',{title:'Agents',
  html:`<div class="ag-top"><h1>Agents</h1><button type="button" class="icon-btn ag-help" data-aghelp aria-label="How agents and spaces work">?</button></div>
<div class="ag-wrap" id="agwrap">
  <div class="ag-side" id="agside">
    <div class="ag-tools">
      <span class="seg" role="group" aria-label="Layout"><button type="button" data-aglayout="list">List</button><button type="button" data-aglayout="chart">Chart</button></span>
      <button type="button" class="chip" data-agoff aria-pressed="false">Offline <span id="agoffn"></span></button>
      <input id="agsearch" type="search" placeholder="Search agents" aria-label="Search agents by name, folder, branch, space, role or summary" autocomplete="off">
    </div>
    <div id="aglist"></div>
  </div>
  <div class="ag-main" id="agmain">
    <a class="ag-back" href="#agents">${PL.icon('back',20)}Agents</a>
    <div id="agd-head"></div><div id="agd-wait"></div><div id="agd-compose"></div><div id="agd-rest"></div>
  </div>
</div>`,
  count:st=>st.peers.length||'',
  render:(st,route)=>agRender(st,route),
  unmount(){document.body.classList.remove('drawer','wide');AG.sheet?.close()}});

// ---- Small lookups -------------------------------------------------------------------------------------------------
const spaceName=n=>!n||n==='default'?'unassigned':n;
const stateText=x=>(x.busy?'working':'idle')+(x.busy_since?' '+ago(x.busy_since):'');
// The list shows a few words; the detail the whole summary. Older plugins send no headline: the first sentence, cut.
const headline=x=>{if(x.headline)return x.headline;const first=String(x.summary||'').split(/(?<=[.;!?])\s|\s[—–-]\s/)[0].trim().replace(/[;:,]$/,'');
  return first.length>80?first.slice(0,first.lastIndexOf(' ',78)>40?first.lastIndexOf(' ',78):78)+'…':first};
const short=d=>{const t=tilde(d).split('/');return t.length>3?'…/'+t.slice(-2).join('/'):t.join('/')};
// What waits on you from this agent: its questions, tasks for you, approvals it asked for and its feedback.
const itemsFor=(st,x)=>x.remote?[]:st.inbox.filter(i=>i.who===x.name);
const ownsTask=(x,t)=>(x.task_ids||[]).includes(t.id)||(!!t.owner_cwd&&t.owner_cwd===x.cwd);
const askedTask=(x,t)=>t.requester?.id===x.id||(!!x.cwd&&t.requester?.cwd===x.cwd);
const blockedOf=(st,x)=>st.tasks.filter(t=>isLive(t)&&t.blocked&&ownsTask(x,t));
const leadBadge=x=>x.leads?PL.badge('acc',x.leads==='only'?'Lead · only agent':'Lead'):'';
const TBADGE={open:['info','Open'],in_progress:['info','In progress'],done:['ok','Done'],failed:['bad','Failed'],cancelled:['mut','Cancelled']};
const tBadge=t=>t.blocked&&isLive(t)?PL.badge('warn','Blocked'):PL.badge(...(TBADGE[t.status]||['mut',String(t.status)]));
const setSpaceOf=x=>x.space_source==='agent'?(x.space==='default'?'unassigned':x.space):'';
const spaceWhy=x=>x.space_source==='started'?'the agent that started it asked for it':x.space_source==='agent'?'you put it here':x.space_source==='set'?'you put its folder here':x.space_source==='file'?'from '+tilde(x.space_from):'no space set';
const roleLine=(st,x)=>{const how={set:'you picked it',only:'it was the only agent in the space'}[x.leads]||'';const led=st.leads[x.space];
  return x.leads?`Leads ${esc(spaceName(x.space))}${x.parent?`, inside ${esc(x.parent)}`:''} · ${how}`:`Member${led?` · led by ${led.live?PL.agentLink(led.name):esc(led.name)+' (offline)'}`:''}`};
const spaceNames=st=>[...new Set([...Object.keys(st.leads||{}),...st.peers.map(p=>p.space)])].filter(n=>n&&n!=='default').sort();
const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
// The value that matters for a row: what waits on you, or a blocked task, before how full its context is.
const rowValue=(st,x)=>{const n=itemsFor(st,x).length,b=blockedOf(st,x).length;
  if(n||b)return (n?PL.badge('warn',n>1?`waiting on you · ${n}`:'waiting on you'):'')+(b?PL.badge('bad','Blocked'):'');
  return x.context!=null?PL.meter(x.context):''};

// ---- The list: one row per agent, by space, each space's lead first ------------------------------------------------
const lrow=(st,x,lvl,selId)=>{
  if(x.offline)return `<div class="ag-row off" style="--lvl:${lvl}"><span class="dot ag-dot-off"></span><span class="ag-row-main"><span class="ag-row-t"><span class="ag-nm">${esc(x.name)}</span>${leadBadge(x)}</span><span class="ag-row-s">Offline: work for ${esc(spaceName(x.space))} waits for it</span></span>
    <span class="ag-row-v"><button type="button" class="btn btn-soft sm" data-agremovelead="${esc(x.space)}" data-name="${esc(x.name)}" data-cwd="${esc(x.cwd)}">Remove</button></span></div>`;
  const bits=[esc(headline(x)||x.role||'no summary yet')];
  if(x.open_tasks)bits.push(plural(x.open_tasks,'task'));
  if(x.sent_hour>=20)bits.push(`<span class="hot">${x.sent_hour} sent/h</span>`);
  return `<a class="ag-row${x.leads?' is-lead':''}${x.id===selId?' sel':''}${oldSummary(x)?' old':''}" style="--lvl:${lvl}" href="${PL.agentHref(x)}"${x.id===selId?' aria-current="page"':''}>
    <span class="dot${x.busy?' busy':''}" role="img" aria-label="${x.busy?'working':'idle'}"></span><span class="ag-row-main"><span class="ag-row-t"><span class="ag-nm">${esc(x.name)}</span>${x.remote?`<span class="ag-host">@${esc(x.host)}</span>`:''}${leadBadge(x)}</span>
    <span class="ag-row-s">${bits.join(' · ')}</span></span><span class="ag-row-v">${rowValue(st,x)}</span></a>`};
function listHtml(st,selId){const {groups,lbl,inside,kids,leads,rank,tops,isLead,all}=PL.org(st);const byName=(a,b)=>a.name.localeCompare(b.name);
  // A space's rows are its lead, then its members indented under it; a space inside it follows, indented the same.
  const sec=(n,seen,lvl)=>{if(seen.has(n))return '';seen.add(n);
    const nested=inside[n]&&inside[n].parent!==n;
    const head=(nested?(leads[n]||[]):tops(n)).slice().sort(rank);
    const own=(groups[n]||[]).filter(x=>!isLead(x,n)&&!(x.leads&&!x.parent)).sort(byName);
    const ch=(kids[n]||[]).filter(c=>c!==n&&!seen.has(c)).sort();
    const inner=lvl+(head.length?1:0),live=head.filter(x=>!x.offline).length+own.length;
    return `<div class="ag-sec" style="--lvl:${lvl}"><div class="ag-sec-h">${esc(lbl(n))} · ${live}${nested?` <span>inside ${esc(spaceName(inside[n].parent))}</span>`:''}</div>
      ${head.map(x=>lrow(st,x,lvl,selId)).join('')}${own.map(x=>lrow(st,x,inner,selId)).join('')}</div>${ch.map(c=>sec(c,seen,inner)).join('')}`};
  return all((n,seen)=>sec(n,seen,0))}
// The chart: each space a box, its lead on top, the spaces inside it hanging beneath their lead.
function chartHtml(st,selId){const {lbl,inside,leads,rank,tops,members,all}=PL.org(st);
  const node=x=>x.offline?`<div class="node is-lead off"><div class="nm"><span>${esc(x.name)}</span><span class="rt">${leadBadge(x)}</span></div><div class="dir">${esc(short(x.cwd))}</div><div class="sum">Offline: work for the space waits for it</div>
      <div class="state"><button type="button" class="btn btn-soft sm" data-agremovelead="${esc(x.space)}" data-name="${esc(x.name)}" data-cwd="${esc(x.cwd)}">Remove</button></div></div>`
    :`<a class="node${x.leads?' is-lead':''}${x.id===selId?' sel':''}" href="${PL.agentHref(x)}"><div class="nm"><span><span class="dot${x.busy?' busy':''}"></span>${esc(x.name)}</span><span class="rt">${leadBadge(x)}</span></div>
      <div class="dir">${esc(short(x.cwd))}${x.branch?` · ⎇ ${esc(x.branch)}`:''}</div><div class="sum">${esc(headline(x)||x.role||'no summary yet')}</div><div class="state"><span>${stateText(x)}${x.open_tasks?' · '+plural(x.open_tasks,'task'):''}</span>${rowValue(st,x)}</div></a>`;
  const unit=(n,seen)=>{if(seen.has(n))return '';seen.add(n);
    const list=members(n),top=tops(n),branches=list.some(x=>x.parent&&x.space!==n);
    const count=top.filter(x=>!x.offline).length+list.reduce((t,x)=>t+(x.parent&&x.space!==n?leads[x.space].filter(l=>!l.offline).length:x.offline?0:1),0);
    const cols=list.map(x=>x.parent&&x.space!==n&&!seen.has(x.space)
      ?`<div class="ocol"><div class="orow stack">${leads[x.space].slice().sort(rank).map(node).join('')}</div><div class="down"></div>${unit(x.space,seen)}</div>`:`<div class="ocol">${node(x)}</div>`);
    // A space with no spaces under it stacks, so each lead's column stays one card wide.
    const stack=inside[n]&&inside[n].parent!==n&&!branches;
    const row=`<div class="orow${stack?' stack':''}">${cols.join('')||'<span class="mut small">no other live agents</span>'}</div>`;
    return `<div class="unit"><div class="unit-h">${esc(lbl(n))} · ${count}</div>${top.length?`<div class="orow stack">${top.map(node).join('')}</div>${cols.length?`<div class="under">${row}</div>`:''}`:row}</div>`};
  return all((n,seen)=>{const u=unit(n,seen);return u?`<div class="chart">${u}</div>`:''})}
const offlineHtml=st=>st.offline.length?`<div class="ag-sec"><div class="ag-sec-h">Offline · ${st.offline.length} <span>kept 60 days</span></div>${st.offline.map(a=>`<div class="ag-row off"><span class="dot ag-dot-off"></span>
  <span class="ag-row-main"><span class="ag-row-t"><span class="ag-nm">${esc(a.name)}</span></span><span class="ag-row-s"><span class="mono">${esc(tilde(a.cwd))}</span> · last seen ${a.seen?ago(a.seen)+' ago':'never'}</span></span>
  <span class="ag-row-v"><button type="button" class="btn btn-soft sm" data-agdelete="${esc(a.id)}" data-name="${esc(a.name)}">Delete</button></span></div>`).join('')}</div>`
  :`<div class="ag-sec"><div class="ag-sec-h">Offline · 0</div><p class="small mut">No agent has gone offline lately.</p></div>`;

// ---- The detail -----------------------------------------------------------------------------------------------------
const stat=(k,v,{cls='',extra='',sub=''}={})=>`<div class="ag-stat"><div class="k">${k}</div><div class="v${cls?' '+cls:''}">${v}</div>${extra}${sub?`<div class="s">${sub}</div>`:''}</div>`;
function headHtml(st,x){const items=itemsFor(st,x),blocked=blockedOf(st,x).length;
  const others=st.peers.filter(y=>y.id!==x.id&&y.cwd===x.cwd&&y.space===x.space);
  const badges=[PL.badge('mut',spaceName(x.space)),leadBadge(x),x.muted?PL.badge('warn','muted'):'',x.terminating?PL.badge('bad','ending…'):''].join('');
  const ctx=x.context;
  const tiles=x.remote?'':`<div class="ag-stats">
    ${stat('Context',ctx==null?'?':Math.round(ctx)+'%',{cls:ctx>=80?'bad':'',extra:ctx==null?'':`<span class="meter${ctx>=80?' m-bad':ctx>=50?' m-warn':''}"><i style="width:${Math.max(0,Math.min(100,ctx))}%"></i></span>`,sub:ctx>=80?'close to compacting':''})}
    ${stat('Sent / hour',x.sent_hour||0,{cls:x.sent_hour>=20?'warn':'',sub:x.sent_hour>=20?'chatty: each one can cost its recipient a turn':''})}
    ${stat('Open tasks',x.open_tasks||0,{sub:blocked?`<span class="ag-bad">${blocked} blocked</span>`:''})}
    ${stat('Waiting on you',items.length,{cls:items.length?'warn':''})}</div>`;
  const owes=x.threads?.owes||[],waits=x.threads?.waiting||[];
  return `<div class="ag-dhead">${PL.avatar(x.name,48)}<div class="ag-dtitle"><h2 class="ag-name">${esc(x.name)}${x.remote?` <span class="ag-host">@${esc(x.host)}</span>`:''}</h2>
      <div class="ag-meta"><span class="dot${x.busy?' busy':''}"></span>${stateText(x)} ${badges}</div></div>
      ${x.remote?'':`<div class="ag-dacts"><button type="button" class="btn btn-out sm" data-agnewtask>${PL.icon('plus',18)}New task</button><button type="button" class="icon-btn" data-agmenu aria-label="More actions for ${esc(x.name)}">${PL.icon('more',22)}</button></div>`}</div>
    <div class="ag-where"><span class="mono">${esc(tilde(x.cwd))}${x.branch?` · ⎇ ${esc(x.branch)}`:''}</span><button type="button" class="btn btn-ghost sm" data-agcopy="${esc(x.cwd)}">Copy</button></div>
    <div class="ag-plugin small">Plugin ${esc(x.plugin||'older than 0.6.6')}${x.stale&&!x.remote?` · <span class="ag-warn">${x.reload_queued?`reload queued ${ago(x.reload_queued)} ago and not run yet: `:''}run /reload-plugins in this agent</span>`:''}</div>
    ${tiles}
    <div class="ag-now${oldSummary(x)?' old':''}"><div class="label">Now${x.summary_ts&&x.summary?` · set ${ago(x.summary_ts)} ago${oldSummary(x)?', may be out of date':''}`:''}</div><p>${x.summary?esc(x.summary):'<span class="mut">No summary yet.</span>'}</p></div>
    ${x.remote?`<div class="ag-facts"><span class="k">Role</span><span>${x.role?esc(x.role):'<span class="mut">none</span>'}</span>
      <span class="k">Space</span><span>${esc(spaceName(x.space))} <span class="mut">· ${esc(spaceWhy(x))}</span>${(x.also||[]).length?` <span class="mut">· also in ${x.also.map(esc).join(', ')}</span>`:''}</span>
      <span class="k">Lead</span><span>${roleLine(st,x)}</span></div>`:''}
    ${others.length?`<div class="ag-also small"><span class="k">Also in this folder</span> ${others.map(o=>`${PL.agentLink(o.id,o.name)} <span class="mut">(${o.busy?'working':'idle'})</span>`).join(', ')}</div>`:''}
    ${owes.length||waits.length?`<div class="ag-threads">${PL.label('Open requests')}<div class="group">${owes.map(t=>`<div class="row"><span class="row-main"><span class="row-t small">Owes ${PL.agentLink(t.with)} a reply</span><span class="row-s">${PL.msgLink(t.id)}: ${esc(plain(t.text).slice(0,110))}</span></span></div>`).join('')}
      ${waits.map(t=>`<div class="row"><span class="row-main"><span class="row-t small">Waiting on ${PL.agentLink(t.with)}</span><span class="row-s">${PL.msgLink(t.id)}: ${esc(plain(t.text).slice(0,110))}</span></span></div>`).join('')}</div></div>`:''}
    ${x.remote?`<p class="ag-remote small mut">${PL.icon('alert',18)}This agent runs on another machine; change it there.</p>`:''}`}

// What waits on you, answered here with the Inbox's own calls. Numbered options become one-tap buttons.
// (Phase 2: this is the Inbox's item card; the two should share one component.)
const apprOf=i=>/^c\d+$/.test(i.id)?'schedule':/^r\d+$/.test(i.id)?'rule':'agent';
const IKIND={question:'question',task:'task for you',feedback:'feedback',schedule:'wants a schedule',rule:'proposes a rule',agent:'wants a new agent'};
const kindOf=i=>i.kind==='approval'?apprOf(i):i.kind;
const itemLink=i=>i.kind==='task'?PL.taskLink(i.id):i.kind==='question'?PL.msgLink(i.id):i.kind==='approval'&&apprOf(i)==='schedule'?PL.schedLink(i.id)
  :i.kind==='approval'&&apprOf(i)==='rule'?`<a class="link" href="#setup/rules">${esc(i.id)}</a>`:esc(i.id);
// A question's options come at the end of its text as "1. …", "2. …" (the daemon writes them so).
const splitOptions=text=>{const lines=String(text||'').replace(/\r/g,'').trimEnd().split('\n'),opts=[];
  for(let k=lines.length-1;k>=0;k--){const m=lines[k].match(/^\s*(\d+)\.\s+(.+?)\s*$/);if(!m)break;opts.unshift({n:+m[1],t:m[2]})}
  if(opts.length<2||opts.some((o,j)=>o.n!==j+1))return {body:String(text||''),opts:[]};
  return {body:lines.slice(0,lines.length-opts.length).join('\n').trim(),opts:opts.map(o=>o.t)}};
function waitCard(i){const k=kindOf(i),{body,opts}=i.kind==='question'?splitOptions(i.text):{body:i.text,opts:[]};
  const t=String(body).trim(),[first,...rest]=t.split('\n'),more=first.trim()===String(i.title).trim()?rest.join('\n').trim():t;
  const b=(act,label,cls='btn-out')=>`<button type="button" class="btn ${cls} sm" data-agiact="${act}">${esc(label)}</button>`;
  const field=ph=>`<input type="text" data-agitext placeholder="${esc(ph)}" aria-label="${esc(ph)}" autocomplete="off">`;
  const acts=i.kind==='question'?`${opts.length?`<div class="ag-w-opts">${opts.map((o,j)=>`<button type="button" class="btn btn-out sm" data-agiopt="${esc(o)}">${j+1} · ${esc(o)}</button>`).join('')}</div>`:''}
      <div class="ag-w-ans">${field(opts.length?'Or write an answer':'Your answer')}<span class="ag-w-btns">${b('reply','Send')}${b('dismiss','Dismiss','btn-ghost')}</span></div>`
    :i.kind==='task'?`<div class="ag-w-ans">${field(`Note for ${i.who} (optional)`)}<span class="ag-w-btns">${b('done','Done')}${b('failed',"Couldn't do it",'btn-ghost')}</span></div>`
    :i.kind==='approval'?`<div class="ag-w-btns">${b('approve',{schedule:'Approve',rule:'Approve rule',agent:'Approve and start it'}[k])}${b('deny','Deny','btn-ghost')}</div>`
    :`<div class="ag-w-btns">${b('accepted','Accept')}${b('dismissed','Dismiss','btn-ghost')}</div>`;
  return `<div class="ag-wait" data-scope data-agikind="${esc(i.kind)}" data-agiid="${esc(i.id)}"><div class="ag-w-top">${PL.badge(i.kind==='question'||i.kind==='task'?'warn':'info',IKIND[k]||k)}<span class="mut small">${itemLink(i)} · waiting ${ago(i.since)}</span></div>
    ${i.kind==='question'?`<div class="ag-w-q md">${md(t)}</div>`:`<div class="ag-w-t">${esc(plain(i.title))}</div>${more?`<div class="ag-w-q md">${md(more)}</div>`:''}`}${acts}</div>`}
const waitHtml=(st,x)=>{const items=itemsFor(st,x);return items.length?`<div class="label ag-wait-l">Waiting on you · ${items.length}</div>${items.map(waitCard).join('')}`:''};

// The message box: always there, Message or Task, and Send is the page's one accent button.
const composeHtml=x=>x.remote?'':`<form class="ag-compose" data-agto="${esc(x.id)}" data-agname="${esc(x.name)}">
  <textarea name="text" rows="3" placeholder="${esc(AG.mode==='task'?`A task for ${x.name}: first line is its title`:`Message ${x.name}`)}" aria-label="${esc(AG.mode==='task'?'Task for '+x.name:'Message '+x.name)}"></textarea>
  <div class="ag-compose-bar"><span class="seg" role="group" aria-label="Send as"><button type="button" data-agmode="message" class="${AG.mode==='message'?'on':''}" aria-pressed="${AG.mode==='message'}">Message</button><button type="button" data-agmode="task" class="${AG.mode==='task'?'on':''}" aria-pressed="${AG.mode==='task'}">Task</button></span>
  <span class="ag-compose-hint small mut">${AG.mode==='task'?'Tracked in Tasks until it reports back.':'Its reply shows in Messages.'}</span><button type="submit" class="btn btn-acc sm">Send</button></div></form>`;

// Its tasks, its schedules, its recent messages and its setup.
const taskLine=(st,t,mine)=>{const other=mine?t.requester:{name:t.owner};
  return `<div class="row ag-task" data-agtask="${esc(t.id)}">${tBadge(t)}<span class="row-main"><span class="row-t">${PL.taskLink(t.id,t.title)}</span>
    <span class="row-s">${esc(t.id)} · ${mine?'from':'for'} ${PL.agentLink(other?.id||other?.name||'?',other?.name||'?')} · ${isLive(t)?ago(t.created)+' ago':'closed '+ago(t.updated)+' ago'}${t.blocked&&isLive(t)?`<span class="ag-blocked">Blocked: ${esc(plain(t.blocked).slice(0,120))}</span>`:''}</span></span>
    <span class="row-v"><button type="button" class="icon-btn" data-agtaskmenu="${esc(t.id)}" aria-label="Task ${esc(t.id)}: details and actions">${PL.icon('more',20)}</button></span></div>`};
function tasksHtml(st,x){const mine=byLive(st.tasks.filter(t=>ownsTask(x,t))),asked=byLive(st.tasks.filter(t=>askedTask(x,t)&&!ownsTask(x,t)));
  const block=(key,title,list,none,isMine)=>{const live=list.filter(isLive),closed=list.filter(t=>!isLive(t)),all=AG.moreClosed.has(x.id+key);
    const shown=[...live,...(all?closed:closed.slice(0,3))],rest=closed.length-(all?closed.length:Math.min(3,closed.length));
    return `<div class="ag-sub">${title}${list.length?` · ${live.length} open`:''}</div>${list.length?`<div class="group">${shown.map(t=>taskLine(st,t,isMine)).join('')}${rest>0||all&&closed.length>3?`<button type="button" class="row ag-more" data-agmoreclosed="${esc(key)}">${all?'Show fewer':`Show ${plural(rest,'older closed task')}`}</button>`:''}</div>`:`<p class="small mut">${none}</p>`}`};
  const sched=st.schedules.filter(c=>(c.status==='active'||c.status==='pending')&&(c.goes_to?c.goes_to===x.name:c.folder===x.cwd));
  return `<section class="ag-card">${PL.label(`Tasks · ${x.open_tasks||0} open`)}${block('o','Owns',mine,'No tasks for this agent.',true)}${block('a','Asked for',asked,"It hasn't handed out any tasks.",false)}
    <div class="ag-sub">Schedules</div>${sched.length?`<div class="group">${sched.map(c=>`<div class="row" data-agsched="${esc(c.id)}">${PL.badge(c.status==='pending'?'warn':'ok',c.status==='pending'?'Needs approval':'Active')}<span class="row-main"><span class="row-t">${PL.schedLink(c.id,c.when_text||c.id)}</span><span class="row-s">${esc(c.id)}${c.agent?'':' · for its folder'} · ${esc(plain(c.prompt).slice(0,120))}</span></span>
      ${c.status==='pending'?`<span class="row-v ag-w-btns"><button type="button" class="btn btn-out sm" data-agschedok="approve">Approve</button><button type="button" class="btn btn-ghost sm" data-agschedok="deny">Deny</button></span>`:''}</div>`).join('')}</div>`:'<p class="small mut">None. Add one on the Schedules page.</p>'}</section>`}
function messagesHtml(st,x){const mine=st.messages.filter(m=>m.from===x.id||m.to===x.id||(!x.remote&&(m.from_name===x.name||m.to_name===x.name))).slice(-5).reverse();
  const who=(m,out)=>{const n=out?m.to_name:m.from_name;return out&&m.to==='user'||!out&&m.from==='user'?'you':n||'?'};
  return `<section class="ag-card">${PL.label('Recent messages')}${mine.length?`<div class="group">${mine.map(m=>{const out=m.from===x.id||m.from_name===x.name&&m.from!=='user';
      return `<a class="row ag-msg" href="#messages/${encodeURIComponent(m.id)}"><span class="ag-dir${out?' out':''}" aria-label="${out?'sent to':'from'}">${out?'→':'←'}</span><span class="row-main"><span class="row-t small">${esc(who(m,out))}${m.task?` · task ${esc(m.task)}`:''}</span><span class="row-s ag-1l">${esc(plain(m.text).slice(0,160))}</span></span><span class="row-v small">${ago(m.ts)}</span></a>`}).join('')}
    <a class="row ag-more" href="#messages/${encodeURIComponent(mine[0].id)}">Open in Messages<span class="chev">${PL.icon('chev',18)}</span></a></div>`:'<p class="small mut">No messages to or from it lately.</p>'}</section>`}
const wakeText=w=>w===true?'starts a turn':w===false?'waits for the next prompt':'default';
function setupHtml(st,x){const sc=cfg.sessions?.[x.id]||{};
  const r=(key,icon,title,sub,value)=>`<button type="button" class="row ag-setrow" data-agset="${key}"><span class="tile">${PL.icon(icon,20)}</span><span class="row-main"><span class="row-t">${title}</span>${sub?`<span class="row-s">${sub}</span>`:''}</span><span class="row-v">${value||''}<span class="chev">${PL.icon('chev',18)}</span></span></button>`;
  const also=(x.also||[]).length?x.also.map(esc).join(', '):'none',links=(x.links||[]).length?x.links.map(esc).join(', '):'none';
  const led=st.leads[x.space],how={set:'you picked it',only:'the only agent in it'}[x.leads]||'';
  const lead=x.leads?`leads it, ${how}`:led?`led by ${esc(led.name)}${led.live?'':' (offline)'}`:'';
  const ctl=[`Message arrives: ${wakeText(sc.auto_wake)}`,x.muted?'muted':'not muted',x.auto_approve||cfg.auto_approve_all?'starts agents without asking':'asks before starting agents'].join(' · ');
  return `<section class="ag-setup">${PL.label('Setup')}<div class="group">
    ${r('name','agents','Name',sc.nickname?'You named it':'The name it picked',esc(x.name))}
    ${r('role','rules','Role',x.role?`<span class="ag-2l">${esc(x.role)}</span>`:x.folder_role?'From its folder':'None set',x.role?'':'<span class="mut">none</span>')}
    ${r('space','spaces','Space',`${[esc(spaceWhy(x)),lead].filter(Boolean).join(' · ')}<br>Also in: ${also} · Linked with: ${links}`,`${esc(spaceName(x.space))}${x.leads?' · lead':''}`)}
    ${r('controls','controls','Controls',esc(ctl)+' · clear context, terminate','')}
  </div></section>`}
const restHtml=(st,x)=>x.remote?'':`<div class="ag-cols">${tasksHtml(st,x)}${messagesHtml(st,x)}</div>${setupHtml(st,x)}`;

// With nothing picked (from 900px): a short overview, and the agents that wait on you.
function overviewHtml(st){const working=st.peers.filter(p=>p.busy).length;
  const waiting=st.peers.map(x=>({x,l:itemsFor(st,x)})).filter(a=>a.l.length).sort((a,b)=>Math.min(...a.l.map(i=>i.since))-Math.min(...b.l.map(i=>i.since)));
  const blocked=st.peers.filter(x=>blockedOf(st,x).length),full=st.peers.filter(x=>x.context>=80);
  const arow=(x,sub,value)=>`<a class="row" href="${PL.agentHref(x)}">${PL.avatar(x.name,36)}<span class="row-main"><span class="row-t">${esc(x.name)}</span><span class="row-s">${sub}</span></span><span class="row-v">${value}<span class="chev">${PL.icon('chev',18)}</span></span></a>`;
  return `<div class="ag-ov"><h2 class="ag-name">Overview</h2><p class="small mut">Pick an agent to see it, message it or change it.</p>
    <div class="ag-stats">${stat('Working',working)}${stat('Idle',st.peers.length-working)}${stat('Waiting on you',st.inbox.length,{cls:st.inbox.length?'warn':''})}${stat('Offline',st.offline.length)}</div>
    ${PL.label('Waiting on you')}${waiting.length?`<div class="group">${waiting.map(({x,l})=>arow(x,esc([...new Set(l.map(i=>IKIND[kindOf(i)]))].join(', '))+` · waiting ${ago(Math.min(...l.map(i=>i.since)))}`,PL.badge('warn',String(l.length)))).join('')}</div>`:'<p class="small mut">Nothing waits on you.</p>'}
    ${blocked.length?PL.label('Blocked')+`<div class="group">${blocked.map(x=>arow(x,esc(plain(blockedOf(st,x)[0].blocked).slice(0,100)),PL.badge('bad','Blocked'))).join('')}</div>`:''}
    ${full.length?PL.label('Close to compacting')+`<div class="group">${full.map(x=>arow(x,esc(headline(x)||''),PL.meter(x.context))).join('')}</div>`:''}</div>`}

// ---- Drawing the page ---------------------------------------------------------------------------------------------------
function agRender(st,route){
  const x=route.id?PL.findAgent(route.id):null,selId=x?.id||'';
  const wrap=$('#agwrap'),q=($('#agsearch').value||'').trim().toLowerCase();
  wrap.classList.toggle('chart',AG.layout==='chart'&&!q);wrap.classList.toggle('has-sel',!!route.id);
  document.querySelectorAll('[data-aglayout]').forEach(b=>{const on=b.dataset.aglayout===AG.layout;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
  const offb=$('[data-agoff]');offb.setAttribute('aria-pressed',AG.off);$('#agoffn').textContent=st.offline.length?'· '+st.offline.length:'';
  // A search shows the matching agents as a flat list, whichever view is on.
  const hits=q?st.peers.filter(y=>[y.name,y.cwd,y.branch,y.summary,y.space,y.role].join(' ').toLowerCase().includes(q)):null;
  PL.paint($('#aglist'),(!st.peers.length?PL.empty({icon:'agents',title:'No live agents',text:'Start Claude Code with the peerlink plugin and it shows up here.'})
    :hits?`<div class="ag-sec"><div class="ag-sec-h">${plural(hits.length,'match').replace('matchs','matches')}</div>${hits.map(y=>lrow(st,y,0,selId)).join('')||'<p class="small mut">No agent matches.</p>'}</div>`
    :AG.layout==='chart'?chartHtml(st,selId):listHtml(st,selId))+(AG.off?offlineHtml(st):''));
  // The picked row stays in sight in the list's own scroll.
  if(selId!==AG.listSel){AG.listSel=selId;requestAnimationFrame(()=>{const side=$('#agside'),row=$('#aglist .sel');
    if(!row||getComputedStyle(side).overflowY!=='auto')return;const r=row.getBoundingClientRect(),s=side.getBoundingClientRect();
    if(r.top<s.top+110||r.bottom>s.bottom)side.scrollTop+=r.top-s.top-140})}
  // The detail. A new agent replaces every part; the message box keeps a draft per agent, the answers per item.
  const key=x?x.id:route.id?'?'+route.id:'';
  const parts=['#agd-head','#agd-wait','#agd-compose','#agd-rest'].map(s=>$(s));
  let force=false;
  if(key!==AG.shown){force=true;saveDrafts();AG.shown=key;if(x)$('#agmain').scrollTop=0;if(route.id&&matchMedia('(max-width:899px)').matches)scrollTo(0,0)}
  if(!x){const off=route.id&&st.offline.find(a=>a.name.toLowerCase()===route.id.toLowerCase()||a.id===route.id);
    PL.paint(parts[0],route.id?PL.empty({icon:'agents',title:off?`${off.name} is offline`:'Not running',text:off?`Last seen ${off.seen?ago(off.seen)+' ago':'a while ago'}. It shows up here again once it starts.`:'No live agent has that name now. It may be offline, or renamed.',action:{label:'All agents',href:'#agents'}})
      :overviewHtml(st),{force});
    for(const p of parts.slice(1))PL.paint(p,'',{force});return}
  PL.paint(parts[0],headHtml(st,x),{force});
  if(PL.paint(parts[1],waitHtml(st,x),{force}))restoreAnswers();
  if(PL.paint(parts[2],composeHtml(x),{force})){const ta=parts[2].querySelector('textarea');if(ta&&AG.drafts.get(x.id))ta.value=AG.drafts.get(x.id)}
  PL.paint(parts[3],restHtml(st,x),{force})}
// What you typed survives switching agents and coming back.
function saveDrafts(){const f=$('#agd-compose form');if(f){const v=f.elements.text.value;v?AG.drafts.set(f.dataset.agto,v):AG.drafts.delete(f.dataset.agto)}
  document.querySelectorAll('#agd-wait [data-agiid]').forEach(c=>{const v=c.querySelector('[data-agitext]')?.value;v?AG.answers.set(c.dataset.agiid,v):AG.answers.delete(c.dataset.agiid)})}
function restoreAnswers(){document.querySelectorAll('#agd-wait [data-agiid]').forEach(c=>{const v=AG.answers.get(c.dataset.agiid),i=c.querySelector('[data-agitext]');if(i&&v)i.value=v})}
const cur=()=>PL.route.page==='agents'&&PL.route.id?PL.findAgent(PL.route.id):null;

// ---- Sheets: every edit happens in one. A sheet with unsaved changes asks before a route change takes it away. ---------
function agSheet(opts){const h=PL.sheet.open({...opts,onClose:()=>{if(AG.sheet===h)AG.sheet=null;opts.onClose?.()}});AG.sheet=h;return h}
window.addEventListener('hashchange',async()=>{const prev=AG.lastHash;AG.lastHash=location.hash;
  if(AG.reverting){AG.reverting=false;return}
  const h=AG.sheet;if(!h||!PL.sheet.isOpen())return;
  if(PL.dirty(h.el)&&!await ask('Discard your unsaved changes?',{ok:'Discard'})){AG.reverting=true;location.replace(prev||'#agents');return}
  h.close()});
const field=(label,input,hint)=>`<label class="field">${label}${input}${hint?`<span class="hint">${hint}</span>`:''}</label>`;
async function saveCfg(x,patch){const r=await post(`/api/sessions/${encodeURIComponent(x.id)}/config`,patch);if(r.error)return r.error;if(r.sessions)cfg.sessions=r.sessions;return ''}
function nameSheet(x){const sc=cfg.sessions?.[x.id]||{};
  agSheet({title:`Rename ${x.name}`,body:field('Name',`<input name="nickname" type="text" value="${esc(sc.nickname||'')}" placeholder="${esc(x.name)}" autocomplete="off" autofocus>`,'What other agents call it. Kept for this folder. Leave it empty for the name it picked.'),
    onSave:async f=>{const v=f.elements.nickname.value.trim();if(v===(sc.nickname||''))return;const err=await saveCfg(x,{nickname:v});if(err)return err;
      await refresh(true);const y=PL.findAgent(x.id);PL.toast(`Renamed to ${y?y.name:v||x.name}`);
      // The route names it: follow the new name, in place of the old entry.
      if(y&&PL.route.page==='agents'&&PL.route.id!==y.id&&PL.route.id!==y.name){AG.reverting=false;AG.sheet=null;location.replace(PL.agentHref(y))}}})}
function roleSheet(x){const sc=cfg.sessions?.[x.id]||{};
  agSheet({title:`Role of ${x.name}`,body:field('Role',`<textarea name="role" rows="5" placeholder="${x.folder_role?'From the folder: '+esc(x.folder_role):'What this agent is here for, e.g. Owns the billing API: invoices, payments, the Stripe webhook.'}" autofocus>${esc(sc.role||'')}</textarea>`,
      `For this agent only, kept across /clear and resume. The agent gets it as its brief, and other agents see it.${x.folder_role?" Leave it empty to use the role: in its folder's .peerlink.":" A role: line in a folder's .peerlink is the role of every agent there without one of its own."}`),
    onSave:async f=>{const v=f.elements.role.value.trim();if(v===(sc.role||''))return;const err=await saveCfg(x,{role:v});if(err)return err;PL.toast(`Role of ${x.name} saved`);refresh(true)}})}
// Moving is one tap, with Undo; moving a lead asks first, since another agent takes over its space.
async function moveAgent(x,to){const where=to===''?"back to its folder's space":to==='unassigned'?'out of every space':`to ${to}`;
  if(x.leads&&!await ask(`Move ${x.name} ${where}? It leads ${spaceName(x.space)}: another agent will lead it instead, and ${x.name} loses its peers there.`,{ok:'Move'}))return false;
  const prev=setSpaceOf(x),r=await post('/api/folders/space',{cwd:x.cwd,id:x.id,space:to});
  if(r.error){PL.toast(r.error,{kind:'bad'});return false}
  PL.toast(`Moved ${x.name} ${where}`,{undo:x.leads?null:async()=>{const r2=await post('/api/folders/space',{cwd:x.cwd,id:x.id,space:prev});if(r2.error)PL.toast(r2.error,{kind:'bad'});refresh(true)}});
  refresh(true);return true}
function spaceSheet(x){const st=PL.state,names=spaceNames(st),here=x.space&&x.space!=='default'?x.space:'unassigned',led=st.leads[x.space];
  const pick=(val,title,sub)=>{const on=val===here;return `<button type="button" class="row ag-pick${on?' on':''}" data-agmove="${esc(val)}"${on?' aria-current="true" disabled':''}><span class="row-main"><span class="row-t">${esc(title)}</span>${sub?`<span class="row-s">${sub}</span>`:''}</span><span class="row-v">${on?PL.icon('check',20):''}</span></button>`};
  const leadBtn=x.remote||!x.space||x.space==='default'?'':x.leads?`<button type="button" class="btn btn-soft sm" data-agclearlead="${esc(x.space)}">Clear lead</button>`
    :`<button type="button" class="btn btn-out sm" data-agmakelead="${esc(x.space)}">${led?'Make lead instead of '+esc(led.name):'Make lead of '+esc(x.space)}</button>`;
  const h=agSheet({title:`Space of ${x.name}`,body:`<p class="small mut">Now in <b>${esc(spaceName(x.space))}</b>: ${esc(spaceWhy(x))}. It moves alone: other agents in its folder stay where they are.</p>
    ${PL.label('Move to')}<div class="group">${names.map(n=>pick(n,n,st.leads[n]?`led by ${esc(st.leads[n].name)}${st.leads[n].live?'':' (offline)'}`:'no lead')).join('')}${pick('unassigned','Unassigned','with the other agents in no space')}
      ${x.space_source==='agent'?pick('',"Its folder's space",'what its folder, or its .peerlink, says'):''}</div>
    ${field('Or a new space','<input name="newspace" type="text" autocomplete="off" placeholder="e.g. payments">','For this agent only. It keeps it after /clear and restarts.')}
    ${PL.label('Reach')}
    ${field('Also a member of',`<input name="also" type="text" value="${esc((x.also||[]).join(', '))}" placeholder="none" autocomplete="off">`,'Rarely needed: more spaces it sees and messages, on top of its own. For this agent only. Separate with commas.')}
    ${field('Linked with',`<input name="links" type="text" value="${esc((x.links||[]).join(', '))}" placeholder="none" autocomplete="off">`,"Agents it sees and messages, and that see and message it, whatever spaces they're in. Nobody else's reach changes. Separate names with commas.")}
    ${leadBtn?PL.label('Lead')+`<p class="small">${roleLine(st,x)}</p><div>${leadBtn}</div>`:''}`,
    onSave:async f=>{const errs=[],v=n=>f.elements[n].value.trim(),list=n=>v(n).split(',').map(t=>t.trim()).filter(Boolean);
      if(v('newspace')){if(!await moveAgent(x,v('newspace')))return false}
      if(list('also').join(', ')!==(x.also||[]).join(', ')){const r=await post('/api/members',{cwd:x.cwd,id:x.id,spaces:list('also')});if(r.error)errs.push(r.error)}
      if(list('links').join(', ')!==(x.links||[]).join(', ')){const r=await post('/api/links',{id:x.id,names:list('links')});if(r.error)errs.push(r.error)}
      await refresh(true);if(errs.length)return errs.join(' ')}});
  return h}
const wakeVal=w=>w===true?'on':w===false?'off':'default';
function controlsSheet(x){const sc=cfg.sessions?.[x.id]||{},w=wakeVal(sc.auto_wake),all=!!cfg.auto_approve_all;
  const seg=(v,t)=>`<button type="button" data-agwake="${v}" class="${w===v?'on':''}" aria-pressed="${w===v}">${t}</button>`;
  agSheet({title:`Controls for ${x.name}`,body:`${PL.label('When a message arrives')}<span class="seg ag-seg3" role="group" aria-label="When a message arrives">${seg('default','Default')}${seg('on','Start a turn')}${seg('off','Wait')}</span>
    <p class="small mut ag-wake-hint">${{default:'Uses the default from Settings.',on:'A message starts a turn at once, even when it is idle.',off:'Messages wait for its next prompt.'}[w]}</p>
    <div class="group">
      <label class="row ag-switch-row"><span class="row-main"><span class="row-t">Mute</span><span class="row-s">Hold every message for this agent.</span></span><input type="checkbox" class="ag-switch" data-agmute ${x.muted?'checked':''}></label>
      <label class="row ag-switch-row"><span class="row-main"><span class="row-t">Start agents and schedules without asking me</span><span class="row-s">${all?'On for every agent in Settings.':'Its folder keeps this.'}</span></span><input type="checkbox" class="ag-switch" data-agauto ${x.auto_approve||all?'checked':''} ${all?'disabled':''}></label>
    </div>
    ${PL.label('Session')}<div class="group">
      <div class="row ag-ctl"><span class="row-main"><span class="row-t">Clear its context</span><span class="row-s">Runs /clear once its current turn ends: a fresh conversation in the same folder, keeping its name, space and role. What it still owes peers is given back to it.</span></span><button type="button" class="btn btn-out sm" data-agclear>Clear</button></div>
      <div class="row ag-ctl"><span class="row-main"><span class="row-t">End this agent</span><span class="row-s">It finishes its current turn, then closes. If it's still running a minute later, it's stopped.</span></span><button type="button" class="btn btn-danger sm" data-agterm ${x.terminating?'disabled':''}>${x.terminating?'Ending…':'Terminate'}</button></div>
    </div>`})}
function menuSheet(x){const r=(act,icon,title,cls='')=>`<button type="button" class="row ag-setrow${cls}" data-agmenuact="${act}"><span class="tile">${PL.icon(icon,20)}</span><span class="row-main"><span class="row-t">${title}</span></span></button>`;
  agSheet({title:x.name,body:`<div class="group">${r('name','agents','Rename')}${r('role','rules','Edit role')}${r('space','spaces','Move to another space')}${r('controls','controls','Controls')}${r('copy','check','Copy folder path')}</div>
    <div class="group">${r('clear','alert','Clear context')}${r('term','x','Terminate',' ag-danger')}</div>`})}
function taskSheet(t){const kids=PL.state.tasks.filter(k=>k.parent===t.id);
  agSheet({title:`Task ${t.id}`,saveLabel:'Reassign',cancelLabel:'Close',body:`<div class="ag-tsheet"><div>${tBadge(t)} <b class="ag-tt">${esc(t.title)}</b></div>
    <p class="small mut">${PL.agentLink(t.requester?.id||t.requester?.name||'?',t.requester?.name||'?')} → ${PL.agentLink(t.owner)}${t.space?' · '+esc(t.space):''}${kids.length?` · ${kids.filter(k=>k.status==='done').length} of ${kids.length} subtasks done`:''} · ${ago(t.created)} ago</p>
    ${t.note?`<div class="md small">${md(t.note)}</div>`:''}${taskLog(t)}
    ${field('Owner',agentSelect(t.owner_cwd||'','name="owner"','Pick an agent'),'Reassigning tells the new owner, and the old one stops.')}
    <div class="ag-w-btns">${isLive(t)?`<button type="button" class="btn btn-danger sm" data-agtstatus="cancelled">Cancel task</button>`:`<button type="button" class="btn btn-out sm" data-agtstatus="open">Reopen</button>`}<a class="btn btn-ghost sm" href="#tasks/${encodeURIComponent(t.id)}">Open in Tasks</a></div></div>`,
    onSave:async f=>{const v=f.elements.owner.value;if(!v||v===t.owner_cwd)return 'Pick another agent to reassign it to.';
      const r=await post('/api/tasks/'+encodeURIComponent(t.id),{owner:v});if(r.error)return r.error;PL.toast(`Task ${t.id} reassigned`);refresh(true)}}).el.dataset.agtid=t.id}
function helpSheet(){PL.sheet.open({title:'How agents work',body:`<ul class="ag-help-list">
  <li>Each space lists its lead first, with its members indented under it. A space inside another sits under that space's lead.</li>
  <li>Work sent to a space goes to its lead: the agent you picked, or else the one that was alone in it. Pick a lead in an agent's Space; pick which space sits inside which on Setup, Spaces.</li>
  <li>An agent only sees and messages agents in its own space. A lead also sees the space its space sits inside. Two agents you link (Space, "Linked with") see and message each other whatever their spaces.</li>
  <li>To move an agent, open it and tap Space. It moves alone: other agents in its folder stay where they are.</li>
  <li>A green dot means idle, a yellow one working. On the right of each row: <b>waiting on you</b> when it asked you something, <b>Blocked</b> when a task it owns is stuck, else how full its context window is (yellow past half, red past 80%).</li>
  <li>Offline agents are kept 60 days; the Offline chip shows them, and you can delete them there.</li></ul>`})}

// ---- Actions ------------------------------------------------------------------------------------------------------------
const on=(sel,fn,type='click')=>document.addEventListener(type,e=>{const b=e.target.closest?.(sel);if(b)fn(b,e)});
on('[data-aglayout]',b=>{AG.layout=b.dataset.aglayout;keep('alayout',AG.layout);PL.render()});
on('[data-agoff]',()=>{AG.off=!AG.off;keep('agoff',AG.off?'1':'');PL.render()});
on('[data-aghelp]',helpSheet);
document.addEventListener('input',e=>{if(e.target.id==='agsearch')PL.render()});
on('[data-agcopy]',async b=>{try{await navigator.clipboard.writeText(b.dataset.agcopy);PL.toast('Folder path copied')}catch{PL.toast("Couldn't copy: the browser said no",{kind:'bad'})}});
on('[data-agnewtask]',()=>{setMode('task');$('#agd-compose textarea')?.focus()});
on('[data-agmenu]',()=>{const x=cur();if(x)menuSheet(x)});
on('[data-agset]',b=>{const x=cur();if(!x)return;({name:nameSheet,role:roleSheet,space:spaceSheet,controls:controlsSheet})[b.dataset.agset](x)});
on('[data-agmenuact]',async b=>{const x=cur();if(!x)return;const a=b.dataset.agmenuact;
  if(a==='copy'){AG.sheet?.close();try{await navigator.clipboard.writeText(x.cwd);PL.toast('Folder path copied')}catch{PL.toast("Couldn't copy: the browser said no",{kind:'bad'})}return}
  if(a==='clear'||a==='term'){AG.sheet?.close();return a==='clear'?clearCtx(x):terminate(x)}
  ({name:nameSheet,role:roleSheet,space:spaceSheet,controls:controlsSheet})[a](x)});
function setMode(m){AG.mode=m;const f=$('#agd-compose form');if(!f)return;
  f.querySelectorAll('[data-agmode]').forEach(b=>{b.classList.toggle('on',b.dataset.agmode===m);b.setAttribute('aria-pressed',b.dataset.agmode===m)});
  const n=f.dataset.agname,ta=f.elements.text;ta.placeholder=m==='task'?`A task for ${n}: first line is its title`:`Message ${n}`;ta.setAttribute('aria-label',m==='task'?'Task for '+n:'Message '+n);
  f.querySelector('.ag-compose-hint').textContent=m==='task'?'Tracked in Tasks until it reports back.':'Its reply shows in Messages.'}
on('[data-agmode]',b=>setMode(b.dataset.agmode));
document.addEventListener('submit',async e=>{const f=e.target;if(!f.matches?.('.ag-compose'))return;e.preventDefault();
  const text=f.elements.text.value.trim();if(!text){f.elements.text.focus();return}
  const btn=f.querySelector('[type=submit]');btn.disabled=true;
  const r=await post('/api/web/send',{to:f.dataset.agto,text,kind:AG.mode});btn.disabled=false;
  if(r.error){PL.toast(r.error,{kind:'bad'});return}
  f.elements.text.value='';PL.settle(f);AG.drafts.delete(f.dataset.agto);
  PL.toast(r.task?`Task ${r.task} sent to ${r.to}`:`Sent to ${r.to}`);refresh(true)});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&e.target.matches?.('.ag-compose textarea')){e.preventDefault();e.target.form.requestSubmit()}});
// An item waiting on you: the Inbox's calls, answered here.
on('[data-agiact],[data-agiopt]',async b=>{const card=b.closest('[data-agiid]');if(!card)return;
  const kind=card.dataset.agikind,id=card.dataset.agiid,inp=card.querySelector('[data-agitext]');
  const action=b.dataset.agiact||'reply',text=b.dataset.agiopt??(inp?.value||'');
  if(action==='reply'&&!text.trim()){inp?.focus();return}
  if(kind==='approval'&&action==='approve'&&apprOf({id})==='agent'&&!await ask('Start a new Claude Code session in that folder?',{ok:'Start'}))return;
  card.querySelectorAll('button').forEach(x=>x.disabled=true);
  const r=await post('/api/inbox',{kind,id,action,text});
  if(r.error){card.querySelectorAll('button').forEach(x=>x.disabled=false);PL.toast(r.error,{kind:'bad'});return}
  AG.answers.delete(id);if(inp){inp.value='';PL.settle(card)}
  PL.toast({reply:'Answer sent',dismiss:'Dismissed',done:`${id} marked done`,failed:`${id} marked not done`,approve:'Approved',deny:'Denied',accepted:'Accepted',dismissed:'Dismissed'}[action]||'Done');refresh(true)});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches?.('#agd-wait [data-agitext]')){e.preventDefault();e.target.closest('[data-agiid]').querySelector('[data-agiact]')?.click()}});
on('[data-agschedok]',async b=>{const id=b.closest('[data-agsched]').dataset.agsched;b.disabled=true;
  const r=await post('/api/inbox',{kind:'approval',id,action:b.dataset.agschedok});if(r.error)PL.toast(r.error,{kind:'bad'});else PL.toast(b.dataset.agschedok==='approve'?`Schedule ${id} approved`:`Schedule ${id} denied`);refresh(true)});
on('[data-agmoreclosed]',b=>{const x=cur();if(!x)return;const k=x.id+b.dataset.agmoreclosed;AG.moreClosed.has(k)?AG.moreClosed.delete(k):AG.moreClosed.add(k);PL.render()});
on('[data-agtaskmenu]',b=>{const t=PL.state.tasks.find(t=>t.id===b.dataset.agtaskmenu);if(t)taskSheet(t)});
on('[data-agtstatus]',async b=>{const id=b.closest('form')?.dataset.agtid,t=PL.state.tasks.find(t=>t.id===id);if(!t)return;const to=b.dataset.agtstatus,was=t.status;
  if(to==='cancelled'&&!await ask(`Cancel task ${id}? Its owner is told to stop.`))return;
  const r=await post('/api/tasks/'+encodeURIComponent(id),{status:to,expect:was});if(r.error){PL.toast(r.error,{kind:'bad'});return}
  AG.sheet?.close();PL.toast(to==='cancelled'?`Task ${id} cancelled`:`Task ${id} reopened`,{undo:to==='open'?async()=>{await post('/api/tasks/'+encodeURIComponent(id),{status:was});refresh(true)}:null});refresh(true)});
// Moving and leading, from the Space sheet.
on('[data-agmove]',async b=>{const x=cur();if(!x)return;if(await moveAgent(x,b.dataset.agmove))AG.sheet?.close()});
on('[data-agmakelead]',async b=>{const x=cur();if(!x)return;const r=await post(`/api/spaces/${encodeURIComponent(b.dataset.agmakelead)}/lead`,{cwd:x.cwd,id:x.id});
  if(r.error){PL.toast(r.error,{kind:'bad'});return}AG.sheet?.close();PL.toast(`${x.name} now leads ${b.dataset.agmakelead}`);refresh(true)});
on('[data-agclearlead]',async b=>{const space=b.dataset.agclearlead;
  if(!await ask(`Clear the lead of ${space}? Work sent to the space won't reach anyone until you pick a new lead.`,{ok:'Clear'}))return;
  const r=await post(`/api/spaces/${encodeURIComponent(space)}/lead`,{cwd:'',id:''});if(r.error){PL.toast(r.error,{kind:'bad'});return}AG.sheet?.close();PL.toast(`${space} has no lead now`);refresh(true)});
// An offline lead: delete its agent, which takes the lead with it; one with no record left just stops leading.
on('[data-agremovelead]',async b=>{const space=b.dataset.agremovelead,d=b.dataset,st=PL.state;
  const gone=st.offline.find(a=>a.cwd===d.cwd&&a.name===d.name)||st.offline.find(a=>a.cwd===d.cwd);
  if(gone){if(!await ask(`Delete ${gone.name}? It's offline: it stops leading ${space}, and its settings and the spaces you set for it go.`))return;
    const r=await post(`/api/agents/${encodeURIComponent(gone.id)}/delete`);if(r.error)PL.toast(r.error,{kind:'bad'});else PL.toast(`${gone.name} deleted`);refresh(true);return}
  if(!await ask(`Remove ${d.name}, offline, as the lead of ${space}? The space has no lead until you pick one.`,{ok:'Remove'}))return;
  const r=await post(`/api/spaces/${encodeURIComponent(space)}/lead`,{cwd:''});if(r.error)PL.toast(r.error,{kind:'bad'});refresh(true)});
on('[data-agdelete]',async b=>{if(!await ask(`Delete ${b.dataset.name}? Its settings and the spaces you set for it go; messages queued for it wait for its folder's next agent.`))return;
  const r=await post(`/api/agents/${encodeURIComponent(b.dataset.agdelete)}/delete`);if(r.error)PL.toast(r.error,{kind:'bad'});else PL.toast(`${b.dataset.name} deleted`);refresh(true)});
// Controls apply at once, each with Undo.
async function applyCfg(x,patch,undo,text){const err=await saveCfg(x,patch);if(err){PL.toast(err,{kind:'bad'});return false}
  PL.toast(text,{undo:async()=>{const e2=await saveCfg(x,undo);if(e2)PL.toast(e2,{kind:'bad'});await refresh(true);syncControls(x)}});refresh(true);return true}
function syncControls(x){const s=AG.sheet?.el;if(!s||!s.querySelector('[data-agwake]'))return;const y=PL.findAgent(x.id)||x,w=wakeVal(cfg.sessions?.[x.id]?.auto_wake);
  s.querySelectorAll('[data-agwake]').forEach(b=>{b.classList.toggle('on',b.dataset.agwake===w);b.setAttribute('aria-pressed',b.dataset.agwake===w)});
  s.querySelector('.ag-wake-hint').textContent={default:'Uses the default from Settings.',on:'A message starts a turn at once, even when it is idle.',off:'Messages wait for its next prompt.'}[w];
  const m=s.querySelector('[data-agmute]');if(m){m.checked=!!y.muted;PL.settle(m)}const a=s.querySelector('[data-agauto]');if(a&&!a.disabled){a.checked=!!y.auto_approve;PL.settle(a)}}
on('[data-agwake]',async b=>{const x=cur();if(!x)return;const was=cfg.sessions?.[x.id]?.auto_wake??null,v=b.dataset.agwake,val=v==='default'?null:v==='on';if(val===was)return;
  if(await applyCfg(x,{auto_wake:val},{auto_wake:was},`${x.name}: ${v==='default'?'uses the default':v==='on'?'a message starts a turn':'messages wait for its next prompt'}`))syncControls(x)});
on('[data-agmute]',async i=>{const x=cur();if(!x)return;PL.settle(i);if(!await applyCfg(x,{muted:i.checked},{muted:!i.checked},i.checked?`${x.name} muted`:`${x.name} unmuted`)){i.checked=!i.checked;PL.settle(i)}},'change');
on('[data-agauto]',async i=>{const x=cur();if(!x)return;PL.settle(i);if(!await applyCfg(x,{auto_approve:i.checked},{auto_approve:!i.checked},i.checked?`${x.name} starts agents without asking`:`${x.name} asks before starting agents`)){i.checked=!i.checked;PL.settle(i)}},'change');
async function clearCtx(x){if(!await ask(`Clear ${x.name}'s context? It starts a fresh conversation after the turn it's in.`))return;
  const r=await post(`/api/sessions/${encodeURIComponent(x.id)}/clear`);if(r.error)PL.toast(r.error,{kind:'bad'});else{AG.sheet?.close();PL.toast(`Asked: ${x.name} clears after its current turn`)}}
async function terminate(x){if(!await ask(`End ${x.name}? Its session closes after the turn it's in.`))return;
  const r=await post(`/api/sessions/${encodeURIComponent(x.id)}/terminate`);if(r.error)PL.toast(r.error,{kind:'bad'});else{AG.sheet?.close();PL.toast(`Ending ${x.name}`)}refresh(true)}
on('[data-agclear]',()=>{const x=cur();if(x)clearCtx(x)});
on('[data-agterm]',()=>{const x=cur();if(x)terminate(x)});
// Escape goes back to the list, unless a sheet, a dialog or a field has it.
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&PL.route.page==='agents'&&PL.route.id&&!PL.sheet.isOpen()&&!document.querySelector('dialog[open]')&&!e.target.matches?.('input,textarea,select'))PL.go('#agents')});
})();
