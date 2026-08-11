// Saca el manifiesto y el icono de dentro del HTML y los deja como archivos.
//
// Estaban incrustados como direcciones "data:" — cómodo mientras Prisma era un
// solo archivo, pero eso impide empaquetarla para Google Play: Bubblewrap pide
// el manifiesto por su dirección, y una "data:" no tiene dirección que pedir.
//
// Uso:  node herramientas/extraer-manifiesto.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(DIR, 'noticias.html'), 'utf8');

// 1) el icono, que viaja en base64 dentro del <link rel="icon">
const mIcono = html.match(/<link rel="icon"[^>]*href="data:image\/png;base64,([^"]+)"/);
if (!mIcono) { console.log('No encontré el icono incrustado en noticias.html'); process.exit(1); }
const png = Buffer.from(mIcono[1], 'base64');
fs.writeFileSync(path.join(DIR, 'icono-512.png'), png);
console.log('  icono-512.png          ' + png.length + ' bytes');

// 2) el manifiesto, que viaja codificado en la URL del <link rel="manifest">
const mMan = html.match(/<link rel="manifest" href="data:application\/json,([^"]+)"/);
const previo = mMan ? JSON.parse(decodeURIComponent(mMan[1])) : {};

const manifiesto = {
  name: previo.name || 'Prisma · Noticias del mundo',
  short_name: previo.short_name || 'Prisma',
  description: 'Las noticias del mundo de 221 medios, con el sesgo y el dueño de cada uno a la vista.',
  start_url: './noticias.html',
  scope: './',
  display: 'standalone',
  orientation: 'any',
  background_color: previo.background_color || '#17181c',
  theme_color: previo.theme_color || '#17181c',
  lang: 'es-CO',
  dir: 'ltr',
  categories: ['news', 'magazines'],
  icons: [
    { src: 'icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  shortcuts: [
    { name: 'Canal', short_name: 'Canal', description: 'El noticiero que se elige solo', url: './noticias.html#canal' },
    { name: 'En vivo', short_name: 'En vivo', description: 'Televisión de noticias 24 horas', url: './noticias.html#envivo' },
  ],
};
fs.writeFileSync(path.join(DIR, 'manifest.webmanifest'), JSON.stringify(manifiesto, null, 2) + '\n');
console.log('  manifest.webmanifest   ' + Object.keys(manifiesto).length + ' campos, ' + manifiesto.icons.length + ' iconos');
console.log('\nAhora en noticias.html el <link rel="manifest"> tiene que apuntar a manifest.webmanifest');
