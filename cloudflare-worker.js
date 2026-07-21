/**
 * Prisma · Puente propio (Cloudflare Worker)
 * Un mini-servidor gratis que lee las fuentes por ti y las entrega con permiso CORS,
 * para que Prisma nunca dependa de puentes públicos que se saturan.
 *
 * Cómo usarlo: ver DESPLEGAR-PUENTE.txt (5 minutos, gratis, sin tarjeta).
 * Pega TODO este archivo en el editor del Worker en Cloudflare y pulsa "Deploy".
 */
export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const target = new URL(request.url).searchParams.get('url');
    if (!target) {
      return new Response('Prisma · puente activo. Usa ?url=<direccion>', { status: 200, headers: cors });
    }
    let t;
    try { t = new URL(target); } catch (e) {
      return new Response('URL invalida', { status: 400, headers: cors });
    }
    if (t.protocol !== 'http:' && t.protocol !== 'https:') {
      return new Response('Protocolo no permitido', { status: 400, headers: cors });
    }
    try {
      const resp = await fetch(target, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PrismaNoticias/1.0)', 'Accept': '*/*' },
        cf: { cacheTtl: 300, cacheEverything: true },
        redirect: 'follow',
      });
      const body = await resp.arrayBuffer();
      const h = new Headers(cors);
      h.set('Content-Type', resp.headers.get('content-type') || 'text/plain; charset=utf-8');
      h.set('Cache-Control', 'public, max-age=300');
      return new Response(body, { status: resp.status, headers: h });
    } catch (e) {
      return new Response('No se pudo leer la fuente', { status: 502, headers: cors });
    }
  },
};
