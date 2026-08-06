// ¿Cuáles de los 221 medios del catálogo siguen publicando, y cuáles ya no?
//
// Desde el navegador no se puede saber: si un medio no contesta, puede ser que
// esté muerto o que sea CORS bloqueando. Node no tiene esa limitación, así que
// pregunta a la fuente directamente y distingue las dos cosas.
//
// Uso:  node herramientas/comprobar-feeds.js
// Deja el detalle en herramientas/feeds-resultado.json
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const CAT = JSON.parse(fs.readFileSync(path.join(DIR, 'catalogo.json'), 'utf8'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const ESPERA = 15000, A_LA_VEZ = 10;

async function probar(url) {
  const c = new AbortController();
  const to = setTimeout(() => c.abort(), ESPERA);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' }, signal: c.signal, redirect: 'follow' });
    const t = await r.text();
    const ms = Date.now() - t0;
    const esFeed = /<rss|<feed|<channel|<item|<entry/i.test(t.slice(0, 2000));
    const items = (t.match(/<item[\s>]|<entry[\s>]/gi) || []).length;
    return { http: r.status, ms, bytes: t.length, esFeed, items, destino: r.url !== url ? r.url : null,
             tipo: (r.headers.get('content-type') || '').split(';')[0] };
  } catch (e) {
    return { http: 0, ms: Date.now() - t0, error: e.name === 'AbortError' ? 'no contesta en ' + (ESPERA / 1000) + 's' : (e.cause && e.cause.code) || e.message };
  } finally { clearTimeout(to); }
}

async function mirar(o) {
  const salida = { id: o.id, nombre: o.nombre, region: o.region, pais: o.pais, intentos: [] };
  for (const url of (o.rss || [])) {
    const r = await probar(url);
    salida.intentos.push({ url, ...r });
    if (r.esFeed && r.items > 0) { salida.vivo = true; salida.usa = url; salida.items = r.items; salida.ms = r.ms; break; }
  }
  if (!salida.vivo) {
    salida.vivo = false;
    const i = salida.intentos[0] || {};
    salida.motivo = !o.rss || !o.rss.length ? 'sin RSS en el catálogo'
      : i.error ? i.error
      : i.http >= 400 ? ('el servidor responde ' + i.http)
      : i.http === 0 ? 'no responde'
      : !i.esFeed ? 'responde, pero no es un feed (' + (i.tipo || '?') + ')'
      : 'feed vacío, sin noticias';
  }
  return salida;
}

(async () => {
  console.log('Preguntando a ' + CAT.length + ' medios, uno por uno (sin puentes de por medio)…\n');
  const res = []; let i = 0;
  await Promise.all(Array.from({ length: A_LA_VEZ }, async () => { while (i < CAT.length) res.push(await mirar(CAT[i++])); }));

  const vivos = res.filter(r => r.vivo), muertos = res.filter(r => !r.vivo);
  const porMotivo = {};
  muertos.forEach(r => { porMotivo[r.motivo] = (porMotivo[r.motivo] || 0) + 1; });

  console.log('MEDIOS QUE YA NO PUBLICAN (' + muertos.length + '):');
  muertos.sort((a, b) => a.motivo.localeCompare(b.motivo) || a.nombre.localeCompare(b.nombre))
         .forEach(r => console.log('  ✖ ' + r.nombre.padEnd(28) + r.region.padEnd(16) + r.motivo));

  console.log('\nPOR QUÉ FALLAN:');
  Object.entries(porMotivo).sort((a, b) => b[1] - a[1]).forEach(([m, n]) => console.log('  ' + String(n).padStart(4) + '  ' + m));

  const lentos = vivos.filter(r => r.ms > 5000).sort((a, b) => b.ms - a.ms);
  if (lentos.length) {
    console.log('\nVIVOS PERO LENTOS (más de 5 s):');
    lentos.forEach(r => console.log('  🐢 ' + r.nombre.padEnd(28) + (r.ms / 1000).toFixed(1) + ' s'));
  }
  const redirigidos = vivos.filter(r => r.intentos.some(i => i.destino && i.esFeed));
  if (redirigidos.length) {
    console.log('\nVIVOS PERO EN OTRA DIRECCIÓN (conviene actualizar el catálogo):');
    redirigidos.forEach(r => { const i = r.intentos.find(x => x.destino); console.log('  ↪ ' + r.nombre.padEnd(24) + i.url + '\n      ahora en: ' + i.destino); });
  }

  console.log('\n================ ' + vivos.length + ' vivos · ' + muertos.length + ' muertos · de ' + res.length + ' ================');
  fs.writeFileSync(path.join(__dirname, 'feeds-resultado.json'), JSON.stringify(res, null, 1));
})();
