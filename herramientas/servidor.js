// Servidor de pruebas de Prisma · Noticias.
// Sirve la carpeta padre por http (la app ya no abre por file:// porque el
// catálogo se carga por fetch). Uso:  node herramientas/servidor.js [puerto]
const http = require('http'), fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const PUERTO = Number(process.argv[2]) || 8203;
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.webmanifest': 'application/manifest+json',
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/noticias.html';
  const file = path.join(DIR, rel);
  // nadie sale de la carpeta del proyecto
  if (!file.startsWith(DIR)) { res.writeHead(403).end('403'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}).end('No está: ' + rel); return; }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',   // en pruebas siempre queremos el archivo de ahora
    });
    res.end(buf);
  });
}).listen(PUERTO, () => console.log('Prisma en pruebas:  http://localhost:' + PUERTO + '/'));
