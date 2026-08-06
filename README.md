# Prisma · Noticias del mundo

Un canal de noticias que reúne muchas fuentes del mundo, las **filtra** y **traduce**, las muestra en un **mapa**, e incluye **video, shorts y radio** — y sobre todo, deja ver la **trayectoria y el sesgo (izquierda–derecha)** de cada medio para que el lector decida.

- **App en vivo:** https://joanhispanista-star.github.io/prisma-noticias/
- **Instalable:** en escritorio (Chrome/Edge → *Instalar*) y en iPhone (Safari → *Añadir a pantalla de inicio*). Funciona **sin internet** una vez abierta (service worker).
- **Tus datos** (preferencias, guardados, clave de traducción) viven solo en tu dispositivo (localStorage).

## Estructura del código
El código está separado para facilitar el diseño y el mantenimiento (se sirve por web; ya **no** se abre por `file://` porque el catálogo se carga por `fetch`):

| Archivo | Qué es |
|---|---|
| `noticias.html` | Cascarón: `<head>` (meta, manifest, fuentes) + el HTML de todas las pestañas. Enlaza `estilos.css` y `app.js`. |
| `estilos.css` | **Todo el diseño visual** (colores, tipografía, layout). Empieza por las variables en `:root`. |
| `app.js` | Toda la lógica (feeds, proxies, traducción, mapa, render…). En `boot()` carga el catálogo y arranca. |
| `catalogo.json` | Los **221 medios** (sesgo, propiedad, país del dueño, RSS…). Una línea JSON por medio. |
| `envivo.json` | Los **canales de TV que se pueden ver en directo**. No se escribe a mano: lo generan las herramientas. |
| `sw-prisma.js` | Service worker: hace la app instalable y offline. |
| `index.html` | Redirección a `noticias.html`. |
| `cloudflare-worker.js` + `DESPLEGAR-PUENTE.txt` | Puente propio opcional para esquivar los proxies públicos. |

> Para rediseñar la interfaz, casi todo vive en **`estilos.css`** (aspecto) y en el marcado de **`noticias.html`** (estructura). La paleta y las variables están al inicio de `estilos.css`.

## Qué incluye
- **Portada:** feed agregado de 221 medios, con filtros por tema, región y sesgo, y buscador. Botón "Buscar en el mundo" (GDELT), e **Historias con puntos ciegos**.
- **Mundo:** mapa con las noticias ubicadas por ciudad/país.
- **En vivo:** televisión de noticias 24 horas (CNN en Español, RTVE 24H, DW, Al Jazeera, Noticias RCN, CityTv…), cada canal con el **sesgo del medio que emite**.
- **Video / Shorts:** de canales de noticias de YouTube.
- **Radio:** emisoras de noticias en vivo (radio-browser).
- **Canales:** directorio con el medidor de sesgo, la historia, el dueño (y "seguir el dinero") y la credibilidad de cada medio.
- **Prisma / Archivo / Comunidad:** resumen con IA, hemeroteca y documentales, y noticias locales + desmentidos + reportes ciudadanos.

## Cómo se decide qué sale en “En vivo”
No por fama ni por el título de la emisión: **por el reloj**. Las herramientas
preguntan a YouTube canal por canal quién está emitiendo y **desde cuándo**. Una
señal continua lleva días o años encendida sin cortarse; una transmisión suelta
—un juicio, una rueda de prensa— unas horas. Solo entran las continuas.

```bash
node herramientas/comprobar-envivo.js      # 1. quién está en vivo ahora
node herramientas/comprobar-senales.js     # 2. cuánto lleva al aire cada uno
node herramientas/resolver-canales.js      # 3. canales de fuera del catálogo
node herramientas/armar-envivo.js          # 4. arma envivo.json
node herramientas/comprobar-incrustable.js # 5. ¿deja YouTube verlo dentro de Prisma?
```

Las dos decisiones a mano están escritas con su motivo en `armar-envivo.js`
(por ejemplo, la señal 24 h de CGTN quedó fuera: es un canal de viajes, no de
noticias). Si un canal deja de emitir, el reproductor lo dice; para refrescar la
lista se vuelven a correr los pasos.

## Sobre el sesgo
Las clasificaciones izquierda–derecha y de credibilidad provienen de terceros (**AllSides**, **Media Bias/Fact Check**, **Ad Fontes Media**) y son orientativas, no un juicio de Prisma. Los medios estatales van marcados como tales, con quién los financia.

---
Parte de la familia **Joan te presta**.
