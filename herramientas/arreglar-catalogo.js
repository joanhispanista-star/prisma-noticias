// Aplica al catálogo los arreglos que las mediciones dejaron probados:
//   1. direcciones que redirigen  → se apunta al destino final (un salto menos
//      por medio y por carga)
//   2. arreglos comprobados a mano, cada uno con su motivo escrito
// Reescribe catalogo.json respetando su formato (un medio por línea).
// Uso:  node herramientas/arreglar-catalogo.js [--seco]
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const SECO = process.argv.includes('--seco');
const CAT = JSON.parse(fs.readFileSync(path.join(DIR, 'catalogo.json'), 'utf8'));

/* Arreglos comprobados uno por uno (ver el mensaje del commit).
   El motivo va aquí para que dentro de seis meses se sepa por qué. */
const A_MANO = {
  gazetawyborcza: { rss: ['https://news.google.com/rss/search?q=site:wyborcza.pl+when:7d&hl=pl&gl=PL&ceid=PL:pl'],
                    porque: 'se le preguntaba a Google News en español: 0 noticias. En polaco: 100' },
  kathimerini:    { rss: ['https://news.google.com/rss/search?q=site:kathimerini.gr+when:7d&hl=el&gl=GR&ceid=GR:el'],
                    porque: 'se le preguntaba en español: 0 noticias. En griego: 100' },
  afp:            { rss: ['https://www.afp.com/es/rss.xml',
                          'https://news.google.com/rss/search?q=site:afp.com+when:7d&hl=es-419&gl=CO&ceid=CO:es-419'],
                    porque: 'no tenía ningún RSS en el catálogo. Se pone el propio EN ESPAÑOL (afp.com/rss.xml ' +
                            'redirige al francés) y detrás Google News, que da 100 noticias frente a 10' },
  elfaro:         { rss: ['https://news.google.com/rss/search?q=site:elfaro.net+when:14d&hl=es-419&gl=CO&ceid=CO:es-419'],
                    porque: 'publica poco: en 3 días salían 0 noticias, en 14 salen 5' },
  agendapropia:   { rss: ['https://news.google.com/rss/search?q=site:agendapropia.co+when:30d&hl=es-419&gl=CO&ceid=CO:es-419'],
                    porque: 'medio pequeño: hace falta un mes de ventana para que aparezca algo' },
  conexioncapita: { rss: ['https://news.google.com/rss/search?q=site:conexioncapital.co+when:30d&hl=es-419&gl=CO&ceid=CO:es-419'],
                    porque: 'igual: en 3 días 0, en 30 días 2' },
};

const cambios = [];
const byId = Object.fromEntries(CAT.map(o => [o.id, o]));

// 1) arreglos a mano
for (const [id, fix] of Object.entries(A_MANO)) {
  const o = byId[id];
  if (!o) { console.log('  ⚠ no está en el catálogo: ' + id); continue; }
  if (JSON.stringify(o.rss) === JSON.stringify(fix.rss)) continue;
  cambios.push({ nombre: o.nombre, de: (o.rss || [])[0] || '(ninguno)', a: fix.rss[0], porque: fix.porque });
  o.rss = fix.rss;
}

// 2) redirecciones detectadas por comprobar-feeds.js
const prev = path.join(__dirname, 'feeds-resultado.json');
if (fs.existsSync(prev)) {
  for (const r of JSON.parse(fs.readFileSync(prev, 'utf8'))) {
    const o = byId[r.id];
    if (!o || A_MANO[r.id]) continue;
    for (const intento of (r.intentos || [])) {
      if (!intento.destino || !intento.esFeed) continue;
      const i = (o.rss || []).indexOf(intento.url);
      if (i < 0) continue;
      o.rss[i] = intento.destino;
      cambios.push({ nombre: o.nombre, de: intento.url, a: intento.destino, porque: 'redirigía: se apunta al destino y se ahorra un salto' });
    }
  }
} else {
  console.log('  ⚠ falta feeds-resultado.json (corre comprobar-feeds.js) — solo se aplican los arreglos a mano\n');
}

// 3) feed propio POR DELANTE de la búsqueda en Google News
//    (la de Google se queda detrás, de respaldo: la app prueba las direcciones
//    en orden, así que si el feed propio cae un día, no se nota)
const propios = path.join(__dirname, 'feeds-propios.json');
if (fs.existsSync(propios)) {
  let n = 0, directos = 0;
  for (const [id, v] of Object.entries(JSON.parse(fs.readFileSync(propios, 'utf8')))) {
    const o = byId[id];
    if (!o || (o.rss || [])[0] === v.url) continue;
    o.rss = [v.url, ...(o.rss || []).filter(u => u !== v.url)];
    n++; if (v.directo) directos++;
  }
  if (n) cambios.push({ cuenta: n, nombre: n + ' medios pasan a leer su propio RSS', de: 'preguntaban primero a Google News',
                        a: 'su propio RSS, con Google News detrás de respaldo',
                        porque: 'el feed propio trae todo lo que publican, no solo lo que Google indexó — y ' + directos + ' se leen sin puente' });
} else {
  console.log('  ⚠ falta feeds-propios.json (corre buscar-feed-propio.js)\n');
}

if (!cambios.length) { console.log('El catálogo ya está al día: nada que cambiar.'); process.exit(0); }
for (const c of cambios) {
  console.log('  ' + c.nombre);
  console.log('     antes : ' + c.de);
  console.log('     ahora : ' + c.a);
  console.log('     porqué: ' + c.porque);
}
const total = cambios.reduce((a, c) => a + (c.cuenta || 1), 0);
console.log('\n' + total + ' medios actualizados' + (SECO ? '  (ensayo: no se escribió nada)' : ''));

if (!SECO) {
  // se respeta el formato original: un medio por línea, para que el diff se lea
  const texto = '[\n' + CAT.map(o => JSON.stringify(o)).join(',\n') + '\n]\n';
  fs.writeFileSync(path.join(DIR, 'catalogo.json'), texto);
  console.log('catalogo.json reescrito. Comprueba con:  node herramientas/verificar.js');
}
