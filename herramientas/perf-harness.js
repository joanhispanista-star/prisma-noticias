// Arnés: carga las funciones reales de noticias.html en un vm con fetch simulado
// y prueba los arreglos de red (rotación de proxies, carrera paralela, timeouts).
const fs=require('fs'), vm=require('vm'), path=require('path');
const HTML=path.join('C:\\Users\\joanh\\OneDrive\\Desktop\\Joan te presta','noticias.html');
const html=fs.readFileSync(HTML,'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const src=scripts.sort((a,b)=>b.length-a.length)[0];

let MOCK=async()=>({ok:false,status:500,text:async()=>'',json:async()=>({})});
const hangFetch=(signal)=>new Promise((_,rej)=>{ if(signal) signal.addEventListener('abort',()=>rej(new Error('aborted'))); });

// stub de elemento para stripHtml (createElement('div'); innerHTML=..; textContent)
const makeEl=()=>{ let _t=''; return { set innerHTML(v){ _t=String(v).replace(/<[^>]*>/g,''); }, get textContent(){ return _t; }, set textContent(v){_t=v;}, style:{}, classList:{add(){},remove(){},contains(){return false;}}, appendChild(){}, addEventListener(){}, setAttribute(){}, }; };
const docStub={ addEventListener(){}, querySelector(){return null;}, querySelectorAll(){return [];}, getElementById(){return null;}, createElement:()=>makeEl(), head:{appendChild(){}}, body:{appendChild(){}}, documentElement:{} };

const ctx={
  fetch:(...a)=>MOCK(...a),
  AbortController, setTimeout, clearTimeout, setInterval, clearInterval,
  Promise, Date, Math, JSON, Set, Map, Array, Object, String, Number, Boolean, RegExp, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
  console,
  document:docStub,
  window:{}, navigator:{onLine:true, userAgent:'node', language:'es'},
  location:{href:'http://localhost/noticias.html', reload(){}},
  localStorage:{ getItem:()=>null, setItem(){}, removeItem(){} },
  DOMParser:function(){ this.parseFromString=()=>({ getElementsByTagName:()=>[] }); },
  speechSynthesis:{ getVoices:()=>[] }, matchMedia:()=>({matches:false,addEventListener(){}}),
};
ctx.window=ctx; ctx.self=ctx; ctx.globalThis=ctx;
vm.createContext(ctx);

try{ new vm.Script(src,{filename:'inline.js'}).runInContext(ctx,{timeout:8000}); }
catch(e){ console.log('❌ El script lanzó al cargar (top-level):',e.message); process.exit(1); }
console.log('✅ El <script> corre en top-level sin lanzar (funciones definidas, catálogo construido)');

// parseFeed determinista para aislar la lógica de red (parseFeed en sí no lo toqué)
ctx.parseFeed=(xml,outlet)=> String(xml).includes('GOOD') ? [{title:'t',link:'l',outlet:outlet.id,ts:1,desc:'',img:'',cats:[]}] : [];

const A='api.allorigins.win/raw', AG='api.allorigins.win/get', CT='api.codetabs.com', CE='cors.eu.org', R2='api.rss2json.com';
const GOOD='GOOD '+'<item>feed</item> '.repeat(6); // >60 chars (el código descarta cuerpos <60)
const okText=(t)=>({ok:true,status:200,text:async()=>t,json:async()=>JSON.parse(t)});
let pass=0, fail=0;
const check=(name,cond,extra='')=>{ (cond?pass++:fail++); console.log((cond?'  ✅ ':'  ❌ ')+name+(extra?'  '+extra:'')); };

(async()=>{
  // ---- TEST 1: probeProxy elige VARIOS ganadores y proxyChain los rota + dedup + nunca lidera con 'direct'
  console.log('\n[1] Sondeo de proxies (probeProxy) + reparto (proxyChain)');
  MOCK=async(u,opt)=>{ const s=String(u);
    if(s.includes(A)||s.includes(CT)) return okText('<?xml version="1.0"?><rss><channel><item><title>x</title></item></channel></rss>');
    if(s.includes(CE)) return {ok:false,status:503,text:async()=>''};
    return {ok:false,status:500,text:async()=>''};
  };
  await ctx.probeProxy();
  const c1=ctx.proxyChain('medio-a'), c2=ctx.proxyChain('medio-b'), c3=ctx.proxyChain('medio-cccc');
  check('proxyChain lidera con un ganador sano (no "direct")', c1[0]!=='direct' && (c1[0]==='allorigins'||c1[0]==='codetabs'), 'chain='+JSON.stringify(c1));
  check('sin duplicados en la cadena', new Set(c1).size===c1.length, JSON.stringify(c1));
  check('incluye todos los proxies base + direct al final', c1.includes('allorigins')&&c1.includes('corseu')&&c1.includes('codetabs')&&c1[c1.length-1]==='direct');
  const leads=new Set([c1[0],c2[0],c3[0]]);
  check('rota el líder entre medios (reparte carga, no "efecto rebaño")', leads.size>=2, 'líderes vistos='+[...leads].join(','));

  // ---- TEST 2: raceProxies devuelve al 1º que responde SIN esperar al que se cuelga
  console.log('\n[2] Carrera en paralelo (raceProxies): gana el rápido, no espera al colgado');
  MOCK=async(u,opt)=>{ const s=String(u);
    if(s.includes(A)) return new Promise(res=>setTimeout(()=>res(okText(GOOD)),40));      // rápido, OK
    if(s.includes(CT)) return hangFetch(opt&&opt.signal);                                     // se cuelga
    return {ok:false,text:async()=>''};
  };
  let t=Date.now(); const items=await ctx.raceProxies('http://x',['allorigins','codetabs'],{id:'o'},6000); let dt=Date.now()-t;
  check('devuelve items del proxy rápido', Array.isArray(items)&&items.length===1, 'items='+JSON.stringify(items));
  check('no esperó al proxy colgado (<800ms, no 6000)', dt<800, 'dt='+dt+'ms');

  // ---- TEST 3: fetchJsonT SÍ aborta por timeout (antes los fallbacks NO tenían límite → colas de minutos)
  console.log('\n[3] fetchJsonT respeta el timeout (arreglo de los fallbacks sin AbortController)');
  MOCK=async(u,opt)=>hangFetch(opt&&opt.signal);
  t=Date.now(); let threw=false; try{ await ctx.fetchJsonT('http://x',300); }catch(e){ threw=true; } dt=Date.now()-t;
  check('aborta y lanza al vencer el timeout', threw, 'dt='+dt+'ms');
  check('aborta cerca del timeout (250-900ms), no cuelga', dt>=250&&dt<900, 'dt='+dt+'ms');

  // ---- TEST 4: fetchOutletItems camino feliz (feed real por el líder)
  console.log('\n[4] fetchOutletItems: camino feliz y presupuesto por medio');
  MOCK=async(u,opt)=>{ const s=String(u); if(s.includes(A)||s.includes(CT)) return okText(GOOD); return {ok:false,text:async()=>''}; };
  t=Date.now(); let out=await ctx.fetchOutletItems({id:'m1',rss:['http://feed1']}); dt=Date.now()-t;
  check('devuelve items cuando el líder responde', Array.isArray(out)&&out.length===1, 'items='+out.length+' dt='+dt+'ms');
  check('camino feliz es rápido (<800ms)', dt<800, 'dt='+dt+'ms');

  // ---- TEST 5: todos los proxies fallan al instante → [] sin colgarse, sin lanzar
  console.log('\n[5] Todo falla → devuelve [] sin lanzar (degradación limpia)');
  MOCK=async(u,opt)=>{ const s=String(u); if(s.includes(AG)||s.includes(R2)) return {ok:true,json:async()=>({})}; return {ok:false,text:async()=>''}; };
  t=Date.now(); out=await ctx.fetchOutletItems({id:'m2',rss:['http://feed2']}); dt=Date.now()-t;
  check('devuelve [] (no lanza)', Array.isArray(out)&&out.length===0, 'dt='+dt+'ms');

  console.log('\n================ RESULTADO:', pass, 'OK ·', fail, 'FALLOS ================');
  process.exit(fail?1:0);
})();
