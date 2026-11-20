// shell.js: the frame every page lives in. It loads first; the page scripts (inbox.js, agents.js, ...) register
// themselves with PL.page() and the shell draws only the page you're on. Read ui/README.md before changing a page.
//
// Here: the shared helpers (on window.PL, with the older bare names kept for the moved page code), the data
// (one snapshot, pushed by /api/stream or polled), the router with detail URLs, the top bar and bottom tab bar, the
// global banners, the jump box, edit protection (PL.paint), sheets, toasts and the yes/no dialog.
const PL=window.PL={pages:{},state:null,route:{page:'',id:'',hash:''}};

// ---- Small helpers ---------------------------------------------------------------------------------------------
const $=s=>document.querySelector(s);
let cfg={};
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
// A summary unchanged for two hours may describe work that's long done: shown dimmed, with its age.
const oldSummary=x=>!!(x.summary&&x.summary_ts&&Date.now()/1000-x.summary_ts>7200);
const ago=ts=>{const d=Date.now()/1000-ts;return d<90?Math.round(d)+'s':d<5400?Math.round(d/60)+'m':d<129600?Math.round(d/3600)+'h':Math.round(d/86400)+'d'};
// This browser's own preferences; storage can be missing (a private window), so every use is guarded.
const pref=(k,d)=>{try{return localStorage.getItem('peerlink.'+k)??d}catch{return d}};
const keep=(k,v)=>{try{localStorage.setItem('peerlink.'+k,v)}catch{}};
const initial=n=>esc(String(n||'?').replace(/^[^a-z0-9]+/i,'').slice(0,1).toUpperCase()||'?');
Object.assign(PL,{$,esc,md,plain,tilde,ago,pref,keep,initial,oldSummary,
  time:ts=>ts?new Date(ts*1000).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'',
  date:ts=>ts?new Date(ts*1000).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''});

// ---- Talking to the daemon -------------------------------------------------------------------------------------
// Same-origin fetches only: the daemon refuses a browser write whose Origin isn't its own.
// Signed out (the cookie expired, or every browser was signed out): say so and stop polling, rather than reload.
let signedOut=false;
async function api(p,o){const r=await fetch(p,o);if(r.status===401){signedOut=true;$('#signedout').hidden=false;throw new Error('signed out')}return r.json()}
const post=(p,b)=>api(p,{method:'POST',headers:J,body:JSON.stringify(b||{})});
PL.api=api;PL.post=post;
PL.put=(p,b)=>api(p,{method:'PUT',headers:J,body:JSON.stringify(b||{})});
PL.del=p=>api(p,{method:'DELETE'});

// ---- Icons: lucide-style, 24x24, 2px stroke ----------------------------------------------------------------------
const ICONS={
  inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  agents:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  tasks:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  messages:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  schedules:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  setup:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search:'<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4.2-4.2"/>',
  more:'<circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/><circle cx="5" cy="12" r="1.2"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  chev:'<path d="m9 18 6-6-6-6"/>',
  back:'<path d="m15 18-6-6 6-6"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  alert:'<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  spaces:'<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  rules:'<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  channels:'<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  settings:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  controls:'<path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0"/>',
  feedback:'<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
};
PL.icon=(name,size=20)=>`<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||''}</svg>`;

// ---- Components as HTML strings ---------------------------------------------------------------------------------
// Text arguments are escaped here unless the name says html. Classes are in base.css.
PL.badge=(kind,text)=>`<span class="badge b-${esc(kind)}">${esc(text)}</span>`;
// A grouped-list row: icon tile, title, optional sub-line, the current value, a chevron. title/sub/value are HTML
// (escape what you put in); href makes the row a link, attrs adds attributes (data-*) to it.
PL.row=({href,icon,tile,title='',sub='',value='',chevron=!!href,attrs='',cls=''}={})=>{const tag=href?'a':'div';
  return `<${tag} class="row${cls?' '+cls:''}"${href?` href="${esc(href)}"`:''} ${attrs}>${icon||tile?`<span class="tile">${tile||PL.icon(icon)}</span>`:''}<span class="row-main"><span class="row-t">${title}</span>${sub?`<span class="row-s">${sub}</span>`:''}</span>${value||chevron?`<span class="row-v">${value}${chevron?`<span class="chev">${PL.icon('chev',18)}</span>`:''}</span>`:''}</${tag}>`};
PL.group=rows=>`<div class="group">${rows}</div>`;
PL.label=text=>`<div class="label">${esc(text)}</div>`;
// An empty state: a round icon, a heading, a line and at most one action ({label, href} or {label, attrs}).
PL.empty=({icon='inbox',title='',text='',action}={})=>`<div class="empty-state"><span class="empty-ic">${PL.icon(icon,26)}</span>${title?`<div class="empty-t">${esc(title)}</div>`:''}${text?`<p>${esc(text)}</p>`:''}${action?(action.href?`<a class="btn btn-out" href="${esc(action.href)}">${esc(action.label)}</a>`:`<button type="button" class="btn btn-out" ${action.attrs||''}>${esc(action.label)}</button>`):''}</div>`;
// Six pastel pairs, picked from the name, so a list has colour without photos.
PL.avatar=(name,size=36)=>{let h=0;for(const c of String(name||''))h=(h*31+c.charCodeAt(0))>>>0;
  return `<span class="av av${h%6+1}" style="--av:${size}px" aria-hidden="true">${initial(name)}</span>`};
// A meter: how full something is, with its number shown (not hidden in a tooltip). Warn from 50%, bad from 80%.
PL.meter=(pct,{text=true,warn=50,bad=80}={})=>pct==null?'':`<span class="meter-w"><span class="meter${pct>=bad?' m-bad':pct>=warn?' m-warn':''}"><i style="width:${Math.max(0,Math.min(100,pct))}%"></i></span>${text?`<span class="meter-v">${Math.round(pct)}%</span>`:''}</span>`;

// ---- Links to detail routes -------------------------------------------------------------------------------------
// Any agent, task, message or schedule named anywhere links to its detail. Unknown names stay plain text.
PL.findAgent=key=>{if(!key||!PL.state)return null;const ps=PL.state.peers,k=String(key).toLowerCase();
  return ps.find(p=>p.id===key)||ps.find(p=>String(p.name).toLowerCase()===k)||null};
PL.agentHref=x=>{const same=PL.state.peers.filter(p=>p.name===x.name).length>1;return '#agents/'+encodeURIComponent(same?x.id:x.name)};
PL.agentLink=(key,label)=>{const x=PL.findAgent(key),text=esc(label??(x?x.name:key));return x?`<a class="link" href="${PL.agentHref(x)}">${text}</a>`:text};
PL.taskLink=(tid,label)=>tid?`<a class="link" href="#tasks/${encodeURIComponent(tid)}">${esc(label??tid)}</a>`:'';
PL.msgLink=(mid,label)=>mid?`<a class="link" href="#messages/${encodeURIComponent(mid)}">${esc(label??mid)}</a>`:'';
PL.schedLink=(cid,label)=>cid?`<a class="link" href="#schedules/${encodeURIComponent(cid)}">${esc(label??cid)}</a>`:'';
PL.go=hash=>{if(location.hash===hash)PL.render();else location.hash=hash};

// ---- Edit protection --------------------------------------------------------------------------------------------
// The page redraws on every change the daemon pushes. A redraw never replaces what you're changing: PL.paint() leaves
// a region alone while it holds the focused field, or a field you've changed and not saved, and paints it once you
// leave that field with nothing unsaved. Saving releases a region: a form's submit, a field that applies on change
// (outside a form), or a button inside an element marked data-scope (its fields are taken as sent). Sheets live
// outside the page, so a redraw never touches them.
const CONTROLS='input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]),textarea,select';
const unsaved=el=>el.matches('input,textarea')?(el.type==='checkbox'||el.type==='radio'?el.checked!==el.defaultChecked:el.value!==el.defaultValue)
  :el.matches('select')?[...el.options].some(o=>o.selected!==o.defaultSelected):false;
const settle=el=>{if(el.matches('select'))[...el.options].forEach(o=>o.defaultSelected=o.selected);else if(el.type==='checkbox'||el.type==='radio')el.defaultChecked=el.checked;else if('defaultValue' in el)el.defaultValue=el.value};
PL.dirty=box=>!!box&&[...box.querySelectorAll(CONTROLS)].some(unsaved);
PL.held=box=>{if(!box)return false;const a=document.activeElement;
  if(a&&a!==document.body&&box.contains(a)&&a.matches(CONTROLS))return true;return PL.dirty(box)};
PL.settle=root=>{if(!root)return;(root.matches?.(CONTROLS)?[root]:[...root.querySelectorAll(CONTROLS)]).forEach(settle)};
// Returns true when it painted (the region's content changed), false when it was unchanged or held.
PL.paint=(el,html,{force=false}={})=>{if(!el)return false;html=String(html??'');
  if(!force&&el._plHtml===html)return false;
  if(!force&&PL.held(el)){el.dataset.stale='1';return false}
  el.innerHTML=html;el._plHtml=html;delete el.dataset.stale;return true};
document.addEventListener('change',e=>{if(e.target.closest('form'))return;if(e.target.matches?.(CONTROLS))settle(e.target)},true);
document.addEventListener('submit',e=>PL.settle(e.target),true);
document.addEventListener('click',e=>{const b=e.target.closest('button');const s=b&&b.closest('[data-scope]');if(s)PL.settle(s)},true);
// Leaving a field lets a region that waited for it paint now.
document.addEventListener('focusout',()=>setTimeout(()=>{if(document.querySelector('main [data-stale]'))PL.render()},0));

// ---- The yes-or-no dialog ---------------------------------------------------------------------------------------
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
PL.ask=ask;PL.tell=tell;

// ---- Sheets: a bottom sheet on a phone, a dialog in between, a side sheet from 900px ------------------------------
// PL.sheet.open({title, body, onSave, saveLabel, danger, onClose}): body is HTML or a Node, inside a <form>. Save calls
// onSave(form, sheet); return false or an error string to keep it open (the string is shown), anything else closes
// it. Without onSave the sheet only has Close. The sheet owns its fields until Save or Cancel: page redraws never
// reach it. Returns {el, body, close, setError}.
let curSheet=null;
PL.sheet={isOpen:()=>!!curSheet,close:()=>curSheet&&curSheet.close(),
  open({title='',body='',onSave=null,saveLabel='Save',cancelLabel='Cancel',danger=false,onClose=null,wide=false}={}){
    curSheet?.close();
    const back=document.activeElement,wrap=document.createElement('div');wrap.className='sheet-wrap';
    wrap.innerHTML=`<div class="scrim" data-sheet-close></div><form class="sheet${wide?' wide':''}" role="dialog" aria-modal="true" aria-labelledby="sheet-t">
      <header class="sheet-head"><h2 id="sheet-t"></h2><button type="button" class="icon-btn" data-sheet-close aria-label="Close">${PL.icon('x')}</button></header>
      <div class="sheet-body"></div>
      <footer class="sheet-foot"><span class="sheet-err" role="alert"></span>${onSave?`<button type="button" class="btn btn-soft" data-sheet-close>${esc(cancelLabel)}</button><button type="submit" class="btn ${danger?'btn-danger':'btn-solid'}">${esc(saveLabel)}</button>`:`<button type="button" class="btn btn-soft" data-sheet-close>Close</button>`}</footer></form>`;
    const form=wrap.querySelector('form'),bodyEl=wrap.querySelector('.sheet-body'),err=wrap.querySelector('.sheet-err');
    wrap.querySelector('#sheet-t').textContent=title;
    if(body instanceof Node)bodyEl.append(body);else bodyEl.innerHTML=body;
    const h={el:form,body:bodyEl,setError:t=>{err.textContent=t||''},close(){if(curSheet!==h)return;curSheet=null;
      wrap.classList.remove('on');document.body.classList.remove('sheet-open');setTimeout(()=>wrap.remove(),320);
      try{back?.focus?.()}catch{}onClose?.()}};
    form.addEventListener('submit',async e=>{e.preventDefault();if(!onSave)return h.close();
      const b=form.querySelector('button[type=submit]'),was=b.textContent;b.disabled=true;b.textContent='Saving…';h.setError('');let r;
      try{r=await onSave(form,h)}catch(x){r=String(x?.message||x)}
      b.disabled=false;b.textContent=was;if(r===false||typeof r==='string'){h.setError(r||'');return}h.close()});
    wrap.addEventListener('click',e=>{if(e.target.closest('[data-sheet-close]'))h.close()});
    wrap.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();h.close()}});
    $('#sheets').append(wrap);document.body.classList.add('sheet-open');curSheet=h;
    requestAnimationFrame(()=>requestAnimationFrame(()=>wrap.classList.add('on')));
    (bodyEl.querySelector('[autofocus]')||bodyEl.querySelector(CONTROLS)||wrap.querySelector('.icon-btn')).focus({preventScroll:true});
    return h}};

// ---- Toasts: what just happened, with Undo where it can be taken back --------------------------------------------
PL.toast=(text,{undo,ms,kind='ok'}={})=>{const t=document.createElement('div');t.className='toast'+(kind==='bad'?' bad':'');t.setAttribute('role','status');
  t.innerHTML=`<span class="toast-ic">${PL.icon(kind==='bad'?'alert':'check',18)}</span><span class="toast-t"></span>${undo?'<button type="button" class="toast-undo">Undo</button>':''}`;
  t.querySelector('.toast-t').textContent=text;
  const gone=()=>{t.classList.remove('on');setTimeout(()=>t.remove(),250)};
  t.querySelector('.toast-undo')?.addEventListener('click',async()=>{gone();await undo()});
  $('#toasts').append(t);requestAnimationFrame(()=>t.classList.add('on'));setTimeout(gone,ms||(undo?6000:3500));return t};

// ---- Shared lookups the moved page code uses ----------------------------------------------------------------------
// The snapshot's parts, as globals for the older page code; new code reads PL.state.
let livePeers=[],leadOf={},offList=[],allTasks=[],allFeedback=[],inbox=[],allSched=[];
const agentFolders=()=>{const m=new Map();for(const p of livePeers)if(!p.remote&&!m.has(p.cwd))m.set(p.cwd,{cwd:p.cwd,name:p.name,space:p.space});return [...m.values()].sort((a,b)=>a.name.localeCompare(b.name))};
const folderLabel=cwd=>{const a=agentFolders().find(x=>x.cwd===cwd);return a?`${a.name} · ${a.space}`:`${(cfg.folder_names||{})[cwd]||cwd.split('/').filter(Boolean).pop()||cwd} (not running)`};
// A channel maps agents by folder and name, so where several share a folder each is its own pick.
const liveAgents=()=>{const m=new Map();for(const p of livePeers)if(!p.remote&&!m.has(p.cwd+'\t'+p.name))m.set(p.cwd+'\t'+p.name,{cwd:p.cwd,name:p.name,space:p.space});return [...m.values()].sort((a,b)=>a.name.localeCompare(b.name))};
const entryLabel=e=>{if(!e.name)return folderLabel(e.cwd);const a=liveAgents().find(x=>x.cwd===e.cwd&&x.name.toLowerCase()===e.name.toLowerCase());return a?`${a.name} · ${a.space}`:`${e.name} (not running)`};
function entrySelect(attrs,placeholder){return `<select ${attrs}><option value="">${placeholder}</option>${liveAgents().map(o=>`<option value="${esc(o.cwd+'\t'+o.name)}">${esc(o.name+' · '+o.space)}</option>`).join('')}</select>`}
function agentSelect(val,attrs,placeholder){const opts=agentFolders();const extra=val&&!opts.some(o=>o.cwd===val)?[{cwd:val}]:[];
  return `<select ${attrs}><option value="">${placeholder}</option>${[...opts,...extra].map(o=>`<option value="${esc(o.cwd)}" ${o.cwd===val?'selected':''}>${esc(folderLabel(o.cwd))}</option>`).join('')}</select>`}
const DISCORD_LOGO='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.007.128 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.363 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.42 0-1.333.956-2.418 2.157-2.418 1.21 0 2.176 1.095 2.157 2.419 0 1.333-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.086-2.157-2.42 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419z"/></svg>',TG_LOGO='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M4.6 11.6l13.1-5.05c.6-.22 1.13.15.93 1.06l-2.23 10.5c-.17.75-.6.93-1.23.58l-3.4-2.5-1.64 1.58c-.18.18-.33.33-.68.33l.24-3.46 6.3-5.69c.27-.24-.06-.38-.43-.14l-7.78 4.9-3.35-1.05c-.73-.23-.74-.73.15-1.07z"/></svg>';
// A chat's platform from its id, and that platform's logo.
const SLACK_LOGO='<svg viewBox="0 0 24 24" aria-hidden="true"><path stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none" d="M9 4.5v15M15 4.5v15M4.5 9h15M4.5 15h15"/></svg>';
const PLAT={discord:['Discord','#5865F2',DISCORD_LOGO],telegram:['Telegram','#26A5E4',TG_LOGO],slack:['Slack','#4A154B',SLACK_LOGO],agents:['Agents','#0F766E','<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M8 9l-4 3 4 3M16 9l4 3-4 3M13.5 6l-3 12"/></svg>']};
const platOf=id=>String(id).startsWith('tg:')?'telegram':String(id).startsWith('slack:')?'slack':String(id).startsWith('agents:')?'agents':'discord';
const platLogo=id=>{const [name,color,logo]=PLAT[platOf(id)];return `<span class="mlogo" title="${name}" style="background:${color}">${logo}</span>`};
const OTHER=g=>g.id==='telegram'||g.id==='slack'||g.id==='agents';
// A list split into panels (Inbox by agent, Feedback by status); one you open or close stays that way across redraws.
const grpState={};
document.addEventListener('toggle',e=>{const d=e.target;if(d.matches?.('details.grp'))grpState[d.dataset.grp]=d.open},true);
const grp=(key,{title,sub='',state='',bg='var(--mut)',icon,open=true},body)=>`<details class="plat grp" data-grp="${esc(key)}" ${(grpState[key]??open)?'open':''}><summary>
  <span class="plogo" style="background:${bg}">${icon||`<b style="color:#fff">${initial(title)}</b>`}</span><span class="ptitle"><b>${esc(title)}</b><span class="psub">${sub}</span></span>
  <span class="pstate">${state}</span><span class="chev" aria-hidden="true"></span></summary><div class="pbody grpbody">${body}</div></details>`;
// The org tree of spaces, shared by the Agents page (chart and list) and Setup's Spaces section.
PL.org=st=>{const peers=st.peers,leadOf=st.leads||{};
  const groups={};for(const x of peers)(groups[x.space||'default']??=[]).push(x);
  const lbl=n=>n==='default'?'unassigned':n;
  const names=[...new Set(peers.map(x=>x.space||'default'))];
  // An org chart. A space is a box of its own agents; the lead of a space inside it sits in that box too, with
  // its team's box hanging beneath it. Charts with teams in them come first, so the top of the org is at the top.
  // Two sessions open in a lead's folder are both leads: all sit in the parent's box, the team under the first.
  // A lead that's offline keeps its place at the top of its space, greyed, so you can see who work waits for.
  const ghost=(n,l)=>({id:'',name:l.name,cwd:l.cwd,space:n,parent:l.parent&&l.parent!==n?l.parent:'',leads:l.how,offline:true,summary:'offline; work for the space waits for it'});
  const ghosts=Object.entries(leadOf).filter(([n,l])=>!l.live).map(([n,l])=>ghost(n,l));
  const inside={},kids={},leads={};for(const x of [...peers,...ghosts])if(x.parent){(leads[x.space]??=[]).push(x);if(!inside[x.space]){inside[x.space]={parent:x.parent,lead:x.name,peer:x};(kids[x.parent]??=[]).push(x.space)}}
  for(const n in inside)inside[n].lead=leads[n].map(x=>x.name).join(', ');
  // A nested space whose only agent is its offline lead has no live members, but it still gets a box.
  for(const n of [...Object.keys(kids),...Object.keys(inside)])if(!groups[n])groups[n]=[];
  // An agent you added to other spaces shows once, in its own space, with a badge for each space it also joined.
  // The Spaces chart still names it in each of them, with its own space beside it.
  const joined={};for(const x of peers)for(const n of x.also||[])(joined[n]??=[]).push(x);
  // Every live agent gets its own card, two sessions in one folder included: a hidden one can't be found to message.
  const rank=(a,b)=>(b.busy-a.busy)||(a.last_seen_s-b.last_seen_s);
  const size=(n,seen=new Set())=>{if(seen.has(n))return 0;seen.add(n);return (groups[n]||[]).length+(kids[n]||[]).reduce((t,c)=>t+size(c,seen),0)};
  const order=(a,b)=>a==='default'?1:b==='default'?-1:((kids[b]||[]).length>0)-((kids[a]||[]).length>0)||size(b)-size(a)||a.localeCompare(b);
  const roots=Object.keys(groups).filter(n=>!inside[n]||n===inside[n].parent).sort(order);
  // A lead of a space at the top sits pinned above its members, who hang beneath it.
  const tops=n=>[...(groups[n]||[]).filter(x=>x.leads&&!x.parent),...ghosts.filter(x=>x.space===n&&!x.parent)].sort(rank);
  // A space's box: its members, then the leads of the spaces under it.
  const isLead=(x,n)=>!!(inside[n]&&inside[n].parent!==n&&x.parent&&x.space===n);
  const members=n=>[...(groups[n]||[]).filter(x=>!isLead(x,n)&&!(x.leads&&!x.parent)).sort(rank).sort((a,b)=>a.name.localeCompare(b.name)),
    ...(kids[n]||[]).filter(c=>c!==n).sort().map(c=>inside[c].peer)];
  // Spaces caught in a parent loop have no root; they are shown at the top level after the rest.
  const all=(fn)=>{const seen=new Set();let out=roots.map(n=>fn(n,seen)).join('');for(const n of Object.keys(groups).sort())if(!seen.has(n))out+=fn(n,seen);return out};
  return {groups,lbl,names,ghosts,inside,kids,leads,joined,rank,size,roots,tops,isLead,members,all}};

// ---- Shared task rows: the Tasks list and the agent panel's Tasks tab draw the same row, with the same actions -----
const TSTATE={open:'open',in_progress:'in progress',done:'done',failed:'failed',cancelled:'cancelled'};
const isLive=t=>t.status==='open'||t.status==='in_progress';
// A task's record: what its owner reported, what it's blocked on, notes from above and what you decided.
const TKIND={progress:'progress',blocked:'blocked',note:'note',decision:'decision',closed:'closed'};
const taskLog=t=>(t.blocked&&isLive(t)?`<div class="tblocked"><b>Blocked:</b> ${esc(t.blocked)}</div>`:'')
  +((t.log||[]).length?`<details class="tlog" data-tlog="${esc(t.id)}" ${openLogs.has(t.id)?'open':''}><summary>Record (${t.log.length})</summary>${t.log.slice().reverse().map(e=>`<div class="te ${esc(e.kind)}"><span class="k">${esc(TKIND[e.kind]||e.kind)} · ${esc(e.by)} · ${ago(e.ts)} ago</span><div class="md">${md(e.text)}</div></div>`).join('')}</details>`:'');
const openLogs=new Set();
document.addEventListener('toggle',e=>{const d=e.target;if(!d.dataset||!d.dataset.tlog)return;d.open?openLogs.add(d.dataset.tlog):openLogs.delete(d.dataset.tlog)},true);
function taskRow(t,sub){const kids=allTasks.filter(x=>x.parent===t.id);
  return `<div class="task${sub?' sub':''}" data-task="${esc(t.id)}"><div class="mh"><span class="tchip ${esc(t.status)}">${TSTATE[t.status]||esc(t.status)}</span><b>${esc(t.title)}</b><span class="when">${PL.taskLink(t.id)} · ${ago(t.created)} ago</span></div>
    <div class="small mut">${PL.agentLink(t.requester?.id||t.requester?.name||'?',t.requester?.name||'?')} → <b>${PL.agentLink(t.owner)}</b>${t.space?' · '+esc(t.space):''}${kids.length?` · ${kids.filter(k=>k.status==='done').length} of ${kids.length} subtasks done`:''}${!isLive(t)?' · closed '+ago(t.updated)+' ago':''}</div>
    ${t.note?`<div class="note md">${md(t.note)}</div>`:''}${taskLog(t)}
    <div class="tact">${isLive(t)?'<button class="ghost small" data-tact="cancelled">Cancel</button>':'<button class="ghost small" data-tact="open">Reopen</button>'}${agentSelect('','data-treassign','Reassign to…')}</div></div>`}
// Open and in-progress first, then the rest, newest first within each.
const byLive=list=>list.slice().sort((a,b)=>(isLive(b)-isLive(a))||(b.created-a.created));
document.addEventListener('click',async e=>{const b=e.target.closest('[data-tact]');if(!b)return;
  const id=b.closest('[data-task]').dataset.task,was=allTasks.find(t=>t.id===id)?.status;
  if(b.dataset.tact==='cancelled'&&!await ask(`Cancel task ${id}? Its owner is told to stop.`))return;
  const r=await post('/api/tasks/'+encodeURIComponent(id),{status:b.dataset.tact,expect:was});if(r.error)tell(r.error);refresh(true)});
document.addEventListener('change',async e=>{const t=e.target;
  if(t.dataset.treassign!==undefined&&t.value){const id=t.closest('[data-task]').dataset.task;
    const r=await post('/api/tasks/'+encodeURIComponent(id),{owner:t.value});if(r.error)tell(r.error);t.blur();refresh(true)}});

// ---- Pages and the router -----------------------------------------------------------------------------------------
// PL.page(name, {title, html, render(state, route), mount?(el, state, route), unmount?(el), count?(state)})
// registers a page: its <section id="page-NAME"> is made at once, with html (static markup) in it.
PL.page=(name,def)=>{const el=document.createElement('section');el.className='page';el.id='page-'+name;el.dataset.page=name;el.hidden=true;
  if(def.html)el.innerHTML=def.html;$('#main').append(el);PL.pages[name]=Object.assign(def,{name,el});return def};
PL.el=name=>PL.pages[name]?.el;
const TABS=['inbox','agents','tasks','messages','schedules'];
const TITLES={inbox:'Inbox',agents:'Agents',tasks:'Tasks',messages:'Messages',schedules:'Schedules',setup:'Setup'};
// Older links: each set-up page is now a section of Setup.
const ALIAS={spaces:'setup/spaces',rules:'setup/rules',channels:'setup/channels',discord:'setup/channels',settings:'setup/settings',controls:'setup/controls',feedback:'setup/feedback'};
const parseHash=()=>{const raw=location.hash.replace(/^#\/?/,''),[page,...rest]=raw.split('/');let id=rest.join('/');try{id=decodeURIComponent(id)}catch{}
  return {page:page||'',id,hash:'#'+raw}};
function route(){const r=parseHash();
  if(ALIAS[r.page]){location.replace('#'+ALIAS[r.page]);return}
  // No page named: Inbox when something waits on you, else Agents. That needs the first snapshot.
  if(!r.page){if(PL.state)location.replace(inbox.length?'#inbox':'#agents');else PL.route=r;return}
  const prev=PL.route,pg=PL.pages[r.page];PL.route=r;
  if(prev.page!==r.page){const old=PL.pages[prev.page];if(old){old.el.hidden=true;try{old.unmount?.(old.el)}catch(e){console.error(e)}}
    $('#nopage').hidden=!!pg;
    if(pg){pg.el.hidden=false;try{pg.mount?.(pg.el,PL.state,r)}catch(e){console.error(e)}}
    document.body.dataset.page=r.page;scrollTo(0,0)}
  document.querySelectorAll('[data-tab]').forEach(a=>{const on=a.dataset.tab===r.page||(a.dataset.tab==='more'&&(r.page==='schedules'||r.page==='setup'));
    a.classList.toggle('on',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  document.title=(TITLES[r.page]?TITLES[r.page]+' · ':'')+'Peerlink';
  PL.render()}
window.addEventListener('hashchange',route);

// Draws the counts, banners and the page you're on. A page's render() errors stay in that page.
let pageVersion='';
PL.render=()=>{const st=PL.state;if(!st)return;
  for(const [name,pg] of Object.entries(PL.pages)){let c='';try{c=pg.count?pg.count(st):''}catch(e){console.error(e)}
    document.querySelectorAll(`[data-count="${name}"]`).forEach(e=>e.textContent=c||'')}
  banners(st);notify(st);
  document.title=(inbox.length?`(${inbox.length}) `:'')+(TITLES[PL.route.page]?TITLES[PL.route.page]+' · ':'')+'Peerlink';
  // A new peerlink version brings a new page: load it once nothing on this one is being changed.
  if(pageVersion&&st.status.version!==pageVersion&&!PL.held($('#main'))&&!curSheet)location.reload();pageVersion=pageVersion||st.status.version;
  const pg=PL.pages[PL.route.page],err=$('#pageerr');if(!pg){err.hidden=true;return}
  try{pg.render(st,PL.route);err.hidden=true}
  catch(e){console.error(e);err.textContent=`This page hit an error drawing itself: ${e.message}. Reload it; if it stays, report it.`;err.hidden=false}};

// ---- The snapshot -----------------------------------------------------------------------------------------------
// What the page shows comes in one snapshot: pushed by /api/stream as it changes, or fetched when the stream is down.
let lastSnap=null,streamOk=false,live=null;
const applySnap=snap=>{lastSnap=snap;const {status,peers:p,messages:m,tasks:tk,issues:fb,inbox:ib}=snap;
  livePeers=p.peers||[];leadOf=p.leads||{};offList=p.offline||[];allTasks=tk.tasks||[];allFeedback=fb.issues||[];inbox=ib.items||[];allSched=snap.schedules?.schedules||[];
  PL.state={snap,status,peers:livePeers,leads:leadOf,offline:offList,messages:m.messages||[],tasks:allTasks,issues:allFeedback,inbox,schedules:allSched,cfg};
  if(!PL.route.page)route()};
// refresh(): fetch the snapshot (or take the one given) and draw. Pages call refresh(true) after an action.
async function refresh(force,snap){if(signedOut)return;
  if(!snap){snap=await api('/api/snapshot');if(snap.error&&!snap.status)throw new Error('!'+snap.error)}
  applySnap(snap);PL.render()}
PL.refresh=()=>refresh(true);
async function loadCfg(){const c=await api('/api/config');if(c.error&&c.max_hops===undefined)throw new Error('!'+c.error);cfg=c;if(PL.state)PL.state.cfg=cfg;return cfg}
PL.loadCfg=loadCfg;PL.setCfg=c=>{cfg=c;if(PL.state)PL.state.cfg=c;PL.render()};

// ---- Banners: the usage limit, agents on an old plugin, offline, signed out --------------------------------------
function banners(st){
  const lim=st.status.limit,lb=$('#limitbar');lb.hidden=!lim;
  PL.paint(lb,lim?`${PL.icon('alert',18)}<span><b>Usage limit reached</b> · ${lim.resets_at?'resets '+PL.date(lim.resets_at):'no reset time given'} · hit by ${esc(lim.by)}. Agents hold their messages and schedules wait.</span><button class="btn btn-out sm" data-limresume>Resume now</button>`:'');
  // Agents still on older plugin code: they keep working, but get fixes only after /reload-plugins. Each reloads itself
  // when next idle; one whose queued reload hasn't run in 5 minutes is stuck. Dismissed, the banner stays away until
  // the set of agents on an old plugin changes.
  const stuck=st.peers.filter(x=>x.stale&&!x.remote&&(!x.reload_queued||Date.now()/1000-x.reload_queued>300));
  const key=stuck.map(x=>x.name).sort().join(','),bar=$('#stalebar');let gone='';try{gone=localStorage.getItem('pl.stale.dismissed')||''}catch(e){}
  bar.hidden=!stuck.length||gone===key;bar.dataset.key=key;
  PL.paint(bar,!stuck.length?'':`${PL.icon('alert',18)}<span><b>${stuck.length} agent${stuck.length>1?'s':''} need${stuck.length>1?'':'s'} <span class="mono">/reload-plugins</span></b> for the newer peerlink plugin: ${stuck.map(x=>PL.agentLink(x.id)+(x.reload_queued?` <span class="mut">(reload waiting ${ago(x.reload_queued)})</span>`:'')).join(', ')}. Run it in ${stuck.length>1?'each':'it'}, or terminate it.</span><button class="btn btn-ghost sm" data-stalehide>Dismiss</button>`)}
document.addEventListener('click',e=>{if(!e.target.closest('[data-stalehide]'))return;const bar=$('#stalebar');
  try{localStorage.setItem('pl.stale.dismissed',bar.dataset.key)}catch(e){}bar.hidden=true});
document.addEventListener('click',e=>{if(e.target.closest('[data-limresume]'))post('/api/limit/resume',{}).then(()=>refresh(true))});

// ---- Desktop alerts and the title count -------------------------------------------------------------------------
let seenInbox=null;
const notifyOn=()=>pref('notify','')==='1'&&window.Notification&&Notification.permission==='granted';
PL.notifyOn=notifyOn;
function notify(st){const ids=new Set(st.inbox.map(i=>i.kind+i.id));
  if(seenInbox&&notifyOn()&&document.hidden)for(const i of st.inbox)if(!seenInbox.has(i.kind+i.id)){
    try{const n=new Notification(`Peerlink · ${i.who||'an agent'}`,{body:i.title,tag:i.kind+i.id});n.onclick=()=>{focus();location.hash='#inbox';n.close()}}catch{}}
  seenInbox=ids}
document.addEventListener('click',async e=>{if(!e.target.closest('[data-notify]'))return;
  if(notifyOn()){try{localStorage.setItem('peerlink.notify','')}catch{}}
  else if(!window.Notification)tell('This browser has no desktop notifications.');
  else if(await Notification.requestPermission()==='granted'){try{localStorage.setItem('peerlink.notify','1')}catch{}}
  else tell('Notifications are blocked for this page. Allow them in the browser\'s site settings.');
  PL.render()});

// ---- The jump box: Ctrl/Cmd+K, to any agent, task, schedule or page ----------------------------------------------
function jumpItems(){const st=PL.state,out=[];
  for(const p of ['inbox','agents','tasks','messages','schedules','setup'])out.push({t:TITLES[p],s:'Page',h:'#'+p,i:p});
  for(const [k,t] of PL.pages.setup?.sections||[])out.push({t,s:'Setup',h:'#setup/'+k,i:PL.pages.setup.icons?.[k]||'setup'});
  if(!st)return out;
  for(const x of st.peers)out.push({t:x.name,s:'Agent · '+(x.space==='default'||!x.space?'unassigned':x.space)+(x.busy?' · working':''),h:PL.agentHref(x),i:'agents'});
  for(const t of st.tasks)out.push({t:t.id+' · '+t.title,s:'Task · '+(t.owner||'')+' · '+String(t.status).replace('_',' '),h:'#tasks/'+t.id,i:'tasks'});
  for(const c of st.schedules)out.push({t:c.id+' · '+(c.agent||tilde(c.folder)),s:'Schedule · '+(c.when_text||c.status),h:'#schedules/'+c.id,i:'schedules'});
  return out}
// Fuzzy: the letters in order; a straight run, a word start and an early match score higher.
const fuzzy=(q,s)=>{s=s.toLowerCase();const at=s.indexOf(q);if(at>=0)return 1000-at+(at===0||/\W/.test(s[at-1])?200:0)-s.length/100;
  let i=0,score=0,last=-2;for(const ch of q){const k=s.indexOf(ch,i);if(k<0)return -1;score+=k===last+1?8:(k===0||/\W/.test(s[k-1])?4:1);last=k;i=k+1}return score-s.length/100};
function jumpList(q,box,active){q=q.trim().toLowerCase();const all=jumpItems();
  const hits=q?all.map(x=>({...x,sc:fuzzy(q,x.t)})).filter(x=>x.sc>=0).sort((a,b)=>b.sc-a.sc).slice(0,8):all.filter(x=>x.s==='Page');
  box.innerHTML=hits.map((x,i)=>`<a class="jump-item${i===active?' on':''}" role="option" href="${esc(x.h)}" aria-selected="${i===active}"><span class="tile">${PL.icon(x.i,18)}</span><span class="row-main"><span class="row-t">${esc(x.t)}</span><span class="row-s">${esc(x.s)}</span></span></a>`).join('')
    ||'<div class="jump-none">Nothing matches.</div>';return hits}
function jumpBind(input,box,done){let act=0,hits=[];const draw=()=>{hits=jumpList(input.value,box,act)};
  input.addEventListener('input',()=>{act=0;draw()});
  input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();act=(act+(e.key==='ArrowDown'?1:-1)+hits.length)%Math.max(1,hits.length);draw()}
    else if(e.key==='Enter'){e.preventDefault();const x=hits[act];if(x){done();PL.go(x.h)}}});
  box.addEventListener('click',e=>{if(e.target.closest('a'))done()});draw()}
const isPhone=()=>matchMedia('(max-width:899px)').matches;
function openJump(){if(isPhone()){const s=PL.sheet.open({title:'Jump to',body:`<input type="search" class="input" placeholder="Agent, task, schedule or page" aria-label="Jump to" autocomplete="off" autofocus><div class="jump-list static" role="listbox"></div>`});
    jumpBind(s.body.querySelector('input'),s.body.querySelector('.jump-list'),()=>s.close());return}
  const q=$('#jumpq');q.focus();q.select()}
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openJump()}});

// ---- The frame: tabs along the top, a tab bar at the bottom of a phone, the More sheet ----------------------------
function buildFrame(){
  $('#tabs').innerHTML=TABS.map(n=>`<a class="tab" href="#${n}" data-tab="${n}">${TITLES[n]}<span class="count${n==='inbox'?' hot':''}" data-count="${n}"></span></a>`).join('');
  $('#tabbar').innerHTML=TABS.slice(0,4).map(n=>`<a href="#${n}" data-tab="${n}"><i>${PL.icon(n,22)}<span class="count${n==='inbox'?' hot':''}" data-count="${n}"></span></i>${TITLES[n]}</a>`).join('')
    +`<button type="button" data-tab="more" data-more><i>${PL.icon('more',22)}</i>More</button>`;
  $('#setupbtn').innerHTML=PL.icon('setup',20)+'<span class="count dot" data-count="setup"></span>';
  $('#jumpbtn').innerHTML=PL.icon('search',20);
  $('#nopage').innerHTML=PL.empty({icon:'alert',title:'No such page',text:'That link names a page this version doesn’t have.',action:{label:'Go to the Inbox',href:'#inbox'}});
  const q=$('#jumpq'),box=$('#jumplist');
  const close=()=>{box.hidden=true;q.value='';q.blur()};
  q.addEventListener('focus',()=>{box.hidden=false;jumpList(q.value,box,0)});
  q.addEventListener('blur',()=>setTimeout(()=>{if(!box.contains(document.activeElement))box.hidden=true},150));
  q.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close()}});
  jumpBind(q,box,close);box.hidden=true;
  $('#jumpbtn').addEventListener('click',openJump);
  document.addEventListener('click',e=>{if(!e.target.closest('[data-more]'))return;const st=PL.state;
    const sc=n=>{try{return PL.pages[n]?.count?.(st)||''}catch{return ''}};
    const s=PL.sheet.open({title:'More',body:PL.group(PL.row({href:'#schedules',icon:'schedules',title:'Schedules',value:esc(sc('schedules'))})+PL.row({href:'#setup',icon:'setup',title:'Setup',value:esc(sc('setup'))}))
      +((PL.pages.setup?.sections||[]).length?PL.label('Setup')+PL.group((PL.pages.setup.sections).map(([k,t])=>PL.row({href:'#setup/'+k,icon:PL.pages.setup.icons?.[k]||'setup',title:esc(t)})).join('')):'')});
    s.body.addEventListener('click',e=>{if(e.target.closest('a'))s.close()})})}

// ---- Polling, the stream, being offline -------------------------------------------------------------------------
// Poll every 2 s; while the daemon is unreachable say so, back off to 10 s, and pick up again once it's back.
let misses=0;
// The daemon answered, but with an error: say what it said, since "can't reach" would send you looking in the wrong place.
function offline(e){const m=String(e?.message||'');
  $('#offwhy').textContent=m.startsWith('!')?`The peerlink daemon is running but couldn't build this page: ${m.slice(1)}. The reason is also in daemon.log, in peerlink's folder.`
    :e instanceof TypeError&&!/fetch|network|load/i.test(m)?`This page hit an error drawing itself: ${m}. Reload it; if it stays, report it.`
    :"Can't reach the peerlink daemon. This page reconnects once it's back.";
  $('#offline').hidden=false}
function connect(){if(!window.EventSource||signedOut)return;live?.close();live=new EventSource('/api/stream');
  live.onopen=()=>{streamOk=true};
  live.onmessage=e=>{const d=JSON.parse(e.data);
    if(misses){misses=0;$('#offline').hidden=true;loadCfg().catch(()=>{})}
    refresh(false,d).catch(()=>{})};
  // The browser retries the stream by itself; until it's back, tick() polls.
  live.onerror=()=>{streamOk=false}}
// With the stream up, tick only redraws now and then, so "idle 12m" stays true; without it, it polls.
async function tick(){
  try{if(streamOk&&lastSnap)await refresh(true,lastSnap);else{await refresh();if(misses){misses=0;$('#offline').hidden=true;await loadCfg();await refresh(true)}}}
  catch(e){if(!signedOut){misses++;offline(e)}}
  if(signedOut){live?.close();return}
  setTimeout(tick,streamOk?30000:misses?10000:2000)}

// Every page's script has loaded by DOMContentLoaded: start then.
document.addEventListener('DOMContentLoaded',()=>{buildFrame();route();
  loadCfg().then(()=>refresh(true)).catch(e=>{misses=1;offline(e)}).finally(()=>{connect();setTimeout(tick,2000)})});
