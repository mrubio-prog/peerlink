// inbox.js: the Inbox page, everything waiting on you, the longest waiting first, each answered in place.
// One flat list of cards; filter chips by type (with counts) and a "Group by agent" chip. A question's options are
// one-tap buttons; Approve is the accent button; a task keeps Done / Couldn't do it with an optional note. What you
// answer leaves the list at once, with Undo where the daemon can take it back (a task reopens, feedback goes back to new).
//
// inboxCard(item) and its handlers are document-wide, so another page (the agent detail) could show the same card;
// its styles are under #page-inbox for now.
PL.page('inbox',{title:'Inbox',
  html:`<div class="ib-head"><h1>Inbox</h1><span class="spacer"></span><button type="button" class="icon-btn ib-help" data-ibhelp aria-label="About the Inbox, and desktop alerts">?</button></div>
<div class="chips ib-chips" id="ibchips"></div>
<div class="ib-list" id="iblist"></div>`,
  count:st=>st.inbox.length||'',
  render:(st)=>inboxRender(st)});

// What an item is, from its kind and its id: t task, m question, c schedule, s start request, r rule, i feedback.
const IB_TYPE={task:{label:'Task for you',badge:'info'},question:{label:'Question',badge:'warn'},schedule:{label:'Schedule',badge:'acc'},
  spawn:{label:'New agent',badge:'acc'},rule:{label:'Rule',badge:'acc'},feedback:{label:'Feedback',badge:'mut'}};
const ibType=i=>i.kind!=='approval'?i.kind:/^c\d+$/.test(i.id)?'schedule':/^r\d+$/.test(i.id)?'rule':'spawn';
// The filter chips: the four kinds the daemon has.
const IB_FILTERS=[['all','All'],['question','Questions'],['task','Tasks for you'],['approval','Approvals'],['feedback','Feedback']];
// Items answered here leave at once; they're dropped from this set when the daemon's list no longer has them, or on Undo.
const ibGone=new Set();
const ibKey=i=>i.kind+':'+i.id;

// The question's options: as the daemon kept them (a question posted to a chat), or the numbered list it appended to
// the text (a question to the Inbox only). The list comes out of the body, since the buttons show it.
function ibOptions(i){
  const m=(PL.state?.messages||[]).find(x=>x.id===i.id);
  if(m&&Array.isArray(m.options)&&m.options.length)return {opts:m.options.map(String),text:i.text,m};
  const lines=String(i.text||'').replace(/\r/g,'').split('\n');
  for(let end=lines.length;end>0;){
    // The last run of "1. a", "2. b"... with nothing after it but blank lines or the Files: list.
    let s=end;while(s>0&&/^\d+\.\s+\S/.test(lines[s-1]))s--;
    if(s<end){const run=lines.slice(s,end),ok=run.length>=2&&run.every((l,k)=>parseInt(l,10)===k+1);
      const after=lines.slice(end).join('\n').trim();
      if(ok&&(!after||/^Files:/.test(after)))return {opts:run.map(l=>l.replace(/^\d+\.\s+/,'')),text:[...lines.slice(0,s),...lines.slice(end)].join('\n'),m};
      break}
    if(lines[end-1].trim()&&!/^(Files:|- )/.test(lines[end-1]))break;
    end--}
  return {opts:[],text:i.text,m}}

// The body under the title: the whole text, less the first line when that is the title (nothing is cut mid-word).
function ibBody(text,title){const t=String(text||'').trim(),[first,...rest]=t.split('\n');
  return first.trim()===String(title||'').trim()?rest.join('\n').trim():t}

// Where an item's id leads: the task, the conversation, the schedule, the rules, the feedback.
function ibIdLink(i){const t=ibType(i);
  return t==='task'?PL.taskLink(i.id):t==='question'?PL.msgLink(i.id):t==='schedule'?PL.schedLink(i.id)
    :t==='rule'?`<a class="link" href="#setup/rules">${esc(i.id)}</a>`:t==='feedback'?`<a class="link" href="#setup/feedback">${esc(i.id)}</a>`:esc(i.id)}

// A schedule's approval says when it runs in plain words (schedules.js), when the schedule is in the snapshot; the
// prompt is the body under it.
function ibTitle(i){
  if(ibType(i)==='schedule'){const c=(PL.state?.schedules||[]).find(x=>x.id===i.id);
    if(c&&typeof schedCadence==='function')return `Schedule for ${c.agent||PL.tilde(c.folder)}, ${schedCadence(c).text}`}
  return i.title}

function inboxCard(i){
  const t=ibType(i),ty=IB_TYPE[t],btn=(act,label,cls='btn-soft',extra='')=>`<button type="button" class="btn ${cls} sm" data-ibact="${act}"${extra}>${label}</button>`;
  const who=i.who||'an agent';
  let body='',acts='',extra='';
  if(t==='question'){const q=ibOptions(i);body=ibBody(q.text,i.title);
    if(q.m&&q.m.default&&q.m.default_at&&!q.m.default_done)extra=`<div class="ib-default">${PL.icon('alert',16)}<span>No answer by ${esc(PL.time(q.m.default_at))}, and ${PL.agentLink(who)} goes with <b>${esc(q.m.default)}</b></span></div>`;
    acts=(q.opts.length?`<div class="ib-opts">${q.opts.map((o,k)=>`<button type="button" class="btn btn-out sm ib-opt" data-ibact="reply" data-ibtext="${esc(o)}"><span class="ib-n">${k+1}</span><span>${esc(o)}</span></button>`).join('')}</div>`:'')
      +`<form class="ib-line" data-ibform="reply"><input data-ibtext-in name="text" placeholder="${q.opts.length?'Or write an answer':'Your answer'}" aria-label="Your answer to ${esc(who)}" autocomplete="off" enterkeyhint="send">${btn('reply','Send','btn-solid')}</form>`
      +`<div class="ib-acts">${btn('dismiss','Dismiss','btn-ghost')}</div>`}
  else if(t==='task'){body=ibBody(i.text,i.title);
    acts=`<form class="ib-line" data-ibform="done"><input data-ibtext-in name="text" placeholder="Note for ${esc(who)} (optional)" aria-label="Note for ${esc(who)}" autocomplete="off" enterkeyhint="done"></form>`
      +`<div class="ib-acts">${btn('done','Done','btn-solid')}${btn('failed','Couldn’t do it')}</div>`}
  else if(i.kind==='approval'){body=t==='schedule'?ibBody(i.text,''):ibBody(i.text,i.title);
    acts=`<div class="ib-acts">${btn('approve',t==='spawn'?'Approve and start':t==='rule'?'Approve rule':'Approve','btn-acc')}${btn('deny','Deny')}</div>`}
  else{body=ibBody(i.text,i.title);
    acts=`<div class="ib-acts">${btn('accepted','Accept','btn-out')}${btn('dismissed','Dismiss')}</div>`}
  const badge=PL.badge(ty.badge,t==='feedback'&&i.type?`${ty.label} · ${i.type}`:ty.label);
  return `<article class="ib-card" data-scope data-ikind="${esc(i.kind)}" data-iid="${esc(i.id)}" data-iwho="${esc(who)}">
  <div class="ib-top">${PL.avatar(who,24)}<span class="ib-who">${PL.agentLink(who)}</span>${badge}<span class="ib-wait">${ibIdLink(i)} · ${ago(i.since)}</span></div>
  <div class="ib-q">${esc(plain(ibTitle(i)))}</div>
  ${body?`<div class="ib-body md">${md(body)}</div>`:''}${extra}
  ${acts}</article>`}

function inboxRender(st){
  const live=new Set(st.inbox.map(ibKey));for(const k of [...ibGone])if(!live.has(k))ibGone.delete(k);
  const items=st.inbox.filter(i=>!ibGone.has(ibKey(i))).slice().sort((a,b)=>a.since-b.since);
  let f=PL.pref('inbox.filter','all');if(!IB_FILTERS.some(([k])=>k===f))f='all';
  const grouped=PL.pref('inbox.group','')==='1';
  const n=k=>k==='all'?items.length:items.filter(i=>i.kind===k).length;
  // A type with nothing waiting has no chip, unless it's the one you're on.
  PL.paint($('#ibchips'),items.length?IB_FILTERS.filter(([k])=>k==='all'||n(k)||k===f).map(([k,l])=>`<button type="button" class="chip" data-ibfilter="${k}" aria-pressed="${k===f}">${l} · ${n(k)}</button>`).join('')
    +`<span class="ib-sep" aria-hidden="true"></span><button type="button" class="chip" data-ibgroup aria-pressed="${grouped}">Group by agent</button>`:'');
  const shown=f==='all'?items:items.filter(i=>i.kind===f);
  let html;
  if(!items.length)html=PL.empty({icon:'inbox',title:'Nothing is waiting on you',text:'Questions, tasks and approvals from your agents show up here.',action:{label:'Open Agents',href:'#agents'}});
  else if(!shown.length)html=PL.empty({icon:'inbox',title:'Nothing of this kind',text:'The rest of your Inbox is under All.',action:{label:'Show all',attrs:'data-ibfilter="all"'}});
  else if(grouped){const by=new Map();for(const i of shown){const k=i.who||'an agent';if(!by.has(k))by.set(k,[]);by.get(k).push(i)}
    html=[...by].map(([who,l])=>`<section class="ib-grp"><div class="ib-grp-h">${PL.avatar(who,28)}<b>${PL.agentLink(who)}</b><span class="count">${l.length}</span><span class="ib-wait">waiting ${ago(l[0].since)}</span></div>${l.map(inboxCard).join('')}</section>`).join('')}
  else html=shown.map(inboxCard).join('');
  PL.paint($('#iblist'),html)}

// ---- Acting on an item ------------------------------------------------------------------------------------------
const IB_DONE={dismiss:'Dismissed',done:'Marked done',failed:'Marked couldn’t do it',approve:'Approved',deny:'Denied',accepted:'Accepted',dismissed:'Dismissed'};
async function ibAct(card,action,text){
  const kind=card.dataset.ikind,id=card.dataset.iid,who=card.dataset.iwho,key=kind+':'+id;
  if(action==='reply'&&!text.trim()){card.querySelector('[data-ibtext-in]')?.focus();return}
  card.querySelectorAll('button,input').forEach(b=>b.disabled=true);
  let r;try{r=await PL.post('/api/inbox',{kind,id,action,text})}catch(e){r={error:String(e.message||e)}}
  if(r.error){card.querySelectorAll('button,input').forEach(b=>b.disabled=false);PL.toast(r.error,{kind:'bad'});return}
  card.classList.add('ib-leaving');
  setTimeout(()=>{ibGone.add(key);PL.render()},180);
  // Undo where the daemon can take it back: a task reopens (its owner is told), dismissed feedback is new again.
  let undo=null;
  if(kind==='task')undo=async()=>{const u=await PL.post('/api/tasks/'+encodeURIComponent(id),{status:'open',expect:action});
    if(u.error)PL.toast(u.error,{kind:'bad'});ibGone.delete(key);PL.refresh()};
  if(kind==='feedback'&&action==='dismissed')undo=async()=>{const u=await PL.post('/api/issues/'+encodeURIComponent(id),{status:'new'});
    if(u.error)PL.toast(u.error,{kind:'bad'});ibGone.delete(key);PL.refresh()};
  PL.toast(action==='reply'?`Sent to ${who}`+(r.waiting?'; it isn’t running, so the answer waits for it':''):`${IB_DONE[action]||'Done'}: ${id}`,{undo});
  PL.refresh()}
document.addEventListener('click',e=>{const b=e.target.closest('[data-ibact]');if(!b)return;const card=b.closest('.ib-card');if(!card)return;
  e.preventDefault();
  ibAct(card,b.dataset.ibact,b.dataset.ibtext!=null?b.dataset.ibtext:card.querySelector('[data-ibtext-in]')?.value||'')});
// Enter in the answer field sends it; in a task's note it's Done.
document.addEventListener('submit',e=>{const f=e.target.closest('[data-ibform]');if(!f)return;e.preventDefault();
  ibAct(f.closest('.ib-card'),f.dataset.ibform,f.elements.text.value)});
document.addEventListener('click',e=>{const b=e.target.closest('[data-ibfilter]');if(!b)return;PL.keep('inbox.filter',b.dataset.ibfilter);PL.render()});
document.addEventListener('click',e=>{if(!e.target.closest('[data-ibgroup]'))return;PL.keep('inbox.group',PL.pref('inbox.group','')==='1'?'':'1');PL.render()});

// ---- The ? sheet: how the Inbox works, and desktop alerts ----------------------------------------------------------
// Phase 2: desktop alerts move to Setup (setup.js owns them then). Until then they're switched here, with the same
// preference the shell's notify() reads ('peerlink.notify'), so the shell keeps sending them.
const ibAlertsLabel=()=>PL.notifyOn()?'On':'Off';
async function ibAlertsToggle(){
  if(PL.notifyOn())PL.keep('notify','');
  else if(!window.Notification)return PL.tell('This browser has no desktop notifications.');
  else if(await Notification.requestPermission()==='granted')PL.keep('notify','1');
  else return PL.tell('Notifications are blocked for this page. Allow them in the browser’s site settings.');
  PL.render()}
document.addEventListener('click',e=>{if(!e.target.closest('[data-ibhelp]'))return;
  const s=PL.sheet.open({title:'Inbox',body:`<p class="ib-help-p">Everything your agents wait on you for: questions, tasks they gave you, approvals (a new agent, a schedule, a standing rule) and feedback about peerlink. The longest waiting is first.</p>
<p class="ib-help-p">On Discord, <span class="mono">/inbox</span> shows the same items, and you answer by number, like <span class="mono">1 done</span> or <span class="mono">2 approve</span>.</p>
${PL.label('This browser')}${PL.group(`<div class="row"><span class="tile">${PL.icon('bell')}</span><span class="row-main"><span class="row-t">Desktop alerts</span><span class="row-s">A notification when something new waits on you and this tab is in the background</span></span><span class="row-v"><button type="button" class="btn btn-out sm" data-ibalerts>${ibAlertsLabel()}</button></span></div>`)}`});
  s.body.addEventListener('click',async ev=>{const b=ev.target.closest('[data-ibalerts]');if(!b)return;await ibAlertsToggle();b.textContent=ibAlertsLabel()})});
