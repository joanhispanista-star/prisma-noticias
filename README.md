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
| `sw-prisma.js` | Service worker: hace la app instalable y offline. |
| `index.html` | Redirección a `noticias.html`. |
| `cloudflare-worker.js` + `DESPLEGAR-PUENTE.txt` | Puente propio opcional para esquivar los proxies públicos. |

> Para rediseñar la interfaz, casi todo vive en **`estilos.css`** (aspecto) y en el marcado de **`noticias.html`** (estructura). La paleta y las variables están al inicio de `estilos.css`.

## Qué incluye
- **Portada:** feed agregado de 221 medios, con filtros por tema, región y sesgo, y buscador. Botón "Buscar en el mundo" (GDELT), e **Historias con puntos ciegos**.
- **Mundo:** mapa con las noticias ubicadas por ciudad/país.
- **Video / Shorts:** de canales de noticias de YouTube.
- **Radio:** emisoras de noticias en vivo (radio-browser).
- **Canales:** directorio con el medidor de sesgo, la historia, el dueño (y "seguir el dinero") y la credibilidad de cada medio.
- **Prisma / Archivo / Comunidad:** resumen con IA, hemeroteca y documentales, y noticias locales + desmentidos + reportes ciudadanos.

## Sobre el sesgo
Las clasificaciones izquierda–derecha y de credibilidad provienen de terceros (**AllSides**, **Media Bias/Fact Check**, **Ad Fontes Media**) y son orientativas, no un juicio de Prisma. Los medios estatales van marcados como tales, con quién los financia.

---
Parte de la familia **Joan te presta**.
