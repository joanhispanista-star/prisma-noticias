// ¿Qué medios del catálogo emiten EN VIVO ahora mismo en YouTube?
// Node no tiene las restricciones del navegador, así que puede preguntárselo a
// YouTube directamente. Uso:  node herramientas/comprobar-envivo.js
// Imprime una tabla y deja el resultado en herramientas/envivo-resultado.json
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const CAT = JSON.parse(fs.readFileSync(path.join(DIR, 'catalogo.json'), 'utf8'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

async function mirar(o) {
  const url = 'https://www.youtube.com/channel/' + o.yt + '/live';
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8' }, signal: ctrl.signal });
    const t = await r.text();
    // Un canal EN VIVO redirige a su emisión: el canonical apunta a /watch?v=…
    // y la página trae "isLive":true. Uno sin directo devuelve la página del
    // canal, cuyo canonical es la propia dirección del canal.
    // (No sirve buscar hlsManifestUrl: YouTube ya no lo manda en esta página.)
    const live = /"isLive"\s*:\s*true/.test(t);
    const vid  = (t.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/) || [])[1] || null;
    const tit  = (t.match(/<title>([^<]{0,140})<\/title>/) || [])[1].replace(/ - YouTube$/, '').replace(/&amp;/g, '&') || '';
    return { id: o.id, nombre: o.nombre, yt: o.yt, region: o.region, envivo: !!(live && vid), vid, titulo: tit };
  } catch (e) {
    return { id: o.id, nombre: o.nombre, yt: o.yt, region: o.region, envivo: false, error: e.name || e.message };
  } finally { clearTimeout(to); }
}

(async () => {
  const outs = CAT.filter(o => o.yt);
  console.log('Preguntando a YouTube por ' + outs.length + ' canales…\n');
  const res = [];
  const CONC = 6;
  let i = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < outs.length) { const o = outs[i++]; res.push(await mirar(o)); }
  }));
  res.sort((a, b) => (b.envivo - a.envivo) || a.nombre.localeCompare(b.nombre));
  const vivos = res.filter(r => r.envivo);
  for (const r of res) {
    console.log((r.envivo ? '  🔴 EN VIVO  ' : '     —       ') + r.nombre.padEnd(26) + (r.envivo ? (r.vid + '  ' + r.titulo.slice(0, 72)) : (r.error || '')));
  }
  console.log('\n================ ' + vivos.length + ' en vivo de ' + res.length + ' ================');
  fs.writeFileSync(path.join(__dirname, 'envivo-resultado.json'), JSON.stringify(res, null, 1));
})();
