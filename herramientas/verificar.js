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
  DOMParser:function(){this.parseFromString=()=>({getElementsByTagName:()=>[]});},speechSynthesis:{getVoices:()=>[],addEventListener(){},removeEventListener(){},cancel(){},speak(){}},matchMedia:()=>({matches:false,addEventListener(){}}),caches:undefined};
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

    console.log('[4] En vivo (televisión)');
    let LIVE=null; try{ LIVE=JSON.parse(rd('envivo.json')); }catch(e){ ck('envivo.json parsea', false, e.message); }
    if(LIVE){
      const ids=LIVE.map(c=>c.canal);
      ck('es una lista de canales', Array.isArray(LIVE)&&LIVE.length>0, 'len='+LIVE.length);
      ck('todos con canal de YouTube válido', LIVE.every(c=>/^UC[\w-]{22}$/.test(c.canal||'')));
      ck('todos con nombre', LIVE.every(c=>c.nombre));
      ck('sin canales repetidos', ids.filter((x,i)=>ids.indexOf(x)!==i).length===0);
      ck('el medio que citan existe en el catálogo', LIVE.every(c=>!c.medio||CAT.some(o=>o.id===c.medio)),
         LIVE.filter(c=>c.medio&&!CAT.some(o=>o.id===c.medio)).map(c=>c.medio).join(',')||'');
      ck('hay canales en español', LIVE.filter(c=>c.lang==='es').length>0, LIVE.filter(c=>c.lang==='es').length+' en español');
      ck('la pestaña existe en el cascarón', shell.includes('data-v="envivo"') && shell.includes('id="v-envivo"'));
      ck('la pestaña está cableada en app.js', appSrcRaw.includes("v==='envivo'") && appSrcRaw.includes('function buildEnVivo'));
      ck('se abre por canal, no por video fijo', appSrcRaw.includes('embed/live_stream?channel='));
      ck('el SW guarda envivo.json', rd('sw-prisma.js').includes('envivo.json'));
    }

    console.log('[5] Cortacircuito de puentes');
    {
      const v=ctx.puenteVivo, f=ctx.puenteFallo, ok=ctx.puenteOk, t=ctx.puenteTumbar;
      ck('existe', [v,f,ok,t].every(x=>typeof x==='function'));
      if(typeof v==='function'){
        ck('un puente nuevo se da por vivo', v('pruebaA')===true);
        f('pruebaA'); f('pruebaA');
        ck('dos fallos seguidos todavía no lo tumban', v('pruebaA')===true);
        f('pruebaA');
        ck('al tercero se le deja de preguntar', v('pruebaA')===false);
        f('pruebaB'); f('pruebaB'); ok('pruebaB'); f('pruebaB'); f('pruebaB');
        ck('un acierto en medio borra la cuenta', v('pruebaB')===true);
        for(let i=0;i<9;i++) f('direct');
        ck("'directo' nunca se da por caído (ahí falla el medio, no un puente)", v('direct')===true);
        t('pruebaC');
        ck('el sondeo de arranque tumba de una vez', v('pruebaC')===false);
        ok('pruebaC');
        ck('si revive, vuelve a entrar', v('pruebaC')===true);
        ck('rss2json también pasa por el cortacircuito', appSrcRaw.includes("puenteVivo('rss2json')"));
      }
    }

    console.log('[6] Robot de titulares');
    {
      let R=null; try{ R=require(path.join(DIR,'herramientas','robot-titulares.js')); }catch(e){ ck('el robot carga', false, e.message); }
      if(R){
        const rss='<rss><channel><item><title><![CDATA[Sube el d&oacute;lar &amp;quot;m&aacute;s de lo previsto&amp;quot;]]></title>'
          +'<link>https://medio.test/economia/dolar</link><description>&lt;p&gt;El &lt;b&gt;peso&lt;/b&gt; cae.&lt;/p&gt;&lt;img src="https://medio.test/f.jpg"&gt;</description>'
          +'<pubDate>Sat, 14 Nov 2026 10:00:00 GMT</pubDate><category>Economía</category></item>'
          +'<item><title>Sin enlace</title><description>x</description></item>'
          +'<item><title>Lluvias en Bogotá - El Diario</title><link>https://news.google.com/rss/articles/abc</link></item></channel></rss>';
        const a=R.leerFeed(rss,'m1');
        ck('RSS: lee los titulares que tienen enlace', a.length===2, 'len='+a.length);
        ck('RSS: CDATA y entidades dobles quedan limpias', a[0]&&a[0].title==='Sube el dólar "más de lo previsto"', a[0]&&a[0].title);
        ck('RSS: el resumen sale sin etiquetas', a[0]&&a[0].desc==='El peso cae.', a[0]&&a[0].desc);
        ck('RSS: saca la foto del resumen', a[0]&&a[0].img==='https://medio.test/f.jpg');
        ck('RSS: fecha, medio y sección', a[0]&&a[0].ts===Date.parse('Sat, 14 Nov 2026 10:00:00 GMT')&&a[0].outlet==='m1'&&a[0].cats.includes('economía')&&a[0].cats.includes('economia'));
        ck('Google News: quita la coletilla " - Medio"', a[1]&&a[1].title==='Lluvias en Bogotá', a[1]&&a[1].title);
        const atom='<feed><entry><title type="html">Acuerdo &amp;amp; paz</title><link rel="self" href="https://x.test/self"/>'
          +'<link rel="alternate" href="https://x.test/mundo/nota"/><summary>Resumen</summary><updated>2026-11-14T09:00:00Z</updated>'
          +'<media:thumbnail url="https://x.test/t.png"/><category term="Mundo"/></entry></feed>';
        const b=R.leerFeed(atom,'m2');
        ck('Atom: enlace alternate, no el self', b.length===1&&b[0].link==='https://x.test/mundo/nota', b[0]&&b[0].link);
        ck('Atom: título, miniatura y fecha', b[0]&&b[0].title==='Acuerdo & paz'&&b[0].img==='https://x.test/t.png'&&b[0].ts===Date.parse('2026-11-14T09:00:00Z'));
        const yt='<feed><entry><yt:videoId>dQw4w9WgXcQ</yt:videoId><title>Resumen &amp;amp; an&aacute;lisis</title>'
          +'<published>2026-11-14T12:00:00+00:00</published><media:group><media:title>otro titulo</media:title></media:group></entry>'
          +'<entry><yt:videoId>corto</yt:videoId><title>id roto</title></entry></feed>';
        const v=R.leerVideos(yt,'m4');
        ck('YouTube: lee el video y descarta el id roto', v.length===1&&v[0].vid==='dQw4w9WgXcQ', 'len='+v.length);
        ck('YouTube: el título es el del video, no el de media:group', v[0]&&v[0].title==='Resumen & análisis', v[0]&&v[0].title);
        ck('YouTube: fecha y medio', v[0]&&v[0].pub===Date.parse('2026-11-14T12:00:00+00:00')&&v[0].outlet==='m4');
        const gn='<rss><channel><item><title>Es falso que el agua con lim&amp;oacute;n cure el dengue - Colombiacheck</title>'
          +'<link>https://news.google.com/rss/articles/xyz</link><pubDate>Fri, 13 Nov 2026 15:00:00 GMT</pubDate>'
          +'<source url="https://colombiacheck.com">Colombiacheck</source></item><item><title>sin enlace</title></item></channel></rss>';
        const g=R.leerGoogle(gn);
        ck('Desmentidos: lee el chequeo y quita la coletilla del medio', g.length===1&&g[0].title==='Es falso que el agua con limón cure el dengue', g[0]&&g[0].title);
        ck('Desmentidos: fuente y fecha', g[0]&&g[0].src==='Colombiacheck'&&g[0].ts===Date.parse('Fri, 13 Nov 2026 15:00:00 GMT'));
        const enApp=[...appSrcRaw.matchAll(/\{n:'[^']+',d:'([^']+)',loc:'(es|en)'/g)].map(m=>m[1]+'|'+m[2]).sort().join(',');
        const enRobot=R.VERIFICADORES.map(v=>v[0]+'|'+v[1]).sort().join(',');
        ck('la lista de verificadores es la misma en la app y en el robot', enApp===enRobot && R.VERIFICADORES.length===10, enApp===enRobot?'':'app: '+enApp+' / robot: '+enRobot);
        ck('La Silla apunta a su Detector, no a todo el medio', R.VERIFICADORES.some(v=>v[0]==='lasillavacia.com/detector-de-mentiras'));
        ck('las páginas de índice no pasan por desmentidos', ['Chequeos: Inchequeable (página 3)','calabazas Archives','Article List – Page 3'].every(t=>R.ES_INDICE.test(t)) && !R.ES_INDICE.test('Es falso que el agua con limón cure el dengue') && !R.ES_INDICE.test('Did Texas have more registered voters than adult citizens?'));
        ck('basura no lo tumba', R.leerFeed('<html>no soy un feed</html>','m3').length===0 && R.leerFeed('','m3').length===0);
      }
      ck('la app lee el archivo del robot', appSrcRaw.includes('raw.githubusercontent.com/joanhispanista-star/prisma-noticias/datos/titulares.json'));
      ck('los últimos desmentidos salen del robot', appSrcRaw.includes('ROBOT.desmentidos'));
      ck('si no se pudo preguntar, no se afirma que "no hay chequeos"', appSrcRaw.includes('arts.sinPuente') && appSrcRaw.includes('NO significa que no haya chequeos'));
      ck('Video y Shorts salen del robot antes que de un puente', appSrcRaw.includes('ROBOT.videos[outlet.id]') && appSrcRaw.includes('robotTraeVideos()'));
      ck('el robot también trae los videos', rd('herramientas/robot-titulares.js').includes('feeds/videos.xml?channel_id='));
      ck('si el robot está parado, la app no le cree a solas', appSrcRaw.includes('robotFresco()') && appSrcRaw.includes('ROBOT_FRESCO_MS'));
      ck('"Borrar mis datos" también se lleva la copia del robot', appSrcRaw.includes('k===RK'));
      let wf=''; try{ wf=rd('.github/workflows/titulares.yml'); }catch(e){}
      ck('el flujo de GitHub existe y corre con reloj', /cron:/.test(wf) && wf.includes('robot-titulares.js'));
      ck('el flujo publica en la rama datos, no en main', /push[^\n]*--force[^\n]* datos/.test(wf) && !/push[^\n]* main/.test(wf));
      ck('la privacidad cuenta lo del robot', rd('privacidad.html').includes('robot de Prisma'));
    }

    console.log('\n================ '+pass+' OK · '+fail+' FALLOS ================');
    process.exit(fail?1:0);
  })();
}
