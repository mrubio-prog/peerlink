// Messages as a conversation: newest first, each reply under the message it answers.
let msgFilter='',spaceFilter='';
// A message's spaces: what it recorded when sent, else (older messages) the space of a live agent on either end.
const spacesOf=x=>{const by=n=>livePeers.find(p=>p.name===n)?.space;return [x.from_space||by(x.from_name),x.to_space||by(x.to_name)].filter(Boolean)};
function renderMessages(list){
  const opts=(el,all,vals)=>{const keep=el.value;el.innerHTML=`<option value="">${all}</option>`+vals.map(n=>`<option ${n===keep?'selected':''}>${esc(n)}</option>`).join('')};
  opts($('#msgspace'),'All spaces',[...new Set(list.flatMap(spacesOf))].sort());
  const inSpace=list.filter(x=>!spaceFilter||spacesOf(x).includes(spaceFilter));
  opts($('#msgagent'),'Everyone',[...new Set(inSpace.flatMap(x=>[x.from_name,x.to_name]))].sort());
  const q=($('#msgq').value||'').trim().toLowerCase();
  const noSched=$('#msgnosched').checked;
  const shown=inSpace.filter(x=>!(noSched&&x.from==='peerlink'&&/^schedule /.test(x.from_name||''))&&(!msgFilter||x.from_name===msgFilter||x.to_name===msgFilter)&&(!q||[x.text,x.from_name,x.to_name,x.id].join(' ').toLowerCase().includes(q)));
  // One panel per conversation: the two ends of each message, newest activity first. Opened, it shows the pair's whole
  // history from the log, oldest first, as a chat reads.
  const convs=new Map();
  for(const x of shown){const a=partyOf(x,'from'),b=partyOf(x,'to'),key=[a,b].sort().join('|');
    const c=convs.get(key)||{key,a:a<b?a:b,b:a<b?b:a,names:{},list:[]};c.names[a]=x.from_name;c.names[b]=x.to_name;c.list.push(x);convs.set(key,c)}
  const rows=[...convs.values()].map(c=>({...c,last:c.list.reduce((m,x)=>x.ts>m.ts?x:m)})).sort((p,q)=>q.last.ts-p.last.ts);
  const html=rows.map(c=>{const open=openConvs.has(c.key),hist=convHist[c.key];
    const pending=c.list.filter(x=>x.status==='queued').length,waiting=c.list.some(x=>x.expects_reply&&!c.list.some(y=>y.reply_to===x.id));
    const body=!open?'':hist?hist.list.map(x=>convLine(x,c)).join('')+(hist.list.length>=500?'<div class="small mut">Older messages are in ~/.peerlink/messages.jsonl.</div>':''):'<div class="small mut">Loading…</div>';
    return `<details class="plat conv" data-conv="${esc(c.key)}" data-a="${esc(c.a)}" data-b="${esc(c.b)}" data-last="${esc(c.last.id)}" ${open?'open':''}><summary>
      <span class="ptitle"><span class="cnames">${partyLabel(c.a,c.names[c.a])}<span class="mut">↔</span>${partyLabel(c.b,c.names[c.b])}</span>
      <span class="psub">${esc(c.last.from_name)}: ${esc(plain(c.last.text).slice(0,140))}</span></span>
      <span class="pstate">${pending?`<span class="pill warn">${pending} queued</span>`:''}${waiting?'<span class="pill">reply expected</span>':''}<span class="small mut">${when(c.last.ts)}</span></span><span class="chev" aria-hidden="true"></span></summary>
      <div class="pbody convbody">${body}</div></details>`}).join('');
  $('#msgs').innerHTML=html||'<div class="empty">No messages yet.</div>';
  document.querySelectorAll('#msgs .convbody').forEach(el=>el.scrollTop=el.scrollHeight);
  for(const c of rows)if(openConvs.has(c.key)&&(!convHist[c.key]||convHist[c.key].last!==c.last.id))loadConv(c.key,c.a,c.b,c.last.id);
}
const when=ts=>new Date(ts*1000).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const partyOf=(x,side)=>{const who=String(x[side]||'');return who.startsWith('discord:')?who:'n:'+String(x[side+'_name']||who).toLowerCase()};
// A chat channel shows its platform's logo, and its name without "#… on Telegram".
const partyLabel=(key,name)=>{if(!key.startsWith('discord:'))return `<b>${esc(name)}</b>`;
  return `${platLogo(key.slice(8))}<b>${esc(String(name).replace(/^#/,'').replace(/ on (Discord|Telegram|Slack)$/,''))}</b>`};
function convLine(x,c){const st=x.status==='delivered'?'':`<span class="chip ${esc(x.status)}">${esc(x.status)}</span>`;
  return `<div class="cline${partyOf(x,'from')===c.a?'':' other'}${openLines.has(x.id)?' open':''}" data-line="${esc(x.id)}"><div class="mh"><b>${esc(x.from_name)}</b>
    ${x.kind==='announcement'?`<span class="chip reply">announcement · ${(x.recipients||[]).length} agents</span>`:''}${x.task?`<span class="chip reply">task ${esc(x.task)}</span>`:x.expects_reply?'<span class="chip">reply expected</span>':''}${x.reply_to?`<span class="chip reply">re ${esc(x.reply_to)}</span>`:''}${st}
    <span class="when">${when(x.ts)} · ${esc(x.id)}</span></div><div class="mt md">${md(x.text)}</div></div>`}
const openConvs=new Set(),convHist={},openLines=new Set();
// Schedule runs are hidden unless you've asked to see them.
try{$('#msgnosched').checked=localStorage.getItem('pl.msg.nosched')!=='0'}catch(e){$('#msgnosched').checked=true}
document.addEventListener('click',e=>{const l=e.target.closest('.cline');if(!l||e.target.closest('a')||getSelection().toString())return;l.classList.toggle('open');
  l.classList.contains('open')?openLines.add(l.dataset.line):openLines.delete(l.dataset.line)});let lastMsgs=[];
async function loadConv(key,a,b,last){convHist[key]=convHist[key]||null;
  const r=await api(`/api/conversation?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);convHist[key]={last,list:r.messages||[]};
  const el=document.querySelector(`details.conv[data-conv="${CSS.escape(key)}"] .convbody`);if(!el)return;
  const c={a};el.innerHTML=convHist[key].list.map(x=>convLine(x,c)).join('')||'<div class="small mut">Nothing in the log.</div>';el.scrollTop=el.scrollHeight}
// <details> toggles don't bubble: listened for on the way down.
document.addEventListener('toggle',e=>{const d=e.target;if(!d.matches?.('details.conv'))return;const k=d.dataset.conv;
  if(d.open){openConvs.add(k);if(!convHist[k]||convHist[k].last!==d.dataset.last)loadConv(k,d.dataset.a,d.dataset.b,d.dataset.last)}else openConvs.delete(k)},true);
document.addEventListener('change',e=>{
  if(e.target.id==='msgagent'){msgFilter=e.target.value;renderMessages(lastMsgs)}
  if(e.target.id==='msgnosched'){try{localStorage.setItem('pl.msg.nosched',e.target.checked?'1':'0')}catch(err){}renderMessages(lastMsgs)}
  if(e.target.id==='msgspace'){spaceFilter=e.target.value;msgFilter='';$('#msgagent').value='';renderMessages(lastMsgs)}});
