// Para los medios cuyo feed dejó de traer noticias, busca otra dirección que sí
// funcione: las rutas habituales de su propio sitio y, si ninguna sirve, la
// consulta a Google News restringida a ese dominio (patrón que el catálogo ya
// usa para Reuters, TRT y otros).
// Uso:  node herramientas/buscar-feed-alterno.js [id ...]   (sin ids: los que fallaron)
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const CAT = JSON.parse(fs.readFileSync(path.join(DIR, 'catalogo.json'), 'utf8'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

const RUTAS = ['/feed/', '/feed', '/rss', '/rss.xml', '/index.xml', '/atom.xml', '/feeds/all.xml',
               '/?feed=rss2', '/rss/portada.xml', '/rss/noticias.xml', '/arc/outboundfeeds/rss/'];

async function items(url) {
  const c = new AbortController(); const to = setTimeout(() => c.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' }, signal: c.signal, redirect: 'follow' });
    if (!r.ok) return { n: 0, http: r.status };
    const t = await r.text();
    if (!/<rss|<feed|<channel/i.test(t.slice(0, 2000))) return { n: 0, http: r.status, nota: 'no es feed' };
    return { n: (t.match(/<item[\s>]|<entry[\s>]/gi) || []).length, http: r.status, final: r.url };
  } catch (e) { return { n: 0, error: e.name === 'AbortError' ? 'tarda demasiado' : ((e.cause && e.cause.code) || e.message) }; }
  finally { clearTimeout(to); }
}

(async () => {
  let ids = process.argv.slice(2);
  if (!ids.length) {
    const prev = path.join(__dirname, 'feeds-resultado.json');
    if (!fs.existsSync(prev)) { console.log('Corre antes:  node herramientas/comprobar-feeds.js'); process.exit(1); }
    ids = JSON.parse(fs.readFileSync(prev, 'utf8')).filter(r => !r.vivo).map(r => r.id);
  }
  const hallazgos = {};
  for (const id of ids) {
    const o = CAT.find(x => x.id === id);
    if (!o) { console.log('✖ ' + id + ': no está en el catálogo'); continue; }
    console.log('\n' + o.nombre + '  (' + o.sitio + ')');
    let host; try { host = new URL(o.sitio).origin; } catch (e) { console.log('   sitio inválido en el catálogo'); continue; }

    let encontrado = null;
    for (const ruta of RUTAS) {
      const u = host + ruta;
      const r = await items(u);
      if (r.n > 0) { console.log('   ✅ ' + u + '  → ' + r.n + ' noticias'); encontrado = u; break; }
    }
    if (!encontrado) {
      const dom = host.replace(/^https?:\/\//, '').replace(/^www\./, '');
      const g = 'https://news.google.com/rss/search?q=site:' + dom + '+when:7d&hl=es-419&gl=CO&ceid=CO:es-419';
      const r = await items(g);
      if (r.n > 0) { console.log('   ✅ vía Google News → ' + r.n + ' noticias'); encontrado = g; }
      else console.log('   ✖ nada: ni rutas propias ni Google News (' + (r.error || r.http || '?') + ')');
    }
    if (encontrado) hallazgos[id] = encontrado;
  }
  fs.writeFileSync(path.join(__dirname, 'feeds-alternos.json'), JSON.stringify(hallazgos, null, 1));
  console.log('\n================ ' + Object.keys(hallazgos).length + ' de ' + ids.length + ' recuperados ================');
})();
