// The page's own dialog for a yes-or-no or a notice, in place of the browser's confirm() and alert() boxes. The button
// says what happens ("Delete", "Move"), and a destructive one is red; Escape or a click outside answers no.
function ask(text,{ok,tell:only}={}){return new Promise(done=>{
  const verb=ok||(only?'OK':(text.match(/^[A-Z][a-z]+/)||['OK'])[0]),bad=!only&&/^(Delete|Clear|End|Cancel|Disconnect|Stop|Rotate|Sign|Unassign|Remove|Revoke)$/.test(verb);
  const d=document.createElement('dialog');d.className='ask';
  d.innerHTML=`<p></p><div class="acts">${only?'':`<button type="button" class="ghost" value="no">${verb==='Cancel'?'Keep':'Cancel'}</button>`}<button type="button" value="yes"${bad?' class="bad"':''}></button></div>`;
  d.querySelector('p').textContent=text;d.querySelector('[value=yes]').textContent=verb;
  const end=v=>{if(!d.open)return;d.close();d.remove();done(v)};
  d.addEventListener('click',e=>{const b=e.target.closest('button');if(b)end(b.value==='yes');else if(e.target===d)end(false)});
  d.addEventListener('cancel',e=>{e.preventDefault();end(false)});
  document.body.append(d);d.showModal();d.querySelector(bad?'[value=no]':'[value=yes]').focus()})}
const tell=text=>ask(String(text),{tell:true});
// The page redraws itself every few seconds. A redraw never replaces what you're changing: a part of the page holding
// the field you're in, or one you've changed and not saved yet, is left alone until you save or leave it. Saving
// (a form's submit, or a button) lets the next redraws through.
const unsaved=el=>el.matches('input,textarea')?(el.type==='checkbox'||el.type==='radio'?el.checked!==el.defaultChecked:el.value!==el.defaultValue)
  :el.matches('select')?[...el.options].some(o=>o.selected!==o.defaultSelected):false;
let paintFreeUntil=0,pageVersion='';
const holdPaint=box=>{if(Date.now()<paintFreeUntil)return false;const a=document.activeElement;
  if(a&&a!==document.body&&box.contains(a)&&a.matches('input:not([type=button]):not([type=submit]),textarea,select'))return true;
  return [...box.querySelectorAll('input:not([type=hidden]):not([type=button]):not([type=submit]),textarea,select')].some(unsaved)};
{const d=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
 Object.defineProperty(Element.prototype,'innerHTML',{configurable:true,get(){return d.get.call(this)},
  set(v){if(this.isConnected&&this.closest('main')&&holdPaint(this))return;d.set.call(this,v)}})}
document.addEventListener('submit',()=>{paintFreeUntil=Date.now()+4000},true);
// Outside a form with a Save button, a field is applied as soon as it changes (most save then; filters redraw).
const settle=el=>{if(el.matches('select'))[...el.options].forEach(o=>o.defaultSelected=o.selected);else if(el.type==='checkbox'||el.type==='radio')el.defaultChecked=el.checked;else if('defaultValue' in el)el.defaultValue=el.value};
document.addEventListener('change',e=>{if(e.target.closest('form'))return;paintFreeUntil=Date.now()+4000;settle(e.target)},true);
document.addEventListener('click',e=>{if(e.target.closest('button,a,[data-dflag]'))paintFreeUntil=Date.now()+4000},true);
const $=s=>document.querySelector(s);let cfg={};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Markdown as agents write it, made safe: everything is escaped first, then a small set of marks become tags.
// Links open only http(s) URLs. plain() drops the marks, for one-line previews and titles.
const md=src=>{const keep=[];const hold=h=>{keep.push(h);return `\u0001${keep.length-1}\u0001`};
  const inline=s=>{s=s.replace(/`([^`\n]+)`/g,(_,c)=>hold(`<code>${esc(c)}</code>`))
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,l,u)=>hold(`<a href="${esc(u)}" target="_blank" rel="noreferrer">${esc(l)}</a>`))
      .replace(/https?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]]/g,u=>hold(`<a href="${esc(u)}" target="_blank" rel="noreferrer">${esc(u)}</a>`));
    return esc(s).replace(/\*\*(?=\S)([^*\n]+?)\*\*/g,'<b>$1</b>').replace(/__(?=\S)([^_\n]+?)__/g,'<b>$1</b>')
      .replace(/(^|[^\w*])\*(?=\S)([^*\n]+?)\*(?!\w)/g,'$1<i>$2</i>').replace(/(^|[^\w_])_(?=\S)([^_\n]+?)_(?!\w)/g,'$1<i>$2</i>')
      .replace(/~~(?=\S)([^~\n]+?)~~/g,'<s>$1</s>')};
  let t=String(src??'').replace(/\r/g,'').replace(/```[^\n]*\n?([\s\S]*?)(```|$)/g,(_,c)=>`\n${hold(`<pre><code>${esc(c.replace(/\n$/,''))}</code></pre>`)}\n`);
  const out=[];let list=null,para=[];
  const flush=()=>{if(para.length){out.push(`<p>${para.join('<br>')}</p>`);para=[]}if(list){out.push(`<${list.tag}${list.start>1?` start="${list.start}"`:''}>${list.items.map(i=>`<li>${i}</li>`).join('')}</${list.tag}>`);list=null}};
  for(const line of t.split('\n')){let m;
    if(!line.trim()){flush();continue}
    if(/^\u0001\d+\u0001$/.test(line.trim())){flush();out.push(line.trim());continue}
    if((m=line.match(/^\s{0,3}#{1,6}\s+(.*)$/))){flush();out.push(`<p class="mdh">${inline(m[1])}</p>`);continue}
    if((m=line.match(/^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/))){const tag=m[1]?'ol':'ul';if(para.length||list&&list.tag!==tag)flush();
      list=list||{tag,items:[],start:+m[1]||1};list.items.push(inline(m[2]));continue}
    if((m=line.match(/^\s*>\s?(.*)$/))){flush();out.push(`<blockquote>${inline(m[1])}</blockquote>`);continue}
    if(list&&/^\s{2,}\S/.test(line)){list.items[list.items.length-1]+='<br>'+inline(line.trim());continue}
    if(list)flush();para.push(inline(line))}
  flush();return out.join('').replace(/\u0001(\d+)\u0001/g,(_,i)=>keep[+i])};
const plain=s=>String(s??'').replace(/```[^\n]*\n?/g,'').replace(/\[([^\]\n]+)\]\([^)\s]+\)/g,'$1').replace(/(\*\*|__|~~|`)/g,'').replace(/^\s{0,3}#{1,6}\s+/gm,'').replace(/\s+/g,' ').trim();
const J={'Content-Type':'application/json'};
const tilde=p=>String(p||'').replace(/^\/Users\/[^/]+/,'~');
// Signed out (the cookie expired, or every browser was signed out): say so and stop polling, rather than reload.
let signedOut=false;
async function api(p,o){const r=await fetch(p,o);if(r.status===401){signedOut=true;$('#signedout').style.display='block';throw new Error('signed out')}return r.json()}
const post=(p,b)=>api(p,{method:'POST',headers:J,body:JSON.stringify(b||{})});
let offList=[];  // agents not running now, from the last snapshot
// Agents and Tasks lay out across the whole window; the reading pages keep a comfortable line length.
// The Agents list reads like any other page; only its chart needs the room.
function show(){const id=(location.hash||'#agents').slice(1);document.body.classList.toggle('wide',(id==='agents'&&aLayout!=='list')||id==='tasks');
  document.querySelectorAll('section').forEach(s=>s.classList.toggle('on',s.id===id));
  document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('on',a.dataset.nav===id))}
let livePeers=[],leadOf={};
// What a render shows; the page is redrawn only when this changes, so it never flickers or loses your place.
let lastView='',lastPanel='';
// What the page shows comes in one snapshot: pushed by /api/stream as it changes, or fetched when the stream is down.
let lastSnap=null,streamOk=false,live=null;
async function refresh(force,snap){
  if(signedOut)return;
  if(!snap){snap=await api('/api/snapshot');if(snap.error&&!snap.status)throw new Error('!'+snap.error);lastSnap=snap}
  const {status:st,peers:p,messages:m,tasks:tk,issues:fb,inbox:ib}=snap;
  allTasks=tk.tasks||[];allFeedback=fb.issues||[];inbox=ib.items||[];allSched=snap.schedules?.schedules||[];
  const lim=st.limit;$('#limitbar').style.display=lim?'block':'none';
  $('#limitbar').innerHTML=lim?`<b>⏸️ Usage limit reached</b> (${lim.resets_at?'resets '+new Date(lim.resets_at*1000).toLocaleString([], {weekday:'short',hour:'numeric',minute:'2-digit'}):'no reset time given'}; hit by ${esc(lim.by)}). Agents hold their messages and schedules wait. <button class="ghost small" data-limresume>Resume now</button> after switching accounts.`:'';
  const view=JSON.stringify([p.peers.map(({last_seen_s,...x})=>x),p.leads,m.messages.map(x=>[x.id,x.status]),allTasks.map(t=>[t.id,t.status,t.owner,t.note]),allFeedback.map(f=>[f.id,f.status,f.note]),inbox.map(i=>i.id),allSched.map(c=>[c.id,c.status,c.runs,c.note]),sel,panelTab,cfg.sessions]);
  if(view===lastView&&!force)return;lastView=view;
  // A new peerlink version brings a new page: load it once nothing on this one is being changed.
  if(pageVersion&&st.version!==pageVersion&&!holdPaint(document.querySelector('main')))location.reload();pageVersion=pageVersion||st.version;
  $('#hostline').textContent=`${st.host} · daemon ${st.version}`;
  $('#browsers').textContent=`${st.browsers} signed in · links work once and expire after 60 s`;
  $('#keypath').textContent=st.home+'/key';
  drawAgents(p,m);
  livePeers=p.peers;lastMsgs=m.messages;renderMessages(lastMsgs);renderTasks();renderFeedback();renderInbox();renderSchedules();
}
// A list split into panels (Inbox by agent, Feedback by status); one you open or close stays that way across redraws.
const grpState={};
document.addEventListener('toggle',e=>{const d=e.target;if(d.matches?.('details.grp'))grpState[d.dataset.grp]=d.open},true);
const initial=n=>esc(String(n||'?').replace(/^[^a-z0-9]+/i,'').slice(0,1).toUpperCase()||'?');
const grp=(key,{title,sub='',state='',bg='var(--mut)',icon,open=true},body)=>`<details class="plat grp" data-grp="${esc(key)}" ${(grpState[key]??open)?'open':''}><summary>
  <span class="plogo" style="background:${bg}">${icon||`<b style="color:#fff">${initial(title)}</b>`}</span><span class="ptitle"><b>${esc(title)}</b><span class="psub">${sub}</span></span>
  <span class="pstate">${state}</span><span class="chev" aria-hidden="true"></span></summary><div class="pbody grpbody">${body}</div></details>`;
// A summary unchanged for two hours may describe work that's long done: shown dimmed, with its age.
const oldSummary=x=>!!(x.summary&&x.summary_ts&&Date.now()/1000-x.summary_ts>7200);
const ago=ts=>{const d=Date.now()/1000-ts;return d<90?Math.round(d)+'s':d<5400?Math.round(d/60)+'m':d<129600?Math.round(d/3600)+'h':Math.round(d/86400)+'d'};
// The board's layout, rows and open cards are this browser's own; storage can be missing (a private window), so every use is guarded.
const pref=(k,d)=>{try{return localStorage.getItem('peerlink.'+k)??d}catch{return d}};
const keep=(k,v)=>{try{localStorage.setItem('peerlink.'+k,v)}catch{}};
const agentFolders=()=>{const m=new Map();for(const p of livePeers)if(!p.remote&&!m.has(p.cwd))m.set(p.cwd,{cwd:p.cwd,name:p.name,space:p.space});return [...m.values()].sort((a,b)=>a.name.localeCompare(b.name))};
const folderLabel=cwd=>{const a=agentFolders().find(x=>x.cwd===cwd);return a?`${a.name} · ${a.space}`:`${(cfg.folder_names||{})[cwd]||cwd.split('/').filter(Boolean).pop()||cwd} (not running)`};
// A channel maps agents by folder and name, so where several share a folder each is its own pick.
const liveAgents=()=>{const m=new Map();for(const p of livePeers)if(!p.remote&&!m.has(p.cwd+'\t'+p.name))m.set(p.cwd+'\t'+p.name,{cwd:p.cwd,name:p.name,space:p.space});return [...m.values()].sort((a,b)=>a.name.localeCompare(b.name))};
const entryLabel=e=>{if(!e.name)return folderLabel(e.cwd);const a=liveAgents().find(x=>x.cwd===e.cwd&&x.name.toLowerCase()===e.name.toLowerCase());return a?`${a.name} · ${a.space}`:`${e.name} (not running)`};
function entrySelect(attrs,placeholder){return `<select ${attrs}><option value="">${placeholder}</option>${liveAgents().map(o=>`<option value="${esc(o.cwd+'\t'+o.name)}">${esc(o.name+' · '+o.space)}</option>`).join('')}</select>`}
function agentSelect(val,attrs,placeholder){const opts=agentFolders();const extra=val&&!opts.some(o=>o.cwd===val)?[{cwd:val}]:[];
  return `<select ${attrs}><option value="">${placeholder}</option>${[...opts,...extra].map(o=>`<option value="${esc(o.cwd)}" ${o.cwd===val?'selected':''}>${esc(folderLabel(o.cwd))}</option>`).join('')}</select>`}
const DISCORD_LOGO='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.007.128 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.363 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.42 0-1.333.956-2.418 2.157-2.418 1.21 0 2.176 1.095 2.157 2.419 0 1.333-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.086-2.157-2.42 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419z"/></svg>',TG_LOGO='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M4.6 11.6l13.1-5.05c.6-.22 1.13.15.93 1.06l-2.23 10.5c-.17.75-.6.93-1.23.58l-3.4-2.5-1.64 1.58c-.18.18-.33.33-.68.33l.24-3.46 6.3-5.69c.27-.24-.06-.38-.43-.14l-7.78 4.9-3.35-1.05c-.73-.23-.74-.73.15-1.07z"/></svg>';
document.addEventListener('click',e=>{if(!e.target.closest('[data-stalehide]'))return;const bar=$('#stalebar');
  try{localStorage.setItem('pl.stale.dismissed',bar.dataset.key)}catch(e){}bar.style.display='none'});
document.addEventListener('click',e=>{if(e.target.closest('[data-limresume]'))post('/api/limit/resume',{}).then(()=>refresh(true))});
// A chat's platform from its id, and that platform's logo.
const SLACK_LOGO='<svg viewBox="0 0 24 24" aria-hidden="true"><path stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none" d="M9 4.5v15M15 4.5v15M4.5 9h15M4.5 15h15"/></svg>';
const PLAT={discord:['Discord','#5865F2',DISCORD_LOGO],telegram:['Telegram','#26A5E4',TG_LOGO],slack:['Slack','#4A154B',SLACK_LOGO],agents:['Agents','#0F766E','<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M8 9l-4 3 4 3M16 9l4 3-4 3M13.5 6l-3 12"/></svg>']};
const platOf=id=>String(id).startsWith('tg:')?'telegram':String(id).startsWith('slack:')?'slack':String(id).startsWith('agents:')?'agents':'discord';
const platLogo=id=>{const [name,color,logo]=PLAT[platOf(id)];return `<span class="mlogo" title="${name}" style="background:${color}">${logo}</span>`};
const OTHER=g=>g.id==='telegram'||g.id==='slack'||g.id==='agents';
// Poll every 2 s; while the daemon is unreachable say so, back off to 10 s, and pick up again once it's back.
let misses=0;
// The daemon answered, but with an error: say what it said, since "can't reach" would send you looking in the wrong place.
function offline(e){const m=String(e?.message||'');
  $('#offwhy').textContent=m.startsWith('!')?`The peerlink daemon is running but couldn't build this page: ${m.slice(1)}. The reason is also in daemon.log, in peerlink's folder.`
    :e instanceof TypeError&&!/fetch|network|load/i.test(m)?`This page hit an error drawing itself: ${m}. Reload it; if it stays, report it.`
    :"Can't reach the peerlink daemon. This page reconnects once it's back.";
  $('#offline').style.display='block'}
function connect(){if(!window.EventSource||signedOut)return;live?.close();live=new EventSource('/api/stream');
  live.onopen=()=>{streamOk=true};
  live.onmessage=e=>{const d=JSON.parse(e.data);lastSnap=d;
    if(misses){misses=0;$('#offline').style.display='none';loadCfg().catch(()=>{})}
    refresh(false,d).catch(()=>{})};
  // The browser retries the stream by itself; until it's back, tick() polls.
  live.onerror=()=>{streamOk=false}}
// With the stream up, tick only redraws now and then, so "idle 12m" stays true; without it, it polls.
async function tick(){
  try{if(streamOk&&lastSnap)await refresh(true,lastSnap);else{await refresh();if(misses){misses=0;$('#offline').style.display='none';await loadCfg();await refresh(true)}}}
  catch(e){if(!signedOut){misses++;offline(e)}}
  if(signedOut){live?.close();return}
  setTimeout(tick,streamOk?30000:misses?10000:2000)}
// Every page's script has loaded by DOMContentLoaded: start then.
document.addEventListener('DOMContentLoaded',()=>{
show();loadCfg().then(()=>refresh(true)).then(()=>{if(location.hash==='#discord')location.hash='#channels';else if(location.hash==='#channels'){loadDiscord();loadTelegram();loadSlack();loadAgents()}}).catch(e=>{misses=1;offline(e)}).finally(()=>{connect();setTimeout(tick,2000)});
});
