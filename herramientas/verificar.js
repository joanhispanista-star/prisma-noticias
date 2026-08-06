// Verificador de la app Prisma · Noticias (portátil: lee de la carpeta padre).
// Uso:  node herramientas/verificar.js   (desde la carpeta Noticias, o desde donde sea)
// Comprueba: catalogo.json válido, app.js compila y arranca (boot carga el catálogo),
// y que el cascarón noticias.html enlaza bien estilos.css + app.js.
const fs=require('fs'), vm=require('vm'), path=require('path');
const DIR=path.join(__dirname,'..');
const rd=f=>fs.readFileSync(path.join(DIR,f),'utf8');
let pass=0,fail=0; const ck=(n,c,x='')=>{ (c?pass++:fail++); console.log((c?'  ✅ ':'  ❌ ')+n+(x?'  '+x:'')); };

const appSrcRaw=rd('app.js'), catJson=rd('catalogo.json'), shell=rd('noticias.html');

console.log('[1] catalogo.json válido');
let CAT; try{ CAT=JSON.parse(catJson); }catch(e){ ck('parsea como JSON',false,e.message); }
if(CAT){ const ids=CAT.map(o=>o.id);
  ck('es array de medios', Array.isArray(CAT)&&CAT.length>=200, 'len='+CAT.length);
  ck('sin ids duplicados', ids.filter((x,i)=>ids.indexOf(x)!==i).length===0);
  ck('sesgo_num en [-3,3]', CAT.every(o=>typeof o.sesgo_num!=='number'||(o.sesgo_num>=-3&&o.sesgo_num<=3)));
  ck('todos con id+nombre', CAT.every(o=>o.id&&o.nombre));
}

console.log('[2] app.js compila y arranca (boot carga el catálogo)');
const appTest=appSrcRaw.replace('let CATALOGO = []','var CATALOGO = []').replace('let byId = {}, DOMAIN_IDX = {};','var byId = {}, DOMAIN_IDX = {};');
const makeEl=()=>{let _t='';return{set innerHTML(v){_t=String(v).replace(/<[^>]*>/g,'');},get textContent(){return _t;},set textContent(v){_t=v;},style:{},classList:{add(){},remove(){},toggle(){},contains(){return false;}},appendChild(){},addEventListener(){},setAttribute(){},getAttribute(){return null;},querySelector(){return null;},querySelectorAll(){return [];}};};
const doc={addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];},getElementById(){return null;},createElement:()=>makeEl(),head:{appendChild(){}},body:{appendChild(){}},documentElement:{style:{}}};
let MOCK=async()=>({ok:false});
const ctx={fetch:(...a)=>MOCK(...a),AbortController,setTimeout,clearTimeout,setInterval,clearInterval,Promise,Date,Math,JSON,Set,Map,Array,Object,String,Number,Boolean,RegExp,URL,isNaN,parseInt,parseFloat,encodeURIComponent,decodeURIComponent,console,
  document:doc,navigator:{onLine:true,userAgent:'node',language:'es',serviceWorker:{register(){return Promise.resolve();}}},
  location:{href:'https://x/noticias.html',origin:'https://x',reload(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  DOMParser:function(){this.parseFromString=()=>({getElementsByTagName:()=>[]});},speechSynthesis:{getVoices:()=>[]},matchMedia:()=>({matches:false,addEventListener(){}}),caches:undefined};
ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
let ok=true; try{ new vm.Script(appTest,{filename:'app.js'}).runInContext(ctx); }catch(e){ ok=false; ck('app.js compila y corre top-level',false,e.message); }
if(ok){ ck('app.js compila y corre top-level',true);
  ctx.init=()=>{ctx.__init=true;};
  (async()=>{
    MOCK=async(u)=>String(u).includes('catalogo.json')?{ok:true,json:async()=>JSON.parse(catJson)}:{ok:false};
    ctx.__init=false; await ctx.boot();
    ck('boot carga los 221 medios', ctx.CATALOGO.length===221, 'len='+ctx.CATALOGO.length);
    ck('byId + DOMAIN_IDX poblados', Object.keys(ctx.byId).length===ctx.CATALOGO.length && Object.keys(ctx.DOMAIN_IDX).length>150);
    ck('boot llama a init()', ctx.__init===true);
    MOCK=async()=>{throw new Error('offline');}; ctx.__init=false; let threw=false; try{ await ctx.boot(); }catch(e){ threw=true; }
    ck('offline: boot no lanza y arranca igual', !threw && ctx.__init===true);

    console.log('[3] cascarón noticias.html');
    ck('enlaza estilos.css', shell.includes('href="estilos.css"'));
    ck('carga app.js', shell.includes('<script src="app.js"></script>'));
    ck('sin <style> ni catálogo embebidos', !shell.includes('<style>') && !shell.includes('__CATALOGO__'));
    ck('registra el SW', appSrcRaw.includes("navigator.serviceWorker.register('sw-prisma.js')"));

    console.log('\n================ '+pass+' OK · '+fail+' FALLOS ================');
    process.exit(fail?1:0);
  })();
}
