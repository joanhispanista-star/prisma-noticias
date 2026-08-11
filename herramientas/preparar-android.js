// Prepara lo que hace falta para que Prisma entre a Google Play como app.
//
// La técnica se llama TWA: la app de Android es una ventana sin barras que abre
// tu propia web. Es la misma que ya usaste para PlataDeuna, así que el JDK, el
// SDK y Bubblewrap ya están en tu equipo.
//
// Para que Android se fíe y quite la barra del navegador, tu sitio tiene que
// declarar que esa app es suya. Eso se hace con un archivo en
// .well-known/assetlinks.json que lleva la HUELLA de la llave que firma la app.
// La huella no es un secreto (es pública, va en el sitio); la contraseña de la
// llave sí, y esa no aparece por aquí ni hace falta para este paso.
//
//   node herramientas/preparar-android.js <HUELLA_SHA256>
//
// La huella se saca así (te pedirá la contraseña de tu llave; escríbela tú):
//   C:/Users/joanh/apk-tools/jdk/jdk-17.0.19+10/bin/keytool -list -v -keystore <tu.keystore> -alias <tu-alias>
// …o, mejor, cópiala de Play Console → Configuración → Integridad de la app →
// Certificado de firma de la app (esa es la que Google usará de verdad).
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');

const APP = {
  packageId: 'io.github.joanhispanistastar.prisma',
  host: 'joanhispanista-star.github.io',
  startUrl: '/prisma-noticias/noticias.html',
  name: 'Prisma · Noticias del mundo',
  launcherName: 'Prisma',
  themeColor: '#17181c',
  backgroundColor: '#17181c',
  manifestUrl: 'https://joanhispanista-star.github.io/prisma-noticias/manifest.webmanifest',
};

const huella = (process.argv[2] || '').trim().toUpperCase();
const valida = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(huella);

console.log('Prisma → app de Android\n');
console.log('  paquete    : ' + APP.packageId);
console.log('  arranca en : https://' + APP.host + APP.startUrl);
console.log('  manifiesto : ' + APP.manifestUrl + '\n');

if (!valida) {
  console.log(huella ? '  ✖ Esa huella no tiene la forma esperada.' : '  · Sin huella todavía.');
  console.log('    Se esperan 32 pares hexadecimales separados por dos puntos, así:');
  console.log('    AB:CD:12:34:...:EF  (64 caracteres + los dos puntos)\n');
  console.log('  Cuando la tengas:');
  console.log('    node herramientas/preparar-android.js AB:CD:12:...:EF\n');
  console.log('  Mientras tanto NO se escribe assetlinks.json: un archivo de enlace');
  console.log('  inválido publicado es peor que no tenerlo — Android lo lee, no le');
  console.log('  cuadra, y deja la barra del navegador puesta para siempre.');
  process.exit(0);
}

// 1) la declaración que tu sitio hace sobre la app
const wellKnown = path.join(DIR, '.well-known');
if (!fs.existsSync(wellKnown)) fs.mkdirSync(wellKnown);
const assetlinks = [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: { namespace: 'android_app', package_name: APP.packageId, sha256_cert_fingerprints: [huella] },
}];
fs.writeFileSync(path.join(wellKnown, 'assetlinks.json'), JSON.stringify(assetlinks, null, 2) + '\n');
console.log('  ✅ .well-known/assetlinks.json escrito');
console.log('     (GitHub Pages lo sirve porque el repo tiene .nojekyll; sin eso,');
console.log('      Jekyll se salta las carpetas que empiezan por punto)\n');

// 2) la receta para Bubblewrap
const twa = {
  packageId: APP.packageId, host: APP.host, name: APP.name, launcherName: APP.launcherName,
  display: 'standalone', themeColor: APP.themeColor, navigationColor: APP.themeColor,
  backgroundColor: APP.backgroundColor, startUrl: APP.startUrl,
  iconUrl: 'https://' + APP.host + '/prisma-noticias/icono-512.png',
  maskableIconUrl: 'https://' + APP.host + '/prisma-noticias/icono-512.png',
  appVersionName: '1.0.0', appVersionCode: 1,
  shortcuts: [], generatorApp: 'bubblewrap-cli', webManifestUrl: APP.manifestUrl,
  fallbackType: 'customtabs', enableNotifications: false, orientation: 'default',
};
fs.writeFileSync(path.join(__dirname, 'twa-manifest-prisma.json'), JSON.stringify(twa, null, 2) + '\n');
console.log('  ✅ herramientas/twa-manifest-prisma.json escrito\n');

console.log('  Siguiente paso, en una carpeta VACÍA fuera de este repo:');
console.log('    npx @bubblewrap/cli init --manifest ' + APP.manifestUrl);
console.log('    npx @bubblewrap/cli build');
console.log('  Te pedirá la contraseña de tu llave: escríbela tú, no la pegues en el chat.');
