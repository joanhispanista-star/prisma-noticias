// Comprueba que los gráficos de la tienda cumplen lo que Google exige,
// leyendo la cabecera real del PNG en vez de fiarse del nombre del archivo.
// Uso:  node herramientas/comprobar-graficos.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');

// Un PNG empieza siempre por la misma firma de 8 bytes y sigue con el bloque
// IHDR, donde el ancho y el alto van en 4 bytes cada uno, big-endian.
function medirPng(ruta) {
  const b = fs.readFileSync(ruta);
  const firma = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!b.subarray(0, 8).equals(firma)) return { error: 'no es un PNG de verdad' };
  if (b.subarray(12, 16).toString('ascii') !== 'IHDR') return { error: 'PNG sin cabecera IHDR' };
  return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20), bytes: b.length,
           bits: b[24], tipoColor: b[25] };
}

const EXIGE = [
  { archivo: 'grafico-play-1024x500.png', ancho: 1024, alto: 500, maxMB: 15, que: 'gráfico destacado' },
  { archivo: 'icono-512.png',             ancho: 512,  alto: 512, maxMB: 1,  que: 'icono de la app' },
];

let mal = 0;
for (const e of EXIGE) {
  const ruta = path.join(DIR, e.archivo);
  if (!fs.existsSync(ruta)) { console.log('  ❌ falta ' + e.archivo); mal++; continue; }
  const m = medirPng(ruta);
  if (m.error) { console.log('  ❌ ' + e.archivo + ': ' + m.error); mal++; continue; }
  const medidaOk = m.ancho === e.ancho && m.alto === e.alto;
  const pesoOk = m.bytes <= e.maxMB * 1024 * 1024;
  if (!medidaOk || !pesoOk) mal++;
  console.log('  ' + (medidaOk && pesoOk ? '✅' : '❌') + ' ' + e.que.padEnd(20) +
              m.ancho + '×' + m.alto + ' (pide ' + e.ancho + '×' + e.alto + ')  ' +
              Math.round(m.bytes / 1024) + ' KB de ' + e.maxMB + ' MB');
}
console.log('\n================ ' + (EXIGE.length - mal) + ' de ' + EXIGE.length + ' listos para subir ================');
process.exit(mal ? 1 : 0);
