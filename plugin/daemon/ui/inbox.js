// inbox.js: the Inbox page, everything waiting on you, the longest waiting first, each answered in place.
// One flat list of cards; filter chips by type (with counts) and a "Group by agent" chip. The card and its answers are
// the shell's (PL.inboxCard): a question's options are one-tap buttons, Approve is the accent button, a task keeps
// Done / Couldn't do it with an optional note, and what you answer leaves the list at once, with Undo where the
// daemon can take it back.
PL.page('inbox',{title:'Inbox',
  html:`<div class="ib-head"><h1>Inbox</h1><span class="spacer"></span>${PL.helpBtn('About the Inbox','data-ibhelp')}</div>
<div class="chips ib-chips" id="ibchips"></div>
<div class="ib-list" id="iblist"></div>`,
  count:st=>st.inbox.length||'',
  render:(st)=>inboxRender(st)});

// The filter chips: the four kinds the daemon has.
const IB_FILTERS=[['all','All'],['question','Questions'],['task','Tasks for you'],['approval','Approvals'],['feedback','Feedback']];

function inboxRender(st){
  const items=PL.waiting(st).slice().sort((a,b)=>a.since-b.since);
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
    html=[...by].map(([who,l])=>`<section class="ib-grp"><div class="ib-grp-h">${PL.avatar(who,28)}<b>${PL.agentLink(who)}</b><span class="count">${l.length}</span><span class="icard-wait">waiting ${ago(l[0].since)}</span></div>${l.map(i=>PL.inboxCard(i,{who:false})).join('')}</section>`).join('')}
  else html=shown.map(i=>PL.inboxCard(i)).join('');
  PL.paint($('#iblist'),html)}

document.addEventListener('click',e=>{const b=e.target.closest('[data-ibfilter]');if(!b)return;PL.keep('inbox.filter',b.dataset.ibfilter);PL.render()});
document.addEventListener('click',e=>{if(!e.target.closest('[data-ibgroup]'))return;PL.keep('inbox.group',PL.pref('inbox.group','')==='1'?'':'1');PL.render()});

// ---- The ? sheet: how the Inbox works; desktop alerts are on Setup ---------------------------------------------------
document.addEventListener('click',e=>{if(!e.target.closest('[data-ibhelp]'))return;
  PL.sheet.open({title:'Inbox',body:`<p class="ib-help-p">Everything your agents wait on you for: questions, tasks they gave you, approvals (a new agent, a schedule, a standing rule) and feedback about peerlink. The longest waiting is first.</p>
<p class="ib-help-p">On Discord, <span class="mono">/inbox</span> shows the same items, and you answer by number, like <span class="mono">1 done</span> or <span class="mono">2 approve</span>.</p>
<p class="ib-help-p">A notification when something new waits on you: turn on <a class="link" href="#setup/settings">Desktop alerts</a> in Setup, under Settings.</p>`})});
