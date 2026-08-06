// ¿Deja YouTube ver cada canal DENTRO de Prisma, o solo en su web?
// Algunos emisores prohíben incrustar: la tarjeta se abriría en negro. Esto lo
// comprueba canal por canal, sobre la emisión que tengan al aire ahora.
// Uso:  node herramientas/comprobar-incrustable.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const LIVE = JSON.parse(fs.readFileSync(path.join(DIR, 'envivo.json'), 'utf8'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

const pedir = async (url) => {
  const c = new AbortController(); const to = setTimeout(() => c.abort(), 20000);
  try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-CO,es;q=0.9' }, signal: c.signal }); return await r.text(); }
  finally { clearTimeout(to); }
};

async function mirar(c) {
  try {
    const l = await pedir('https://www.youtube.com/channel/' + c.canal + '/live');
    const vid = (l.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/) || [])[1];
    if (!vid) return { ...c, envivo: false, incrustable: null, nota: 'ahora mismo no está emitiendo' };
    const w = await pedir('https://www.youtube.com/watch?v=' + vid);
    const emb = /"playableInEmbed"\s*:\s*true/.test(w);
    const noEmb = /"playableInEmbed"\s*:\s*false/.test(w);
    return { ...c, envivo: true, vid, incrustable: emb ? true : (noEmb ? false : null) };
  } catch (e) { return { ...c, error: e.name || e.message }; }
}

(async () => {
  console.log('Comprobando los ' + LIVE.length + ' canales de envivo.json…\n');
  const res = []; let i = 0;
  await Promise.all(Array.from({ length: 5 }, async () => { while (i < LIVE.length) res.push(await mirar(LIVE[i++])); }));
  const orden = Object.fromEntries(LIVE.map((c, n) => [c.canal, n]));
  res.sort((a, b) => orden[a.canal] - orden[b.canal]);
  let malos = 0, apagados = 0;
  for (const r of res) {
    let est;
    if (r.error) { est = '  ⚠  ' + r.error; malos++; }
    else if (!r.envivo) { est = '  ⏸  no emite ahora'; apagados++; }
    else if (r.incrustable === true) est = '  ✅ se ve dentro de Prisma';
    else if (r.incrustable === false) { est = '  ❌ PROHÍBE INCRUSTAR'; malos++; }
    else { est = '  ❓ no se pudo saber'; }
    console.log(est.padEnd(32) + r.nombre);
  }
  console.log('\n================ ' + (res.length - malos - apagados) + ' se ven dentro · ' + apagados + ' apagados ahora · ' + malos + ' con problema ================');
  process.exit(malos ? 1 : 0);
})();
