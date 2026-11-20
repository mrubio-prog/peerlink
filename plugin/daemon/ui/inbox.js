// The Inbox: one row per thing waiting on you, with the action it needs.
let inbox=[];
let seenInbox=null;
function renderInbox(){
  $('#n-inbox').textContent=inbox.length||'';
  document.title=inbox.length?`(${inbox.length}) Peerlink`:'Peerlink';
  // A desktop alert for each new item, when you've turned them on and the page isn't in front.
  const ids=new Set(inbox.map(i=>i.kind+i.id));
  if(seenInbox&&notifyOn()&&document.hidden)for(const i of inbox)if(!seenInbox.has(i.kind+i.id)){
    try{const n=new Notification(`Peerlink · ${i.who||'an agent'}`,{body:i.title,tag:i.kind+i.id});n.onclick=()=>{focus();location.hash='#inbox';n.close()}}catch{}}
  seenInbox=ids;
  $('#notifybtn').textContent=notifyOn()?'Desktop alerts: on':'Desktop alerts: off';
  if(document.activeElement?.closest?.('#inboxlist'))return;
  const sched=i=>i.kind==='approval'&&/^c\d+$/.test(i.id);
  const label={approval:'wants a new agent',task:'task for you',question:'waiting on your answer',feedback:'feedback'};
  const btn=(a,t)=>`<button class="ghost small" data-iact="${a}">${t}</button>`;
  const item=i=>`<div class="task" data-ikind="${esc(i.kind)}" data-iid="${esc(i.id)}"><div class="mh"><span class="tchip ${i.kind==='task'||i.kind==='approval'?'open':i.kind==='question'?'new':esc(i.type)}">${sched(i)?'wants a schedule':label[i.kind]}</span><b class="ititle">${esc(plain(i.title))}</b><span class="when">${esc(i.id)} · waiting ${ago(i.since)}</span></div>
    <div class="small mut">from <b>${esc(i.who)}</b>${i.kind==='feedback'?' · '+esc(i.type):''}</div>
    ${(()=>{// The title is the first line, cut: when it was cut, the body keeps the whole text so nothing is lost mid-word.
      const t=i.text.trim(),[first,...rest]=t.split('\n'),more=first.trim()===i.title.trim()?rest.join('\n').trim():t;return more?`<div class="ftext md">${md(more)}</div>`:''})()}
    <div class="tact">${i.kind==='approval'?`${btn('approve',sched(i)?'Approve':'Approve and start it')}${btn('deny','Deny')}`:i.kind==='task'?`<input class="small" data-itext placeholder="Note for ${esc(i.who)} (optional)">${btn('done','Done')}${btn('failed',"Couldn't do it")}`
      :i.kind==='question'?`<input class="small" data-itext placeholder="Your answer">${btn('reply','Send')}${btn('dismiss','Dismiss')}`
      :`${btn('accepted','Accept')}${btn('dismissed','Dismiss')}`}</div></div>`;
  // By who's asking, the longest waiting first; a lone item still sits in its agent's panel.
  const byWho=new Map();for(const i of inbox){const k=i.who||'an agent';if(!byWho.has(k))byWho.set(k,[]);byWho.get(k).push(i)}
  const kinds=l=>[...new Set(l.map(i=>sched(i)?'schedule':i.kind==='approval'?'new agent':i.kind))].join(', ');
  $('#inboxlist').innerHTML=[...byWho].sort((a,b)=>Math.min(...a[1].map(i=>i.since))-Math.min(...b[1].map(i=>i.since))).map(([who,l])=>grp('inbox:'+who,{title:who,sub:esc(kinds(l)),
      state:`<span class="pill warn">${l.length}</span><span class="small mut">waiting ${ago(Math.min(...l.map(i=>i.since)))}</span>`,bg:'var(--acc)'},l.map(item).join(''))).join('')
    ||'<div class="empty">Nothing is waiting on you.</div>'}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-iact]');if(!b)return;const row=b.closest('[data-iid]');
  const text=row.querySelector('[data-itext]')?.value||'';
  if(b.dataset.iact==='reply'&&!text.trim()){row.querySelector('[data-itext]').focus();return}
  if(b.dataset.iact==='approve'&&!/^c\d+$/.test(row.dataset.iid)&&!await ask('Start a new Claude Code session in that folder?'))return;
  const r=await post('/api/inbox',{kind:row.dataset.ikind,id:row.dataset.iid,action:b.dataset.iact,text});
  if(r.error)tell(r.error);document.activeElement?.blur();refresh(true)});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches?.('#inboxlist [data-itext]')){e.preventDefault();e.target.closest('[data-iid]').querySelector('[data-iact]').click()}});
const notifyOn=()=>pref('notify','')==='1'&&window.Notification&&Notification.permission==='granted';
document.addEventListener('click',async e=>{if(!e.target.closest('[data-notify]'))return;
  if(notifyOn()){try{localStorage.setItem('peerlink.notify','')}catch{}}
  else if(!window.Notification)tell('This browser has no desktop notifications.');
  else if(await Notification.requestPermission()==='granted'){try{localStorage.setItem('peerlink.notify','1')}catch{}}
  else tell('Notifications are blocked for this page. Allow them in the browser\'s site settings.');
  renderInbox()});
