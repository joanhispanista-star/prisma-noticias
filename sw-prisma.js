/* Prisma · Noticias del mundo — service worker
   Hace la app INSTALABLE en el escritorio y que funcione SIN internet una vez abierta.
   Archivo propio de Prisma (NO es el sw.js de MATRIX). Caché con nombre propio.
   Diseño seguro: solo toca peticiones del MISMO origen (el cascarón HTML);
   los proxies, fuentes, APIs de traducción, radio, archivo, YouTube (todos de otro
   origen) pasan DIRECTOS a la red sin que el SW los intercepte ni los cachee. */
const CACHE='prisma-shell-v3';
const SHELL=['./','./index.html','./noticias.html','./estilos.css','./app.js','./catalogo.json','./envivo.json'];

self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(ks=>Promise.all(ks.map(k=>k===CACHE?null:caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

// kill-switch / actualización forzada desde la página si hiciera falta
self.addEventListener('message',e=>{ if(e.data==='skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  let url; try{ url=new URL(req.url); }catch(_){ return; }
  // Otro origen (proxies/fuentes/APIs/YouTube/archive…) → red directa, el SW no se mete
  if(url.origin!==location.origin) return;

  // Mismo origen (cascarón + estilos.css + app.js + catalogo.json): RED PRIMERO —
  // siempre lo último cuando hay señal; si no hay red, la copia cacheada → la app abre offline.
  // (network-first en todo evita servir una versión desincronizada durante el diseño).
  e.respondWith(
    fetch(req)
      .then(res=>{ if(res&&res.ok){ const cp=res.clone(); caches.open(CACHE).then(c=>c.put(req,cp)); } return res; })
      .catch(()=>caches.match(req,{ignoreSearch:true}).then(r=> r || (req.mode==='navigate' ? caches.match('./noticias.html') : undefined)))
  );
});
