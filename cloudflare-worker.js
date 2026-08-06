/**
 * Prisma · El puente (Cloudflare Worker)
 *
 * Un mini-servidor gratis que lee las fuentes por ti y las entrega con permiso
 * CORS, para que Prisma no dependa de puentes públicos que se saturan.
 *
 * Cómo usarlo: ver DESPLEGAR-PUENTE.txt (10 minutos, gratis, sin tarjeta).
 * Pega TODO este archivo en el editor del Worker en Cloudflare y pulsa "Deploy".
 *
 * IMPORTANTE — por qué este puente NO es un proxy abierto:
 * la dirección de tu worker queda escrita en app.js, que está en un repositorio
 * público. Hay gente que rastrea GitHub buscando exactamente eso: puentes que
 * reenvíen cualquier cosa a cualquiera. Si el tuyo lo hiciera, te vaciarían las
 * 100.000 lecturas del día y Cloudflare podría cerrarte la cuenta por abuso.
 * Por eso este puente comprueba DOS cosas antes de mover un dedo:
 *   1. que quien llama sea Prisma (la lista SITIOS), y
 *   2. que lo pedido sea un medio del catálogo o una de las APIs que usa
 *      (la lista se saca del propio catalogo.json, así nunca se desactualiza).
 */

/* 1) Quién puede usar este puente. Si algún día pones dominio propio, añádelo. */
const SITIOS = [
  'https://joanhispanista-star.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

/* 2) Qué se puede pedir a través de él, además de los medios del catálogo:
      los servicios que Prisma consulta de verdad, y nada más. */
const CATALOGO = 'https://joanhispanista-star.github.io/prisma-noticias/catalogo.json';
const APIS = [
  'api.gdeltproject.org',          // buscar en el mundo · hemeroteca de prensa
  'news.google.com',               // noticias de tu municipio · desmentidos
  'www.youtube.com', 'youtube.com',// video, shorts y señales en vivo
  'archive.org', 'web.archive.org',// documentales, TV histórica, portadas de otro día
  'translate.googleapis.com',      // traducción
  'api.mymemory.translated.net',   // traducción de respaldo
];

/* Cuánto guardar cada respuesta, en segundos.
   GDELT limita a una consulta cada 5 segundos POR DIRECCIÓN, y archive.org
   también corta con 429 cuando se le pide seguido (comprobado). Guardando sus
   respuestas más tiempo, muchos lectores comparten una sola consulta y el
   límite deja de notarse. Además, una portada de 2001 no va a cambiar: guardarla
   media hora no le quita frescura a nadie.
   Los feeds de noticias, en cambio, tienen que refrescar rápido. */
const GUARDAR = {
  'api.gdeltproject.org': 1800,
  'archive.org': 1800,
  'web.archive.org': 1800,
  defecto: 300,
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': '*',
};
const no = (motivo, code) => new Response(motivo, { status: code, headers: CORS });

/* --- lista de hosts permitidos, sacada del catálogo y guardada en memoria --- */
let PERMITIDOS = null, CADUCA = 0;
async function hostsPermitidos() {
  const ahora = Date.now();
  if (PERMITIDOS && ahora < CADUCA) return PERMITIDOS;
  const set = new Set(APIS);
  try {
    const r = await fetch(CATALOGO, { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (r.ok) {
      for (const medio of await r.json()) {
        for (const u of [...(medio.rss || []), medio.sitio]) {
          if (!u) continue;
          try { set.add(new URL(u).hostname.toLowerCase()); } catch (e) { /* dirección torcida en el catálogo */ }
        }
      }
    }
  } catch (e) { /* sin catálogo seguimos con las APIs: mejor poco que todo */ }
  PERMITIDOS = set;
  CADUCA = ahora + 3600e3;
  return set;
}

function permitido(host, set) {
  host = host.toLowerCase();
  if (set.has(host)) return true;
  // un medio puede servir su RSS desde otro subdominio del mismo sitio
  for (const h of set) if (host.endsWith('.' + h)) return true;
  return false;
}

/* direcciones que nunca son un medio de noticias: red interna, la propia máquina */
const PRIVADA = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|172\.(1[6-9]|2\d|3[01])\.)/i;

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'GET' && request.method !== 'HEAD') return no('Solo lectura', 405);

    const origen = request.headers.get('Origin') || '';
    const desde = request.headers.get('Referer') || '';
    const suyo = SITIOS.some(s => origen === s || desde.startsWith(s + '/'));

    const target = new URL(request.url).searchParams.get('url');
    if (!target) {
      return new Response(
        'Prisma · puente activo.\n\n' +
        'Este puente solo atiende a Prisma y solo a las fuentes de su catálogo.\n' +
        'No es un proxy de uso general.\n',
        { status: 200, headers: CORS });
    }
    // sin Origin ni Referer conocidos no se sirve: así no se puede usar de proxy suelto
    if (!suyo) return no('Este puente solo atiende a Prisma', 403);

    let t;
    try { t = new URL(target); } catch (e) { return no('Dirección inválida', 400); }
    if (t.protocol !== 'http:' && t.protocol !== 'https:') return no('Protocolo no permitido', 400);
    if (PRIVADA.test(t.hostname)) return no('Dirección no permitida', 403);

    const set = await hostsPermitidos();
    if (!permitido(t.hostname, set)) return no('Esa fuente no está en el catálogo de Prisma', 403);

    const ttl = GUARDAR[t.hostname] || GUARDAR.defecto;
    try {
      const resp = await fetch(t.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PrismaNoticias/1.0)', 'Accept': '*/*' },
        cf: { cacheTtl: ttl, cacheEverything: true },
        redirect: 'follow',
      });
      // se reenvía en streaming: ni se acumula en memoria ni se gasta CPU de más
      const h = new Headers(CORS);
      h.set('Content-Type', resp.headers.get('content-type') || 'text/plain; charset=utf-8');
      h.set('Cache-Control', 'public, max-age=' + ttl);
      return new Response(resp.body, { status: resp.status, headers: h });
    } catch (e) {
      return no('No se pudo leer la fuente', 502);
    }
  },
};
