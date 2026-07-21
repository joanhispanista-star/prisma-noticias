/* Prisma · Noticias del mundo — service worker
   Hace la app INSTALABLE en el escritorio y que funcione SIN internet una vez abierta.
   Archivo propio de Prisma (NO es el sw.js de MATRIX). Caché con nombre propio.
   Diseño seguro: solo toca peticiones del MISMO origen (el cascarón HTML);
   los proxies, fuentes, APIs de traducción, radio, archivo, YouTube (todos de otro
   origen) pasan DIRECTOS a la red sin que el SW los intercepte ni los cachee. */
const CACHE='prisma-shell-v1';
const SHELL=['./','./index.html','./noticias.html'];

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

  // El DOCUMENTO HTML: RED PRIMERO (siempre lo último cuando hay señal),
  // y si no hay red, servimos la copia cacheada → la app abre offline.
  if(req.mode==='navigate' || (req.headers.get('accept')||'').includes('text/html')){
    e.respondWith(
      fetch(req)
        .then(res=>{ const cp=res.clone(); caches.open(CACHE).then(c=>c.put('./noticias.html',cp)); return res; })
        .catch(()=>caches.match('./noticias.html').then(r=>r||caches.match('./')))
    );
    return;
  }

  // Resto de recursos del mismo origen: caché primero + refresco en segundo plano
  e.respondWith(
    caches.open(CACHE).then(async c=>{
      const hit=await c.match(req,{ignoreSearch:true});
      const net=fetch(req).then(r=>{ if(r&&r.ok) c.put(req,r.clone()); return r; }).catch(()=>hit);
      return hit||net;
    })
  );
});
