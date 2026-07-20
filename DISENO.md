# Guía de diseño: tus propias imágenes

Todo lo que subas aquí aparece solo en la web, sin tocar código. La regla
es simple: **el nombre del archivo y la carpeta tienen que ser EXACTOS**
(mayúsculas/minúsculas incluidas). Mientras no subas un archivo, la web se
ve como hoy (con el ícono/texto actual) — nada se rompe.

## Dónde van los archivos

Carpeta: **`public/branding/`** (en el repositorio de GitHub). Puedes
subirlos ahí directamente desde la web de GitHub (Add file → Upload files)
o pedirme que los suba yo si me los compartes.

## Los 8 archivos que puedes reemplazar

| Archivo (nombre EXACTO) | Tamaño exacto | Formato | Fondo |
|---|---|---|---|
| `logo.png` | **600 × 160 px** (horizontal) | PNG | Transparente |
| `logo-icon.png` | **512 × 512 px** (cuadrado, solo el símbolo, sin texto) | PNG | Transparente |
| `fondo.jpg` | **1920 × 1080 px** o más grande (entre más grande, mejor se ve en pantallas grandes) | JPG o PNG | No aplica |
| `rango-pokeball.png` | **128 × 128 px** | PNG | Transparente |
| `rango-superball.png` | **128 × 128 px** | PNG | Transparente |
| `rango-ultraball.png` | **128 × 128 px** | PNG | Transparente |
| `rango-masterball.png` | **128 × 128 px** | PNG | Transparente |
| `rango-enteball.png` | **128 × 128 px** | PNG | Transparente |

### ¿Dónde se usa cada uno?

- **`logo.png`**: arriba a la izquierda, en el encabezado de toda la app (reemplaza el ícono ✨ + texto "Encuentra Cartas" que hay ahora).
- **`logo-icon.png`**: el ícono que aparece en la pestaña del navegador (favicon).
- **`fondo.jpg`**: fondo de pantalla completa detrás de toda la app, cubre toda la pantalla sin deformarse (se recorta según el tamaño de cada pantalla, tipo "cover").
- **`rango-*.png`**: el ícono junto al nombre de cada rango (Poké/Super/Ultra/Master/Ente Ball) en las insignias que aparecen por toda la app — reemplaza los emojis ⚪🔵🟣🟡🔴 que hay ahora.

## Botones y colores

Los botones **no funcionan con una imagen fija** (tienen que mostrar texto
de distintos tamaños, cambiar al pasar el mouse, verse bien deshabilitados,
etc.), así que en vez de un archivo, necesito que me des:

1. Tu paleta de colores (puede ser un código hex de cada uno, ej. `#FF2E9A`), o una captura/referencia de otra página/diseño que te guste.
2. El estilo de forma que quieras: ¿bordes muy redondeados (pill), poco redondeados, o rectos? ¿Con sombra/brillo (glow) o planos?

Con eso lo traduzco a estilos que sí funcionan en cualquier tamaño y estado.

## La reestructuración (wireframe)

Cuando tengas listo tu wireframe (boceto de dónde va cada cosa), mándamelo
como imagen, link de Figma, o descríbemelo con detalle — y reconstruyo el
acomodo de las secciones para que coincida.
