// ¿Cuáles de los canales en vivo son SEÑALES PERMANENTES (24 h) y cuáles son
// transmisiones puntuales (un juicio, una rueda de prensa, un programa)?
//
// El criterio no es el título, es el reloj: YouTube dice desde cuándo está al
// aire cada emisión. Una señal 24 h lleva días o semanas encendida; un evento,
// unas horas. Uso:  node herramientas/comprobar-senales.js
// Lee herramientas/envivo-resultado.json (lo deja comprobar-envivo.js).
const fs = require('fs'), path = require('path');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const PREV = path.join(__dirname, 'envivo-resultado.json');
const HORAS_SENAL = 24;   // al aire más de un día seguido = señal permanente

async function desdeCuando(r) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const resp = await fetch('https://www.youtube.com/watch?v=' + r.vid, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8' }, signal: ctrl.signal });
    const t = await resp.text();
    const ini = (t.match(/"startTimestamp":"([^"]+)"/) || [])[1] || null;
    const ahoraLive = /"isLiveNow"\s*:\s*true/.test(t);
    const horas = ini ? (Date.now() - Date.parse(ini)) / 3600000 : null;
    return { ...r, inicio: ini, horasAlAire: horas == null ? null : Math.round(horas * 10) / 10, sigueEnVivo: ahoraLive,
             senal: !!(ahoraLive && horas != null && horas >= HORAS_SENAL) };
  } catch (e) { return { ...r, error: e.name || e.message, senal: false }; }
  finally { clearTimeout(to); }
}

(async () => {
  if (!fs.existsSync(PREV)) { console.log('Falta ' + PREV + '. Corre antes:  node herramientas/comprobar-envivo.js'); process.exit(1); }
  const vivos = JSON.parse(fs.readFileSync(PREV, 'utf8')).filter(r => r.envivo);
  console.log('Mirando desde cuándo llevan al aire ' + vivos.length + ' emisiones…\n');
  const res = [];
  let i = 0;
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (i < vivos.length) { res.push(await desdeCuando(vivos[i++])); }
  }));
  res.sort((a, b) => (b.horasAlAire || 0) - (a.horasAlAire || 0));
  for (const r of res) {
    const h = r.horasAlAire == null ? '   ?  ' : (r.horasAlAire >= 48 ? (Math.round(r.horasAlAire / 24) + ' días').padStart(7) : (r.horasAlAire + ' h').padStart(7));
    console.log((r.senal ? '  📡 SEÑAL 24h ' : '  ▶  evento   ') + r.nombre.padEnd(24) + h + '  ' + (r.titulo || '').slice(0, 60));
  }
  const senales = res.filter(r => r.senal);
  console.log('\n================ ' + senales.length + ' señales permanentes · ' + (res.length - senales.length) + ' transmisiones puntuales ================');
  fs.writeFileSync(path.join(__dirname, 'senales-resultado.json'), JSON.stringify(res, null, 1));
})();
