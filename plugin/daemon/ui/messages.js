// messages.js: the Messages page. Conversations on the left, the open one on the right (#messages/<key>); below 900px
// they are two screens, and Back goes to #messages. A conversation's key is its two ends: "you|web-app" (you and an
// agent), "api|infra" (two agents) or a chat channel's id and an agent. Older keys ("n:alex|n:web-app"), a bare agent
// name ("web-app", your conversation with it) and a message id ("m39") open the conversation they name.
//
// The tab's count is the conversations waiting on your reply: the questions agents asked you (the Inbox's "question"
// items), counted once per conversation. It's what the page is for, and unlike "messages in the snapshot" it goes to
// zero when you've answered everything.

// Schedules (schedules.js) uses the bare when() the old Messages page defined. Kept as a window property, not a
// declaration, so a page that declares its own when() still loads.
if(!window.when)window.when=ts=>new Date(ts*1000).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});

(()=>{
const MX={drafts:new Map(),kinds:new Map(),answer:new Map(),hist:{},older:null,olderBusy:false,olderAsked:new Set(),
  shown:'',seenRoute:'',focus:false,open:new Set(),space:'',agent:''};
const esc=PL.esc;

// ---- Who's at each end ---------------------------------------------------------------------------------------------
// You are one party, whether you wrote from the web UI ("alex (web UI)") or an agent wrote to you ("alex"). A chat
// channel is its own party, by its id; anyone else is their name, which survives an agent's /clear.
const meName=st=>st?.snap?.inbox?.user||'you';
const party=(x,side)=>{const who=String(x[side]||'');if(who==='user')return 'you';if(who.startsWith('discord:'))return who;
  return String(x[side+'_name']||who).toLowerCase()};
// A key in a link: the bar stays readable.
const keyHref=key=>'#messages/'+encodeURIComponent(key).replace(/%7C/gi,'|');
const keyOf=(a,b)=>a==='you'?'you|'+b:b==='you'?'you|'+a:[a,b].sort().join('|');
const ends=key=>{const i=key.indexOf('|');return i<0?['you',key]:[key.slice(0,i),key.slice(i+1)]};
const isChan=t=>String(t).startsWith('discord:');
const isSched=x=>x.from==='peerlink'&&/^schedule /.test(x.from_name||'');
const isAgentTok=t=>t!=='you'&&!isChan(t)&&!t.startsWith('space:')&&t!=='peerlink'&&!/^schedule /.test(t);
// The ends the daemon files a conversation under (GET /api/conversation): you have two names in its log.
const apiParties=(t,st)=>{const me=meName(st).toLowerCase();return t==='you'?['n:'+me,'n:'+me+' (web ui)']:isChan(t)?[t]:['n:'+t]};
// A key as the route gives it, in the page's own form.
const normTok=(t,st)=>{t=String(t||'').trim();if(isChan(t))return t;t=t.replace(/^n:/,'').toLowerCase();const me=meName(st).toLowerCase();
  return t===me||t===me+' (web ui)'||t==='user'||t==='you'?'you':t};
const chanLabel=n=>String(n||'').replace(/^.* on (?=#)/,'').replace(/^#/,'').replace(/ on (Discord|Telegram|Slack)$/,'');

// ---- The messages the page knows about ----------------------------------------------------------------------------
// The snapshot holds the last 100; "Load older" adds the last 500 the daemon keeps (GET /api/messages?limit=500).
function allMsgs(st){const by=new Map();for(const x of MX.older||[])by.set(x.id,x);for(const x of st.messages)by.set(x.id,x);
  return [...by.values()].sort((a,b)=>a.ts-b.ts)}
const spacesOf=x=>{const by=n=>PL.state.peers.find(p=>p.name===n)?.space;return [x.from_space||by(x.from_name),x.to_space||by(x.to_name)].filter(s=>s&&s!=='default')};
// Questions agents asked you, by conversation. The daemon decides what still waits (the Inbox's question items); a
// question older than the messages here is filed under you and its sender.
function waiting(st,msgs){const by=new Map(msgs.map(m=>[m.id,m])),out=new Map();
  for(const i of st.inbox){if(i.kind!=='question')continue;const x=by.get(i.id);
    const key=x?keyOf(party(x,'from'),party(x,'to')):keyOf('you',String(i.who||'').toLowerCase());
    if(!out.has(key))out.set(key,[]);out.get(key).push({id:i.id,who:i.who,since:i.since,text:i.text})}
  return out}
function conversations(st,msgs,{sched=false}={}){const map=new Map();
  const add=key=>{let c=map.get(key);if(!c){const [a,b]=ends(key);c={key,a,b,names:{you:'you'},list:[],spaces:new Set(),wait:null};map.set(key,c)}return c};
  for(const x of msgs){if(!sched&&isSched(x))continue;const a=party(x,'from'),b=party(x,'to'),c=add(keyOf(a,b));
    if(a!=='you')c.names[a]=isChan(a)?(c.names[a]||chanLabel(x.from_name)):x.from_name;
    if(b!=='you')c.names[b]=isChan(b)?chanLabel(x.to_name):x.to_name;
    c.list.push(x);for(const s of spacesOf(x))c.spaces.add(s)}
  for(const [key,qs] of waiting(st,msgs)){const c=add(key);c.wait=qs;const [,b]=ends(key);if(!c.names[b])c.names[b]=qs[0].who}
  for(const c of map.values()){
    c.last=c.list.length?c.list[c.list.length-1]:{id:c.wait[0].id,ts:c.wait[0].since,from_name:c.wait[0].who,text:c.wait[0].text,from:''};
    c.queued=c.list.filter(x=>x.status==='queued').length;
    // Between agents: a question nobody in the list has answered yet.
    c.expects=!c.wait&&c.list.some(x=>x.expects_reply&&!x.task&&!c.list.some(y=>y.reply_to===x.id))}
  return [...map.values()]}
const nameOf=(c,t)=>t==='you'?'you':t.startsWith('space:')?'lead of '+t.slice(6):c.names[t]||t;

// ---- Small pieces ---------------------------------------------------------------------------------------------------
const shortTime=ts=>{if(!ts)return '';const d=new Date(ts*1000),now=new Date();
  return d.toDateString()===now.toDateString()?d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})
    :d.toLocaleDateString([],d.getFullYear()===now.getFullYear()?{month:'short',day:'numeric'}:{year:'numeric',month:'short',day:'numeric'})};
const avatarOf=(c,t,size)=>isChan(t)?`<span class="mx-chan" style="--av:${size}px">${platLogo(t.slice(8))}</span>`:PL.avatar(nameOf(c,t),size);
const avatars=(c,size=40)=>c.a==='you'?avatarOf(c,c.b,size):`<span class="mx-pair" style="--av:${size}px">${avatarOf(c,c.a,Math.round(size*.7))}${avatarOf(c,c.b,Math.round(size*.7))}</span>`;
// "you ↔ web-app", as plain text (a row is a link already) or with each agent linked (the thread's head).
const endLabel=(c,t,link)=>t==='you'?'<span class="mx-you">you</span>':link&&isAgentTok(t)?`<b>${PL.agentLink(nameOf(c,t))}</b>`:`<b>${esc(nameOf(c,t))}</b>`;
const pairLabel=(c,link)=>`${endLabel(c,c.a,link)}<span class="mx-arrow" aria-label="and">↔</span>${endLabel(c,c.b,link)}`;
const senderOf=x=>x.from==='user'?'you':isChan(x.from)?String(x.from_name||'').replace(/ on #?.*$/,'')||'you':x.from_name;
const statusText=x=>x.acked?'read':x.status||'';
const ST_KIND={queued:'warn',expired:'bad',failed:'bad',forwarding:'info'};

// ---- The list -----------------------------------------------------------------------------------------------------
function rowHtml(c,on){const l=c.last,who=l.from?senderOf(l):l.from_name;
  const badges=(c.wait?PL.badge('warn',c.wait.length>1?`${c.wait.length} replies expected`:'reply expected'):c.expects?PL.badge('mut','reply expected'):'')
    +(c.queued?PL.badge('info',`${c.queued} queued`):'');
  return `<a class="mxrow${on?' on':''}${c.wait?' wait':''}" href="${keyHref(c.key)}"${on?' aria-current="true"':''}>
    <span class="mxrow-av">${avatars(c)}</span>
    <span class="mxrow-main"><span class="mxrow-t">${pairLabel(c,false)}</span>
      <span class="mxrow-s">${esc(who)}: ${esc(PL.plain(l.text).slice(0,200))}</span>${badges?`<span class="mxrow-b">${badges}</span>`:''}</span>
    <span class="mxrow-time">${esc(shortTime(l.ts))}</span></a>`}
function chipsHtml(all,nWait){const view=PL.pref('msg.view','all'),sched=PL.pref('msg.sched','0')==='1';
  const spaces=[...new Set(all.flatMap(c=>[...c.spaces]))].sort();
  const ch=(on,attrs,label)=>`<button type="button" class="chip" aria-pressed="${on}" ${attrs}>${label}</button>`;
  return ch(view==='reply','data-mxview="reply"',`Needs your reply${nWait?` <span class="mx-n">${nWait}</span>`:''}`)+ch(view!=='reply','data-mxview="all"','All')
    +spaces.map(s=>ch(MX.space===s,`data-mxspace="${esc(s)}"`,esc(s))).join('')
    +ch(!!MX.agent,'data-mxagent',MX.agent?`${esc(MX.agent)} <span class="mx-x" aria-label="Clear">${PL.icon('x',14)}</span>`:`Agent <span class="mx-x">${PL.icon('chev',14)}</span>`)
    +ch(sched,'data-mxsched','Schedule runs')}

// ---- The thread ---------------------------------------------------------------------------------------------------
// The choices a question offers: what the daemon kept (a chat post), or the numbered list it appends to the text.
const choicesOf=x=>{if((x.options||[]).length)return x.options;const m=String(x.text||'').match(/(?:\n\d+\. [^\n]+)+\s*$/);if(!m)return [];
  const l=m[0].trim().split('\n').map(r=>r.match(/^(\d+)\. (.+)$/));return l.every((r,i)=>r&&+r[1]===i+1)?l.map(r=>r[2].trim()):[]};
function bubble(x,c,qids,route,ans,replied){const from=party(x,'from'),mine=from==='you'||isChan(from),right=!mine&&c.a!=='you'&&from===c.b;
  const who=mine?(x.from==='user'?'you':`${isChan(x.from)?platLogo(x.from.slice(8)):''}<span>${esc(senderOf(x))}</span>`)
    :isSched(x)?PL.schedLink(x.from_name.slice(9),x.from_name):PL.agentLink(x.from_name);
  const st=statusText(x),long=PL.plain(x.text).length>1400||String(x.text).split('\n').length>24,clamp=long&&!MX.open.has(x.id);
  const open=qids.has(x.id);
  const tags=[x.kind==='announcement'?PL.badge('info',`announcement · ${(x.recipients||[]).length} agents`):'',
    x.task?`<span class="badge b-acc">task ${PL.taskLink(x.task)}</span>`:open?PL.badge('warn','waiting on your reply'):x.expects_reply?(replied.has(x.id)?PL.badge('ok','answered'):PL.badge('mut','reply expected')):'',
    x.reply_to?`<span class="mx-re">re ${PL.msgLink(x.reply_to)}</span>`:''].join('');
  return `<div class="mxb${mine?' me':right?' right':''}${route.id===x.id?' hl':''}${clamp?' clamp':''}" data-mid="${esc(x.id)}">
    <div class="mxb-h"><span class="who">${who}</span><span>${esc(shortTime(x.ts))}</span><span>${PL.msgLink(x.id)}</span>${st?`<span class="mx-st${ST_KIND[st]?' '+ST_KIND[st]:''}">${esc(st)}</span>`:''}${tags}</div>
    <div class="md">${PL.md(x.text)}</div>
    ${long?`<button type="button" class="btn btn-ghost sm mx-more" data-mxmore="${esc(x.id)}">${clamp?'Show all':'Show less'}</button>`:''}
    ${open?`<div class="mx-acts">${choicesOf(x).map(o=>`<button type="button" class="btn btn-out sm" data-mxquick="${esc(x.id)}" data-text="${esc(o)}">${esc(o)}</button>`).join('')}${qids.size>1?(ans===x.id?'<span class="badge b-acc">the reply box answers this one</span>':`<button type="button" class="btn btn-soft sm" data-mxans="${esc(x.id)}">Answer this one</button>`):''}</div>`:''}</div>`}
function threadMsgs(c){const by=new Map();const h=MX.hist[c.key];for(const x of h?.list||[])by.set(x.id,x);for(const x of c.list)by.set(x.id,x);
  return [...by.values()].sort((a,b)=>a.ts-b.ts)}
function headHtml(c,st){const t=c.a==='you'?c.b:'',p=t&&isAgentTok(t)?PL.findAgent(nameOf(c,t)):null;
  const sub=c.a==='you'?(isChan(t)?'a chat channel':p?[p.space&&p.space!=='default'?esc(p.space):'no space',p.busy?'working':'idle'].join(' · ')
      :t.startsWith('space:')?'whichever agent leads it gets what you send':'not running')
    :[...c.spaces].map(esc).join(', ')||'between agents';
  return `<div class="mxth"><a class="icon-btn mx-back" href="#messages" aria-label="Back to conversations">${PL.icon('back',22)}</a>
    <span class="mxth-av">${avatars(c,40)}</span><div class="mxth-main"><div class="mxth-t">${pairLabel(c,true)}</div><div class="mxth-s">${sub}</div></div></div>`}
// The reply box, under every conversation you're in: to the agent at the other end. A question it asked you is
// answered (it's then off your Inbox); "Task" sends it as a task instead, which the agent owns.
// The question the reply box answers: the one you picked, else the latest.
const answerOf=c=>{const qs=(c.wait||[]).map(q=>q.id),a=MX.answer.get(c.key);return qs.includes(a)?a:qs[qs.length-1]||''};
function composerHtml(c){const key=c.key,other=c.a==='you'?c.b:isChan(c.a)?c.b:c.a,name=nameOf(c,other);
  const qs=(c.wait||[]).map(q=>q.id),kind=MX.kinds.get(key)||'message',ans=answerOf(c);
  const hint=kind==='task'?`A task for ${esc(name)}: it owns it, and you follow it in Tasks.`
    :ans?`Answers ${esc(ans)}${qs.length>1?` (${qs.length} questions wait on you here)`:''}.`
    :isChan(c.a)||isChan(c.b)?`Goes to ${esc(name)} from the web UI, not to the channel.`:'Ctrl+Enter sends.';
  return `<form class="mxcomp" id="mxform" data-key="${esc(key)}" data-to="${esc(other.startsWith('space:')?other:name)}" data-ans="${esc(kind==='task'?'':ans)}">
    <textarea name="text" rows="2" placeholder="${esc(ans&&kind!=='task'?`Answer ${name}…`:`Message ${name}…`)}" aria-label="Message ${esc(name)}">${esc(MX.drafts.get(key)||'')}</textarea>
    <div class="mxcomp-row"><span class="seg" role="group" aria-label="Send as"><button type="button" data-mxkind="message" class="${kind==='message'?'on':''}" aria-pressed="${kind==='message'}">Message</button><button type="button" data-mxkind="task" class="${kind==='task'?'on':''}" aria-pressed="${kind==='task'}">Task</button></span>
      <span class="mxcomp-hint">${hint}</span><button type="submit" class="btn btn-acc sm">Send</button></div>
    <div class="mxcomp-err" role="alert"></div></form>`}
function notInHtml(c){const ags=[c.a,c.b].filter(isAgentTok);
  return `<div class="mxnot"><span>You aren't in this conversation.</span>${ags.map(t=>`<a class="btn btn-out sm" href="${keyHref('you|'+t)}" data-mxfocus>Message ${esc(nameOf(c,t))}</a>`).join('')}</div>`}

// ---- History: the whole conversation from the log, as opening one did before ----------------------------------------
async function loadHist(key,sig,st){const h=MX.hist[key];if(h&&(h.sig===sig||h.busy))return;
  MX.hist[key]={list:h?.list||[],capped:h?.capped,busy:true,sig};const [a,b]=ends(key),reqs=[];
  for(const p of apiParties(a,st))for(const q of apiParties(b,st))reqs.push(PL.api(`/api/conversation?a=${encodeURIComponent(p)}&b=${encodeURIComponent(q)}`).then(r=>r.messages||[]).catch(()=>[]));
  const lists=await Promise.all(reqs),by=new Map();for(const l of lists)for(const m of l)by.set(m.id,m);
  MX.hist[key]={sig,busy:false,list:[...by.values()],capped:lists.some(l=>l.length>=500)};PL.render()}
async function loadOlder(){if(MX.olderBusy||MX.older)return;MX.olderBusy=true;PL.render();
  try{const r=await PL.api('/api/messages?limit=500');MX.older=r.messages||[]}catch(e){PL.toast('Could not load older messages',{kind:'bad'})}
  MX.olderBusy=false;PL.render()}

// ---- Drawing ------------------------------------------------------------------------------------------------------
const phone=()=>matchMedia('(max-width:899px)').matches;
const scroller=()=>phone()?document.scrollingElement:PL.el('messages').querySelector('.mx-body');
const nearEnd=s=>s.scrollHeight-s.scrollTop-s.clientHeight<96;
function keyFromRoute(id,st,msgs){if(!id)return '';
  if(/^m\d+$/.test(id)){const x=msgs.find(m=>m.id===id)||Object.values(MX.hist).flatMap(h=>h.list||[]).find(m=>m.id===id);
    if(x)return keyOf(party(x,'from'),party(x,'to'));
    // Not among the last 100: look in the 500 the daemon keeps, once.
    if(!MX.older&&!MX.olderAsked.has(id)){MX.olderAsked.add(id);setTimeout(loadOlder)}return ''}
  const [a,b]=id.includes('|')?id.split('|'):['you',id];return keyOf(normTok(a,st),normTok(b,st))}
const backHead=title=>`<div class="mxth"><a class="icon-btn mx-back" href="#messages" aria-label="Back to conversations">${PL.icon('back',22)}</a><div class="mxth-main"><div class="mxth-t">${esc(title)}</div></div></div>`;

function render(st,route){const root=PL.el('messages'),box=root.querySelector('.mx');
  const msgs=allMsgs(st),sched=PL.pref('msg.sched','0')==='1',view=PL.pref('msg.view','all');
  const all=conversations(st,msgs,{sched}),nWait=all.filter(c=>c.wait).length;
  const key=keyFromRoute(route.id,st,msgs);
  root.classList.toggle('mx-open',!!route.id);box.classList.toggle('open',!!route.id);
  if(!/^m\d+$/.test(route.id))MX.seenRoute='';

  // The list: waiting on you first, then the latest activity first.
  const q=(root.querySelector('#mxq').value||'').trim().toLowerCase(),ag=MX.agent.toLowerCase();
  const shown=all.filter(c=>(view!=='reply'||c.wait)&&(!MX.space||c.spaces.has(MX.space))&&(!ag||c.a===ag||c.b===ag)
    &&(!q||[nameOf(c,c.a),nameOf(c,c.b),...c.list.map(x=>x.text+' '+x.id)].join(' ').toLowerCase().includes(q)))
    .sort((p,r)=>(!!r.wait-!!p.wait)||(r.last.ts-p.last.ts));
  PL.paint(root.querySelector('#mxchips'),chipsHtml(all,nWait));
  const foot=st.messages.length<100?'':MX.older?`<p class="mx-foot">From the last ${MX.older.length} messages the daemon keeps.${MX.older.length>=500?' Older ones are only in messages.jsonl, in peerlink\'s folder.':''}</p>`
    :`<div class="mx-foot"><span>From the last ${st.messages.length} messages.</span><button type="button" class="btn btn-out sm" data-mxolder ${MX.olderBusy?'disabled':''}>${MX.olderBusy?'Loading…':'Load older'}</button></div>`;
  PL.paint(root.querySelector('#mxrows'),(shown.length?`<div class="mxrows">${shown.map(c=>rowHtml(c,c.key===key)).join('')}</div>`
    :view==='reply'&&!MX.space&&!ag&&!q?PL.empty({icon:'check',title:'Nothing waits on your reply',text:'When an agent asks you something, its conversation shows here.',action:{label:'Show all',attrs:'data-mxview="all"'}})
    :view==='reply'||MX.space||ag||q?PL.empty({icon:'search',title:'No conversations match',action:{label:'Clear filters',attrs:'data-mxclear'}})
    :PL.empty({icon:'messages',title:'No messages yet',text:'Conversations between your agents, and with you, show up here.'}))+foot);

  // The thread.
  const head=root.querySelector('#mxhead'),body=root.querySelector('#mxbody'),comp=root.querySelector('#mxcomp');
  if(!route.id){PL.paint(head,'');PL.paint(comp,'',{force:true});comp.dataset.key='';MX.shown='';
    PL.paint(body,PL.empty({icon:'messages',title:'Pick a conversation',text:'Or start one with any agent.',action:{label:'New message',attrs:'data-mxnew'}}));return}
  if(!key){PL.paint(head,backHead(route.id));PL.paint(comp,'',{force:true});comp.dataset.key='';MX.shown='';
    PL.paint(body,MX.olderBusy||!MX.older&&/^m\d+$/.test(route.id)?'<p class="mx-wait">Looking for it…</p>'
      :PL.empty({icon:'alert',title:`No message ${route.id}`,text:'It isn\'t among the messages the daemon keeps.',action:{label:'All conversations',href:'#messages'}}));return}
  const [a,b]=ends(key),c=all.find(x=>x.key===key)||conversations(st,msgs,{sched:true}).find(x=>x.key===key)||{key,a,b,names:{you:'you'},list:[],spaces:new Set(),wait:null,last:{}};
  if(a==='you'&&!c.names[b]){const p=PL.findAgent(b);if(p)c.names[b]=p.name}
  loadHist(key,c.list.length?c.list[c.list.length-1].id:'',st);
  const list=threadMsgs(c),replied=new Set(list.map(x=>x.reply_to).filter(Boolean)),h=MX.hist[key],qids=new Set((c.wait||[]).map(x=>x.id)),ans=answerOf(c);
  const s=scroller(),stick=MX.shown!==key||nearEnd(s);
  // A conversation opened from a link: its row comes into view in the list beside it.
  if(MX.shown!==key&&!phone()){const r=root.querySelector('.mxrow.on'),l=root.querySelector('.mx-scroll');
    if(r&&(r.offsetTop<l.scrollTop||r.offsetTop+r.offsetHeight>l.scrollTop+l.clientHeight))l.scrollTop=r.offsetTop-l.clientHeight/3}
  PL.paint(head,headHtml(c,st));
  const capped=h?.capped?`<p class="mx-wait">The latest 500 messages between them. Older ones are only in messages.jsonl, in peerlink's folder.</p>`:'';
  PL.paint(body,list.length?capped+list.map(x=>bubble(x,c,qids,route,ans,replied)).join('')
    :!h||h.busy?'<p class="mx-wait">Loading…</p>':PL.empty({icon:'messages',title:'No messages yet',text:a==='you'?`Write the first one to ${nameOf(c,b)} below.`:'Nothing between them in the log.'}));
  // The reply box keeps a draft per conversation: another conversation repaints it at once, its draft kept.
  const inIt=a==='you'||isChan(a)||isChan(b),cHtml=inIt&&a!==b?composerHtml(c):notInHtml(c);
  if(comp.dataset.key!==key){PL.paint(comp,cHtml,{force:true});comp.dataset.key=key}else PL.paint(comp,cHtml);
  MX.shown=key;
  // Open at the end, as a chat reads, or at the message the route names; stay at the end as messages arrive.
  if(/^m\d+$/.test(route.id)&&MX.seenRoute!==route.id){const el=body.querySelector(`[data-mid="${CSS.escape(route.id)}"]`);
    if(el){MX.seenRoute=route.id;el.scrollIntoView({block:'center'})}else if(stick)s.scrollTop=s.scrollHeight}
  else if(stick&&!/^m\d+$/.test(route.id))s.scrollTop=s.scrollHeight;
  if(MX.focus){MX.focus=false;comp.querySelector('textarea')?.focus({preventScroll:true})}}

// ---- Agent picker: a small sheet, for a new conversation and for the Agent filter ------------------------------------
function pickAgent({title,names,lead=false,everyone=false,onPick}){const st=PL.state;
  const live=new Map(st.peers.filter(p=>!p.remote).map(p=>[p.name.toLowerCase(),p]));
  const rowFor=(val,label,sub,av)=>`<button type="button" class="mxpick-row" data-mxpick="${esc(val)}" data-find="${esc((label+' '+sub).toLowerCase())}">${av}<span class="row-main"><span class="row-t">${esc(label)}</span>${sub?`<span class="row-s">${esc(sub)}</span>`:''}</span></button>`;
  const agentRow=n=>{const p=live.get(n.toLowerCase());return rowFor(p?p.name:n,p?p.name:n,p?[p.space&&p.space!=='default'?p.space:'no space',p.busy?'working':'idle'].join(' · '):'not running',PL.avatar(n,36))};
  const leads=lead?Object.keys(st.leads||{}).sort().map(s=>rowFor('space:'+s,'Lead of '+s,(st.leads[s].name||'')+(st.leads[s].live?'':' · not running'),`<span class="tile">${PL.icon('spaces',18)}</span>`)).join(''):'';
  const body=`<input type="search" class="input" placeholder="Find an agent" aria-label="Find an agent" autocomplete="off" data-mxfind>
    <div class="group mxpick">${everyone?rowFor('','Everyone','every conversation',`<span class="tile">${PL.icon('agents',18)}</span>`):''}${names.map(agentRow).join('')||'<p class="mx-wait">No agents are running.</p>'}</div>
    ${leads?`${PL.label('Space leads')}<div class="group mxpick">${leads}</div>`:''}`;
  const s=PL.sheet.open({title,body});
  s.body.addEventListener('input',e=>{const v=e.target.value.trim().toLowerCase();s.body.querySelectorAll('[data-mxpick]').forEach(r=>r.hidden=!!v&&!r.dataset.find.includes(v))});
  s.body.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[data-mxfind]')){e.preventDefault();s.body.querySelector('[data-mxpick]:not([hidden])')?.click()}});
  s.body.addEventListener('click',e=>{const r=e.target.closest('[data-mxpick]');if(!r)return;s.close();onPick(r.dataset.mxpick)})}
function newMessage(){const names=PL.state.peers.filter(p=>!p.remote).map(p=>p.name).sort((x,y)=>x.localeCompare(y));
  pickAgent({title:'New message',names,lead:true,onPick:v=>{MX.focus=true;PL.go(keyHref('you|'+v.toLowerCase()))}})}
function help(){PL.sheet.open({title:'How Messages works',body:`<div class="md">
  <p>Every conversation between your agents, and between them and you (here, or on Discord, Telegram and Slack), one row each. The ones waiting on your reply come first, and the Messages tab counts them.</p>
  <p><b>Reply expected</b>: the sender asked a question. When it's on you, the reply box answers it, and it leaves your Inbox. <b>Queued</b>: not handed to the agent yet; it gets it at its next turn.</p>
  <p>On each message: when it was sent, its id (a link you can share) and its status: <b>queued</b>, <b>delivered</b>, <b>read</b> (the agent has it), <b>expired</b> or <b>failed</b>.</p>
  <p><b>Task</b> sends what you write as a task: the agent owns it, reports back, and you follow it on the Tasks page.</p>
  <p>The list starts from the last 100 messages; <b>Load older</b> adds the rest the daemon keeps. A conversation you open shows its whole history from the log. Schedule runs are hidden unless you turn on <b>Schedule runs</b>.</p></div>`})}

// ---- Actions --------------------------------------------------------------------------------------------------------
const forceComposer=()=>{PL.el('messages').querySelector('#mxcomp').dataset.key=''};
async function send(f){const text=f.elements.text.value.trim(),err=f.querySelector('.mxcomp-err'),key=f.dataset.key;if(!text){f.elements.text.focus();return}
  const kind=MX.kinds.get(key)||'message',ans=f.dataset.ans,btn=f.querySelector('button[type=submit]');
  btn.disabled=true;btn.textContent='Sending…';err.textContent='';let r;
  try{r=kind==='message'&&ans?await PL.post('/api/inbox',{kind:'question',id:ans,action:'reply',text})
    :await PL.post('/api/web/send',{to:f.dataset.to,text,kind})}catch(e){r={error:String(e.message||e)}}
  btn.disabled=false;btn.textContent='Send';
  if(r.error){err.textContent=r.error;return}
  MX.drafts.delete(key);MX.answer.delete(key);f.elements.text.value='';PL.settle(f);forceComposer();
  PL.toast(r.task?`Task ${r.task} sent to ${r.to}`:kind==='message'&&ans?`Answered ${ans}${r.waiting?'; it waits for the agent':''}`:`Sent to ${r.to} · ${r.id}`);
  // To a space's lead: the conversation is with whichever agent leads it.
  if(f.dataset.to.startsWith('space:')&&r.to)PL.go(keyHref('you|'+String(r.to).toLowerCase()));
  PL.refresh()}

// One click: a question's choice goes back as your answer.
async function quick(b){b.disabled=true;let r;
  try{r=await PL.post('/api/inbox',{kind:'question',id:b.dataset.mxquick,action:'reply',text:b.dataset.text})}catch(e){r={error:String(e.message||e)}}
  b.disabled=false;if(r.error){PL.toast(r.error,{kind:'bad'});return}
  PL.toast(`Answered ${b.dataset.mxquick}: ${b.dataset.text}`);PL.refresh()}

PL.page('messages',{title:'Messages',
  html:`<div class="mx-head"><h1>Messages</h1><button type="button" class="icon-btn mx-help" data-mxhelp aria-label="How Messages works">?</button><button type="button" class="btn btn-out sm" data-mxnew>${PL.icon('plus',18)}New message</button></div>
<div class="mx"><div class="mx-list"><div class="mx-tools"><input id="mxq" type="search" placeholder="Search messages" aria-label="Search messages" autocomplete="off"><div class="chips" id="mxchips"></div></div>
<div class="mx-scroll"><div id="mxrows"></div></div></div>
<div class="mx-thread"><div id="mxhead"></div><div class="mx-body"><div id="mxbody"></div></div><div id="mxcomp"></div></div></div>`,
  count:st=>waiting(st,allMsgs(st)).size||'',
  render});

const root=PL.el('messages');
root.querySelector('#mxq').addEventListener('input',()=>PL.render());
root.addEventListener('input',e=>{const f=e.target.closest('#mxform');if(f&&e.target.name==='text')MX.drafts.set(f.dataset.key,e.target.value)});
root.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&e.target.closest('#mxform')){e.preventDefault();e.target.closest('#mxform').requestSubmit()}});
root.addEventListener('submit',e=>{if(e.target.id!=='mxform')return;e.preventDefault();send(e.target)});
root.addEventListener('click',e=>{const t=e.target.closest('button,a');if(!t)return;const d=t.dataset;
  if(d.mxview!==undefined){PL.keep('msg.view',d.mxview);PL.render()}
  else if(d.mxspace!==undefined){MX.space=MX.space===d.mxspace?'':d.mxspace;PL.render()}
  else if(d.mxsched!==undefined){PL.keep('msg.sched',PL.pref('msg.sched','0')==='1'?'0':'1');PL.render()}
  else if(d.mxagent!==undefined){if(MX.agent&&e.target.closest('.mx-x')){MX.agent='';PL.render();return}
    const st=PL.state,seen=new Map();for(const c of conversations(st,allMsgs(st),{sched:true}))for(const tk of [c.a,c.b])if(isAgentTok(tk))seen.set(tk,nameOf(c,tk));
    for(const p of st.peers)if(!p.remote)seen.set(p.name.toLowerCase(),p.name);
    pickAgent({title:'Show conversations with',everyone:true,names:[...seen.values()].sort((x,y)=>x.localeCompare(y)),onPick:v=>{MX.agent=v;PL.render()}})}
  else if(d.mxclear!==undefined){MX.space='';MX.agent='';PL.keep('msg.view','all');root.querySelector('#mxq').value='';PL.render()}
  else if(d.mxolder!==undefined)loadOlder();
  else if(d.mxnew!==undefined)newMessage();
  else if(d.mxhelp!==undefined)help();
  else if(d.mxfocus!==undefined)MX.focus=true;
  else if(d.mxmore!==undefined){MX.open.has(d.mxmore)?MX.open.delete(d.mxmore):MX.open.add(d.mxmore);PL.render()}
  // The box may hold a draft (kept per conversation): it's repainted at once with the new choice.
  else if(d.mxkind!==undefined){MX.kinds.set(t.closest('#mxform').dataset.key,d.mxkind);forceComposer();PL.render()}
  else if(d.mxquick!==undefined)quick(t);
  else if(d.mxans!==undefined){const key=root.querySelector('#mxform')?.dataset.key;if(!key)return;MX.answer.set(key,d.mxans);MX.kinds.set(key,'message');
    forceComposer();PL.render();root.querySelector('#mxform textarea')?.focus()}});
})();
