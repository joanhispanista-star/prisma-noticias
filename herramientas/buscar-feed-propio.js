// 195 de los 221 medios no leen su propio RSS: leen una búsqueda en Google News.
// Eso es peor por tres motivos: sólo trae lo que Google indexó, mete un salto de
// más, y deja a la app colgando de un único puente (a Google no le gustan los
// proxies). Este script busca, medio por medio, si publica su propio feed.
//
// Y comprueba algo que vale doble: si ese feed manda permiso CORS, Prisma puede
// leerlo EN DIRECTO, sin puente y sin gastar cuota de nadie.
//
// Uso:  node herramientas/buscar-feed-propio.js
// Deja el detalle en herramientas/feeds-propios.json
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const CAT = JSON.parse(fs.readFileSync(path.join(DIR, 'catalogo.json'), 'utf8'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const RUTAS = ['/feed/', '/rss.xml', '/rss', '/index.xml', '/arc/outboundfeeds/rss/', '/feeds/all.xml'];
const ESPERA = 6000, A_LA_VEZ = 10;
const ORIGEN = 'https://joanhispanista-star.github.io';

async function mirar(url) {
  const c = new AbortController(); const to = setTimeout(() => c.abort(), ESPERA);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Origin': ORIGEN, 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' }, signal: c.signal, redirect: 'follow' });
    if (!r.ok) return null;
    const t = await r.text();
    if (!/<rss|<feed|<channel/i.test(t.slice(0, 2000))) return null;
    const n = (t.match(/<item[\s>]|<entry[\s>]/gi) || []).length;
    if (!n) return null;
    const acao = r.headers.get('access-control-allow-origin') || '';
    return { url: r.url, items: n, directo: acao === '*' || acao === ORIGEN };
  } catch (e) { return null; }
  finally { clearTimeout(to); }
}

(async () => {
  const objetivo = CAT.filter(o => (o.rss || []).some(u => u.includes('news.google.com')));
  console.log('Buscando feed propio para ' + objetivo.length + ' medios que hoy dependen de Google News…');
  console.log('(hasta ' + RUTAS.length + ' direcciones por medio, ' + ESPERA / 1000 + 's cada una — esto tarda)\n');

  const hallados = {}; let hechos = 0, i = 0;
  await Promise.all(Array.from({ length: A_LA_VEZ }, async () => {
    while (i < objetivo.length) {
      const o = objetivo[i++];
      let host; try { host = new URL(o.sitio).origin; } catch (e) { hechos++; continue; }
      for (const ruta of RUTAS) {
        const r = await mirar(host + ruta);
        if (r) { hallados[o.id] = { nombre: o.nombre, region: o.region, ...r }; break; }
      }
      hechos++;
      if (hechos % 25 === 0) console.log('   … ' + hechos + '/' + objetivo.length + '  (' + Object.keys(hallados).length + ' con feed propio)');
    }
  }));

  const lista = Object.entries(hallados);
  const directos = lista.filter(([, v]) => v.directo);
  console.log('\nCON FEED PROPIO (' + lista.length + ' de ' + objetivo.length + '):');
  lista.sort((a, b) => b[1].items - a[1].items).forEach(([id, v]) =>
    console.log('  ' + (v.directo ? '🟢' : '  ') + ' ' + v.nombre.padEnd(26) + String(v.items).padStart(3) + ' noticias  ' + v.url));
  console.log('\n  🟢 = lo entrega con permiso CORS: Prisma puede leerlo SIN puente');

  fs.writeFileSync(path.join(__dirname, 'feeds-propios.json'), JSON.stringify(hallados, null, 1));
  console.log('\n================ ' + lista.length + ' con feed propio · ' + directos.length + ' de ellos legibles sin puente ================');
})();
