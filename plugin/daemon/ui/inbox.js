// inbox.js: the Inbox page, everything waiting on you, with the action each needs.
PL.page('inbox',{title:'Inbox',
  html:`<h1>Inbox</h1><p class="lead">Everything waiting on you, the longest waiting first. On Discord, <span class="mono">/inbox</span> shows the same list, and you answer by number, like <span class="mono">1 done</span>.</p>
<div class="msgbar"><button class="ghost small" id="notifybtn" data-notify>Desktop alerts: off</button></div>
<div class="mlist" id="inboxlist"></div>`,
  count:st=>st.inbox.length||'',
  render:()=>renderInbox()});
// An approval is for a new agent (s…), a schedule (c…) or a standing rule (r…): each says which, and approving a
// new agent asks first, since it starts a Claude Code session.
const approvalOf=i=>i.kind!=='approval'?'':/^c\d+$/.test(i.id)?'schedule':/^r\d+$/.test(i.id)?'rule':'agent';
const ILABEL={schedule:'wants a schedule',rule:'proposes a rule',agent:'wants a new agent',task:'task for you',question:'waiting on your answer',feedback:'feedback'};
const IAPPROVE={schedule:'Approve',rule:'Approve rule',agent:'Approve and start it'};
// An item's id links to where it lives: the task, the message, the schedule, the rules.
const itemLink=i=>i.kind==='task'?PL.taskLink(i.id):i.kind==='question'?PL.msgLink(i.id):approvalOf(i)==='schedule'?PL.schedLink(i.id)
  :approvalOf(i)==='rule'?`<a class="link" href="#setup/rules">${esc(i.id)}</a>`:esc(i.id);
function renderInbox(){
  $('#notifybtn').textContent=notifyOn()?'Desktop alerts: on':'Desktop alerts: off';
  const btn=(a,t)=>`<button class="ghost small" data-iact="${a}">${t}</button>`;
  const item=i=>`<div class="task" data-scope data-ikind="${esc(i.kind)}" data-iid="${esc(i.id)}"><div class="mh"><span class="tchip ${i.kind==='task'||i.kind==='approval'?'open':i.kind==='question'?'new':esc(i.type)}">${ILABEL[approvalOf(i)||i.kind]}</span><b class="ititle">${esc(plain(i.title))}</b><span class="when">${itemLink(i)} · waiting ${ago(i.since)}</span></div>
    <div class="small mut">from <b>${PL.agentLink(i.who)}</b>${i.kind==='feedback'?' · '+esc(i.type):''}</div>
    ${(()=>{// The title is the first line, cut: when it was cut, the body keeps the whole text so nothing is lost mid-word.
      const t=i.text.trim(),[first,...rest]=t.split('\n'),more=first.trim()===i.title.trim()?rest.join('\n').trim():t;return more?`<div class="ftext md">${md(more)}</div>`:''})()}
    <div class="tact">${i.kind==='approval'?`${btn('approve',IAPPROVE[approvalOf(i)])}${btn('deny','Deny')}`:i.kind==='task'?`<input class="small" data-itext placeholder="Note for ${esc(i.who)} (optional)" aria-label="Note">${btn('done','Done')}${btn('failed',"Couldn't do it")}`
      :i.kind==='question'?`<input class="small" data-itext placeholder="Your answer" aria-label="Your answer">${btn('reply','Send')}${btn('dismiss','Dismiss')}`
      :`${btn('accepted','Accept')}${btn('dismissed','Dismiss')}`}</div></div>`;
  // By who's asking, the longest waiting first; a lone item still sits in its agent's panel.
  const byWho=new Map();for(const i of inbox){const k=i.who||'an agent';if(!byWho.has(k))byWho.set(k,[]);byWho.get(k).push(i)}
  const kinds=l=>[...new Set(l.map(i=>({schedule:'schedule',rule:'rule',agent:'new agent'})[approvalOf(i)]||i.kind))].join(', ');
  PL.paint($('#inboxlist'),[...byWho].sort((a,b)=>Math.min(...a[1].map(i=>i.since))-Math.min(...b[1].map(i=>i.since))).map(([who,l])=>grp('inbox:'+who,{title:who,sub:esc(kinds(l)),
      state:`<span class="pill warn">${l.length}</span><span class="small mut">waiting ${ago(Math.min(...l.map(i=>i.since)))}</span>`,bg:'var(--acc)'},l.map(item).join(''))).join('')
    ||PL.empty({icon:'inbox',title:'Nothing is waiting on you',text:'Questions, tasks and approvals from your agents show up here.'}))}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-iact]');if(!b)return;const row=b.closest('[data-iid]');
  const text=row.querySelector('[data-itext]')?.value||'';
  if(b.dataset.iact==='reply'&&!text.trim()){row.querySelector('[data-itext]').focus();return}
  if(b.dataset.iact==='approve'&&approvalOf({kind:'approval',id:row.dataset.iid})==='agent'&&!await ask('Start a new Claude Code session in that folder?'))return;
  const r=await post('/api/inbox',{kind:row.dataset.ikind,id:row.dataset.iid,action:b.dataset.iact,text});
  if(r.error)tell(r.error);document.activeElement?.blur();refresh(true)});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches?.('#inboxlist [data-itext]')){e.preventDefault();e.target.closest('[data-iid]').querySelector('[data-iact]').click()}});
