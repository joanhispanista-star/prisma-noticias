// Arma envivo.json: la lista de canales de noticias que Prisma ofrece para VER.
// No decide por el título ni por fama: parte de lo MEDIDO por
//   1) comprobar-envivo.js   → quién está en vivo
//   2) comprobar-senales.js  → cuánto lleva al aire (24 h+ = señal permanente)
//   3) resolver-canales.js   → canales de fuera del catálogo, verificados
// y aplica unas pocas decisiones a mano, cada una con su motivo escrito.
// Uso:  node herramientas/armar-envivo.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const leer = f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const CAT = JSON.parse(fs.readFileSync(path.join(DIR, 'catalogo.json'), 'utf8'));
const byId = Object.fromEntries(CAT.map(o => [o.id, o]));

// --- decisiones a mano, con motivo (lo que la medición sola no puede saber) ---
const FUERA = {
  cgtn:        'su señal permanente no es de noticias, es un canal de viajes por China',
  France24_es: 'el canal se llama Español pero emite en francés: duplica a France 24',
};
// canales que reinician su emisión cada día, así que nunca llegan a 24 h seguidas
// aunque son señales continuas. Se incluyen habiéndolos visto en vivo.
const DENTRO_IGUAL = { ABCNews: 'reinicia la emisión cada día; se vio en vivo' };
// a qué medio del catálogo pertenece cada canal de fuera (para heredar su sesgo:
// es el MISMO emisor en otro idioma, no una atribución inventada)
const MEDIO = { cnnee:'cnn', dwespanol:'dw', aljazeera:'aljazeeraar', africanews:'africanews', ABCNews:'abcnews' };
const IDIOMA = { cnnee:'es', dwespanol:'es', aljazeera:'ar', africanews:'fr', NoticiasCaracol:'es', ntn24:'es', ABCNews:'en',
                 nhk:'en', euronews:'en', aljz:'en', bloomberg:'en', dw:'en', rtve:'es', france24:'en', cnn:'en',
                 trt:'en', milenio:'es', eltiempo:'es', rcnnoticiasrcn:'es' };
const NOMBRE = { eltiempo:'CityTv · El Tiempo', rcnnoticiasrcn:'Noticias RCN', rtve:'RTVE · Canal 24H',
                 cnn:'CNN', aljazeera:'Al Jazeera (árabe)', dwespanol:'DW Español', cnnee:'CNN en Español' };

const salida = [];
const fuera = [];

// 1) los del catálogo
for (const r of leer('senales-resultado.json')) {
  if (!r.senal) continue;
  if (FUERA[r.id]) { fuera.push([r.nombre, FUERA[r.id]]); continue; }
  const o = byId[r.id];
  salida.push({ canal: r.yt, nombre: NOMBRE[r.id] || r.nombre, medio: r.id,
                pais: o ? o.pais : '', region: o ? o.region : '', lang: IDIOMA[r.id] || '',
                visto: r.titulo, horasAlAire: Math.round(r.horasAlAire) });
}
// 2) los resueltos por arroba
for (const r of leer('canales-resueltos.json')) {
  if (r.error || !r.canal) continue;
  if (FUERA[r.arroba]) { fuera.push([r.nombre, FUERA[r.arroba]]); continue; }
  if (!r.senal && !DENTRO_IGUAL[r.arroba]) continue;
  if (salida.some(x => x.canal === r.canal)) continue;
  const m = MEDIO[r.arroba] || null, o = m ? byId[m] : null;
  salida.push({ canal: r.canal, nombre: NOMBRE[r.arroba] || r.nombre, medio: m,
                pais: o ? o.pais : '', region: o ? o.region : '', lang: IDIOMA[r.arroba] || '',
                visto: r.titulo, horasAlAire: r.horasAlAire == null ? null : Math.round(r.horasAlAire) });
}

// el español primero (es la audiencia de Prisma), luego por antigüedad de la señal
const peso = l => (l === 'es' ? 0 : l === 'en' ? 1 : 2);
salida.sort((a, b) => peso(a.lang) - peso(b.lang) || (b.horasAlAire || 0) - (a.horasAlAire || 0));

fs.writeFileSync(path.join(DIR, 'envivo.json'), JSON.stringify(salida, null, 1));
console.log('envivo.json · ' + salida.length + ' canales\n');
for (const c of salida) console.log('  ' + (c.lang || '--') + '  ' + c.nombre.padEnd(24) + (c.medio ? ('sesgo de ' + c.medio) : 'sin clasificar').padEnd(22) + (c.horasAlAire != null ? Math.round(c.horasAlAire / 24) + ' días al aire' : ''));
if (fuera.length) { console.log('\nDejados fuera a propósito:'); fuera.forEach(([n, m]) => console.log('  ✖ ' + n.padEnd(24) + m)); }
