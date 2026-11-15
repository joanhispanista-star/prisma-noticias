// El robot de titulares.
//
// Por qué existe: el navegador no puede leer casi ningún RSS (CORS), así que
// Prisma dependía de "puentes" públicos ajenos. Se murieron tres veces; la
// última, el 14-nov-2026, los cuatro a la vez, y la portada quedó en 15 medios.
// Un servidor no tiene esa restricción. Este script corre en GitHub cada 20
// minutos, les pregunta a los 221 medios por su propia puerta y deja UN archivo
// con los titulares. La app lee ese archivo y ya no depende de ningún puente.
//
// El robot no elige ni reescribe nada: copia el titular, el enlace, el resumen
// y la foto tal como los publica cada medio, con el mismo recorte que hacía la
// app. Quién sale y en qué orden lo sigue decidiendo la app, a la vista.
//
// Uso:   node herramientas/robot-titulares.js [carpeta-de-salida]
// Deja:  <salida>/titulares.json   (por defecto, en herramientas/salida/)
// Sin dependencias a propósito: GitHub lo corre sin instalar nada.
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const SALIDA = path.resolve(process.argv[2] || path.join(__dirname, 'salida'));

const UA = 'Mozilla/5.0 (compatible; PrismaNoticias/1.0; +https://joanhispanista-star.github.io/prisma-noticias/)';
const ESPERA = 12000;        // ms por dirección
const A_LA_VEZ = 12;         // medios en paralelo
const POR_MEDIO = 10;        // titulares que se guardan de cada medio (con 14 el archivo pesaba 589 KB comprimido)
const MAX_DIAS = 4;          // lo más viejo que eso no es portada

/* ---------- utilidades de texto ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', euro: '€', copy: '©', reg: '®', deg: '°' };
function desEntidades(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return ''; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(+d); } catch (e) { return ''; } })
    .replace(/&([a-zA-Z]+);/g, (m, n) => (n in ENT ? ENT[n] : m));
}
const sinCdata = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
/* igual que stripHtml() de la app: fuera etiquetas, entidades resueltas, espacios en uno.
   Las entidades se resuelven dos veces porque muchos feeds las mandan dobles (&amp;quot;). */
function texto(s) {
  let t = desEntidades(sinCdata(s));
  t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ');
  return desEntidades(t).replace(/\s+/g, ' ').trim();
}
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function etiqueta(bloque, nombre) {            // contenido de <nombre ...>…</nombre>
  const m = bloque.match(new RegExp('<' + escRe(nombre) + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + escRe(nombre) + '>', 'i'));
  return m ? m[1] : '';
}
function atributo(etq, nombre) {               // valor de nombre="…" dentro de una etiqueta
  const m = etq.match(new RegExp('\\s' + escRe(nombre) + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i'));
  return m ? desEntidades(m[2] != null ? m[2] : m[3]) : '';
}
const etiquetas = (bloque, nombre) => bloque.match(new RegExp('<' + escRe(nombre) + '(?:\\s[^>]*)?/?>', 'gi')) || [];

/* ---------- la foto, con el mismo orden de preferencia que pickImg() en la app ---------- */
function foto(bloque, descCruda) {
  for (const e of etiquetas(bloque, 'media:content')) {
    const u = atributo(e, 'url'), ty = atributo(e, 'type'), me = atributo(e, 'medium');
    if (u && (me === 'image' || /image/.test(ty) || /\.(jpg|jpeg|png|webp)/i.test(u))) return u;
  }
  for (const e of etiquetas(bloque, 'media:thumbnail')) { const u = atributo(e, 'url'); if (u) return u; }
  for (const e of etiquetas(bloque, 'enclosure')) { if (/image/.test(atributo(e, 'type')) && atributo(e, 'url')) return atributo(e, 'url'); }
  for (const e of etiquetas(bloque, 'itunes:image')) { const u = atributo(e, 'href'); if (u) return u; }
  const m = desEntidades(sinCdata(descCruda || '')).match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : '';
}

const SECCION = /\/(mundo|internacional|world|politic[ao]|economi[ao]|business|money|tecnolog[ií]a|technology|tech|ciencia|science|salud|health|deporte|sport|cultura|culture|entertainment|espectaculos|farandula|gente|opinion)\b/i;

/* ---------- RSS o Atom → titulares con la misma forma que usa la app ---------- */
function leerFeed(xml, medioId) {
  const bloques = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  const salida = [];
  for (const b of bloques) {
    const titulo = texto(etiqueta(b, 'title')); if (!titulo) continue;
    let enlace = texto(etiqueta(b, 'link'));
    if (!enlace) {                                   // Atom: <link rel="alternate" href="…"/>
      for (const l of etiquetas(b, 'link')) {
        const rel = atributo(l, 'rel');
        if (!rel || rel === 'alternate') { enlace = atributo(l, 'href'); if (enlace) break; }
      }
    }
    if (!/^https?:\/\//i.test(enlace)) continue;     // sin enlace de verdad no hay nada que citar
    const descCruda = etiqueta(b, 'description') || etiqueta(b, 'summary') || etiqueta(b, 'content:encoded') || etiqueta(b, 'content');
    const fecha = texto(etiqueta(b, 'pubDate') || etiqueta(b, 'published') || etiqueta(b, 'updated') || etiqueta(b, 'dc:date'));
    let ts = fecha ? Date.parse(fecha) : 0; if (isNaN(ts)) ts = 0;
    // Google News añade " - Medio" al final del titular: se quita, como hace la app
    let t = titulo;
    if (enlace.indexOf('news.google.') > -1) t = titulo.replace(/\s+[-–|]\s+[^-–|]{2,45}$/, '').trim() || titulo;
    const cats = [];
    for (const m of b.matchAll(/<category(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/category>)/gi)) {
      const c = (atributo(m[0], 'term') || texto(m[1] || '')).trim().toLowerCase();
      if (c) cats.push(c);
      if (cats.length >= 6) break;
    }
    const secc = (enlace.match(SECCION) || [])[1]; if (secc) cats.push(secc.toLowerCase());
    salida.push({ title: t, link: enlace, desc: texto(descCruda).slice(0, 220), ts, img: foto(b, descCruda), outlet: medioId, cats });
  }
  return salida;
}

async function pedir(url) {
  const c = new AbortController(); const to = setTimeout(() => c.abort(), ESPERA);
  try {
    const r = await fetch(url, { signal: c.signal, redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*' } });
    if (!r.ok) return { error: 'responde ' + r.status };
    return { xml: await r.text() };
  } catch (e) { return { error: e.name === 'AbortError' ? 'no contesta en ' + ESPERA / 1000 + ' s' : ((e.cause && e.cause.code) || e.message) }; }
  finally { clearTimeout(to); }
}

async function medio(o) {
  let ultimo = 'sin RSS en el catálogo';
  for (const url of (o.rss || [])) {
    const r = await pedir(url);
    if (r.error) { ultimo = r.error; continue; }
    let items = leerFeed(r.xml, o.id);
    if (!items.length) { ultimo = 'feed vacío'; continue; }
    const limite = Date.now() - MAX_DIAS * 864e5;
    // sin fecha (ts=0) se conserva: hay feeds que no la mandan y sus noticias son de hoy
    items = items.filter(a => !a.ts || a.ts >= limite).sort((a, b) => b.ts - a.ts).slice(0, POR_MEDIO);
    if (!items.length) { ultimo = 'solo noticias de hace más de ' + MAX_DIAS + ' días'; continue; }
    return { id: o.id, items, via: /news\.google\./.test(url) ? 'google' : 'propio' };
  }
  return { id: o.id, items: [], error: ultimo };
}

async function main() {
  const CAT = JSON.parse(fs.readFileSync(path.join(DIR, 'catalogo.json'), 'utf8'));
  const t0 = Date.now();
  const res = []; let i = 0;
  await Promise.all(Array.from({ length: A_LA_VEZ }, async () => { while (i < CAT.length) res.push(await medio(CAT[i++])); }));
  const orden = Object.fromEntries(CAT.map((o, n) => [o.id, n]));
  res.sort((a, b) => orden[a.id] - orden[b.id]);

  const con = res.filter(r => r.items.length), sin = res.filter(r => !r.items.length);
  const items = con.flatMap(r => r.items);
  const doc = {
    v: 1,
    generado: new Date().toISOString(),
    medios: con.map(r => r.id),                                  // quiénes respondieron en esta vuelta
    faltan: Object.fromEntries(sin.map(r => [r.id, r.error])),   // y quiénes no, con su motivo
    items,
  };
  if (!fs.existsSync(SALIDA)) fs.mkdirSync(SALIDA, { recursive: true });
  const cuerpo = JSON.stringify(doc);
  fs.writeFileSync(path.join(SALIDA, 'titulares.json'), cuerpo);

  const porGoogle = con.filter(r => r.via === 'google').length;
  console.log('Robot de titulares · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  console.log('  medios con noticias : ' + con.length + ' de ' + CAT.length + '   (' + (con.length - porGoogle) + ' por su RSS, ' + porGoogle + ' por Google News)');
  console.log('  titulares           : ' + items.length);
  console.log('  con foto            : ' + Math.round(items.filter(a => a.img).length / (items.length || 1) * 100) + ' %');
  console.log('  peso                : ' + Math.round(cuerpo.length / 1024) + ' KB');
  if (sin.length) {
    const motivos = {}; sin.forEach(r => { motivos[r.error] = (motivos[r.error] || 0) + 1; });
    console.log('  sin noticias (' + sin.length + '): ' + Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([m, n]) => n + ' ' + m).join(' · '));
  }
  // Si casi nadie contesta, lo roto es el robot (o la red de GitHub), no el mundo:
  // mejor no publicar y que la app siga con el archivo anterior.
  if (con.length < 60) { console.error('✖ Solo ' + con.length + ' medios: no se publica esta vuelta.'); process.exit(1); }
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { leerFeed, texto, foto };
