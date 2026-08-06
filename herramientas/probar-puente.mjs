// Somete el puente a las mismas 16 pruebas, ANTES y DESPUÉS de desplegarlo.
// Comprueba que deja pasar lo de Prisma y que rechaza todo lo demás — sobre todo
// que no se pueda usar como proxy abierto, que es lo que vacía la cuota y hace
// que Cloudflare cierre cuentas.
//
//   node herramientas/probar-puente.mjs
//        → prueba el CÓDIGO de cloudflare-worker.js aquí mismo, en Node
//
//   node herramientas/probar-puente.mjs https://prisma-puente.TU-USUARIO.workers.dev
//        → prueba el worker YA DESPLEGADO, tal como lo verá la app
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESPLEGADO = (process.argv[2] || '').replace(/\/+$/, '');

let worker = null;
if (!DESPLEGADO) {
  const fuente = fs.readFileSync(path.join(DIR, 'cloudflare-worker.js'), 'utf8');
  // el worker es un módulo ES; se carga desde memoria sin escribir nada al disco
  worker = (await import('data:text/javascript;base64,' + Buffer.from(fuente).toString('base64'))).default;
}
console.log(DESPLEGADO ? ('Probando el puente desplegado en ' + DESPLEGADO + '\n')
                       : 'Probando el código de cloudflare-worker.js (sin desplegar)\n');

const SITIO = 'https://joanhispanista-star.github.io';
let ok = 0, mal = 0;
const ck = (nombre, cond, extra = '') => { cond ? ok++ : mal++; console.log((cond ? '  ✅ ' : '  ❌ ') + nombre + (extra ? '  ' + extra : '')); };

const pedir = (destino, { origen, referer, metodo = 'GET' } = {}) => {
  const h = {};
  if (origen) h['Origin'] = origen;
  if (referer) h['Referer'] = referer;
  const base = DESPLEGADO || 'https://prisma-puente.workers.dev';
  const u = base + '/' + (destino ? '?url=' + encodeURIComponent(destino) : '');
  return DESPLEGADO ? fetch(u, { method: metodo, headers: h, redirect: 'follow' })
                    : worker.fetch(new Request(u, { method: metodo, headers: h }));
};

console.log('[1] Puerta de entrada: ¿quién puede usarlo?');
{
  const r = await pedir('https://feeds.bbci.co.uk/news/world/rss.xml', { origen: 'https://sitio-de-otro.com' });
  ck('rechaza a un sitio ajeno', r.status === 403, 'http=' + r.status);
}
{
  const r = await pedir('https://feeds.bbci.co.uk/news/world/rss.xml');
  ck('rechaza sin Origin ni Referer (proxy suelto)', r.status === 403, 'http=' + r.status);
}
{
  const r = await pedir(null, { origen: SITIO });
  const t = await r.text();
  ck('sin ?url responde que está vivo', r.status === 200 && /puente activo/.test(t));
}
{
  const r = await pedir('https://feeds.bbci.co.uk/news/world/rss.xml', { origen: SITIO, metodo: 'POST' });
  ck('rechaza métodos que no sean lectura', r.status === 405, 'http=' + r.status);
}
{
  const r = await worker.fetch(new Request('https://prisma-puente.workers.dev/', { method: 'OPTIONS' }));
  ck('responde al saludo previo del navegador (OPTIONS)', r.status === 200 && r.headers.get('Access-Control-Allow-Origin') === '*');
}

console.log('\n[2] Qué se puede pedir a través de él');
{
  const r = await pedir('https://ejemplo-cualquiera.com/algo.xml', { origen: SITIO });
  ck('rechaza una web que no es del catálogo', r.status === 403, 'http=' + r.status);
}
{
  const r = await pedir('http://127.0.0.1:8080/secreto', { origen: SITIO });
  ck('rechaza direcciones de la red interna', r.status === 403, 'http=' + r.status);
}
{
  const r = await pedir('ftp://archivo.example.com/x', { origen: SITIO });
  ck('rechaza protocolos raros', r.status === 400, 'http=' + r.status);
}
{
  const r = await pedir('esto no es una direccion', { origen: SITIO });
  ck('rechaza una dirección torcida', r.status === 400, 'http=' + r.status);
}

console.log('\n[3] Lo que SÍ tiene que funcionar (peticiones reales)');
{
  const r = await pedir('https://feeds.bbci.co.uk/news/world/rss.xml', { origen: SITIO });
  const t = await r.text();
  ck('trae el RSS de un medio del catálogo', r.status === 200 && /<rss|<feed|<channel/i.test(t.slice(0, 800)), 'http=' + r.status + ' ' + t.length + 'b');
  ck('lo entrega con permiso CORS', r.headers.get('Access-Control-Allow-Origin') === '*');
}
{
  const r = await pedir('https://www.eltiempo.com/rss/colombia.xml', { referer: SITIO + '/prisma-noticias/noticias.html' });
  const t = await r.text();
  ck('vale también con Referer en vez de Origin', r.status === 200 && /<rss|<item/i.test(t.slice(0, 800)), 'http=' + r.status);
}
{
  const r = await pedir('https://www.youtube.com/feeds/videos.xml?channel_id=UC16niRr50-MSBwiO3YDb3RA', { origen: SITIO });
  const t = await r.text();
  ck('deja pasar los feeds de YouTube (Video y Shorts)', r.status === 200 && /<entry/i.test(t), 'http=' + r.status);
}
/* Ojo con estos dos: archive.org y GDELT cortan con 429 cuando una misma
   dirección les pregunta seguido. Ese 429 lo pone el servicio de arriba, NO el
   puente, así que aquí se comprueba lo que sí depende de nosotros: que el
   puente los deje pasar (que no responda 403). El 429 se anota aparte. */
const dejaPasar = async (nombre, url) => {
  const r = await pedir(url, { origen: SITIO });
  const t = await r.text();
  const bloqueadoPorNosotros = r.status === 403;
  const cortadoPorEllos = r.status === 429;
  ck(nombre, !bloqueadoPorNosotros,
     'http=' + r.status + (cortadoPorEllos ? '  (429 lo pone el servicio, no el puente: guarda respuesta ' + 1800 + 's justo para esto)' : ''));
  return t;
};
await dejaPasar('deja pasar el archivo (portadas de otro día)', 'https://archive.org/wayback/available?url=nytimes.com&timestamp=20010911');
await dejaPasar('deja pasar GDELT (buscar en el mundo)', 'https://api.gdeltproject.org/api/v2/doc/doc?query=Colombia&mode=artlist&format=json&maxrecords=5');
{
  const r = await pedir('https://news.google.com/rss/search?q=Quibd%C3%B3&hl=es-419&gl=CO&ceid=CO:es-419', { origen: SITIO });
  const t = await r.text();
  ck('deja pasar Google News (tu municipio, desmentidos)', r.status === 200 && /<item/i.test(t), 'http=' + r.status);
}

console.log('\n================ ' + ok + ' OK · ' + mal + ' FALLOS ================');
process.exit(mal ? 1 : 0);
