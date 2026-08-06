// Resuelve arrobas de YouTube (@dwespanol) a su identificador de canal y mira
// si tienen señal en vivo. NO inventa nada: si la arroba no existe, se cae y
// se descarta; el nombre que se imprime es el que devuelve YouTube.
// Uso:  node herramientas/resolver-canales.js
const fs = require('fs'), path = require('path');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

// candidatos: cadenas de noticias que emiten en directo, sobre todo en español
const ARROBAS = ['dwespanol','France24_es','ntn24','telesurtv','cnnee','rtnoticias','SkyNews',
                 'ABCNews','NBCNews','CBSNews','africanews','WION','CNA','aljazeera',
                 'NoticiasCaracol','Semananoticias','elespectador','LaFM','wradiocolombia'];

const pedir = async (url) => {
  const c = new AbortController(); const to = setTimeout(() => c.abort(), 20000);
  try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-CO,es;q=0.9' }, signal: c.signal });
        return { ok: r.ok, status: r.status, texto: await r.text() }; }
  finally { clearTimeout(to); }
};

async function resolver(arroba) {
  try {
    const p = await pedir('https://www.youtube.com/@' + arroba);
    if (!p.ok) return { arroba, error: 'HTTP ' + p.status };
    const t = p.texto;
    const cid = (t.match(/"(?:externalId|channelId)":"(UC[\w-]{22})"/) || [])[1];
    const nom = ((t.match(/<meta property="og:title" content="([^"]{0,80})"/) || [])[1] || '').replace(/&amp;/g, '&');
    if (!cid) return { arroba, error: 'sin identificador de canal' };
    // ¿está en vivo, y desde cuándo?
    const l = await pedir('https://www.youtube.com/channel/' + cid + '/live');
    const vid = (l.texto.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/) || [])[1] || null;
    const live = /"isLive"\s*:\s*true/.test(l.texto);
    let horas = null, tit = '';
    if (vid && live) {
      const w = await pedir('https://www.youtube.com/watch?v=' + vid);
      const ini = (w.texto.match(/"startTimestamp":"([^"]+)"/) || [])[1];
      if (ini) horas = Math.round((Date.now() - Date.parse(ini)) / 360000) / 10;
      tit = ((w.texto.match(/<title>([^<]{0,140})<\/title>/) || [])[1] || '').replace(/ - YouTube$/, '').replace(/&amp;/g, '&');
    }
    return { arroba, canal: cid, nombre: nom, envivo: !!(vid && live), vid, horasAlAire: horas, titulo: tit,
             senal: !!(vid && live && horas != null && horas >= 24) };
  } catch (e) { return { arroba, error: e.name || e.message }; }
}

(async () => {
  console.log('Resolviendo ' + ARROBAS.length + ' canales…\n');
  const res = [];
  let i = 0;
  await Promise.all(Array.from({ length: 4 }, async () => { while (i < ARROBAS.length) res.push(await resolver(ARROBAS[i++])); }));
  res.sort((a, b) => (b.horasAlAire || 0) - (a.horasAlAire || 0));
  for (const r of res) {
    if (r.error) { console.log('  ✖ @' + r.arroba.padEnd(18) + r.error); continue; }
    const h = r.horasAlAire == null ? '  —   ' : (r.horasAlAire >= 48 ? (Math.round(r.horasAlAire / 24) + ' días').padStart(8) : (r.horasAlAire + ' h').padStart(8));
    console.log((r.senal ? '  📡 ' : (r.envivo ? '  ▶  ' : '  ·  ')) + ('@' + r.arroba).padEnd(19) + (r.nombre || '').padEnd(26) + h + '  ' + r.canal + '  ' + (r.titulo || '').slice(0, 46));
  }
  console.log('\n================ ' + res.filter(r => r.senal).length + ' con señal permanente ================');
  fs.writeFileSync(path.join(__dirname, 'canales-resueltos.json'), JSON.stringify(res, null, 1));
})();
