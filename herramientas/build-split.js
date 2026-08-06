// Separa noticias.html (monolito) en: noticias.html (cascarón) + estilos.css + app.js + catalogo.json
// Determinista, con aserciones: si algún marcador no aparece, ABORTA (no produce archivos rotos).
const fs=require('fs'), vm=require('vm'), path=require('path');
const DIR='C:\\Users\\joanh\\OneDrive\\Desktop\\Joan te presta';
const SRC=path.join(DIR,'noticias.html');
const html=fs.readFileSync(SRC,'utf8');
const must=(cond,msg)=>{ if(!cond){ console.error('❌ ABORTA:',msg); process.exit(1); } };

// backup del monolito original
const bak=path.join('C:\\Users\\joanh\\AppData\\Local\\Temp\\claude\\C--Users-joanh-OneDrive-Desktop-Joan-te-presta\\80835f6a-a4dc-4c59-96b0-58e691462226\\scratchpad','noticias.monolito.bak.html');
fs.writeFileSync(bak,html); console.log('📦 backup del monolito →',bak);

// ---- 1) CSS
const sOpen=html.indexOf('<style>'), sClose=html.indexOf('</style>');
must(sOpen>=0&&sClose>sOpen,'no encuentro <style>...</style>');
const css=html.slice(sOpen+7,sClose).replace(/^\n/,'');
fs.writeFileSync(path.join(DIR,'estilos.css'),css);
must(css.includes(':root{'),'el CSS extraído no contiene :root{');
console.log('🎨 estilos.css:',css.length,'bytes');

// ---- 2) SCRIPT (único <script> del archivo)
const scOpen=html.indexOf('<script>'), scClose=html.indexOf('</script>');
must(scOpen>=0&&scClose>scOpen,'no encuentro <script>...</script>');
must(html.indexOf('<script>',scOpen+1)===-1,'hay más de un <script> (revisar)');
let script=html.slice(scOpen+8,scClose);

// ---- 3) CATÁLOGO → catalogo.json (evaluando el literal en un vm limpio: solo literales, sin funciones)
const cOpen=script.indexOf('/*__CATALOGO__*/'), cEnd=script.indexOf('/*__CATALOGO_END__*/');
must(cOpen>=0&&cEnd>cOpen,'no encuentro los sentinelas del catálogo');
const catBlock=script.slice(cOpen,cEnd);
const arrText=catBlock.slice(catBlock.indexOf('['),catBlock.lastIndexOf(']')+1);
let CAT; try{ CAT=vm.runInNewContext('('+arrText+')'); }catch(e){ must(false,'el literal del catálogo no evalúa: '+e.message); }
must(Array.isArray(CAT)&&CAT.length>=200,'catálogo evaluado sospechoso, len='+ (CAT&&CAT.length));
const ids=CAT.map(o=>o.id); const dup=ids.filter((x,i)=>ids.indexOf(x)!==i);
must(dup.length===0,'ids duplicados: '+dup.join(','));
const badBias=CAT.filter(o=>typeof o.sesgo_num==='number'&&(o.sesgo_num<-3||o.sesgo_num>3));
must(badBias.length===0,'sesgo_num fuera de [-3,3]: '+badBias.map(o=>o.id).join(','));
must(CAT.every(o=>o.id&&o.nombre),'algún medio sin id/nombre');
// una línea JSON por medio (diff-friendly, misma convención que el bloque original)
const catJson='[\n'+CAT.map(o=>JSON.stringify(o)).join(',\n')+'\n]\n';
fs.writeFileSync(path.join(DIR,'catalogo.json'),catJson);
console.log('🗂️  catalogo.json:',catJson.length,'bytes ·',CAT.length,'medios · sin ids dup · sesgo_num en rango');

// round-trip: catalogo.json vuelve a ser IGUAL al catálogo original
const back=JSON.parse(catJson);
must(JSON.stringify(back)===JSON.stringify(CAT),'round-trip catalogo.json != catálogo original (¡se perdió/alteró data!)');
console.log('   ✅ round-trip idéntico al catálogo original');

// ---- 4) app.js: quitar el catálogo embebido + índices perezosos + boot que carga el JSON
let app=script;
// 4a) reemplazar bloque de catálogo por CATALOGO vacío
const before=app.length;
app=app.replace(script.slice(cOpen,cEnd)+'/*__CATALOGO_END__*/','let CATALOGO = []; /* se carga desde catalogo.json en boot() */');
must(app.length!==before && !app.includes('/*__CATALOGO__*/'),'no pude reemplazar el bloque del catálogo');

// 4b) índices: const→let + función buildIndexes()
const idxStart=app.indexOf('const byId = {}');
must(idxStart>=0,'no encuentro "const byId = {}"');
const dEnd=app.indexOf('});', app.indexOf('DOMAIN_IDX[new URL'));
must(dEnd>idxStart,'no encuentro el cierre del forEach de DOMAIN_IDX');
const idxBlock=app.slice(idxStart,dEnd+3);
const newIdx=`let byId = {}, DOMAIN_IDX = {};
/* dominio → id de medio (para reconocer el sesgo en resultados externos de GDELT) */
function buildIndexes(){
  byId = {}; CATALOGO.forEach(o=>byId[o.id]=o);
  DOMAIN_IDX = {};
  CATALOGO.forEach(o=>{ try{ DOMAIN_IDX[new URL(o.sitio).hostname.replace(/^www\\./,'')]=o.id; }catch(e){} });
}`;
app=app.replace(idxBlock,newIdx);
must(app.includes('function buildIndexes()'),'no se insertó buildIndexes()');

// 4c) bootstrap: cargar catalogo.json antes de init
const boot=`async function boot(){
  try{ const r=await fetch('catalogo.json',{cache:'no-cache'}); if(r&&r.ok){ const data=await r.json(); if(Array.isArray(data)&&data.length) CATALOGO=data; } }
  catch(e){ /* sin red y sin caché del SW: arrancamos con lo que haya */ }
  buildIndexes();
  init();
}
document.addEventListener('DOMContentLoaded',boot);`;
must(app.includes("document.addEventListener('DOMContentLoaded',init);"),'no encuentro el arranque original');
app=app.replace("document.addEventListener('DOMContentLoaded',init);",boot);

// syntax check de app.js
try{ new vm.Script(app,{filename:'app.js'}); }catch(e){ must(false,'app.js NO compila: '+e.message); }
fs.writeFileSync(path.join(DIR,'app.js'),app);
console.log('📜 app.js:',app.length,'bytes · compila OK · catálogo fuera · buildIndexes()+boot() añadidos');

// ---- 5) noticias.html cascarón: <style>..</style> → link, <script>..</script> → src
let shell=html.slice(0,sOpen)+'<link rel="stylesheet" href="estilos.css">'+html.slice(sClose+8);
// re-localizar el script en el shell ya modificado
const s2o=shell.indexOf('<script>'), s2c=shell.indexOf('</script>');
must(s2o>=0&&s2c>s2o,'no encuentro el <script> en el cascarón');
shell=shell.slice(0,s2o)+'<script src="app.js"></script>'+shell.slice(s2c+9);
must(!shell.includes('<style>')&&shell.includes('href="estilos.css"'),'cascarón: CSS no enlazado bien');
must(shell.includes('<script src="app.js"></script>')&&!shell.includes('/*__CATALOGO__*/'),'cascarón: JS no enlazado bien');
fs.writeFileSync(SRC,shell);
console.log('📄 noticias.html (cascarón):',shell.length,'bytes ·',(shell.match(/\n/g)||[]).length+1,'líneas');

console.log('\n✅ SEPARACIÓN COMPLETA: noticias.html + estilos.css + app.js + catalogo.json');
