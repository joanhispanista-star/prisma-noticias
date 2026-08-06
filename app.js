
/* ============================================================
   PRISMA · Noticias del mundo — motor de una sola página
   Todo en el dispositivo. Sin backend propio.
   ============================================================ */
"use strict";

/* ---------- utilidades cortas ---------- */
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const el = (t,c,h)=>{const e=document.createElement(t); if(c)e.className=c; if(h!=null)e.innerHTML=h; return e;};
const enc = encodeURIComponent;
function esc(s){return (s==null?'':String(s)).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
function stripHtml(s){const d=document.createElement('div'); d.innerHTML=s||''; return (d.textContent||'').replace(/\s+/g,' ').trim();}
function toast(m){const t=$('#toast'); t.textContent=m; t.classList.add('on'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('on'),2600);}
function shareArticle(title,url){
  if(!url) return;
  if(navigator.share){ navigator.share({title:title||'Prisma · Noticias',text:title,url}).catch(()=>{}); }
  else if(navigator.clipboard){ navigator.clipboard.writeText(url).then(()=>toast('Enlace copiado')).catch(()=>toast('No se pudo copiar')); }
  else toast(url);
}
function timeAgo(d){ if(!d) return ''; const s=(Date.now()-d)/1000; if(s<60)return 'ahora'; if(s<3600)return Math.floor(s/60)+' min'; if(s<86400)return Math.floor(s/3600)+' h'; const dd=Math.floor(s/86400); if(dd<7)return dd+' d'; return new Date(d).toLocaleDateString('es-CO',{day:'numeric',month:'short'}); }

/* ---------- almacenamiento ---------- */
const SK='noticias_v1', KK='noticias_api_key';
const defaults={ lang:'es', auto:false, proxy:'auto', worker:'', cat:'todas', reg:'todas', bias:'all', off:[], saved:[], follows:[], lastVisit:0, reports:[], lugares:[] };
let ST = load();
function load(){ try{ return Object.assign({}, defaults, JSON.parse(localStorage.getItem(SK)||'{}')); }catch(e){ return {...defaults}; } }
function save(){ try{ localStorage.setItem(SK, JSON.stringify(ST)); }catch(e){} }
function getKey(){ try{ return localStorage.getItem(KK)||''; }catch(e){ return ''; } }
function setKey(k){ try{ k? localStorage.setItem(KK,k): localStorage.removeItem(KK); }catch(e){} }

/* ============================================================
   CATÁLOGO DE MEDIOS  (semilla; el workflow lo amplía/corrige)
   sesgo_num: -3 izquierda … 0 centro … +3 derecha
   sesgo: izq | ci | centro | cd | der | estatal
   ============================================================ */
let CATALOGO = []; /* se carga desde catalogo.json en boot() */

let byId = {}, DOMAIN_IDX = {};
/* dominio → id de medio (para reconocer el sesgo en resultados externos de GDELT) */
function buildIndexes(){
  byId = {}; CATALOGO.forEach(o=>byId[o.id]=o);
  DOMAIN_IDX = {};
  CATALOGO.forEach(o=>{ try{ DOMAIN_IDX[new URL(o.sitio).hostname.replace(/^www\./,'')]=o.id; }catch(e){} });
}

/* clase css de sesgo a partir del número/etiqueta */
function biasClass(o){
  if(o.sesgo==='estatal') return 'estatal';
  const n=o.sesgo_num;
  if(n<=-1.5) return 'izq'; if(n<=-0.5) return 'ci'; if(n<0.5) return 'centro'; if(n<1.5) return 'cd'; return 'der';
}
function biasWord(o){
  if(o.sesgo==='estatal') return 'Estatal';
  const c=biasClass(o);
  return {izq:'Izquierda',ci:'Centro-izq',centro:'Centro',cd:'Centro-der',der:'Derecha'}[c];
}
function biasBadge(o){
  const c=biasClass(o);
  const t=o.sesgo==='estatal'? ('Medio estatal · '+o.pais) : ('Sesgo: '+biasWord(o)+' · fuente: '+(o.fuente||'—'));
  return `<span class="bbadge ${c}" title="${esc(t)}"><span class="dt"></span>${biasWord(o)}</span>`;
}

/* ============================================================
   COORDENADAS para el mapa (lat,lng)
   ============================================================ */
const COORD_PAIS={
  'EE.UU.':[38,-97],'Reino Unido':[54,-2],'España':[40,-3.7],'Colombia':[4.6,-74.1],'Argentina':[-34.6,-58.4],
  'México':[19.4,-99.1],'Francia':[46.6,2.3],'Alemania':[51.2,10.4],'Rusia':[55.7,37.6],'China':[39.9,116.4],
  'Catar':[25.3,51.5],'Turquía':[39.9,32.8],'India':[28.6,77.2],'Japón':[35.7,139.7],
  'Israel':[31.5,34.9],'Australia':[-25,134],'Singapur':[1.35,103.8],'Congo (Rep.)':[-4.26,15.24],
  'Perú':[-9.2,-75],'Chile':[-33.4,-70.7],
  // regiones (respaldo cuando no hay ciudad ni país exacto)
  'Europa':[50.1,9.1],'Latinoamérica':[-15,-60],'Medio Oriente':[31,35.5],'Asia':[34,100],
  'Oceanía':[-25,134],'África':[2,20],'Global':[20,0]
};
/* ciudades para dar el toque "por ciudades" */
const CIUDADES={
  'washington':[38.9,-77],'new york':[40.7,-74],'nueva york':[40.7,-74],'los angeles':[34,-118.2],'london':[51.5,-0.12],
  'londres':[51.5,-0.12],'paris':[48.85,2.35],'parís':[48.85,2.35],'berlin':[52.5,13.4],'berlín':[52.5,13.4],
  'madrid':[40.4,-3.7],'barcelona':[41.4,2.17],'moscow':[55.75,37.6],'moscú':[55.75,37.6],'kyiv':[50.45,30.5],
  'kiev':[50.45,30.5],'gaza':[31.5,34.45],'tel aviv':[32.08,34.78],'jerusalem':[31.78,35.22],'jerusalén':[31.78,35.22],
  'beijing':[39.9,116.4],'pekín':[39.9,116.4],'tokyo':[35.68,139.7],'tokio':[35.68,139.7],'delhi':[28.6,77.2],
  'bogota':[4.6,-74.08],'bogotá':[4.6,-74.08],'medellin':[6.25,-75.56],'medellín':[6.25,-75.56],'cali':[3.45,-76.53],
  'buenos aires':[-34.6,-58.4],'ciudad de méxico':[19.4,-99.1],'mexico city':[19.4,-99.1],'caracas':[10.5,-66.9],
  'lima':[-12.05,-77.04],'santiago':[-33.45,-70.66],'brasilia':[-15.8,-47.9],'são paulo':[-23.55,-46.63],
  'doha':[25.3,51.5],'dubai':[25.2,55.27],'estambul':[41,28.98],'istanbul':[41,28.98],'roma':[41.9,12.5],'rome':[41.9,12.5],
  'bruselas':[50.85,4.35],'brussels':[50.85,4.35],'ginebra':[46.2,6.14],'seúl':[37.57,126.98],'seoul':[37.57,126.98]
};

/* ============================================================
   PROXY / lectura de feeds
   ============================================================ */
/* Puentes públicos, verificados uno por uno el 6-ago-2026 DESDE GitHub Pages
   (que es lo único que cuenta: cada puente decide según el origen que le llama):
     corsproxy  → responde ~78% de los 221 medios, y rápido. El mejor hoy.
     allorigins → saturado: casi siempre tarda o corta, pero es el ÚNICO que
                  sirve Google News (a corsproxy, Google le devuelve 503).
     codetabs   → muerto.
     corseu     → muerto.
   Por eso ninguno va solo: se corre una carrera y gana el que conteste. */
/* EL PUENTE DE PRISMA — la única línea que hay que rellenar para que la Portada
   traiga los 221 medios a CUALQUIER lector, sin que él configure nada.
   Se monta gratis en 10 minutos siguiendo DESPLEGAR-PUENTE.txt y se pega aquí:
     const PUENTE_OFICIAL='https://prisma-puente.TU-USUARIO.workers.dev';
   Vacío, la app funciona igual pero solo con las fuentes que se dejan leer en
   directo (unas 25 de 221): los puentes públicos gratuitos están saturados. */
const PUENTE_OFICIAL='';
const puente=()=>(((ST.worker&&ST.worker.trim())||PUENTE_OFICIAL)||'').replace(/\/+$/,'');
const PROXIES={
  worker:     u=>puente()+'/?url='+enc(u),
  corsproxy:  u=>'https://corsproxy.io/?url='+enc(u),
  allorigins: u=>'https://api.allorigins.win/raw?url='+enc(u),
  codetabs:   u=>'https://api.codetabs.com/v1/proxy/?quest='+enc(u),
  corseu:     u=>'https://cors.eu.org/'+u,
  direct:     u=>u
};
const hasWorker=()=>!!puente();
/* la fiabilidad de cada proxy cambia por día; al arrancar sondeamos y usamos el que responda.
   Si el usuario configuró su PUENTE PROPIO (Cloudflare Worker), ese manda siempre. */
let PROXY_WINNER=null, PROXY_WINNERS=[], probeDone=null;
function hashId(s){ let h=0; s=String(s); for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return h; }
function proxyChain(id){
  const p=ST.proxy, base=['corsproxy','allorigins','codetabs','corseu','direct'];
  const lead=hasWorker()?['worker']:[];
  if(p==='direct') return [...new Set([...lead,'direct','corseu','allorigins'])];
  if(p&&p!=='auto'&&PROXIES[p]) return [...new Set([...lead,p,...base.filter(x=>x!==p)])];
  // reparte el proxy líder entre los ganadores sanos (evita el "efecto rebaño" de un solo proxy)
  const W=PROXY_WINNERS.filter(n=>n!=='worker');
  let leadProxies;
  if(W.length>1 && id!=null){ const rot=hashId(id)%W.length; leadProxies=[W[rot],...W.filter((_,i)=>i!==rot)]; }
  else if(W.length){ leadProxies=W; }
  else { leadProxies=PROXY_WINNER?[PROXY_WINNER]:[]; }
  const rest=[...leadProxies,...base.filter(x=>!leadProxies.includes(x))];
  return [...new Set([...lead,...rest])];
}
async function probeProxy(){
  if(ST.proxy && ST.proxy!=='auto') return;   // proxy fijado por el usuario
  if(probeDone) return probeDone;
  probeDone=(async()=>{
    const test='https://feeds.bbci.co.uk/news/world/rss.xml';
    const cands=hasWorker()?['worker','corsproxy','allorigins','codetabs']:['corsproxy','allorigins','codetabs'];
    const winners=[];
    await Promise.all(cands.map(name=>(async()=>{
      try{ const c=new AbortController(); const to=setTimeout(()=>c.abort(),5500);
        const r=await fetch(PROXIES[name](test),{signal:c.signal}); clearTimeout(to);
        if(!r.ok) return; const t=await r.text();
        if(/<rss|<feed|<channel/i.test(t.slice(0,400))){ winners.push(name); if(!PROXY_WINNER) PROXY_WINNER=name; } // el 1º que valide se aplica en caliente
      }catch(e){}
    })()));
    PROXY_WINNERS=winners;
    if(!PROXY_WINNER && winners.length) PROXY_WINNER=winners[0];
  })();
  return probeDone;
}
/* ---------- memoria de vía por medio ----------
   Muchas fuentes (El País, NYT, Fox, DW, RTVE…) entregan su RSS con permiso CORS:
   se pueden leer EN DIRECTO, sin puente, más rápido y sin gastar el cupo de nadie.
   Apuntamos por qué vía respondió cada medio para ir por ahí primero la próxima vez. */
const VK='nvia_v1', VIA_TTL=7*24*3600*1000;
let VIA=(()=>{ try{ const o=JSON.parse(localStorage.getItem(VK)||'{}'), n={}, now=Date.now();
    for(const k in o){ if(o[k]&&o[k].n&&now-o[k].t<VIA_TTL) n[k]=o[k]; } return n; }catch(e){ return {}; } })();
let viaDirty=false, viaTimer=null;
/* se guarda poco después de aprender algo: la portada tarda en terminar y el
   lector puede irse antes; lo aprendido no se puede perder por eso. */
function viaSet(id,name){ const c=VIA[id]; if(!c||c.n!==name){ VIA[id]={n:name,t:Date.now()}; viaDirty=true; clearTimeout(viaTimer); viaTimer=setTimeout(viaSave,1500); } }
function viaSave(){ if(!viaDirty) return; viaDirty=false; try{ localStorage.setItem(VK,JSON.stringify(VIA)); }catch(e){} }
/* orden de vías para UN medio: su puente propio manda; luego la vía que ya le funcionó;
   y si aún no sabemos nada de él, 'directo' entra en la carrera (si la fuente no lo permite
   falla en milisegundos, así que probarlo no cuesta tiempo). */
function outletChain(id){
  const base=proxyChain(id), lead=hasWorker()?['worker']:[];
  const k=VIA[id]&&VIA[id].n;
  const usable=k && (k==='direct' || (PROXIES[k] && (k!=='worker'||hasWorker())));
  return [...new Set([...lead, usable?k:'direct', ...base])];
}
/* Carrera EN PARALELO de todas las vías: gana la primera que traiga algo con cuerpo.
   Antes iba en fila y cada una podía comerse 8 s: con dos puentes muertos delante,
   un solo canal de YouTube tardaba medio minuto (la pestaña Video, 51 s en total). */
async function fetchText(url,{timeout=8000}={}){
  const names=proxyChain();
  try{
    return await Promise.any(names.map(async name=>{
      const ctrl=new AbortController(); const to=setTimeout(()=>ctrl.abort(),timeout);
      try{
        const r=await fetch(PROXIES[name](url),{signal:ctrl.signal,headers:{'Accept':'text/xml,application/xml,application/rss+xml,text/html,*/*'}});
        if(!r.ok) throw 0;
        const t=await r.text();
        if(!t||t.length<=60) throw 0;
        return t;
      } finally{ clearTimeout(to); }
    }));
  }catch(e){ throw new Error('sin puente'); }
}
/* carrera de proxies en paralelo: gana el primero que responda (para GDELT / búsquedas puntuales) */
async function fetchViaAny(url,timeout=8000){
  const names=proxyChain().filter(n=>n!=='direct');
  return await Promise.any(names.map(async name=>{
    const c=new AbortController(); const to=setTimeout(()=>c.abort(),timeout);
    try{ const r=await fetch(PROXIES[name](url),{signal:c.signal}); const t=await r.text(); clearTimeout(to);
      if(r.ok&&t&&t.length>40) return t; throw new Error('bad'); }
    catch(e){ clearTimeout(to); throw e; }
  }));
}

/* ---------- parseo RSS/Atom ---------- */
function tag(node,name){ const e=node.getElementsByTagName(name); return e&&e[0]?e[0]:null; }
function tagText(node,name){ const e=tag(node,name); return e? (e.textContent||'').trim():''; }
function pickImg(node,desc){
  // media:content / media:thumbnail
  const mc=node.getElementsByTagName('media:content');
  for(const m of mc){ const u=m.getAttribute('url'); const ty=m.getAttribute('type')||''; const me=m.getAttribute('medium')||''; if(u&&(me==='image'||/image/.test(ty)||/\.(jpg|jpeg|png|webp)/i.test(u))) return u; }
  const mt=node.getElementsByTagName('media:thumbnail'); if(mt[0]&&mt[0].getAttribute('url')) return mt[0].getAttribute('url');
  const en=node.getElementsByTagName('enclosure'); for(const e of en){ const ty=e.getAttribute('type')||''; if(/image/.test(ty)&&e.getAttribute('url')) return e.getAttribute('url'); }
  const it=node.getElementsByTagName('itunes:image'); if(it[0]&&it[0].getAttribute('href')) return it[0].getAttribute('href');
  const m=(desc||'').match(/<img[^>]+src=["']([^"']+)["']/i); if(m) return m[1];
  return '';
}
function parseFeed(xml, outlet){
  let doc; try{ doc=new DOMParser().parseFromString(xml,'text/xml'); }catch(e){ return []; }
  if(!doc||doc.getElementsByTagName('parsererror').length) {
    try{ doc=new DOMParser().parseFromString(xml,'text/html'); }catch(e){ return []; }
  }
  let nodes=[...doc.getElementsByTagName('item')];
  if(!nodes.length) nodes=[...doc.getElementsByTagName('entry')];
  const out=[];
  for(const n of nodes){
    const title=stripHtml(tagText(n,'title')); if(!title) continue;
    let link=tagText(n,'link');
    if(!link){ const ls=n.getElementsByTagName('link'); for(const l of ls){ const rel=l.getAttribute('rel'); if(!rel||rel==='alternate'){ link=l.getAttribute('href')||''; if(link)break; } } }
    let descRaw=tagText(n,'description')||tagText(n,'summary')||tagText(n,'content:encoded')||tagText(n,'content');
    const desc=stripHtml(descRaw).slice(0,320);
    const dateS=tagText(n,'pubDate')||tagText(n,'published')||tagText(n,'updated')||tagText(n,'dc:date');
    let ts=dateS? Date.parse(dateS): 0; if(isNaN(ts)) ts=0;
    // Google News añade " - Medio" al final del titular: lo quitamos
    let ftitle=title;
    if(link && link.indexOf('news.google.')>-1) ftitle=title.replace(/\s+[-–|]\s+[^-–|]{2,45}$/,'').trim()||title;
    // categorías/etiquetas propias del feed (señal fuerte para clasificar)
    const cats=[...n.getElementsByTagName('category')].map(c=>((c.getAttribute&&c.getAttribute('term'))||c.textContent||'').trim().toLowerCase()).filter(Boolean).slice(0,6);
    const secc=(link.match(/\/(mundo|internacional|world|politic[ao]|economi[ao]|business|money|tecnolog[ií]a|technology|tech|ciencia|science|salud|health|deporte|sport|cultura|culture|entertainment|espectaculos|farandula|gente|opinion)\b/i)||[])[1];
    if(secc) cats.push(secc.toLowerCase());
    const img=pickImg(n,descRaw);
    out.push({title:ftitle,link,desc,ts,img,outlet:outlet.id,cats});
  }
  return out;
}

/* ---------- caché por medio ---------- */
/* un proxy con timeout → items parseados (o null) */
async function tryProxy(url,name,outlet,timeout){
  const ctrl=new AbortController(); const to=setTimeout(()=>ctrl.abort(),timeout);
  try{
    const r=await fetch(PROXIES[name](url),{signal:ctrl.signal});
    if(!r.ok) return null;
    const t=await r.text(); if(!t||t.length<60) return null;
    const items=parseFeed(t,outlet); return items.length?items:null;
  }catch(e){ return null; }
  finally{ clearTimeout(to); }
}
/* carrera en paralelo: gana la 1ª vía que devuelva items; si ninguna, null.
   Devuelve también CUÁL ganó, para recordarla. */
async function raceProxies(url,names,outlet,timeout){
  if(!names.length) return null;
  try{
    return await Promise.any(names.map(async name=>{
      const it=await tryProxy(url,name,outlet,timeout);
      if(it&&it.length) return {items:it,via:name};
      throw 0;
    }));
  }catch(e){ return null; }
}
/* fetch JSON con timeout (los fallbacks antes NO lo tenían → colas de minutos) */
async function fetchJsonT(url,timeout){
  const ctrl=new AbortController(); const to=setTimeout(()=>ctrl.abort(),timeout);
  try{ const r=await fetch(url,{signal:ctrl.signal}); return await r.json(); }
  finally{ clearTimeout(to); }
}
/* cascada por feed con PRESUPUESTO total por medio: carrera de proxies → allorigins/get → rss2json */
async function fetchOutletItems(outlet){
  const started=Date.now(), BUDGET=9000;
  const timeLeft=()=>BUDGET-(Date.now()-started);
  for(const url of (outlet.rss||[])){
    if(timeLeft()<1200) break;                       // sin presupuesto: no arranques otra dirección
    const chain=outletChain(outlet.id), sabido=VIA[outlet.id]&&VIA[outlet.id].n;
    // 1) si aún no sabemos por dónde entra este medio, 'directo' va SOLO y primero:
    //    no gasta cupo de ningún puente (corsproxy corta con 429 al rato) y, si la
    //    fuente no lo permite, falla en milisegundos. Solo se paga la primera visita.
    if(!sabido||sabido==='direct'){
      const it=await tryProxy(url,'direct',outlet,Math.min(2500,timeLeft()));
      if(it&&it.length){ viaSet(outlet.id,'direct'); return it; }
    }
    const puentes=chain.filter(n=>n!=='direct');
    // 2) carrera EN PARALELO de los 3 puentes líderes (antes era en fila, 4×7s)
    const won=await raceProxies(url,puentes.slice(0,3),outlet,Math.min(6000,timeLeft()));
    if(won){ viaSet(outlet.id,won.via); return won.items; }
    // 2b) resto de puentes, en serie pero con presupuesto
    for(const name of puentes.slice(3)){
      if(timeLeft()<1200) break;
      const items=await tryProxy(url,name,outlet,Math.min(5000,timeLeft()));
      if(items&&items.length){ viaSet(outlet.id,name); return items; }
    }
    // 2) AllOrigins /get (ahora CON timeout): el XML viene dentro de JSON.contents
    if(timeLeft()>1200){
      try{ const j=await fetchJsonT('https://api.allorigins.win/get?url='+enc(url),Math.min(5000,timeLeft()));
        if(j&&j.contents){ const it=parseFeed(j.contents,outlet); if(it.length) return it; } }catch(e){}
    }
    // 3) rss2json (ahora CON timeout): JSON ya limpio, último recurso
    if(timeLeft()>1200){
      try{ const j=await fetchJsonT('https://api.rss2json.com/v1/api.json?rss_url='+enc(url),Math.min(5000,timeLeft()));
        if(j&&j.status==='ok'&&Array.isArray(j.items)){
          const it=j.items.map(x=>({title:stripHtml(x.title),link:x.link,
            desc:stripHtml(x.description||x.content||'').slice(0,320),
            ts:Date.parse(x.pubDate)||0, img:x.thumbnail||(x.enclosure&&x.enclosure.link)||'', outlet:outlet.id})).filter(a=>a.title);
          if(it.length) return it; } }catch(e){}
    }
  }
  return [];
}
const memCache={};
async function loadOutlet(outlet){
  const ttl=10*60*1000, ck='nfeed_'+outlet.id;
  if(memCache[ck]&&Date.now()-memCache[ck].t<ttl) return memCache[ck].items;
  try{ const raw=JSON.parse(localStorage.getItem(ck)||'null'); if(raw&&Date.now()-raw.t<ttl){ memCache[ck]=raw; return raw.items; } }catch(e){}
  if(!outlet.rss||!outlet.rss.length) return [];
  let items=await fetchOutletItems(outlet);
  // sin resultado → sirve la última copia buena (modo offline / proxies caídos)
  if(!items.length){ try{ const raw=JSON.parse(localStorage.getItem(ck)||'null'); if(raw&&raw.items&&raw.items.length) return raw.items; }catch(e){} }
  const rec={t:Date.now(),items};
  memCache[ck]=rec; try{ localStorage.setItem(ck,JSON.stringify(rec)); }catch(e){}
  return items;
}
async function mapLimit(items,limit,fn){
  const ret=new Array(items.length); let i=0;
  const workers=Array.from({length:Math.min(limit,items.length||1)},async()=>{
    while(i<items.length){ const idx=i++; try{ ret[idx]=await fn(items[idx],idx); }catch(e){ ret[idx]=null; } }
  });
  await Promise.all(workers); return ret;
}

/* ---------- traducción ---------- */
async function translate(text,target){
  target=target||ST.lang||'es'; if(!text) return text;
  const key=getKey();
  // 1) Anthropic (mejor calidad)
  if(key){
    try{
      const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:500,messages:[{role:'user',content:`Traduce al ${target==='es'?'español':target} de forma natural y neutral, sin añadir nada. Devuelve SOLO la traducción:\n\n${text}`}]})});
      const j=await r.json(); const t=j&&j.content&&j.content[0]&&j.content[0].text; if(t) return t.trim();
    }catch(e){}
  }
  // 2) Google (endpoint gtx): directo (manda CORS *) y si falla, vía proxy
  try{
    const u='https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl='+target+'&dt=t&q='+enc(text);
    let raw='';
    try{ const r=await fetch(u); if(r.ok) raw=await r.text(); }catch(e){}
    if(!raw){ try{ raw=await fetchText(u,{timeout:9000}); }catch(e){} }
    if(raw){ const data=JSON.parse(raw); if(data&&data[0]) return data[0].map(s=>s[0]).join(''); }
  }catch(e){}
  // 3) MyMemory (respaldo oficial; asume origen inglés si no se detecta)
  try{
    const r=await fetch('https://api.mymemory.translated.net/get?q='+enc(text.slice(0,480))+'&langpair=en|'+target);
    const j=await r.json(); const t=j&&j.responseData&&j.responseData.translatedText; if(t&&!/MYMEMORY WARNING/i.test(t)) return t;
  }catch(e){}
  return text;
}

/* ============================================================
   ESTADO DE LA PORTADA
   ============================================================ */
let FEED=[], shown=0, PAGE=18, loading=false, feedToken=0;
function activeOutlets(){
  const list=CATALOGO.filter(o=>!ST.off.includes(o.id))
    .filter(o=> ST.reg==='todas' || o.region===ST.reg || (ST.reg==='Latinoamérica'&&o.region==='Colombia'))
    .filter(o=> ST.bias==='all' || biasClass(o)===ST.bias);
  // vista amplia (todas + todos los sesgos): muestrea con diversidad por región para no saturar (todos siguen accesibles al filtrar)
  if(ST.reg==='todas' && ST.bias==='all' && list.length>100){
    const rank={alta:0,media:1,mixta:2,baja:3}, byReg={};
    list.forEach(o=>{ (byReg[o.region]=byReg[o.region]||[]).push(o); });
    Object.values(byReg).forEach(a=>a.sort((x,y)=>(rank[x.cred]||2)-(rank[y.cred]||2)));
    const regs=Object.keys(byReg), out=[]; let i=0, guard=0;
    while(out.length<100 && guard++<2000){ const r=regs[i%regs.length]; i++; if(byReg[r] && byReg[r].length) out.push(byReg[r].shift()); if(regs.every(r=>!byReg[r].length)) break; }
    return out;
  }
  return list;
}
async function buildFeed(){
  const myToken=++feedToken; loading=true;
  const feed=$('#feed'); feed.innerHTML='';
  for(let i=0;i<8;i++){ feed.appendChild(el('div','sk','<div class="a"></div><div class="b"><div class="l"></div><div class="l s"></div></div>')); }
  updateNet();
  const outs=activeOutlets();
  if(!outs.length){ feed.innerHTML=''; feed.appendChild(el('div','empty','<div class="ic">🗂️</div><p>No hay fuentes activas con esos filtros. Cambia el sesgo o la región, o enciende medios en Ajustes.</p>')); loading=false; return; }
  FEED=[]; shown=0;
  const seen=new Set();
  let firstPaint=false, pending=false, lastPaint=0;
  const repaint=()=>{ if(myToken!==feedToken) return; FEED.sort((a,b)=>b.ts-a.ts); applyFeedFilters(); renderTicker(); if($('#v-mundo').classList.contains('on')) plotMap(); };
  const schedulePaint=()=>{
    if(myToken!==feedToken) return; const now=Date.now();
    if(!firstPaint){ firstPaint=true; lastPaint=now; repaint(); return; }
    if(now-lastPaint>700){ lastPaint=now; repaint(); }
    else if(!pending){ pending=true; setTimeout(()=>{ pending=false; lastPaint=Date.now(); repaint(); },700); }
  };
  probeProxy();   // ya NO bloqueamos hasta 5,5s: arranque breve y PROXY_WINNER se aplica en caliente
  if(probeDone) await Promise.race([probeDone, new Promise(r=>setTimeout(r,1500))]);
  if(myToken!==feedToken) return;   // el usuario cambió de filtro/pestaña: abandona
  await mapLimit(outs,8,async(o)=>{
    const items=await loadOutlet(o);
    if(myToken!==feedToken) return;
    let added=false;
    for(const a of items){ const k=a.title.toLowerCase().slice(0,70); if(k&&!seen.has(k)){ seen.add(k); FEED.push(a); added=true; } }
    if(added) schedulePaint();
  });
  viaSave();                        // apunta por qué vía respondió cada medio, para la próxima vez
  if(myToken!==feedToken) return;
  loading=false;
  if(!FEED.length){ feed.innerHTML=''; feed.appendChild(el('div','empty','<div class="ic">📭</div><p>No pudimos cargar noticias ahora. Revisa tu conexión, toca “Actualizar” o cambia el “puente” en Ajustes › Conexión.</p>')); $('#loadmore').style.display='none'; return; }
  repaint();
}
function matchesFilters(a){
  const o=byId[a.outlet]; if(!o) return false;
  if(ST.cat!=='todas' && catOf(a,o)!==ST.cat) return false;
  const q=($('#q').value||'').trim().toLowerCase();
  if(q && !(a.title.toLowerCase().includes(q)||(a.desc||'').toLowerCase().includes(q)||o.nombre.toLowerCase().includes(q))) return false;
  return true;
}
/* clasificación de categoría: 1) etiquetas del propio feed, 2) puntuación por palabras (ES+EN, con límites de palabra) */
const CAT_RULES=[
  {key:'deportes', res:[
    /\b(f[uú]tbol|balompi[eé]|goleador|gol(es)?|futbolista|fichaje|mundial de f[uú]tbol|copa (am[eé]rica|libertadores|del rey|mundial)|champions|premier league|la liga|nba|nfl|mlb|tenis|wimbledon|roland garros|f[oó]rmula 1|\bf1\b|motogp|ciclismo|marat[oó]n|ol[ií]mpic|olimpiad|selecci[oó]n nacional|delantero|arquer[oa]|penal(ti)?|hat-?trick|messi|cristiano ronaldo|mbapp[eé]|nadal|alcaraz|vinicius|clasificatori)\b/gi,
    /\b(soccer|football match|playoffs?|touchdown|quarterback|striker|goalkeeper|world cup|super bowl|grand slam|formula one|athletics|gold medal|\bnba\b|\bnfl\b|premier league)\b/gi]},
  {key:'cultura', res:[
    /\b(m[uú]sica|canci[oó]n|cantante|[aá]lbum|concierto|gira musical|artista|far[aá]ndula|celebridad|famos[oa]s?|actor|actriz|pel[ií]cula|estreno|serie de tv|netflix|premios?|grammy|[oó]scars?|libro|novela|museo|regget[oó]n|reggaet[oó]n|k-?pop|shakira|bad bunny|beyonc[eé]|taylor swift|karol g|carnaval|telenovela|videoclip)\b/gi,
    /\b(music|\bsong\b|singer|\balbum\b|concert|\bmovie\b|\bfilm\b|tv series|celebrity|actress|awards? show|grammy|oscars?|\bnovel\b|museum|hollywood|box office|red carpet)\b/gi]},
  {key:'ciencia', res:[
    /\b(ciencia|cient[ií]fic[oa]s?|investigaci[oó]n|\bsalud\b|m[eé]dic[oa]s?|medicina|enfermedad|virus|vacuna|clim[aá]tic|calentamiento global|\bnasa\b|astronom[ií]a|cohete espacial|energ[ií]a renovable|especie|f[oó]sil|gen[eé]tic|\badn\b|c[aá]ncer|neurona)\b/gi,
    /\b(scientists?|research(ers)?|\bstudy\b|\bhealth\b|medical|medicine|disease|\bvirus\b|vaccine|climate|\bnasa\b|astronomy|\brocket\b|renewable|\bspecies\b|\bfossil\b|genetic|\bdna\b|\bcancer\b)\b/gi]},
  {key:'tecnologia', res:[
    /\b(tecnolog[ií]a|inteligencia artificial|\bia\b|smartphone|iphone|android|software|hardware|aplicaci[oó]n m[oó]vil|videojuego|\bgamer\b|robot|rob[oó]tica|\bchip\b|semiconductor|startup|cripto(moneda)?|bitcoin|ethereum|blockchain|ciberseguridad|\bhacker\b|algoritmo|\b5g\b|realidad virtual|metaverso)\b/gi,
    /\b(technology|artificial intelligence|\bai\b|smartphone|iphone|android|\bsoftware\b|videogame|\bgaming\b|\brobot\b|robotics|\bchip\b|semiconductor|startup|\bcrypto\b|bitcoin|blockchain|cybersecurity|\bhacker\b|algorithm|\b5g\b|virtual reality|metaverse|openai|nvidia|chatgpt)\b/gi]},
  {key:'economia', res:[
    /\b(econom[ií]a|inflaci[oó]n|\bd[oó]lar\b|\beuro\b|mercado financiero|\bbolsa\b|acciones|\bbanco\b|banca|tasas? de inter[eé]s|\bpib\b|desempleo|\bsalario\b|impuesto|aranceles?|exportaci[oó]n|importaci[oó]n|\bdeuda\b|recesi[oó]n|petr[oó]leo|inversi[oó]n|d[eé]ficit)\b/gi,
    /\b(economy|inflation|\bdollar\b|stock market|\bstocks?\b|\bshares?\b|central bank|interest rates?|\bgdp\b|unemployment|\bwages?\b|\btariffs?\b|\bexports?\b|\bimports?\b|\bdebt\b|recession|oil price|\bdeficit\b|earnings)\b/gi]},
  {key:'politica', res:[
    /\b(gobierno|president[ae]|elecci[oó]n(es)?|electoral|campa[ñn]a electoral|congreso|senado|parlamento|ministr[oa]|partido pol[ií]tico|oposici[oó]n|\bpetro\b|\btrump\b|reforma|constituci[oó]n|referendo|gobernador|diplomacia|\bonu\b|\botan\b)\b/gi,
    /\b(government|president|elections?|campaign|congress|senate|parliament|minister|political party|opposition|\breform\b|constitution|referendum|governor|diplomacy|white house|\bnato\b)\b/gi]},
  {key:'mundo', res:[
    /\b(guerra|conflicto armado|ataque|bombardeo|ej[eé]rcito|militar|frontera|refugiados?|protesta|manifestaci[oó]n|terremoto|hurac[aá]n|inundaci[oó]n|desastre|ucrania|\brusia\b|\bgaza\b|israel|palestina|migra(ci[oó]n|ntes))\b/gi,
    /\b(\bwar\b|armed conflict|\battack\b|bombing|\bmilitary\b|\bborder\b|refugees?|\bprotest\b|earthquake|hurricane|\bflood\b|disaster|ukraine|russia|\bgaza\b|israel|palestine|migran)\b/gi]},
];
const RSSCAT=[
  [/deporte|sport|f[uú]tbol|\bf1\b|\bnba\b/,'deportes'],
  [/cultura|culture|entreten|entertain|espect|farand|gente|m[uú]sica|music|cine|pel[ií]cula|serie|televis|\btv\b|actor|actriz|arte|\barts?\b|moda|celebrid/,'cultura'],
  [/cienc|science|salud|health|medic|clima|climate/,'ciencia'],
  [/tecnolog|technolog|\btech\b|gadget|inteligencia artificial|\bia\b/,'tecnologia'],
  [/econom|business|money|market|financ|dinero|negocios/,'economia'],
  [/pol[ií]tic|politic|elecc|election|gobierno/,'politica'],
  [/mundo|internacional|world|global/,'mundo']
];
/* puntuación ponderada: el TÍTULO pesa más que la descripción; la etiqueta del feed suma pero no manda sola */
function catScore(text,rule){ let s=0; for(const re of rule.res){ const m=text.match(re); if(m) s+=m.length; } return s; }
function catOf(a,o){
  if(a._cat) return a._cat;
  const title=(a.title||'').toLowerCase(), desc=(a.desc||'').toLowerCase();
  const catsStr=(a.cats||[]).join(' | ');
  const rssKeys=new Set(); if(catsStr) for(const [re,k] of RSSCAT){ if(re.test(catsStr)) rssKeys.add(k); }
  let best='mundo', bestScore=0;
  for(const rule of CAT_RULES){
    let s = catScore(title,rule)*3 + catScore(desc,rule);
    if(rssKeys.has(rule.key)) s += 2;
    if(s>bestScore){ bestScore=s; best=rule.key; }
  }
  // umbral: una mención suelta en la descripción (1) va a "mundo"; título (3) o etiqueta (2) sí clasifican
  a._cat = bestScore>=2 ? best : 'mundo';
  return a._cat;
}
let viewMode='titulares';
function applyFeedFilters(){
  const feed=$('#feed'); feed.className=(viewMode==='historias')?'':'feedgrid'; feed.innerHTML=''; shown=0;
  if(viewMode==='guardados'){ renderGuardados(); return; }
  const list=FEED.filter(matchesFilters);
  if(!list.length){
    feed.appendChild(el('div','empty','<div class="ic">📭</div><p>No encontramos noticias con esos filtros. Prueba con “Actualizar”, otra región o menos filtros.</p>'));
    $('#loadmore').style.display='none'; return;
  }
  FEED._filtered=list;
  if(viewMode==='historias'){ renderHistorias(list); $('#loadmore').style.display='none'; return; }
  renderMore();
}
function renderMore(){
  const list=FEED._filtered||[]; const feed=$('#feed');
  const slice=list.slice(shown,shown+PAGE);
  slice.forEach(a=>feed.appendChild(card(a)));
  shown+=slice.length;
  $('#loadmore').style.display= shown<list.length? 'flex':'none';
}
/* ---- guardar noticias ---- */
function isSaved(link){ return (ST.saved||[]).some(s=>s.link===link); }
function toggleSave(a,btn){
  ST.saved=ST.saved||[];
  const i=ST.saved.findIndex(s=>s.link===a.link);
  if(i>=0){ ST.saved.splice(i,1); if(btn){btn.classList.remove('on');btn.textContent='☆';} toast('Quitado de guardados'); if(viewMode==='guardados')applyFeedFilters(); }
  else { ST.saved.unshift({title:a.title,link:a.link,outlet:a.outlet,ts:a.ts,desc:a.desc||'',img:a.img||''}); if(btn){btn.classList.add('on');btn.textContent='★';} toast('Guardado ✓'); }
  save();
}
function renderGuardados(){
  const feed=$('#feed'); feed.className='feedgrid'; $('#loadmore').style.display='none';
  const s=ST.saved||[];
  if(!s.length){ feed.appendChild(el('div','empty','<div class="ic">★</div><p>Aún no guardas noticias. Toca la ☆ en cualquier titular para leerlo luego. Se guardan solo en este dispositivo.</p>')); return; }
  s.forEach(a=>feed.appendChild(card(a)));
}
/* ---- agrupar la misma noticia (historias) + puntos ciegos ---- */
const CLUSTER_STOP=new Set(('para como pero este esta esto esos esas entre sobre tras desde hasta porque cuando donde segun tambien contra video vivo ultima hora ultimas nuevo nueva noticia noticias tiene hace dice sera millones anos dias mundo pais paises the and for with from that this have will says said after more been they their what when over into about news says video live breaking says report reports could would first '+'').trim().split(/\s+/));
function clusterTokens(a){
  const t=(a.title||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const words=t.match(/[a-z0-9]{4,}/g)||[]; const s=new Set();
  words.forEach(w=>{ if(!CLUSTER_STOP.has(w)) s.add(w); }); return s;
}
function clusterStories(list){
  const arts=list.slice(0,220).map(a=>({a,tk:clusterTokens(a)}));
  const clusters=[];
  for(const it of arts){
    let best=null,bestShared=0;
    for(const c of clusters){ let sh=0; for(const w of it.tk) if(c.seed.has(w)) sh++; if(sh>bestShared){bestShared=sh;best=c;} }
    if(best && bestShared>=3){ best.items.push(it.a); }
    else clusters.push({seed:it.tk,items:[it.a]});
  }
  return clusters;
}
function storyBucket(o){ const c=biasClass(o); return c==='estatal'?'estatal':(c==='izq'||c==='ci')?'izq':(c==='cd'||c==='der')?'der':'centro'; }
function storyCard(cluster){
  const items=cluster.items.slice().filter(a=>byId[a.outlet]);
  const rep=items.slice().sort((x,y)=>(y.title.length)-(x.title.length))[0];
  const cnt={izq:0,centro:0,der:0,estatal:0}, per={izq:[],centro:[],der:[],estatal:[]};
  items.forEach(a=>{ const o=byId[a.outlet]; const b=storyBucket(o); cnt[b]++; per[b].push({a,o}); });
  const total=cnt.izq+cnt.centro+cnt.der, nSrc=items.length;
  let blind='',soft=false;
  if(total>=3){
    if(cnt.izq===0&&cnt.der>=2) blind='Punto ciego: la izquierda no lo cubre';
    else if(cnt.der===0&&cnt.izq>=2) blind='Punto ciego: la derecha no lo cubre';
    else if(cnt.izq/total>=0.8){blind='Sobre todo desde la izquierda';soft=true;}
    else if(cnt.der/total>=0.8){blind='Sobre todo desde la derecha';soft=true;}
    else if(cnt.izq>0&&cnt.der>0){blind='Cubierto en todo el espectro';soft=true;}
  }
  const img=(items.find(a=>a.img)||{}).img||'';
  const bt=Math.max(1,cnt.izq+cnt.centro+cnt.der+cnt.estatal);
  const bar=`<div class="biasbar">${cnt.izq?`<i class="bi" style="width:${(cnt.izq/bt*100).toFixed(1)}%"></i>`:''}${cnt.centro?`<i class="bc" style="width:${(cnt.centro/bt*100).toFixed(1)}%"></i>`:''}${cnt.der?`<i class="bd" style="width:${(cnt.der/bt*100).toFixed(1)}%"></i>`:''}${cnt.estatal?`<i class="be" style="width:${(cnt.estatal/bt*100).toFixed(1)}%"></i>`:''}</div>`;
  const COL={izq:'var(--izq)',centro:'var(--centro)',der:'var(--der)',estatal:'var(--estatal)'};
  let vers=''; ['izq','centro','der','estatal'].forEach(b=>per[b].forEach(x=>{ vers+=`<div class="story-ver"><span class="vdot" style="background:${COL[b]}"></span><div><a href="${esc(x.a.link)}" target="_blank" rel="noopener">${esc(x.a.title)}</a><span class="vsrc">${esc(x.o.nombre)} · ${biasWord(x.o)}${x.a.ts?(' · '+timeAgo(x.a.ts)):''}</span></div></div>`; }));
  const c=el('article','storycard');
  c.innerHTML=`
    <div class="story-top">
      <div class="story-thumb" ${img?`style="background-image:url('${esc(img)}')"`:''}>${img?'':'<div class="ni">🧩</div>'}</div>
      <div class="story-b">
        <div class="story-t">${esc(rep.title)}</div>
        <div class="story-meta"><b style="color:var(--negro)">${nSrc} medios</b> lo cubren ${blind?`· <span class="blindspot ${soft?'soft':''}">${soft?'':'⚠️ '}${esc(blind)}</span>`:''}</div>
        ${bar}
      </div>
    </div>
    <details class="story-more"><summary>Ver las ${nSrc} versiones (izquierda → derecha)</summary>${vers}</details>`;
  return c;
}
function renderHistorias(list){
  const feed=$('#feed');
  const clusters=clusterStories(list);
  const multi=clusters.filter(c=>c.items.length>=2).sort((a,b)=>b.items.length-a.items.length);
  const singles=clusters.filter(c=>c.items.length<2).map(c=>c.items[0]);
  if(multi.length){ const h=el('div','arch-h'); h.innerHTML='🧩 La misma noticia en varios medios <span class="n">· '+multi.length+' historias · abre para ver todas las versiones</span>'; feed.appendChild(h);
    multi.slice(0,40).forEach(c=>feed.appendChild(storyCard(c))); }
  else { feed.appendChild(el('div','empty','<div class="ic">🧩</div><p>Aún no hay suficientes fuentes cargadas para agrupar historias. Espera a que cargue la Portada o quita filtros.</p>')); }
  if(singles.length){ const h=el('div','arch-h'); h.style.marginTop='20px'; h.innerHTML='📰 Otras noticias <span class="n">· por ahora con una sola fuente</span>'; feed.appendChild(h);
    const g=el('div','feedgrid'); singles.slice(0,24).forEach(a=>g.appendChild(card(a))); feed.appendChild(g); }
}
function card(a){
  const o=byId[a.outlet]; if(!o) return extCard(a);
  const c=el('article','art');
  const cat=catOf(a,o);
  const catLabel={mundo:'Mundo',politica:'Política',economia:'Economía',tecnologia:'Tecnología',ciencia:'Ciencia',deportes:'Deportes',cultura:'Cultura'}[cat];
  c.innerHTML=`
    <div class="thumb" ${a.img?`style="background-image:url('${esc(a.img)}')"`:''}>
      ${a.img?'':'<div class="noimg">📰</div>'}
      <span class="cat">${catLabel}</span>
    </div>
    <div class="art-b">
      <div class="art-src">${biasBadge(o)} <span class="nm">${esc(o.nombre)}</span> · ${esc(o.pais)} · ${timeAgo(a.ts)}</div>
      <h3 class="art-t">${esc(a.title)}</h3>
      <p class="art-x">${esc(a.desc||'')}</p>
      <div class="art-foot">
        <a class="lnk" href="${esc(a.link)}" target="_blank" rel="noopener">Abrir ↗</a>
        <button class="lnk tr">🌐 Traducir</button>
        <button class="lnk ver">🧭 Canal</button>
        <button class="lnk sh">↗ Compartir</button>
        <button class="bookmark ${isSaved(a.link)?'on':''}" title="Guardar para leer luego">${isSaved(a.link)?'★':'☆'}</button>
      </div>
    </div>`;
  c.querySelector('.sh').addEventListener('click',()=>shareArticle(a.title,a.link));
  c.querySelector('.bookmark').addEventListener('click',e=>toggleSave(a,e.currentTarget));
  // traducir
  c.querySelector('.tr').addEventListener('click',async(e)=>{
    const btn=e.currentTarget; if(btn.classList.contains('done')){ c.querySelector('.art-t').textContent=a.title; c.querySelector('.art-x').textContent=a.desc||''; btn.classList.remove('done'); btn.innerHTML='🌐 Traducir'; return; }
    btn.innerHTML='… traduciendo'; btn.disabled=true;
    const [tt,tx]=await Promise.all([translate(a.title,ST.lang), a.desc?translate(a.desc,ST.lang):Promise.resolve('')]);
    c.querySelector('.art-t').textContent=tt; if(tx)c.querySelector('.art-x').textContent=tx;
    btn.disabled=false; btn.classList.add('done'); btn.innerHTML='✓ Original';
  });
  c.querySelector('.ver').addEventListener('click',()=>openChannel(o.id));
  return c;
}
/* tarjeta para fuentes externas (GDELT): sesgo solo si reconocemos el dominio */
function extCard(a){
  const c=el('article','art');
  const dom=(a.ext&&a.ext.domain)||''; const o=DOMAIN_IDX[dom]?byId[DOMAIN_IDX[dom]]:null;
  const badge=o?biasBadge(o):'<span class="bbadge centro" title="Medio no clasificado por AllSides/MBFC"><span class="dt"></span>Sin clasificar</span>';
  const nm=o?o.nombre:(dom||'Fuente externa');
  const extra=(a.ext&&a.ext.country)?(' · '+esc(a.ext.country)):'';
  c.innerHTML=`
    <div class="thumb" ${a.img?`style="background-image:url('${esc(a.img)}')"`:''}>
      ${a.img?'':'<div class="noimg">🌐</div>'}<span class="cat">Mundo</span></div>
    <div class="art-b">
      <div class="art-src">${badge} <span class="nm">${esc(nm)}</span>${extra} · ${timeAgo(a.ts)}</div>
      <h3 class="art-t">${esc(a.title)}</h3>
      <p class="art-x">${esc(a.desc||'')}</p>
      <div class="art-foot">
        <a class="lnk" href="${esc(a.link)}" target="_blank" rel="noopener">Abrir ↗</a>
        <button class="lnk tr">🌐 Traducir</button>
        <button class="lnk sh">↗ Compartir</button>
      </div>
    </div>`;
  c.querySelector('.sh').addEventListener('click',()=>shareArticle(a.title,a.link));
  c.querySelector('.tr').addEventListener('click',async(e)=>{
    const btn=e.currentTarget;
    if(btn.classList.contains('done')){ c.querySelector('.art-t').textContent=a.title; btn.classList.remove('done'); btn.innerHTML='🌐 Traducir'; return; }
    btn.innerHTML='… traduciendo'; btn.disabled=true;
    c.querySelector('.art-t').textContent=await translate(a.title,ST.lang);
    btn.disabled=false; btn.classList.add('done'); btn.innerHTML='✓ Original';
  });
  return c;
}
/* búsqueda mundial con GDELT (CORS *, sin llave, ~1 pet/5s) */
function parseGdeltDate(s){ const m=String(s||'').match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/); return m?Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]):0; }
async function worldSearch(){
  const q=($('#q').value||'').trim();
  if(!q){ toast('Escribe algo en el buscador para explorar el mundo'); $('#q').focus(); return; }
  const myToken=++feedToken;   // invalida cualquier carga progresiva en curso (que no pise esto)
  const feed=$('#feed'); feed.innerHTML=''; $('#loadmore').style.display='none';
  feed.appendChild(el('div','',`<div style="grid-column:1/-1;padding:14px 16px;background:#fff;border:1px solid var(--linea);border-radius:14px;font-weight:700;font-size:13px">🌐 Buscando <b>“${esc(q)}”</b> en medios de todo el mundo (GDELT)…</div>`));
  for(let i=0;i<6;i++) feed.appendChild(el('div','sk','<div class="a"></div><div class="b"><div class="l"></div><div class="l s"></div></div>'));
  const url='https://api.gdeltproject.org/api/v2/doc/doc?query='+enc(q)+'&mode=artlist&format=json&maxrecords=48&sort=datedesc';
  let arts=[], nollego=false;
  await probeProxy();
  try{ const raw=await fetchViaAny(url,9000); const j=JSON.parse(raw); arts=(j&&j.articles)||[]; }
  catch(e){ nollego=true; }   // no es "no hay noticias": es que no pudimos preguntar
  if(myToken!==feedToken) return;   // el usuario hizo otra cosa mientras tanto
  feed.innerHTML='';
  const back=el('div',''); back.style.gridColumn='1/-1';
  back.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;background:#fff;border:1px solid var(--linea);border-left:3px solid var(--oro);border-radius:12px;padding:11px 15px;margin-bottom:4px">
    <div style="font-size:13px;font-weight:700">🌐 ${nollego?('No se pudo preguntar por “'+esc(q)+'”'):(arts.length+' resultados del mundo para “'+esc(q)+'”')} <span style="color:var(--gris-claro);font-weight:600">· fuente: GDELT · el sesgo solo se muestra si reconocemos el medio</span></div>
    <button class="btn btn-ghost btn-sm" id="btnBackFeed">← Volver a mi portada</button></div>`;
  feed.appendChild(back);
  $('#btnBackFeed').addEventListener('click',()=>{ $('#q').value=''; buildFeed().then(maybeAutoTranslate); });
  if(!arts.length){
    feed.appendChild(el('div','empty', nollego
      ? '<div class="ic">🚧</div><p><b>No es que no haya noticias: es que no pudimos preguntar.</b> GDELT solo acepta una búsqueda cada 5 segundos por dirección, y la del puente público la comparte mucha gente, así que casi siempre está ocupada.<br><br>Con un <b>puente propio</b> (gratis, 10 minutos: mira <b>DESPLEGAR-PUENTE.txt</b>) esta búsqueda funciona siempre. Mientras tanto, tu portada y las demás pestañas siguen igual.</p>'
      : '<div class="ic">🌐</div><p>GDELT no tiene nada indexado sobre “'+esc(q)+'”. Prueba con otras palabras o en otro idioma.</p>'));
    return;
  }
  arts.forEach(g=>feed.appendChild(extCard({title:g.title,link:g.url,desc:'',ts:parseGdeltDate(g.seendate),img:g.socialimage&&/^https/.test(g.socialimage)?g.socialimage:'',ext:{domain:(g.domain||'').replace(/^www\./,''),country:g.sourcecountry,lang:g.language}})));
}
/* auto-traducción de titulares no-idioma (solo si ST.auto) */
async function maybeAutoTranslate(){
  if(!ST.auto) return;
  const cards=$$('#feed .art');
  await mapLimit(cards,4,async(c)=>{
    const btn=c.querySelector('.tr'); if(btn && !btn.classList.contains('done')) btn.click();
  });
}

/* ---------- ticker ---------- */
function renderTicker(){
  const top=(FEED||[]).slice(0,14);
  if(!top.length){ $('#ticker').style.display='none'; return; }
  const html=top.map(a=>`<a href="${esc(a.link)}" target="_blank" rel="noopener">${esc(a.title)}</a>`).join('');
  $('#tickmove').innerHTML=html+html; $('#ticker').style.display='flex';
}

/* ============================================================
   MAPA
   ============================================================ */
let map=null, mapLayer=null, leafletLoading=null;
function loadLeaflet(){
  if(window.L) return Promise.resolve();
  if(leafletLoading) return leafletLoading;
  leafletLoading=new Promise((res,rej)=>{
    const css=el('link'); css.rel='stylesheet'; css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
    const s=el('script'); s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload=()=>res(); s.onerror=()=>rej(new Error('leaflet')); document.head.appendChild(s);
  });
  return leafletLoading;
}
function locFor(a,o){
  const t=(a.title+' '+(a.desc||'')).toLowerCase();
  for(const city in CIUDADES){ if(t.includes(city)) return {ll:CIUDADES[city],city}; }
  const c=COORD_PAIS[o.pais]||COORD_PAIS[o.region]; if(c) return {ll:c,city:o.pais};
  return null;
}
async function plotMap(){
  try{ await loadLeaflet(); }catch(e){ $('#map').innerHTML='<div class="mapfallback">No se pudo cargar el mapa (sin internet o el CDN falló). El resto de Prisma funciona igual.</div>'; return; }
  if(!map){
    $('#map').innerHTML='';
    map=L.map('map',{worldCopyJump:true,minZoom:2,maxZoom:8,scrollWheelZoom:true}).setView([20,0],2);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{attribution:'© OpenStreetMap · © CARTO',subdomains:'abcd',maxZoom:19}).addTo(map);
  }
  if(mapLayer) map.removeLayer(mapLayer);
  mapLayer=L.layerGroup().addTo(map);
  // agrupar noticias por ubicación
  const groups={};
  (FEED||[]).slice(0,240).forEach(a=>{ const o=byId[a.outlet]; if(!o)return; const loc=locFor(a,o); if(!loc)return;
    const k=loc.ll.join(','); (groups[k]=groups[k]||{ll:loc.ll,city:loc.city,items:[]}).items.push({a,o}); });
  const COL={izq:'#2b5fd0',ci:'#6f97e0',centro:'#8f949c',cd:'#e0906f',der:'#d23b28',estatal:'#7a4fd6'};
  Object.values(groups).forEach(g=>{
    const n=g.items.length; const r=Math.min(9+n*2.4,30);
    // sesgo dominante
    const tally={}; g.items.forEach(x=>{const c=biasClass(x.o); tally[c]=(tally[c]||0)+1;});
    const dom=Object.keys(tally).sort((a,b)=>tally[b]-tally[a])[0]||'centro';
    const m=L.circleMarker(g.ll,{radius:r,color:'#fff',weight:1.5,fillColor:COL[dom],fillOpacity:.82});
    const lis=g.items.slice(0,6).map(x=>`<a class="pp-it" href="${esc(x.a.link)}" target="_blank" rel="noopener">${esc(x.a.title)} <span style="color:#9a9da4">· ${esc(x.o.nombre)}</span></a>`).join('');
    m.bindPopup(`<div class="pp-h">${esc(g.city)} <span class="c">· ${n} noticia${n>1?'s':''}</span></div>${lis}`,{maxWidth:300});
    m.addTo(mapLayer);
  });
  setTimeout(()=>map.invalidateSize(),120);
}

/* ============================================================
   VIDEO / SHORTS (YouTube RSS por canal)
   ============================================================ */
const ytCache={};
async function loadYT(outlet){
  if(!outlet.yt) return [];
  if(ytCache[outlet.yt]&&Date.now()-ytCache[outlet.yt].t<15*60*1000) return ytCache[outlet.yt].v;
  const url='https://www.youtube.com/feeds/videos.xml?channel_id='+outlet.yt;
  let vids=[];
  try{
    const xml=await fetchText(url); const doc=new DOMParser().parseFromString(xml,'text/xml');
    const entries=[...doc.getElementsByTagName('entry')];
    vids=entries.map(n=>{
      const vid=tagText(n,'yt:videoId'); const title=tagText(n,'title');
      const th=n.getElementsByTagName('media:thumbnail')[0]; const img=th?th.getAttribute('url'):('https://i.ytimg.com/vi/'+vid+'/hqdefault.jpg');
      const pub=Date.parse(tagText(n,'published'))||0;
      return {vid,title,img,pub,outlet:outlet.id};
    }).filter(v=>v.vid);
  }catch(e){}
  ytCache[outlet.yt]={t:Date.now(),v:vids};
  return vids;
}
async function buildVideos(single){
  const grid=$('#videos'); grid.innerHTML='';
  for(let i=0;i<6;i++) grid.appendChild(el('div','sk','<div class="a"></div><div class="b"><div class="l"></div><div class="l s"></div></div>'));
  await probeProxy();
  const outs=(single?[byId[single]]:CATALOGO.filter(o=>o.yt&&!ST.off.includes(o.id))).filter(Boolean);
  const lists=await mapLimit(outs,5,loadYT);
  let all=[]; lists.forEach(l=>{ if(l) all=all.concat(l); });
  all.sort((a,b)=>b.pub-a.pub);
  grid.innerHTML='';
  if(!all.length){ grid.appendChild(el('div','empty','<div class="ic">🎬</div><p>No pudimos cargar los videos ahora. Revisa tu conexión o cambia el puente en Ajustes.</p>')); return; }
  all.slice(0,40).forEach(v=>grid.appendChild(vcard(v)));
}
function vcard(v){
  const o=byId[v.outlet]; const c=el('div','vcard');
  c.innerHTML=`<div class="vth" style="background-image:url('${esc(v.img)}')"><div class="play">▶</div></div>
    <div class="vb"><div class="vt">${esc(v.title)}</div><div class="vs">${biasBadge(o)} ${esc(o.nombre)} · ${timeAgo(v.pub)}</div></div>`;
  c.addEventListener('click',()=>openVideo(v.vid,false));
  return c;
}
async function buildShorts(){
  const rail=$('#shorts'), grid=$('#shortsGrid'); rail.innerHTML=''; grid.innerHTML='';
  for(let i=0;i<5;i++){ const s=el('div','short'); s.style.background='#e9eaec'; rail.appendChild(s); }
  await probeProxy();
  const outs=CATALOGO.filter(o=>o.yt&&!ST.off.includes(o.id));
  const lists=await mapLimit(outs,5,loadYT);
  let all=[]; lists.forEach(l=>{ if(l) all=all.concat(l); });
  all.sort((a,b)=>b.pub-a.pub);
  rail.innerHTML='';
  if(!all.length){ rail.innerHTML=''; grid.appendChild(el('div','empty','<div class="ic">⚡</div><p>No hay shorts disponibles ahora mismo.</p>')); return; }
  all.slice(0,18).forEach(v=>{
    const o=byId[v.outlet]; const s=el('div','short');
    s.style.backgroundImage=`url('${esc(v.img)}')`;
    s.innerHTML=`<div class="play">▶</div><div class="ov"><div class="st">${esc(v.title)}</div><div class="ss">${esc(o.nombre)}</div></div>`;
    s.addEventListener('click',()=>openVideo(v.vid,true));
    rail.appendChild(s);
  });
}
function openVideo(id,vertical){
  const box=$('#modalBox'); box.className='box'+(vertical?' vert':'');
  $('#modalInner').innerHTML=`<iframe class="vframe" src="https://www.youtube-nocookie.com/embed/${esc(id)}?autoplay=1&rel=0&playsinline=1" allow="autoplay;encrypted-media;picture-in-picture;fullscreen" allowfullscreen playsinline frameborder="0"></iframe>
    <a href="https://www.youtube.com/watch?v=${esc(id)}" target="_blank" rel="noopener" style="display:block;text-align:center;background:#111;color:#fff;font-size:12.5px;font-weight:700;padding:9px;text-decoration:none">▶ Abrir en YouTube (si no se ve aquí)</a>`;
  $('#modal').classList.add('on');
}
function closeModal(){ $('#modal').classList.remove('on'); $('#modalInner').innerHTML=''; }

/* ============================================================
   RADIO (radio-browser)
   ============================================================ */
const RB='https://de1.api.radio-browser.info';
let curStation=null;
async function buildRadio(){
  const list=$('#radiolist'); list.innerHTML='';
  for(let i=0;i<6;i++) list.appendChild(el('div','sk','<div class="b"><div class="l"></div><div class="l s"></div></div>'));
  const pais=$('#fRadioPais').value, q=($('#qRadio').value||'').trim();
  let url;
  if(q) url=RB+'/json/stations/search?name='+enc(q)+'&limit=60&hidebroken=true&order=clickcount&reverse=true';
  else if(pais) url=RB+'/json/stations/search?tag=news&country='+enc(pais)+'&limit=60&hidebroken=true&order=clickcount&reverse=true';
  else url=RB+'/json/stations/bytag/news?limit=80&hidebroken=true&order=clickcount&reverse=true';
  let arr=[];
  try{ const r=await fetch(url,{headers:{'Accept':'application/json'}}); arr=await r.json(); }catch(e){}
  // filtrar https + audio compatible iOS
  arr=(arr||[]).filter(s=>{ const u=s.url_resolved||s.url||''; return u.startsWith('https')&&/(mp3|aac|aacp|ogg|)/i.test(s.codec||''); });
  // dedupe por nombre
  const seen=new Set(); arr=arr.filter(s=>{const k=(s.name||'').toLowerCase().trim(); if(!k||seen.has(k))return false; seen.add(k); return true;});
  list.innerHTML='';
  if(!arr.length){ list.appendChild(el('div','empty','<div class="ic">📻</div><p>No encontramos emisoras con ese filtro. Prueba otro país o busca por nombre.</p>')); return; }
  arr.slice(0,60).forEach(s=>list.appendChild(rcard(s)));
}
function rcard(s){
  const c=el('div','rstat'); c.dataset.url=s.url_resolved||s.url;
  const fav=s.favicon&&/^https/.test(s.favicon)?`style="background-image:url('${esc(s.favicon)}')"`:'';
  c.innerHTML=`<div class="ricon" ${fav}>${fav?'':'📻'}</div>
    <div style="min-width:0"><div class="rnm">${esc(s.name||'Emisora')}</div>
    <div class="rmeta">${esc(s.country||'')}${s.tags?' · '+esc((s.tags||'').split(',').slice(0,2).join(', ')):''}</div></div>`;
  c.addEventListener('click',()=>playRadio(s,c));
  return c;
}
function playRadio(s,card){
  const audio=$('#audio'); const url=s.url_resolved||s.url;
  $$('.rstat.playing').forEach(x=>x.classList.remove('playing')); if(card)card.classList.add('playing');
  audio.src=url; audio.play().catch(()=>toast('No se pudo reproducir esta emisora. Prueba otra.'));
  curStation=s;
  $('#rbName').textContent=s.name||'Emisora'; $('#rbToggle').textContent='⏸';
  $('#radiobar').classList.add('on');
  if('mediaSession' in navigator){
    navigator.mediaSession.metadata=new MediaMetadata({title:s.name||'Emisora',artist:(s.country||'Radio en vivo'),album:'Prisma · Radio',artwork:s.favicon?[{src:s.favicon,sizes:'128x128'}]:[]});
    navigator.mediaSession.setActionHandler('pause',()=>{audio.pause();$('#rbToggle').textContent='▶';});
    navigator.mediaSession.setActionHandler('play',()=>{audio.play();$('#rbToggle').textContent='⏸';});
  }
}
$('#rbToggle')&&$('#rbToggle').addEventListener('click',()=>{ const a=$('#audio'); if(a.paused){a.play();$('#rbToggle').textContent='⏸';}else{a.pause();$('#rbToggle').textContent='▶';} });
$('#rbStop')&&$('#rbStop').addEventListener('click',()=>{ const a=$('#audio'); a.pause(); a.src=''; $('#radiobar').classList.remove('on'); $$('.rstat.playing').forEach(x=>x.classList.remove('playing')); });

/* ============================================================
   CANALES (directorio con historia + medidor de sesgo)
   ============================================================ */
function biasMeterHtml(o){
  if(o.sesgo==='estatal'){
    return `<div class="bstate">⚑ Medio estatal — financiado por ${esc(o.dueno||o.pais)}</div>
      <div class="bsrc">Los medios estatales reflejan, en distinto grado, la posición de su gobierno. Fuente: ${esc(o.fuente||'—')}.</div>`;
  }
  const pct=Math.max(2,Math.min(98,((o.sesgo_num+3)/6)*100));
  return `<div class="bmeter"><div class="btrack"><span class="mk" style="left:${pct}%"></span></div>
    <div class="blabels"><span>Izquierda</span><span>Centro</span><span>Derecha</span></div></div>
    <div class="bsrc">Clasificado como <b style="color:var(--negro)">${biasWord(o)}</b> · fuente: ${esc(o.fuente||'—')}${o.conf==='baja'?' · <i>sin consenso claro</i>':''}</div>`;
}
/* bandera a partir del código ISO-3166 alfa-2 */
function flagEmoji(cc){ if(!cc||cc.length!==2) return '🏳️'; return cc.toUpperCase().replace(/[A-Z]/g,c=>String.fromCodePoint(127462+c.charCodeAt(0)-65)); }
/* "seguir el dinero": propietario, país del dueño, grupo, financiación y conflictos de interés */
function ownershipHtml(o){
  if(!o.grupo && !o.financ && !o.interes && !o.duenoPais) return '';
  const noInt = !o.interes || /sin (un )?conflicto|no se le documenta|no hay conflicto|sin conflicto de inter|sin interés notable|sin interes notable/i.test(o.interes||'');
  const dueno=o.propietario||o.dueno||'';
  const rows=[];
  if(dueno)     rows.push(`<div class="own-row"><span class="own-ic">👤</span><div><b>Dueño:</b> ${esc(dueno)}</div></div>`);
  if(o.duenoPais) rows.push(`<div class="own-row"><span class="own-ic">🌍</span><div><b>País del dueño:</b> ${flagEmoji(o.duenoPaisCode)} ${esc(o.duenoPais)}${o.duenoExtranjero?' <span class="chip-ext">capital extranjero</span>':''}${o.duenoPaisNota&&(o.duenoExtranjero||/mixto|varios|bolsa/i.test(o.duenoPaisNota))?' — '+esc(o.duenoPaisNota):''}</div></div>`);
  if(o.grupo)   rows.push(`<div class="own-row"><span class="own-ic">🏢</span><div><b>Grupo económico:</b> ${esc(o.grupo)}</div></div>`);
  if(o.financ)  rows.push(`<div class="own-row"><span class="own-ic">💰</span><div><b>Se financia con:</b> ${esc(o.financ)}</div></div>`);
  if(o.interes) rows.push(`<div class="own-row ${noInt?'':'warn'}"><span class="own-ic">${noInt?'✅':'⚠️'}</span><div><b>Posibles intereses:</b> ${esc(o.interes)}</div></div>`);
  const sum = '💵 ¿Quién está detrás? · seguir el dinero'+(noInt?'':' <span class="chip-int">interés</span>');
  return `<details class="own"><summary>${sum}</summary><div class="own-body">${rows.join('')}${o.fuenteProp?`<div class="own-src">Fuente de la propiedad: ${esc(o.fuenteProp)}</div>`:''}</div></details>`;
}
function channelCard(o){
  const c=el('div','chan'); c.dataset.b=biasClass(o);
  const links=[`<a href="${esc(o.sitio)}" target="_blank" rel="noopener">🌐 Sitio</a>`];
  if(o.yt) links.push(`<a href="https://www.youtube.com/channel/${esc(o.yt)}" target="_blank" rel="noopener">▶ YouTube</a>`);
  links.push(`<button class="verport" style="all:unset;cursor:pointer;font-size:11.5px;font-weight:800;padding:6px 10px;border-radius:8px;border:1.5px solid var(--linea)">📰 Ver sus noticias</button>`);
  c.innerHTML=`<div class="chan-h"><div><div class="nm">${esc(o.nombre)}</div>
      <div class="meta">${esc(o.pais)} · fundado ${esc(o.fundado||'—')}${o.duenoPais?` · dueño ${flagEmoji(o.duenoPaisCode)} ${esc(o.duenoPais)}${o.duenoExtranjero?' <span class="chip-ext">extranjero</span>':''}`:(o.dueno?` · ${esc(o.dueno)}`:'')}</div></div>
      <span class="cred ${esc(o.cred||'mixta')}">${({alta:'Cred. alta',media:'Cred. media',baja:'Cred. baja',mixta:'Cred. mixta'})[o.cred||'mixta']}</span></div>
    ${biasMeterHtml(o)}
    <div class="hist">${esc(o.hist||'')}</div>
    ${ownershipHtml(o)}
    <div class="chan-links">${links.join('')}</div>`;
  c.querySelector('.verport').addEventListener('click',()=>{ ST.reg='todas'; ST.bias='all'; ST.off=CATALOGO.filter(x=>x.id!==o.id).map(x=>x.id); save(); syncSettingsUI(); switchTab('portada'); buildFeed(); toast('Mostrando solo '+o.nombre+' · quítalo en Ajustes › Fuentes'); });
  return c;
}
function buildChannels(){
  const grid=$('#channels'); grid.innerHTML='';
  const q=($('#qChan').value||'').trim().toLowerCase(), fb=$('#fChanBias').value, sort=$('#fChanSort').value;
  let list=CATALOGO.filter(o=> (fb==='all'||biasClass(o)===fb) && (!q||o.nombre.toLowerCase().includes(q)||o.pais.toLowerCase().includes(q)));
  if(sort==='bias') list.sort((a,b)=>a.sesgo_num-b.sesgo_num);
  else if(sort==='name') list.sort((a,b)=>a.nombre.localeCompare(b.nombre));
  else if(sort==='country') list.sort((a,b)=>a.pais.localeCompare(b.pais)||a.sesgo_num-b.sesgo_num);
  else if(sort==='duenopais') list.sort((a,b)=>(a.duenoPais||'zzz').localeCompare(b.duenoPais||'zzz')||a.nombre.localeCompare(b.nombre));
  else if(sort==='year') list.sort((a,b)=>(parseInt(a.fundado)||9999)-(parseInt(b.fundado)||9999));
  if(!list.length){ grid.appendChild(el('div','empty','<div class="ic">🧭</div><p>Ningún canal coincide con la búsqueda.</p>')); return; }
  list.forEach(o=>grid.appendChild(channelCard(o)));
}
function openChannel(id){ switchTab('canales'); $('#qChan').value=byId[id].nombre; buildChannels(); window.scrollTo({top:0,behavior:'smooth'}); }

/* ============================================================
   PRISMA · contenido propio (resumen IA, espectro, eventos)
   ============================================================ */
let EVENTOS=[
  {nombre:'Colombia Tech Week 2026',fecha:'10-16 ago 2026',iso:'2026-08-10',ciudad:'Bogotá',pais:'Colombia',tipo:'networking',desc:'Semana del ecosistema tech colombiano que conecta a fundadores, inversores y startups en decenas de eventos simultáneos por toda la ciudad.',url:'https://colombiatechweek.co/',online:false},
  {nombre:'Gamescom 2026',fecha:'26-30 ago 2026',iso:'2026-08-26',ciudad:'Colonia',pais:'Alemania',tipo:'gaming',desc:'La mayor feria mundial de videojuegos; su Opening Night Live (25 ago) marca los grandes anuncios de la industria antes de Navidad.',url:'https://www.gamescom.global/en',online:true},
  {nombre:'Platzi Conf Bogotá 2026',fecha:'29 ago 2026',iso:'2026-08-29',ciudad:'Bogotá',pais:'Colombia',tipo:'tech',desc:'Encuentro anual de la comunidad Platzi con charlas de innovación tecnológica y un Demo Day de startups de LatAm; presencial en Ágora y con streaming mundial.',url:'https://platzi.com/conf/',online:true},
  {nombre:'LEAP 2026',fecha:'31 ago - 3 sep 2026',iso:'2026-08-31',ciudad:'Riad',pais:'Arabia Saudita',tipo:'summit',desc:'El megaevento tecnologico de Vision 2030 que mueve miles de millones en IA, cloud y fintech y atrae a fundadores de todo el mundo.',url:'https://onegiantleap.com/',online:false},
  {nombre:'ANDICOM 2026',fecha:'2-4 sep 2026',iso:'2026-09-02',ciudad:'Cartagena',pais:'Colombia',tipo:'tech',desc:'El congreso internacional de TIC más importante de Colombia (CINTEL), centrado en el poder de la IA y con la Unión Europea como invitada de honor.',url:'https://andicom.co/',online:false},
  {nombre:'IFA Berlin 2026',fecha:'4-8 sep 2026',iso:'2026-09-04',ciudad:'Berlin',pais:'Alemania',tipo:'tech',desc:'La feria de electronica de consumo mas importante de Europa, con ~1.900 expositores y lanzamientos de gadgets, hogar inteligente e IA.',url:'https://www.ifa-berlin.com/',online:false},
  {nombre:'Tokyo Game Show 2026',fecha:'17-21 sep 2026',iso:'2026-09-17',ciudad:'Chiba (Tokio)',pais:'Japon',tipo:'gaming',desc:'El mayor evento de videojuegos de Asia celebra su 30 aniversario con 5 dias en Makuhari Messe; escaparate clave de estudios asiaticos.',url:'https://tgs.cesa.or.jp/',online:true},
  {nombre:'Nerdearla Argentina 2026',fecha:'22-26 sep 2026',iso:'2026-09-22',ciudad:'Buenos Aires',pais:'Argentina',tipo:'tech',desc:'El evento gratuito de tecnología, open source y ciencia más grande de habla hispana; formato híbrido con días virtuales y presencial en el Konex.',url:'https://nerdearla.com/argentina/2026/',online:true},
  {nombre:'TechCrunch Disrupt 2026',fecha:'13-15 oct 2026',iso:'2026-10-13',ciudad:'San Francisco',pais:'Estados Unidos',tipo:'startup',desc:'La cita de referencia de startups y venture capital en Silicon Valley, con el concurso Startup Battlefield y contacto directo con inversores.',url:'https://techcrunch.com/events/techcrunch-disrupt/',online:false},
  {nombre:'Colombia 4.0',fecha:'30-31 oct 2026',iso:'2026-10-30',ciudad:'Bogotá',pais:'Colombia',tipo:'tech',desc:'Festival de MinTIC sobre ecosistemas digitales e industrias creativas que cierra su gira nacional en Corferias; entrada gratuita con charlas y talleres.',url:'https://www.mintic.gov.co/',online:false},
  {nombre:'Web Summit Lisboa 2026',fecha:'9-12 nov 2026',iso:'2026-11-09',ciudad:'Lisboa',pais:'Portugal',tipo:'summit',desc:'La mayor conferencia tech de Europa, punto de conexión global para fundadores e inversores; relevante como paso previo a su edición de Río en LatAm.',url:'https://websummit.com/',online:false},
  {nombre:'COP31 - Cumbre Climática de la ONU',fecha:'9-20 nov 2026',iso:'2026-11-09',ciudad:'Antalya',pais:'Turquía',tipo:'summit',desc:'La cumbre climática anual de la ONU que reúne a casi 200 países; gran foro de conexión global con transmisión y sesiones abiertas en línea.',url:'https://unfccc.int/cop31',online:true},
  {nombre:'NASA Space Apps Challenge 2026',fecha:'14-15 nov 2026',iso:'2026-11-14',ciudad:'Global (sedes locales en LatAm)',pais:'Internacional',tipo:'ciencia',desc:'El mayor hackathon del mundo: en un fin de semana equipos usan datos de la NASA en cientos de sedes locales (México, Colombia, Argentina...) y en línea.',url:'https://www.spaceappschallenge.org/',online:true},
  {nombre:'Slush 2026',fecha:'18-19 nov 2026',iso:'2026-11-18',ciudad:'Helsinki',pais:'Finlandia',tipo:'startup',desc:'El evento europeo mas centrado en fundadores: ~12.000 emprendedores e inversores conectando para levantar capital y escalar globalmente.',url:'https://slush.org/',online:false},
  {nombre:'Nerdearla México 2026',fecha:'18-20 nov 2026',iso:'2026-11-18',ciudad:'Ciudad de México',pais:'México',tipo:'tech',desc:'Edición mexicana del mayor evento gratuito de tecnología en español; charlas, talleres y networking presencial (Expo Reforma) y por streaming.',url:'https://nerdearla.mx/',online:true},
  {nombre:'GITEX Global 2026',fecha:'7-11 dic 2026',iso:'2026-12-07',ciudad:'Dubái',pais:'Emiratos Árabes Unidos',tipo:'tech',desc:'Una de las mayores ferias tech del mundo (200.000+ asistentes de 180 países), estratégica para hacer negocios y conexiones internacionales.',url:'https://www.gitex.com/',online:false},
  {nombre:'The Game Awards 2026',fecha:'10 dic 2026',iso:'2026-12-10',ciudad:'Los Angeles',pais:'Estados Unidos',tipo:'gaming',desc:'La gala anual que premia lo mejor del videojuego y estrena grandes traileres mundiales; transmitida en vivo desde el Peacock Theater.',url:'https://thegameawards.com/',online:true},
  {nombre:'CES 2027',fecha:'6-9 ene 2027',iso:'2027-01-06',ciudad:'Las Vegas',pais:'Estados Unidos',tipo:'tech',desc:'La feria de electrónica de consumo e innovación más influyente del mundo, donde se marcan las tendencias tech del año.',url:'https://www.ces.tech/',online:false},
  {nombre:'Foro Económico Mundial (Davos) 2027',fecha:'18-22 ene 2027',iso:'2027-01-18',ciudad:'Davos',pais:'Suiza',tipo:'summit',desc:'La cumbre global que reúne a líderes políticos, empresariales y sociales; muchas sesiones se transmiten en vivo para el público.',url:'https://www.weforum.org/meetings/',online:true},
  {nombre:'Web Summit Qatar 2027',fecha:'31 ene - 3 feb 2027',iso:'2027-01-31',ciudad:'Doha',pais:'Qatar',tipo:'summit',desc:'Extensión en Oriente Medio de Web Summit; hub de startups e inversores que conecta ecosistemas de tres continentes.',url:'https://qatar.websummit.com/',online:false},
  {nombre:'LEAP 2027',fecha:'3-6 feb 2027',iso:'2027-02-03',ciudad:'Riad',pais:'Arabia Saudita',tipo:'summit',desc:'Edicion 2027 del gran evento tecnologico saudi en el Riyadh Front, con foco en IA, ciberseguridad y gobierno digital.',url:'https://onegiantleap.com/',online:false},
  {nombre:'MWC Barcelona 2027',fecha:'1-4 mar 2027',iso:'2027-03-01',ciudad:'Barcelona',pais:'España',tipo:'tech',desc:'El mayor congreso mundial de telecomunicaciones y móvil, con 100.000+ asistentes; cita clave del calendario tech en español.',url:'https://www.mwcbarcelona.com/',online:false},
  {nombre:'GDC 2027',fecha:'1-5 mar 2027',iso:'2027-03-01',ciudad:'San Francisco',pais:'Estados Unidos',tipo:'gaming',desc:'La Game Developers Conference, el evento profesional de referencia para desarrolladores de videojuegos y sus tecnologias.',url:'https://gdconf.com/',online:false},
  {nombre:'4YFN (Four Years From Now) 2027',fecha:'1-4 mar 2027',iso:'2027-03-01',ciudad:'Barcelona',pais:'España',tipo:'startup',desc:'La feria de startups dentro del MWC que conecta emprendedores, inversores y corporaciones; puerta de entrada para founders de LatAm en Europa.',url:'https://www.4yfn.com/',online:false},
  {nombre:'NVIDIA GTC 2027',fecha:'15-18 mar 2027',iso:'2027-03-15',ciudad:'San Jose (California)',pais:'Estados Unidos',tipo:'ia',desc:'La conferencia estrella de NVIDIA sobre computo de IA; el keynote de Jensen Huang fija el rumbo de GPUs y modelos, con acceso virtual.',url:'https://www.nvidia.com/gtc/',online:true},
  {nombre:'SXSW 2027',fecha:'15-21 mar 2027',iso:'2027-03-15',ciudad:'Austin',pais:'Estados Unidos',tipo:'cultura',desc:'Festival que cruza tecnologia, startups, cine y musica; punto de encuentro cultural donde surgen tendencias e ideas emergentes.',url:'https://www.sxsw.com/',online:false},
  {nombre:'Nerdearla Chile 2027',fecha:'14-16 abr 2027',iso:'2027-04-14',ciudad:'Santiago',pais:'Chile',tipo:'tech',desc:'Edición chilena del evento gratuito de tecnología y open source en español, en el Centro GAM; híbrido con streaming mundial.',url:'https://nerdearla.com/',online:true},
  {nombre:'Talent Land México 2027',fecha:'27-29 abr 2027',iso:'2027-04-27',ciudad:'Ciudad de México',pais:'México',tipo:'tech',desc:'Macroevento tipo campus (Talent Land) enfocado en IA que reúne a miles de jóvenes talentos, empresas y comunidades; nueva sede en Expo Santa Fe.',url:'https://talent-land.mx/',online:false},
  {nombre:'Google I/O 2027',fecha:'~12-14 may 2027 (estimado)',iso:'2027-05-12',ciudad:'Mountain View',pais:'Estados Unidos',tipo:'ia',desc:'La conferencia anual de desarrolladores de Google, escaparate de Android, Gemini e IA; fechas aun sin confirmacion oficial.',url:'https://io.google/',online:true},
  {nombre:'Web Summit Vancouver 2027',fecha:'25-28 may 2027',iso:'2027-05-25',ciudad:'Vancouver',pais:'Canada',tipo:'summit',desc:'El heredero norteamericano de Collision, ahora bajo la marca Web Summit; gran cita de startups e inversores en la costa oeste.',url:'https://vancouver.websummit.com/',online:false},
  {nombre:'Computex 2027',fecha:'1-4 jun 2027',iso:'2027-06-01',ciudad:'Taipei',pais:'Taiwan',tipo:'tech',desc:'La mayor feria de hardware y computo de Asia, epicentro de chips e IA con Nvidia, AMD e Intel; edicion 2027 en el Taipei Nangang Exhibition Center.',url:'https://www.computextaipei.com.tw/',online:true},
  {nombre:'Apple WWDC 2027',fecha:'semana del 7 jun 2027 (esperado)',iso:'2027-06-07',ciudad:'Cupertino',pais:'Estados Unidos',tipo:'tech',desc:'La conferencia de desarrolladores de Apple donde se presentan iOS, macOS y novedades de IA; fecha esperada, aun sin anuncio oficial.',url:'https://developer.apple.com/wwdc/',online:true},
  {nombre:'Web Summit Rio 2027',fecha:'14-17 jun 2027',iso:'2027-06-14',ciudad:'Río de Janeiro',pais:'Brasil',tipo:'summit',desc:'La principal conferencia de tecnología de Sudamérica; el gran punto de conexión de la escena tech y de startups de toda LatAm.',url:'https://rio.websummit.com/',online:false},
  {nombre:'VivaTech 2027',fecha:'16-19 jun 2027',iso:'2027-06-16',ciudad:'París',pais:'Francia',tipo:'tech',desc:'Uno de los mayores eventos de innovación y IA de Europa (200.000+ asistentes), con presencia de las grandes empresas y laboratorios de IA.',url:'https://vivatech.com/',online:false},
  {nombre:'Nerdearla Madrid 2027',fecha:'4-6 nov 2027',iso:'2027-11-04',ciudad:'Madrid',pais:'España',tipo:'tech',desc:'Desembarco en España del mayor evento gratuito de tecnología en español (La Nave), conectando a la comunidad hispanohablante a ambos lados del Atlántico.',url:'https://nerdearla.com/',online:true}
]; /*__EVENTOS__*/
/* markdown mínimo → HTML */
function mdToHtml(t){
  const inl=s=>esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g,'<i>$1</i>');
  const lines=String(t||'').split('\n'); let html='', ul=false;
  for(const raw of lines){ const l=raw.trim();
    if(!l){ if(ul){html+='</ul>';ul=false;} continue; }
    if(/^#{1,4}\s+/.test(l)){ if(ul){html+='</ul>';ul=false;} html+='<h4>'+inl(l.replace(/^#{1,4}\s+/,''))+'</h4>'; continue; }
    if(/^([•\-\*]|\d+[.)])\s+/.test(l)){ if(!ul){html+='<ul>';ul=true;} html+='<li>'+inl(l.replace(/^([•\-\*]|\d+[.)])\s+/,''))+'</li>'; continue; }
    if(ul){html+='</ul>';ul=false;} html+='<p>'+inl(l)+'</p>';
  }
  if(ul) html+='</ul>'; return html;
}
function aiFootnote(n,m){ const d=new Date(); return `<div class="ai-foot">✨ Generado por IA a partir de ${n} titulares${m?(' de '+m+' medios'):''} · ${d.toLocaleString('es-CO',{hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'})}. Es un resumen automático, no una fuente: puede contener errores. Verifica en los medios originales.</div>`; }
function nokeyHtml(){ return `<div class="nokey"><b>Necesitas tu clave de IA.</b> Estas funciones redactan texto con IA usando tu propia clave de Anthropic (se guarda solo en tu dispositivo). Ve a <b>Ajustes → Traducción y resúmenes con IA</b>, pega tu clave y vuelve. <div style="margin-top:10px"><button class="btn btn-negro btn-sm" onclick="switchTab('ajustes')">Ir a Ajustes →</button></div></div>`; }
async function aiComplete(system,user,maxTokens){
  const key=getKey(); if(!key) throw new Error('nokey');
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
    headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:maxTokens||1000,system,messages:[{role:'user',content:user}]})});
  const j=await r.json();
  if(j&&j.type==='error') throw new Error((j.error&&j.error.message)||'error de la API');
  if(j&&j.stop_reason==='refusal') throw new Error('la IA no pudo completar esta petición');
  const t=j&&j.content&&j.content[0]&&j.content[0].text; if(!t) throw new Error('sin respuesta'); return t.trim();
}
/* muestra equilibrada: tope por medio para que un editor de alto volumen no domine (clave para la neutralidad) */
function balancedSample(perCap,max){ const per={}, out=[]; for(const a of (FEED||[])){ per[a.outlet]=(per[a.outlet]||0)+1; if(per[a.outlet]<=perCap){ out.push(a); if(out.length>=max) break; } } return out; }
/* --- Resumen neutral del día --- */
async function buildResumen(){
  const box=$('#resumenOut');
  if(!getKey()){ box.innerHTML=nokeyHtml(); return; }
  if(!FEED.length){ box.innerHTML='<div class="ai-loading">Cargando titulares…</div>'; await buildFeed(); }
  const top=balancedSample(2,34);
  if(!top.length){ box.innerHTML='<div class="nokey">No hay titulares cargados. Abre la <b>Portada</b> y vuelve.</div>'; return; }
  const items=top.map(a=>{ const o=byId[a.outlet]; return '- '+a.title+(o?(' — '+o.nombre+' ('+biasWord(o)+')'):''); }).join('\n');
  box.innerHTML='<div class="ai-loading">Redactando un resumen neutral de '+top.length+' titulares…</div>';
  const system='Eres un editor de noticias imparcial y riguroso. Escribes SOLO a partir de los titulares que te dan, sin añadir hechos externos ni inventar. Separas los hechos de las opiniones. Español claro y neutral, sin adjetivos cargados. Nunca tomas partido político.';
  const user='Titulares reales de múltiples medios (con su medio y sesgo), de ahora mismo:\n\n'+items+'\n\nRedacta un RESUMEN NEUTRAL de lo más importante que ocurre en el mundo, en 6-9 viñetas breves agrupadas por tema (usa **negrita** para el tema al inicio de cada viñeta). Reglas: usa SOLO estos titulares; no inventes cifras ni hechos; si un titular es opinión o los medios discrepan, indícalo; sé conciso.';
  try{ const t=await aiComplete(system,user,1100);
    box.innerHTML='<div style="margin-bottom:10px"><button class="btn btn-negro btn-sm" id="btnEscuchar">🔊 Escuchar</button></div><div class="ai-card">'+mdToHtml(t)+'</div>'+aiFootnote(top.length,new Set(top.map(a=>a.outlet)).size);
    const plain=String(t).replace(/[*#>_`]/g,'').replace(/\n+/g,'. ');
    $('#btnEscuchar').addEventListener('click',e=>speakText(plain,e.currentTarget));
  }
  catch(e){ box.innerHTML='<div class="nokey"><b>No se pudo generar.</b> '+esc(e.message==='nokey'?'Falta la clave de IA (Ajustes).':e.message)+'</div>'; }
}
/* voz del navegador (gratis, sin clave): leer el resumen en voz alta */
let _speaking=false;
function speakText(text,btn){
  if(!('speechSynthesis' in window)){ toast('Tu navegador no puede leer en voz alta'); return; }
  if(_speaking){ speechSynthesis.cancel(); _speaking=false; if(btn)btn.innerHTML='🔊 Escuchar'; return; }
  const u=new SpeechSynthesisUtterance(text); u.lang=(ST.lang==='es'?'es-ES':ST.lang); u.rate=1.02;
  const vs=speechSynthesis.getVoices(); const v=vs.find(x=>/es/i.test(x.lang)); if(v)u.voice=v;
  u.onend=()=>{ _speaking=false; if(btn)btn.innerHTML='🔊 Escuchar'; };
  u.onerror=()=>{ _speaking=false; if(btn)btn.innerHTML='🔊 Escuchar'; };
  speechSynthesis.cancel(); speechSynthesis.speak(u); _speaking=true; if(btn)btn.innerHTML='⏸ Detener';
}
/* --- El mismo hecho, muchas voces (espectro + IA) --- */
function vocesSpectrum(){
  const q=($('#vocesQ').value||'').trim().toLowerCase();
  const spec=$('#vocesSpectrum'); $('#vocesOut').innerHTML='';
  if(!(FEED||[]).length){ spec.innerHTML='<div class="nokey">Abre la <b>Portada</b> para cargar titulares y vuelve.</div>'; return null; }
  const list = q ? FEED.filter(a=>{ const o=byId[a.outlet]; return (a.title+' '+(a.desc||'')+' '+(o?o.nombre:'')).toLowerCase().includes(q); }) : balancedSample(4,180);
  if(!list.length){ spec.innerHTML='<div class="empty"><div class="ic">🔀</div><p>Sin titulares sobre “'+esc(q)+'”. Prueba otro tema o actualiza la Portada.</p></div>'; return null; }
  const groups={izq:[],centro:[],der:[]};
  list.forEach(a=>{ const o=byId[a.outlet]; if(!o)return; const c=biasClass(o); const b=(c==='izq'||c==='ci')?'izq':(c==='cd'||c==='der')?'der':'centro'; groups[b].push({a,o}); });
  const col=(key,tit)=>{ const arr=groups[key].slice(0,7);
    const its=arr.length? arr.map(x=>`<a class="spec-item" href="${esc(x.a.link)}" target="_blank" rel="noopener">${esc(x.a.title)}<span class="src">${esc(x.o.nombre)}${x.o.sesgo==='estatal'?' · estatal':''}</span></a>`).join('') : '<div class="spec-empty">Sin titulares de este lado</div>';
    return `<div class="spec-col ${key}"><div class="spec-h">${tit}<span class="n">${groups[key].length}</span></div>${its}</div>`; };
  spec.innerHTML='<div class="spectrum">'+col('izq','⬅️ Izquierda')+col('centro','⏺️ Centro')+col('der','Derecha ➡️')+'</div>';
  return {q,groups};
}
async function buildVocesIA(){
  const data=vocesSpectrum(); const out=$('#vocesOut'); if(!data) return;
  if(!getKey()){ out.innerHTML=nokeyHtml(); return; }
  const total=data.groups.izq.length+data.groups.centro.length+data.groups.der.length;
  if(total<2){ out.innerHTML='<div class="nokey">Hacen falta más titulares sobre el tema para comparar. Actualiza la Portada o prueba otro tema.</div>'; return; }
  const fmt=g=>g.slice(0,7).map(x=>'- '+x.a.title+' ('+x.o.nombre+')').join('\n')||'(sin titulares de este lado)';
  out.innerHTML='<div class="ai-loading">Comparando cómo lo cuentan los distintos medios…</div>';
  const system='Eres un analista de medios imparcial. Comparas coberturas SOLO a partir de los titulares dados, sin inventar. Distingues el hecho del encuadre/opinión. Español neutral. No tomas partido.';
  const user='Tema: '+(data.q||'la actualidad de hoy')+'\n\nTitulares de medios de IZQUIERDA:\n'+fmt(data.groups.izq)+'\n\nTitulares de CENTRO:\n'+fmt(data.groups.centro)+'\n\nTitulares de DERECHA:\n'+fmt(data.groups.der)+'\n\nCon SOLO estos titulares, responde en secciones con estos títulos exactos (en negrita):\n**Hechos en común** — lo que todos reportan.\n**Cómo lo enmarca cada lado** — izquierda, centro y derecha, con ejemplos breves.\n**Síntesis neutral** — 2-3 frases equilibradas.\nNo inventes datos; si un lado no tiene titulares, dilo.';
  try{ const t=await aiComplete(system,user,1200); out.innerHTML='<div class="ai-card">'+mdToHtml(t)+'</div>'+aiFootnote(total,new Set([...data.groups.izq,...data.groups.centro,...data.groups.der].map(x=>x.o.id)).size); }
  catch(e){ out.innerHTML='<div class="nokey"><b>No se pudo analizar.</b> '+esc(e.message)+'</div>'; }
}
/* --- Eventos que conectan --- */
const EV_TIPO={tech:'💻 Tecnología',ia:'🤖 IA',startup:'🚀 Startups',gaming:'🎮 Gaming',summit:'🌐 Cumbre',networking:'🤝 Networking',ciencia:'🔬 Ciencia',cultura:'🎭 Cultura'};
const EV_MES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function evCard(e){
  const d=new Date(e.iso+'T00:00:00Z'); const ok=!isNaN(d);
  const dd=ok?d.getUTCDate():'—', mm=ok?EV_MES[d.getUTCMonth()]:'', yy=ok?(''+d.getUTCFullYear()).slice(2):'';
  return `<div class="evcard">
    <div class="ev-top">
      <div class="ev-date"><div class="d">${dd}</div><div class="m">${mm}</div><div class="y">'${yy}</div></div>
      <div style="min-width:0"><div class="ev-nm">${esc(e.nombre)}</div><div class="ev-meta">${esc(e.fecha)} · ${esc(e.ciudad)}${e.pais?(', '+esc(e.pais)):''}</div></div>
    </div>
    <div class="ev-desc">${esc(e.desc)}</div>
    <div class="ev-chips"><span class="ev-tipo">${EV_TIPO[e.tipo]||esc(e.tipo)}</span>${e.online?'<span class="ev-online">🌐 En línea</span>':''}${e.url?`<a class="ev-link" href="${esc(e.url)}" target="_blank" rel="noopener">Web ↗</a>`:''}</div>
  </div>`;
}
function buildAgenda(){
  const grid=$('#agendaGrid'); if(!grid) return;
  const tipo=$('#agendaTipo').value, online=$('#agendaOnline').checked;
  const list=EVENTOS.filter(e=>(tipo==='todos'||e.tipo===tipo)&&(!online||e.online));
  grid.innerHTML = list.length? list.map(evCard).join('') : '<div class="empty" style="grid-column:1/-1"><div class="ic">📅</div><p>No hay eventos con ese filtro.</p></div>';
}
function selectPrismaSeg(s){
  $$('#prismaSeg .segbtn').forEach(x=>x.classList.toggle('on',x.dataset.s===s));
  $$('#v-prisma .seg-view').forEach(v=>v.classList.toggle('on',v.id==='s-'+s));
  if(s==='agenda') buildAgenda();
}

/* ============================================================
   ARCHIVO · histórico (Internet Archive · TV News · Wayback)
   ============================================================ */
const FEATURED_DOCS=[
  {id:'TheInternetsOwnBoyTheStoryOfAaronSwartz',t:'El chico de internet: la historia de Aaron Swartz',y:'2014',tema:'tecnología',d:'El activista que soñó con liberar el conocimiento y el caso que lo llevó al límite.'},
  {id:'the-world-at-war-1973-thames-television-world-war-two',t:'El mundo en guerra',y:'1973',tema:'historia',d:'La serie definitiva sobre la Segunda Guerra Mundial, con testimonios de sus protagonistas.'},
  {id:'CosmosAPersonalVoyage',t:'Cosmos: un viaje personal',y:'1980',tema:'ciencia',d:'Carl Sagan nos lleva por el universo en la serie de divulgación más querida de la historia.'},
  {id:'ConnectionsByJamesBurke',t:'Connections (James Burke)',y:'1978',tema:'ciencia',d:'Cómo un invento lleva a otro: la historia de la tecnología contada como un thriller.'},
  {id:'TheCenturyOfTheSelfPart1',t:'El siglo del yo (Adam Curtis)',y:'2002',tema:'historia',d:'Cómo el psicoanálisis y la publicidad moldearon el consumo y la política del siglo XX.'},
  {id:'Apollo1116mmOnboardFilm',t:'Apolo 11: película original a bordo',y:'1969',tema:'ciencia',d:'Las imágenes originales en 16mm de la misión que llevó al ser humano a la Luna.'},
  {id:'LaEducacionProhibida-WithEnglishSubtitles',t:'La Educación Prohibida',y:'2012',tema:'español',d:'Un recorrido por otras formas de educar. Documental independiente en español.'},
  {id:'documental_con_animo_de_lucro',t:'Con ánimo de lucro',y:'2006',tema:'español',d:'Sobre los derechos de autor en la era digital. En español.'},
  {id:'battle_of_san_pietro',t:'La batalla de San Pietro (John Huston)',y:'1945',tema:'historia',d:'El clásico bélico de John Huston, filmado en el frente italiano de la II Guerra Mundial.'},
  {id:'nanookOfTheNorth1922',t:'Nanook, el esquimal',y:'1922',tema:'historia',d:'El primer gran documental de la historia del cine: la vida en el Ártico.'},
  {id:'ChelovekskinoapparatomManWithAMovieCamera',t:'El hombre de la cámara',y:'1929',tema:'historia',d:'Obra maestra de la vanguardia soviética: un día en la ciudad, sin actores ni guion.'},
  {id:'DuckandC1951',t:'Duck and Cover',y:'1951',tema:'historia',d:'La famosa propaganda de la Guerra Fría que enseñaba a los niños a "protegerse" de una bomba atómica.'},
];
const IA_SAFE='collection:(prelinger OR academic_films OR nasa OR usnationalarchives OR computerchronicles OR classic_tv)';
async function iaSearch(q,rows,sort){
  const u='https://archive.org/advancedsearch.php?q='+enc(q)+'&fl[]=identifier&fl[]=title&fl[]=year&sort[]='+enc(sort||'downloads desc')+'&rows='+(rows||24)+'&output=json';
  const r=await fetch(u); const j=await r.json(); return (j.response&&j.response.docs)||[];
}
const iaThumb=id=>'https://archive.org/services/img/'+id;
function openArchive(id){
  const box=$('#modalBox'); box.className='box';
  $('#modalInner').innerHTML=`<iframe class="vframe" src="https://archive.org/embed/${esc(id)}" allow="fullscreen" allowfullscreen frameborder="0"></iframe>
    <a href="https://archive.org/details/${esc(id)}" target="_blank" rel="noopener" style="display:block;text-align:center;background:#111;color:#fff;font-size:12.5px;font-weight:700;padding:9px;text-decoration:none">Ver en Internet Archive ↗</a>`;
  $('#modal').classList.add('on');
}
function archCard(d,badge){
  const id=d.identifier||d.id, c=el('div','vcard');
  c.innerHTML=`<div class="vth" style="background-image:url('${esc(iaThumb(id))}')"><div class="play">▶</div>${(d.y||d.year)?`<span class="yr">${esc(d.y||d.year)}</span>`:''}${badge?`<span class="arch-badge">${esc(badge)}</span>`:''}</div>
    <div class="vb"><div class="vt">${esc(d.t||d.title)}</div>${d.d?`<div class="vs" style="-webkit-line-clamp:2;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden">${esc(d.d)}</div>`:''}${d.tema?`<span class="doc-tema">${esc(d.tema)}</span>`:''}</div>`;
  c.addEventListener('click',()=>openArchive(id));
  return c;
}
function renderFeaturedDocs(){ const g=$('#docGrid'); if(!g)return; $('#docTitulo').textContent='★ Documentales destacados (curados por Prisma)'; g.innerHTML=''; FEATURED_DOCS.forEach(d=>g.appendChild(archCard(d,'documental'))); }
async function buildDocs(){
  const q=($('#docQ').value||'').trim();
  if(!q){ renderFeaturedDocs(); return; }
  const g=$('#docGrid'); $('#docTitulo').textContent='Resultados de archivo para “'+q+'”'; g.innerHTML='';
  for(let i=0;i<6;i++) g.appendChild(el('div','sk','<div class="a"></div><div class="b"><div class="l"></div><div class="l s"></div></div>'));
  let docs=[]; try{ docs=await iaSearch('mediatype:movies AND '+IA_SAFE+' AND ('+q+')',30); }catch(e){}
  g.innerHTML='';
  if(!docs.length){ g.appendChild(el('div','empty','<div class="ic">📼</div><p>Sin resultados en los archivos de confianza para “'+esc(q)+'”. Prueba otro tema o mira los destacados.</p>')); return; }
  docs.forEach(d=>g.appendChild(archCard(d,'archivo')));
}
async function buildHemeroteca(){
  const q=($('#hemQ').value||'').trim(), year=$('#hemYear').value, out=$('#hemOut');
  if(!q){ out.innerHTML='<div class="empty"><div class="ic">📰</div><p>Escribe un tema histórico para buscar en el archivo (ej. “muro de Berlín”, “11 de septiembre”, “elecciones 2010”).</p></div>'; return; }
  out.innerHTML='<div class="ai-loading">Buscando “'+esc(q)+'” en el archivo de televisión y prensa…</div>';
  let tv=[]; try{ let tq='collection:tvnews AND ('+q+')'; if(year) tq+=' AND year:'+year; tv=await iaSearch(tq,24,'-date'); }catch(e){}
  let arts=[]; try{ await probeProxy(); let gu='https://api.gdeltproject.org/api/v2/doc/doc?query='+enc(q)+'&mode=artlist&format=json&maxrecords=30&sort=datedesc'; if(year){ gu+='&startdatetime='+year+'0101000000&enddatetime='+year+'1231235959'; } const raw=await fetchViaAny(gu,9000); const j=JSON.parse(raw); arts=(j&&j.articles)||[]; }catch(e){}
  if(!tv.length && !arts.length){ out.innerHTML='<div class="empty"><div class="ic">🕰️</div><p>Sin resultados para “'+esc(q)+'”'+(year?(' en '+year):'')+'. Prueba con otras palabras o quita el año.</p></div>'; return; }
  let html='';
  if(tv.length) html+='<div class="arch-h">📺 En televisión <span class="n">· '+tv.length+' emisiones reales · toca para verlas</span></div><div class="vgrid" id="hemTv"></div>';
  if(arts.length) html+='<div class="arch-h">📰 En la prensa <span class="n">· fuente: GDELT'+(year?(' · '+year):'')+'</span></div><div id="hemPress"></div>';
  out.innerHTML=html;
  if(tv.length){ const g=$('#hemTv'); tv.forEach(d=>g.appendChild(archCard(d,'TV'))); }
  if(arts.length){ const p=$('#hemPress'); arts.forEach(a=>{ const dt=parseGdeltDate(a.seendate), dom=(a.domain||'').replace(/^www\./,''), o=DOMAIN_IDX[dom]?byId[DOMAIN_IDX[dom]]:null;
    const row=el('div','hemarticle'); row.innerHTML=`<span class="hem-dt">${dt?new Date(dt).toLocaleDateString('es-CO',{year:'2-digit',month:'short',day:'numeric'}):''}</span><div style="min-width:0"><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a><div class="hem-src">${esc(o?o.nombre:dom)}</div></div>`; p.appendChild(row); }); }
}
const WB_SRCS=['nyt','bbc','guardian','elpais','eltiempo','espectador','clarin','lajornada','cnn','wapo'];
async function buildWayback(){
  const date=$('#wbDate').value, id=$('#wbSrc').value, out=$('#wbOut');
  if(!date||!byId[id]){ out.innerHTML='<div class="empty"><p>Elige una fecha y un periódico.</p></div>'; return; }
  const o=byId[id]; let domain; try{ domain=new URL(o.sitio).hostname.replace(/^www\./,''); }catch(e){ domain=o.sitio; }
  const ts=date.replace(/-/g,'');
  out.innerHTML='<div class="ai-loading">Buscando la portada de '+esc(o.nombre)+' del '+esc(date)+'…</div>';
  try{
    // este endpoint del archivo NO manda cabecera CORS: hay que pedirlo por puente
    const raw=await fetchText('https://archive.org/wayback/available?url='+enc(domain)+'&timestamp='+ts,{timeout:9000});
    const j=JSON.parse(raw); const snap=j&&j.archived_snapshots&&j.archived_snapshots.closest;
    if(snap&&snap.url){ const s=snap.timestamp; const fecha=s.slice(6,8)+'/'+s.slice(4,6)+'/'+s.slice(0,4);
      out.innerHTML=`<div class="wb-card"><div class="em">📜</div><div style="flex:1;min-width:0"><div class="t">${esc(o.nombre)} · ${fecha}</div><div class="s">Instantánea más cercana a la fecha que pediste, guardada por la Wayback Machine.</div></div><a class="btn btn-negro btn-sm" href="${esc(snap.url.replace('http://','https://'))}" target="_blank" rel="noopener">Ver la portada archivada ↗</a></div>`;
    } else out.innerHTML='<div class="empty"><div class="ic">📭</div><p>No hay copia archivada de '+esc(o.nombre)+' cerca del '+esc(date)+'. Prueba otra fecha (los archivos son más completos desde ~2000) u otro periódico.</p></div>';
  }catch(e){ out.innerHTML='<div class="nokey">No se pudo consultar el archivo ahora. Reintenta en un momento.</div>'; }
}
function initArchivo(){
  const y=$('#hemYear'); if(y && !y._built){ y._built=true; const now=new Date().getFullYear(); let o='<option value="">Cualquiera</option>'; for(let yr=now; yr>=2009; yr--) o+='<option value="'+yr+'">'+yr+'</option>'; y.innerHTML=o; }
  const sel=$('#wbSrc'); if(sel && !sel._built){ sel._built=true; sel.innerHTML=WB_SRCS.filter(id=>byId[id]).map(id=>`<option value="${id}">${esc(byId[id].nombre)}</option>`).join(''); }
  const dt=$('#wbDate'); if(dt && !dt.value) dt.value='2001-09-11';
  const pr=$('#wbPresets'); if(pr && !pr._built){ pr._built=true;
    pr._data=[['11-S · 2001','2001-09-11','nyt'],['Caída del Muro · 1989','1989-11-10','nyt'],['Obama gana · 2008','2008-11-05','nyt'],['Pandemia declarada · 2020','2020-03-11','elpais'],['Paz en Colombia · 2016','2016-09-27','eltiempo']];
    pr.innerHTML=pr._data.map((p,i)=>`<button class="wb-preset" data-i="${i}">${esc(p[0])}</button>`).join('');
    pr.addEventListener('click',e=>{ const b=e.target.closest('.wb-preset'); if(!b)return; const p=pr._data[+b.dataset.i]; $('#wbDate').value=p[1]; $('#wbSrc').value=p[2]; buildWayback(); });
  }
  renderFeaturedDocs();
}
function selectArchivoSeg(s){
  $$('#archivoSeg .segbtn').forEach(x=>x.classList.toggle('on',x.dataset.s===s));
  $$('#v-archivo .seg-view').forEach(v=>v.classList.toggle('on',v.id==='s-'+s));
}

/* ============================================================
   COMUNIDAD · noticias locales + desmentidos + reportar
   ============================================================ */
function gnewsUrl(q,loc){ const L=loc==='en'?['en-US','US','US:en']:['es-419','CO','CO:es-419']; return 'https://news.google.com/rss/search?q='+enc(q)+'&hl='+L[0]+'&gl='+L[1]+'&ceid='+L[2]; }
async function fetchGnews(url){
  await probeProxy();
  let xml; try{ xml=await fetchViaAny(url,9000); }catch(e){ try{ xml=await fetchText(url,{timeout:9000}); }catch(e2){ return []; } }
  let doc; try{ doc=new DOMParser().parseFromString(xml,'text/xml'); }catch(e){ return []; }
  return [...doc.getElementsByTagName('item')].map(n=>{
    let t=tagText(n,'title'); const link=tagText(n,'link');
    const se=n.getElementsByTagName('source')[0]; const src=(se&&se.textContent)||'';
    t=t.replace(/\s+[-–|]\s+[^-–|]{2,45}$/,'').trim();
    return { title:t, link, ts:Date.parse(tagText(n,'pubDate'))||0, src };
  }).filter(a=>a.title);
}
function newsRow(a,srcHtml){
  const row=el('div','hemarticle');
  row.innerHTML=`<span class="hem-dt">${a.ts?timeAgo(a.ts):''}</span><div style="min-width:0"><a href="${esc(a.link)}" target="_blank" rel="noopener">${esc(a.title)}</a>${srcHtml||(a.src?`<div class="hem-src">${esc(a.src)}</div>`:'')}</div>`;
  return row;
}
/* --- Mi pueblo (hiperlocal) --- */
function localChips(){ const c=$('#localChips'); if(!c)return; const L=ST.lugares||[];
  c.innerHTML=L.length? L.map((p,i)=>`<button class="fchip2" data-pick="${esc(p)}">📍 ${esc(p)} <span class="x" data-del="${i}">✕</span></button>`).join('') : ''; }
async function buildLocal(place){
  const q=(place||$('#localQ').value||'').trim(); const out=$('#localOut');
  if(!q){ out.innerHTML='<div class="empty"><div class="ic">🏘️</div><p>Escribe tu municipio (o vereda) para ver sus noticias — hasta los pueblos más pequeños.</p></div>'; return; }
  ST.lugares=ST.lugares||[]; if(!ST.lugares.includes(q)){ ST.lugares.unshift(q); ST.lugares=ST.lugares.slice(0,6); save(); localChips(); }
  out.innerHTML='<div class="ai-loading">Buscando noticias de '+esc(q)+'…</div>';
  const arts=await fetchGnews(gnewsUrl('"'+q+'" Colombia when:21d','es'));
  if(!arts.length){ out.innerHTML='<div class="empty"><div class="ic">📭</div><p>No encontramos noticias recientes de “'+esc(q)+'”. Prueba con el nombre exacto del municipio o con su departamento.</p></div>'; return; }
  out.innerHTML='<div class="arch-h">📍 Lo último de '+esc(q)+' <span class="n">· '+arts.length+' notas de medios locales y regionales</span></div>';
  const box=el('div',''); arts.slice(0,40).forEach(a=>box.appendChild(newsRow(a))); out.appendChild(box);
}
/* --- Desmentidos (verificadores profesionales) --- */
const FACTCHECK=[
  {n:'Colombiacheck',d:'colombiacheck.com',loc:'es',f:'🇨🇴'},
  {n:'La Silla · Detector',d:'lasillavacia.com',loc:'es',f:'🇨🇴'},
  {n:'Maldita.es',d:'maldita.es',loc:'es',f:'🇪🇸'},
  {n:'Newtral',d:'newtral.es',loc:'es',f:'🇪🇸'},
  {n:'Chequeado',d:'chequeado.com',loc:'es',f:'🇦🇷'},
  {n:'AFP Factual',d:'factual.afp.com',loc:'es',f:'🌎'},
  {n:'EFE Verifica',d:'verifica.efe.com',loc:'es',f:'🌎'},
  {n:'Snopes',d:'snopes.com',loc:'en',f:'🇺🇸'},
  {n:'PolitiFact',d:'politifact.com',loc:'en',f:'🇺🇸'},
  {n:'Full Fact',d:'fullfact.org',loc:'en',f:'🇬🇧'},
];
async function buildDesmentidos(query){
  const out=$('#fcOut'); const q=(query||'').trim();
  out.innerHTML='<div class="ai-loading">'+(q?('Buscando chequeos sobre “'+esc(q)+'”…'):'Trayendo los últimos desmentidos…')+'</div>';
  const results=await mapLimit(FACTCHECK,5,async fc=>{
    const term=(q?('"'+q+'" '):'')+'site:'+fc.d+(q?' when:180d':' when:20d');
    try{ const arts=await fetchGnews(gnewsUrl(term,fc.loc)); return arts.slice(0,q?4:3).map(a=>Object.assign({},a,{fc})); }catch(e){ return []; }
  });
  let all=results.flat().filter(x=>x.title); all.sort((a,b)=>b.ts-a.ts);
  if(!all.length){ out.innerHTML='<div class="empty"><div class="ic">🔍</div><p>'+(q?('No hay chequeos publicados sobre “'+esc(q)+'”. Que nadie lo haya verificado no lo hace cierto ni falso: tómalo con cuidado y no lo reenvíes sin confirmar.'):'No pudimos traer los desmentidos ahora. Reintenta en un momento.')+'</p></div>'; return; }
  out.innerHTML='<div class="arch-h">🔍 '+(q?('Chequeos sobre “'+esc(q)+'”'):'Últimos desmentidos')+' <span class="n">· '+all.length+' · de verificadores profesionales</span></div>';
  const box=el('div',''); all.slice(0,40).forEach(x=>box.appendChild(newsRow(x,`<div class="hem-src">${x.fc.f} ${esc(x.fc.n)}</div>`))); out.appendChild(box);
}
/* --- Reportar (periodismo ciudadano + revisión con IA) --- */
function reportCard(r){
  const st=r.verif?(r.verif.nivel||'revisado por IA'):'sin verificar';
  const stCls=!r.verif?'cred baja':(/alta/i.test(st)?'cred alta':/baja|dudos|contradice/i.test(st)?'cred baja':'cred media');
  let vhtml=''; if(r.verif) vhtml='<div class="ai-card" style="margin-top:10px;border-left-color:#7a4fd6">'+mdToHtml(r.verif.texto)+'</div><div class="ai-foot">🤖 Revisión automática con IA · NO confirma los hechos, solo ayuda a verificar. Contrástalo con las fuentes.</div>';
  const c=el('div','chan'); c.style.borderTopColor='#0891b2';
  c.innerHTML=`<div class="chan-h"><div><div class="nm">${esc(r.title)}</div><div class="meta">${r.place?('📍 '+esc(r.place)+' · '):''}${new Date(r.ts).toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'})} · reporte ciudadano</div></div><span class="cred ${stCls.split(' ')[1]}" style="text-transform:none">${esc(st)}</span></div>
    <div class="hist" style="white-space:pre-wrap">${esc(r.body)}</div>
    ${r.link?`<div class="chan-links"><a href="${esc(r.link)}" target="_blank" rel="noopener">🔗 Fuente aportada</a></div>`:''}
    ${vhtml}
    <div class="chan-links"><button class="rep-share" style="all:unset;cursor:pointer;font-size:11.5px;font-weight:800;padding:6px 10px;border-radius:8px;border:1.5px solid var(--linea)">↗ Compartir</button>${!r.verif&&getKey()?'<button class="rep-check" style="all:unset;cursor:pointer;font-size:11.5px;font-weight:800;padding:6px 10px;border-radius:8px;border:1.5px solid var(--linea);color:var(--izq)">🔎 Revisar con IA</button>':''}<button class="rep-del" style="all:unset;cursor:pointer;font-size:11.5px;font-weight:800;padding:6px 10px;border-radius:8px;border:1.5px solid var(--linea);color:var(--rojo)">Eliminar</button></div>`;
  c.querySelector('.rep-share').addEventListener('click',()=>shareArticle('[Reporte ciudadano · SIN VERIFICAR] '+r.title, r.link||location.href));
  const chk=c.querySelector('.rep-check'); if(chk) chk.addEventListener('click',()=>verifyReport(r));
  c.querySelector('.rep-del').addEventListener('click',()=>{ ST.reports=(ST.reports||[]).filter(x=>x.id!==r.id); save(); renderReports(); });
  return c;
}
function renderReports(){ const list=$('#repList'), h=$('#repListH'); const rs=ST.reports||[]; if(h)h.style.display=rs.length?'flex':'none'; if(list){ list.innerHTML=''; rs.forEach(r=>list.appendChild(reportCard(r))); } }
async function verifyReport(r){
  if(!getKey()){ toast('Pon tu clave de IA en Ajustes para revisar'); return; }
  const out=$('#repOut'); if(out) out.innerHTML='<div class="ai-loading">Revisando “'+esc(r.title)+'” y comparándolo con las noticias reales…</div>';
  const ctx=balancedSample(1,40).map(a=>'- '+a.title).join('\n');
  const system='Eres un ASISTENTE de verificación periodística, prudente y honesto. NO confirmas ni declaras verdadero/falso un hecho: AYUDAS a verificar. Español claro. No difamas. Si el reporte acusa a una persona concreta sin pruebas, adviértelo con claridad.';
  const user='REPORTE CIUDADANO (sin verificar):\nTitular: '+r.title+'\nRelato: '+r.body+(r.place?('\nLugar: '+r.place):'')+(r.link?('\nFuente aportada: '+r.link):'\nFuente: ninguna')+'\n\nTITULARES REALES recientes (para contrastar):\n'+ctx+'\n\nHaz una REVISIÓN en secciones con estos títulos exactos en negrita:\n**Qué se puede comprobar** — afirmaciones verificables y cómo.\n**Señales de alerta** — falta de fuente, sensacionalismo, posible difamación, parecido a bulos; si no hay, dilo.\n**¿Coincide con lo que reportan los medios?** — usa SOLO los titulares dados; di si contradice, coincide o no aparece.\n**Plausibilidad** — una palabra (alta / media / baja / sin poder evaluar) y por qué; recuerda que sin fuente no se puede confirmar.\nSé breve y prudente.';
  try{ const t=await aiComplete(system,user,900);
    const nm=t.match(/plausibilidad[^\n]*?(alta|media|baja|sin poder evaluar)/i);
    r.verif={ texto:t, nivel:'IA: plausibilidad '+(nm?nm[1].toLowerCase():'revisada') }; save();
    if(out) out.innerHTML='<div class="note" style="border-left-color:#7a4fd6"><b>Revisión lista.</b> Es una ayuda automática, no una confirmación. Mírala abajo en “Mis reportes”.</div>';
    renderReports();
  }catch(e){ if(out) out.innerHTML='<div class="nokey"><b>No se pudo revisar.</b> '+esc(e.message)+'</div>'; }
}
async function submitReport(){
  const title=($('#repTitle').value||'').trim(), body=($('#repBody').value||'').trim();
  const place=($('#repPlace').value||'').trim(), link=($('#repLink').value||'').trim();
  if(!title||body.length<15){ toast('Escribe un titular y cuenta el hecho con algo de detalle'); return; }
  const r={ id:'r'+Date.now(), title, body, place, link, ts:Date.now(), verif:null };
  ST.reports=ST.reports||[]; ST.reports.unshift(r); save();
  $('#repTitle').value=''; $('#repBody').value=''; $('#repPlace').value=''; $('#repLink').value=''; renderReports();
  if(!getKey()){ $('#repOut').innerHTML='<div class="nokey"><b>Reporte guardado como “sin verificar”.</b> Para la revisión con IA, pon tu clave en Ajustes. Puedes compartirlo igual (irá marcado como sin verificar).</div>'; return; }
  await verifyReport(r);
}
function initComunidad(){ localChips(); renderReports(); const L=ST.lugares||[]; if(L.length) buildLocal(L[0]); else if($('#localOut')) $('#localOut').innerHTML='<div class="empty"><div class="ic">🏘️</div><p>Escribe tu municipio (o vereda) para ver sus noticias — hasta los pueblos más pequeños.</p></div>'; }
function selectComunidadSeg(s){
  $$('#comunidadSeg .segbtn').forEach(x=>x.classList.toggle('on',x.dataset.s===s));
  $$('#v-comunidad .seg-view').forEach(v=>v.classList.toggle('on',v.id==='c-'+s));
  if(s==='desmentidos' && !$('#fcOut').innerHTML.trim()) buildDesmentidos('');
}

/* ============================================================
   NAVEGACIÓN / TABS
   ============================================================ */
const loaded={};
function switchTab(v){
  $$('.tab').forEach(t=>t.classList.toggle('on',t.dataset.v===v));
  $$('.view').forEach(s=>s.classList.toggle('on',s.id==='v-'+v));
  window.scrollTo({top:0,behavior:'smooth'});
  if(v==='mundo'){ if(!FEED.length) buildFeed().then(plotMap); else plotMap(); }
  if(v==='video'&&!loaded.video){ loaded.video=true; buildVideos(); }
  if(v==='shorts'&&!loaded.shorts){ loaded.shorts=true; buildShorts(); }
  if(v==='radio'&&!loaded.radio){ loaded.radio=true; buildRadio(); }
  if(v==='canales'&&!loaded.canales){ loaded.canales=true; buildChannels(); }
  if(v==='prisma'&&!loaded.prisma){ loaded.prisma=true; buildAgenda(); }
  if(v==='archivo'&&!loaded.archivo){ loaded.archivo=true; initArchivo(); }
  if(v==='comunidad'&&!loaded.comunidad){ loaded.comunidad=true; initComunidad(); }
}

/* ============================================================
   AJUSTES UI
   ============================================================ */
function syncSettingsUI(){
  $('#setLang').value=ST.lang; $('#setProxy').value=ST.proxy;
  if($('#setWorker')) $('#setWorker').value=ST.worker||'';
  $('#setAuto').classList.toggle('on',!!ST.auto);
  $('#fCat').value=ST.cat; $('#fReg').value=ST.reg;
  $$('#biasChips .bchip').forEach(b=>b.classList.toggle('on',b.dataset.b===ST.bias));
  // fuentes
  const sp=$('#srcpick'); if(sp && !sp._built){ sp._built=true; sp.innerHTML='';
    CATALOGO.forEach(o=>{ const l=el('label'); l.innerHTML=`<input type="checkbox" data-id="${o.id}" ${ST.off.includes(o.id)?'':'checked'}> ${esc(o.nombre)} <span style="color:#9a9da4;font-size:11px">· ${esc(o.pais)}</span>`;
      l.querySelector('input').addEventListener('change',e=>{ const id=e.target.dataset.id; if(e.target.checked)ST.off=ST.off.filter(x=>x!==id); else if(!ST.off.includes(id))ST.off.push(id); save(); });
      sp.appendChild(l); });
  }
  // selector de canal para video
  const fv=$('#fVideo'); if(fv&&!fv._built){ fv._built=true; fv.innerHTML='<option value="">Todos</option>'+CATALOGO.filter(o=>o.yt).map(o=>`<option value="${o.id}">${esc(o.nombre)}</option>`).join(''); }
}
function updateNet(){
  const on=navigator.onLine; const c=$('#netchip');
  c.className='chip-net '+(on?'on':'off'); $('#nettxt').textContent= on?'En línea':'Sin conexión';
}

/* ============================================================
   ARRANQUE
   ============================================================ */
function bind(){
  // tabs
  $('#tabs').addEventListener('click',e=>{ const t=e.target.closest('.tab'); if(t) switchTab(t.dataset.v); });
  // filtros portada
  let qT; $('#q').addEventListener('input',()=>{ clearTimeout(qT); qT=setTimeout(applyFeedFilters,240); });
  $('#fCat').addEventListener('change',e=>{ ST.cat=e.target.value; save(); applyFeedFilters(); });
  $('#fReg').addEventListener('change',e=>{ ST.reg=e.target.value; save(); buildFeed(); });
  $('#biasChips').addEventListener('click',e=>{ const b=e.target.closest('.bchip'); if(!b)return; ST.bias=b.dataset.b; save(); syncSettingsUI(); buildFeed(); });
  $('#btnRefresh').addEventListener('click',()=>{ Object.keys(memCache).forEach(k=>delete memCache[k]); buildFeed().then(maybeAutoTranslate); });
  $('#btnWorld').addEventListener('click',worldSearch);
  $('#viewSeg').addEventListener('click',e=>{ const b=e.target.closest('.segbtn'); if(!b)return; viewMode=b.dataset.view;
    $$('#viewSeg .segbtn').forEach(x=>x.classList.toggle('on',x===b));
    $('#viewHint').textContent = viewMode==='historias'?'Agrupada: la misma noticia en varios medios, con sus puntos ciegos.':(viewMode==='guardados'?'Tus noticias guardadas en este dispositivo.':'“Historias” agrupa la misma noticia y avisa de puntos ciegos.');
    applyFeedFilters(); });
  $('#q').addEventListener('keydown',e=>{ if(e.key==='Enter'){ clearTimeout(qT); applyFeedFilters(); } });
  $('#btnMore').addEventListener('click',renderMore);
  // video
  $('#fVideo').addEventListener('change',e=>buildVideos(e.target.value||null));
  $('#btnVideoAll').addEventListener('click',()=>{ $('#fVideo').value=''; buildVideos(); });
  // radio
  $('#btnRadioReload').addEventListener('click',buildRadio);
  $('#fRadioPais').addEventListener('change',buildRadio);
  let rT; $('#qRadio').addEventListener('input',()=>{ clearTimeout(rT); rT=setTimeout(buildRadio,400); });
  // canales
  let cT; $('#qChan').addEventListener('input',()=>{ clearTimeout(cT); cT=setTimeout(buildChannels,220); });
  $('#fChanBias').addEventListener('change',buildChannels); $('#fChanSort').addEventListener('change',buildChannels);
  // prisma
  $('#prismaSeg').addEventListener('click',e=>{ const b=e.target.closest('.segbtn'); if(b) selectPrismaSeg(b.dataset.s); });
  $('#btnResumen').addEventListener('click',buildResumen);
  $('#btnVoces').addEventListener('click',vocesSpectrum);
  $('#btnVocesIA').addEventListener('click',buildVocesIA);
  $('#vocesQ').addEventListener('keydown',e=>{ if(e.key==='Enter') vocesSpectrum(); });
  $('#agendaTipo').addEventListener('change',buildAgenda);
  $('#agendaOnline').addEventListener('change',buildAgenda);
  // archivo
  $('#archivoSeg').addEventListener('click',e=>{ const b=e.target.closest('.segbtn'); if(b) selectArchivoSeg(b.dataset.s); });
  $('#btnHem').addEventListener('click',buildHemeroteca);
  $('#hemQ').addEventListener('keydown',e=>{ if(e.key==='Enter') buildHemeroteca(); });
  $('#btnDoc').addEventListener('click',buildDocs);
  $('#docQ').addEventListener('keydown',e=>{ if(e.key==='Enter') buildDocs(); });
  $('#btnDocFeat').addEventListener('click',()=>{ $('#docQ').value=''; renderFeaturedDocs(); });
  $('#btnWb').addEventListener('click',buildWayback);
  // comunidad
  $('#comunidadSeg').addEventListener('click',e=>{ const b=e.target.closest('.segbtn'); if(b) selectComunidadSeg(b.dataset.s); });
  $('#btnLocal').addEventListener('click',()=>buildLocal());
  $('#localQ').addEventListener('keydown',e=>{ if(e.key==='Enter') buildLocal(); });
  $('#localChips').addEventListener('click',e=>{ const del=e.target.closest('[data-del]'); if(del){ e.stopPropagation(); const i=+del.dataset.del; ST.lugares.splice(i,1); save(); localChips(); return; } const b=e.target.closest('[data-pick]'); if(b){ $('#localQ').value=b.dataset.pick; buildLocal(b.dataset.pick); } });
  $('#btnFc').addEventListener('click',()=>buildDesmentidos($('#fcQ').value));
  $('#fcQ').addEventListener('keydown',e=>{ if(e.key==='Enter') buildDesmentidos($('#fcQ').value); });
  $('#btnFcRecent').addEventListener('click',()=>{ $('#fcQ').value=''; buildDesmentidos(''); });
  $('#btnReport').addEventListener('click',submitReport);
  // ajustes
  $('#setLang').addEventListener('change',e=>{ ST.lang=e.target.value; save(); });
  $('#setProxy').addEventListener('change',e=>{ ST.proxy=e.target.value; save(); toast('Puente actualizado'); });
  $('#btnSaveWorker').addEventListener('click',()=>{ ST.worker=($('#setWorker').value||'').trim(); save(); PROXY_WINNER=null; probeDone=null; Object.keys(memCache).forEach(k=>delete memCache[k]); toast(ST.worker?'Puente propio activado ✓':'Puente propio quitado'); });
  $('#setAuto').addEventListener('click',()=>{ ST.auto=!ST.auto; save(); syncSettingsUI(); if(ST.auto)maybeAutoTranslate(); });
  $('#btnSaveKey').addEventListener('click',()=>{ setKey($('#setKey').value.trim()); toast($('#setKey').value.trim()?'Clave guardada en este dispositivo':'Clave eliminada'); });
  $('#btnExport').addEventListener('click',exportData);
  $('#btnImport').addEventListener('click',importData);
  $('#btnClear').addEventListener('click',()=>{ if(confirm('¿Borrar tus preferencias y guardados de este navegador?')){ localStorage.removeItem(SK); ST={...defaults}; save(); syncSettingsUI(); toast('Datos borrados'); } });
  // modal
  $('#modalX').addEventListener('click',closeModal); $('#modal').addEventListener('click',e=>{ if(e.target.id==='modal')closeModal(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape')closeModal(); });
  // red
  window.addEventListener('online',updateNet); window.addEventListener('offline',updateNet);
}
function exportData(){
  const blob=new Blob([JSON.stringify({ST,ts:Date.now()},null,2)],{type:'application/json'});
  const a=el('a'); a.href=URL.createObjectURL(blob); a.download='prisma-respaldo.json'; a.click();
}
function importData(){
  const inp=el('input'); inp.type='file'; inp.accept='application/json';
  inp.onchange=()=>{ const f=inp.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{ try{ const d=JSON.parse(r.result); if(d.ST){ ST=Object.assign({},defaults,d.ST); save(); syncSettingsUI(); buildFeed(); toast('Respaldo restaurado'); } }catch(e){ toast('Archivo no válido'); } }; r.readAsText(f); };
  inp.click();
}
function clock(){ const d=new Date(); $('#clock').innerHTML=`<b>${d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</b><br>${d.toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'})}`; }

function init(){
  $('#yr').textContent=new Date().getFullYear();
  $('#chanCount').textContent=CATALOGO.length;
  clock(); setInterval(clock,30000);
  updateNet();
  bind();
  syncSettingsUI();
  buildFeed().then(maybeAutoTranslate);
  if('serviceWorker' in navigator){ try{ navigator.serviceWorker.register('sw-prisma.js'); }catch(e){} } // instalable + offline
}
async function boot(){
  try{ const r=await fetch('catalogo.json',{cache:'no-cache'}); if(r&&r.ok){ const data=await r.json(); if(Array.isArray(data)&&data.length) CATALOGO=data; } }
  catch(e){ /* sin red y sin caché del SW: arrancamos con lo que haya */ }
  buildIndexes();
  init();
}
document.addEventListener('DOMContentLoaded',boot);
