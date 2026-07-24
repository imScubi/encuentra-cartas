# Sistema de rangos / suscripciones
<!-- ping deploy directo a main 2026-07-21 16:33 UTC -->

**Dominio oficial:** `encuentracartasmx.com` (comprado y conectado directo
en Vercel → Settings → Domains; el dominio de respaldo
`encuentra-cartas-nmcc-seven.vercel.app` sigue funcionando igual). No
requirió ningún cambio de código — las URLs de Mercado Pago (`back_urls`,
`notification_url`) se arman en `api/mercadopago/gestionar.js` a partir del
dominio desde el que llega la petición (`req.headers.host`), así que
adaptan solas al dominio que se esté usando en cada momento.

## 50. SEO básico: que Google pueda encontrar e indexar la página

Se agregó lo que depende del código (necesario, pero no basta por sí solo
para aparecer en Google — falta la parte manual en Search Console, ver
más abajo):
- `index.html`: título y descripción pensados para búsquedas reales
  ("Encuentra Cartas — Compra y vende cartas coleccionables en México"),
  etiqueta `canonical` apuntando al dominio oficial, y las etiquetas Open
  Graph/Twitter (para que se vea bien la miniatura cuando alguien comparte
  el link en WhatsApp, Facebook, etc.) más un bloque de datos
  estructurados (`JSON-LD` tipo `WebSite`) que ayuda a Google a entender
  de qué trata el sitio.
- `public/robots.txt` y `public/sitemap.xml`: le dicen a Google que puede
  rastrear todo el sitio y dónde está el mapa del sitio.

**Lo que falta es manual, en Google Search Console** (gratis,
search.google.com/search-console):
1. Agregar la propiedad `encuentracartasmx.com` (verificación por DNS: te
   da un registro TXT que agregas en Vercel → tu dominio → DNS Records).
2. Una vez verificado, en "Sitemaps" pega `https://encuentracartasmx.com/sitemap.xml`.
3. En "Inspección de URLs" pega la URL principal y dale "Solicitar
   indexación" para acelerar que Google la vea por primera vez.
4. Opcional pero muy recomendable para que aparezca en búsquedas locales
   ("cartas Pokémon Monterrey", etc.): crear un perfil de Google Business.

Aparecer indexado suele tardar de días a un par de semanas; **rankear
bien** para un término como "encuentra cartas" toma más tiempo y depende
de que más gente entre, comparta el link y publique contenido real — no
hay atajo instantáneo de código para eso.

Guía para dejar funcionando de verdad lo que se agregó: los 5 rangos (Cuarzo,
Zafiro, Amatista, Diamante, Aurora — internamente siguen guardados como
pokeball/superball/ultraball/masterball/enteball en la base de datos), cobro
con Mercado Pago, Wishlist Premium con notificaciones push, y el importador
masivo de Aurora.

## 1. Base de datos (obligatorio, hazlo primero)

Abre tu proyecto en Supabase → **SQL Editor** → *New query*, pega el contenido
de `supabase/migrations/002_suscripciones.sql` y dale **Run**. Es seguro
volver a correrlo si algo falla a medias.

Esto agrega:
- `perfiles.plan` (`pokeball` por defecto), `plan_vence`, `instagram`, `google_maps_url`
- Tabla `alertas` (Wishlist Premium)
- Tabla `push_subscriptions`
- Tabla `pagos`

Si quieres regalar Diamante 90 días a las tiendas que ya tienes cargadas
(recomendado para poblar la app rápido), descomenta y corre el `update` al
final del mismo archivo.

También corre (en el mismo SQL Editor, uno por uno, en orden):
- `supabase/migrations/003_webhooks.sql` (si no lo has corrido ya — conecta la Wishlist con las publicaciones nuevas)
- `supabase/migrations/004_alertas_carta_exacta.sql` (permite que una alerta apunte a una carta/producto exacto, con imagen y precio de referencia)
- `supabase/migrations/005_boost.sql` (agrega el sistema de "Destacar" publicaciones por 3 o 7 días)
- `supabase/migrations/006_renovacion_automatica.sql` (agrega `perfiles.mp_preapproval_id`, para la renovación automática)
- `supabase/migrations/007_avatar.sql` (agrega `perfiles.avatar_url` y crea el bucket de Storage `avatars` para fotos de perfil subidas por los usuarios)
- `supabase/migrations/008_email_perfiles.sql` (agrega `perfiles.email`, necesario para poder mandar avisos por correo)
- `supabase/migrations/009_anuncios.sql` (agrega el flujo completo de Anuncios: pendiente/programado/publicado/rechazado, y programa el cron interno de Supabase que publica los anuncios programados — **antes de correrlo**, edita el archivo y reemplaza `TU-DOMINIO` y `TU_CRON_SECRET` por tus valores reales)

## 2. Variables de entorno (en Vercel → tu proyecto → Settings → Environment Variables)

| Variable | De dónde sale | Notas |
|---|---|---|
| `SUPABASE_URL` | `https://nulypgaaekexlbxbxdwq.supabase.co` | ya la conoces |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` | **nunca** la pongas en el frontend ni la subas a git |
| `MP_ACCESS_TOKEN` | Mercado Pago → tu cuenta → Developers → Credenciales | usa el **Access Token de prueba** mientras pruebas |
| `PUBLIC_BASE_URL` | `https://encuentracartasmx.com` (dominio oficial ya conectado) | sin `/` al final; opcional — si no la pones, el código igual arma la URL sola a partir del dominio desde el que llega la petición |
| `VAPID_PUBLIC_KEY` | `BBPa0Sb2JnCX1McAm78espGKsZw8B7lYD2CFV4F_-F_9EghLKVjuhmSnVYh8YRkLgTibA5l5b5OKoujZD3_Dn8c` | ya generada, coincide con la que está en `src/App.jsx` |
| `VAPID_PRIVATE_KEY` | te la doy en el resumen de este chat (no está en ningún archivo del repo) | cópiala directo a Vercel, no la subas a git |
| `VAPID_SUBJECT` | `mailto:contacto@encuentracartasmx.com` (o el correo de contacto que prefieras) | cualquier correo de contacto |
| `CRON_SECRET` | invéntala tú, ej. una contraseña larga random | Vercel la manda sola como header cuando corre el cron; protege `/api/cron/recordatorios` y `/api/cron/publicar-anuncios` de que cualquiera los llame |
| `GMAIL_USER` | el correo de Gmail que quieras usar de remitente | opcional: si no la pones, la app sigue funcionando normal, solo no manda correos (el push sigue llegando igual) |
| `GMAIL_APP_PASSWORD` | https://myaccount.google.com/apppasswords (requiere verificación en dos pasos activada en esa cuenta) | es una "contraseña de aplicación" de 16 caracteres, **no** tu contraseña normal de Gmail |

## 3. Crear tu cuenta de Mercado Pago

1. Entra a https://www.mercadopago.com.mx/developers y crea una cuenta (o usa tu cuenta normal de Mercado Pago).
2. Ve a **Tus integraciones** → crea una aplicación → **Credenciales de prueba**.
3. Copia el **Access Token de prueba** → pégalo como `MP_ACCESS_TOKEN` en Vercel.
4. Con credenciales de prueba puedes pagar con [tarjetas de prueba de Mercado Pago](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards) sin mover dinero real.
5. Cuando quieras cobrar de verdad: activa tu cuenta de Mercado Pago para producción (te van a pedir datos fiscales/bancarios) y cambia `MP_ACCESS_TOKEN` por el **Access Token de producción**.

El flujo ya está construido: "Planes" → Suscribirme → Mercado Pago Checkout →
al autorizar el pago, `api/mercadopago/webhook.js` activa el plan en Supabase
y **se renueva solo cada mes** (ver sección 7).

## 4. Notificaciones push reales (Wishlist Premium)

Ya está el código (service worker, VAPID, botón "Activar notificaciones").
Falta conectar Supabase para que avise a `/api/alertas/verificar` cada vez
que se publica algo nuevo.

Si encuentras la sección **Database → Webhooks** en tu proyecto, puedes
crearlos ahí a mano (evento `INSERT`, tipo `HTTP Request`, método `POST`,
URL `https://TU-DOMINIO/api/alertas/verificar`) — repite para las tablas
`mercado_listings`, `inventario_tienda` y `sellado_tienda`.

Si no la encuentras (algunas versiones de la interfaz la escondieron o la
movieron), usa el atajo por SQL: abre
`supabase/migrations/003_webhooks.sql`, reemplaza `TU-DOMINIO` por tu URL
real de Vercel, y corre el archivo completo en el **SQL Editor** de
Supabase. Hace exactamente lo mismo (crea los triggers) sin depender de la
interfaz.

## 5. Importador masivo (Aurora)

Ya funciona sin configuración extra: en "Mi tienda", si el perfil tiene plan
`enteball`, aparece la caja para pegar una lista de texto o subir un
CSV/Excel. Formato esperado:

- Texto: `nombre, set (opcional), condición (opcional), precio, cantidad (opcional)` — una carta por línea.
- Excel/CSV: columnas `carta`, `set_nombre`, `condicion`, `precio`, `cantidad`.

## 6. Boost (destacar publicaciones)

Ya funciona sin configuración extra (usa el mismo `MP_ACCESS_TOKEN`). En
"Mi tienda" y "Vender en el Mercado", cada publicación tiene un botón
**"🚀 Destacar"** con dos opciones: 3 días ($15 MXN) o 7 días ($29 MXN).
Al pagar, esa publicación aparece primero en los resultados de búsqueda,
en el Mercado y en el detalle de tienda, con una insignia dorada
"🚀 Destacado", mientras dure el periodo pagado.

## 7. Renovación automática

Los planes pagados ahora son una **suscripción recurrente real** de Mercado
Pago (`Preapproval`), no un pago único: al suscribirse, el usuario autoriza
un cobro mensual que se repite solo hasta que lo cancele. En "Planes", si
tiene una renovación activa, ve un aviso "🔁 Tu plan se renueva
automáticamente" con un botón para cancelarla (cancelar no le quita el plan
de inmediato, solo evita el próximo cobro — el plan sigue activo hasta la
fecha ya pagada).

⚠️ **Importante para probar esto:** a diferencia de un pago único, una
suscripción recurrente es difícil de probar de punta a punta sin esperar un
mes real (el primer cobro sí es inmediato, pero la *renovación* solo se
dispara cuando Mercado Pago la cobra automáticamente al mes siguiente).
Cosas que sí puedes verificar ahora:
- Que "Suscribirme" te lleve a una pantalla de Mercado Pago que dice que
  autorizas un **cobro recurrente mensual** (no un pago único).
- Que, en tu panel de Mercado Pago, bajo **"Tu negocio" → "Suscripciones"**
  (o "Preapprovals"), aparezca la suscripción como "Autorizada" después de
  pagar.
- Que el botón "Cancelar renovación automática" en tu app sí la cambie a
  "Cancelada" en ese mismo panel de Mercado Pago.

## 8. Recordatorios de vencimiento

Un cron job (`api/cron/recordatorios.js`, configurado en `vercel.json` para
correr todos los días) revisa:
- Perfiles cuyo plan vence en los próximos 3 días → push avisando (y
  aclarando si se va a renovar solo o si hay que renovarlo a mano).
- Publicaciones destacadas (Boost) que dejan de estarlo en menos de 1 día → push al dueño.

Vercel debe recoger `vercel.json` automáticamente en el próximo deploy. Para
confirmar que el cron está activo: Vercel → tu proyecto → pestaña **Cron
Jobs** (o **Settings → Cron Jobs**) — debe aparecer `/api/cron/recordatorios`
corriendo una vez al día. También puedes darle **"Run"** manual ahí mismo
para probarlo sin esperar al horario programado.

## 9. Panel "Mis pagos"

Nueva pestaña **"Mis pagos"** (visible si iniciaste sesión): muestra el
historial combinado de tus suscripciones de plan y tus publicaciones
destacadas, con fecha, monto y si se aprobó, quedó pendiente o se rechazó.

## 10. Foto de perfil y menú de cuenta

Al registrarse, cada usuario puede:
- Subir su propia foto (se guarda en el bucket `avatars` de Supabase Storage).
- O elegir un Pokémon de foto con un buscador integrado (usa la API pública de PokeAPI, sin necesidad de llave ni configuración).
- Si no elige nada, se le asigna un Pokémon al azar automáticamente.

El botón "Mi cuenta" del encabezado ahora muestra la foto de perfil y, al
hacerle click, abre un menú con: **Editar perfil** (cambiar nombre, foto,
WhatsApp/Facebook/Instagram/Maps), **Planes**, **Mis pagos**, **Mi
tienda**/**Vender en el Mercado** (según el tipo de cuenta), **Wishlist**,
**Admin** (si aplica) y **Cerrar sesión**.

No requiere ninguna llave nueva — solo corre la migración 007 (arriba) para
que exista la columna y el bucket.

La foto de perfil también aparece ahora junto al nombre en el chat y en los
resultados de búsqueda de tiendas.

## 11. Avisos por correo

Además del push, ahora se manda un correo (vía Gmail SMTP, gratis, sin
necesitar dominio propio) cuando:
- Aparece una carta/producto que coincide con una alerta de tu Wishlist.
- Tu plan o tu destacado (Boost) está por vencer.

Configura `GMAIL_USER` y `GMAIL_APP_PASSWORD` (sección 2) para activarlo —
sin esas variables la app sigue funcionando exactamente igual, solo que no
manda el correo (el push no se ve afectado). Los anuncios del administrador
(sección 12) **no** mandan correo, solo push, tal como se pidió.

Nota: Gmail limita a 500 correos salientes por día por cuenta — de sobra
para el volumen actual. Ya que tienes dominio propio
(`encuentracartasmx.com`), si más adelante el volumen de correos crece se
puede migrar a un servicio como Resend (verificando el dominio ahí) para
mandar más volumen con mejor entregabilidad — mientras tanto, Gmail SMTP
sigue funcionando igual de bien.

## 12. Anuncios

Dentro de "Anuncios y noticias" el administrador ahora tiene un apartado
para:
- Crear un anuncio y **publicarlo de inmediato**, o **programarlo** para una
  fecha y hora futura.
- Revisar los anuncios que las **tiendas proponen** y **aprobarlos** (se
  publican con el nombre y la foto de la tienda que los mandó, no con el
  admin que aprobó) o **rechazarlos**.

Las tiendas, desde "Mi tienda", tienen una caja "📢 Proponer un anuncio":
lo mandan, queda "Esperando aprobación", y ven ahí mismo si se aprobó,
se rechazó o sigue pendiente.

Cuando un anuncio se publica (de inmediato o al llegar su fecha programada)
se manda una **notificación push a todos los usuarios** con notificaciones
activadas (no correo). Para que los anuncios *programados* salgan solos a
su hora sin que nadie tenga que abrir la app, la migración 009 programa un
cron **dentro de Supabase** (pg_cron + pg_net) que revisa cada 5 minutos si
ya toca publicar alguno — se usa ese mecanismo y no un cron de Vercel
porque el plan Hobby de Vercel no permite correr un cron más de una vez al
día.

⚠️ Antes de correr `009_anuncios.sql`, edita el archivo y reemplaza
`TU-DOMINIO` (tu dominio real de Vercel) y `TU_CRON_SECRET` (el mismo valor
que pusiste como variable de entorno `CRON_SECRET`) en la parte de hasta
abajo del archivo.

## 13. Cambiar el plan de un usuario a mano (admin)

Corre `supabase/migrations/010_admin_cambia_plan.sql` (una sola vez). Con
eso, dentro de **Admin** aparece arriba de todo un buscador "🎚️ Cambiar
plan de un usuario": buscas por nombre o correo, eliges la cuenta, y puedes
cambiarle el plan a cualquiera de los 5 rangos, ponerle o quitarle fecha de
vencimiento, y — si tenía una renovación automática activa — cancelarla
también desde ahí. Útil, por ejemplo, para revertir un plan si reembolsaste
un pago de prueba.

## 14. Navegación en celular y bandeja de notificaciones

Corre `supabase/migrations/011_notificaciones.sql`. Con eso:

- El encabezado ahora separa lo esencial (Buscar, Tiendas, Mercado, Mensajes
  — siempre visible) de todo lo demás (Anuncios, Torneos, Wishlist, Planes,
  Mis pagos, Mi tienda/Vender, Ayuda, Admin, Editar perfil, Cerrar sesión),
  que vive en un único menú lateral — en escritorio y en celular por
  igual, para no repetir botones ni saturar la barra. Se abre con tu foto
  de perfil (o el ícono ☰ si no has iniciado sesión).
- La campanita 🔔 junto al menú muestra un contador de notificaciones no
  leídas y una lista con lo más reciente: coincidencias de Wishlist,
  Anuncios publicados, y mensajes nuevos. Al abrir/hacer click se marcan
  como leídas.

## 15. Imágenes en anuncios

Corre `supabase/migrations/012_anuncios_imagen.sql` (agrega
`noticias.imagen_url` y crea el bucket de Storage `anuncios`). Con eso, al
crear un anuncio (admin) o proponer uno (tienda) aparece un botón "+
Agregar imagen (opcional)" — la imagen se ve en la vista pública de
Anuncios, en el panel de aprobación del admin, y en la lista de "Tus
anuncios" de la tienda.

## 16. Captura de errores + aviso al admin

Corre `supabase/migrations/013_errores_app.sql`. Con eso:

- La app captura sola cualquier error de JavaScript que le pase a un
  usuario (incluyendo pantallas en blanco por un componente que truena —
  ahora se muestra un aviso de "Algo salió mal" con botón para recargar,
  en vez de quedar en blanco).
- Cada error se guarda en la tabla `errores_app`, y si no se avisó ya del
  mismo error en la última hora (para no saturarte), se te notifica como
  admin por push, correo y en tu bandeja de notificaciones.
- Dentro de **Admin** hay una sección "🐞 Errores detectados" con el
  mensaje, la URL, la fecha y el detalle técnico de cada uno — al
  resolverlo, márcalo con "Marcar resuelto" para que desaparezca de la
  lista.

No es una IA que corrija el código sola en producción (eso no es posible
técnicamente) — lo que hace es avisarte automáticamente para que tú (o yo,
si me pides que lo revise) lo arreglemos.

## 17. Ayuda / Tutorial

Nueva pestaña "Ayuda" (ícono ❓, en el menú secundario / lateral): explica
en secciones desplegables cómo buscar, contactar vendedores, usar la
Wishlist, los planes, y — según el tipo de cuenta — lo específico de
compradores individuales o de tiendas (inventario, Boost, importador
masivo, proponer anuncios, etc). Al crear una cuenta nueva, la app te
manda ahí automáticamente la primera vez.

## 18. Calendario de torneos

Corre `supabase/migrations/014_torneos.sql`. Con eso:

- Las tiendas, desde "Mi tienda", tienen una caja "📅 Publicar un torneo":
  nombre, descripción, juego, fecha/hora, dirección (si es distinta a la
  de la tienda) y costo de inscripción (opcional). También ven su lista
  de torneos publicados con botón para borrarlos.
- Cualquiera puede ver el calendario completo en la nueva pestaña
  "Torneos", con la info de cada uno y cuántos usuarios están
  interesados.
- Los usuarios le dan "Me interesa" a los que quieran — el cron diario
  (el mismo de recordatorios de plan/boost) revisa los torneos de los
  próximos 3 días y manda un recordatorio (push + correo + en la
  campanita) a quien marcó interés, una sola vez por torneo.

## 19. Ofertas / descuentos

Corre `supabase/migrations/015_ofertas.sql` (agrega `precio_antes` a
`inventario_tienda`, `sellado_tienda` y `mercado_listings`). Al agregar o
editar una carta/producto (en Mi tienda o Vender en el Mercado), hay un
campo opcional "Precio antes (oferta)" — si lo llenas con un número mayor
al precio actual, esa publicación se muestra en todos lados con una
insignia roja "-XX% Descuento" y el precio anterior tachado. Para quitar
la oferta, deja ese campo vacío.

## 20. Pantalla de inicio con vitrina

La pestaña "Buscar", cuando no has escrito nada, ya no se ve vacía: ahora
muestra los anuncios más recientes (con imagen si tienen) y una vitrina
de lo último publicado, mezclando Mercado y tiendas, ordenado por fecha.
No requiere ninguna migración nueva.

## 21. Panel de Admin en pestañas + moderación

Corre `supabase/migrations/017_admin_modera_publicaciones.sql`. El panel
de **Admin** ahora está dividido en pestañas (Planes, Tiendas, Anuncios,
Publicaciones, Errores) en vez de una sola página larga. Novedades:

- **Tiendas**: además de vincular cuentas, ahora ves **todas** las
  tiendas del directorio, con las que comparten nombre marcadas en rojo
  ("posible duplicado") y un botón para borrarlas. Si una tienda tiene
  cartas o producto sellado, bórralos primero desde "Publicaciones" (la
  base de datos no deja borrar la tienda si todavía tiene cosas adentro).
- **Publicaciones**: busca por nombre cualquier carta o producto — de
  tiendas o del Mercado entre usuarios — y bórralo directamente. Las
  publicaciones sin imagen se marcan en rojo para encontrarlas fácil.

## 22. Subir tu propia foto cuando la carta no tiene imagen

Corre `supabase/migrations/018_imagen_manual_cartas.sql` (crea el bucket
de Storage `cartas`). El catálogo oficial que usamos (TCGdex) no siempre
tiene imagen para cartas de arte especial, promos, etc. Ahora, junto a
cada carta o producto ya publicado (en "Mi tienda" o "Vender en el
Mercado"), hay un botón **"📷 Sin foto" / "Cambiar foto"** — sube tu
propia foto y se actualiza al instante, sin depender de que el catálogo
la tenga.

## 23. Respaldo automático de imagen (pokemontcg.io)

No requiere ninguna migración nueva. Cuando el catálogo principal
(TCGdex) no trae imagen para una carta — pasa seguido con cartas de
arte especial o secretas, como "Hisuian Zoroark VSTAR" — la app ahora
intenta automáticamente traer la foto de una segunda base de datos
pública (pokemontcg.io), que suele tener mejor cobertura de esas
variantes:

- Al buscar y agregar una carta nueva (Mi tienda / Vender en el
  Mercado), si TCGdex no trae foto, se intenta el respaldo solo, sin
  que tengas que hacer nada.
- En las cartas que ya publicaste y quedaron sin foto, ahora hay un
  botón **"🔄 Buscar foto"** junto al de subir manual — lo intenta de
  nuevo contra esa segunda base de datos por si ya está disponible ahí.
- Para no traer la imagen de una versión distinta de la misma carta
  (por ejemplo el arte normal en vez del arte especial), el respaldo
  exige que coincidan el **número exacto de la carta y el set** — si no
  hay una coincidencia exacta, dice "No se encontró la versión exacta"
  en vez de arriesgarse a poner una foto equivocada.
- Si ninguna de las dos bases de datos tiene la imagen exacta (pasa con
  algunas cartas muy nuevas o promos raras), sigue disponible el botón
  de subir tu propia foto ("📷 Sin foto").

## 24. Carpetas: publicar un álbum completo desde fotos (Amatista+)

Corre `supabase/migrations/019_carpetas.sql` (tablas `carpetas` y
`carpeta_fotos`, columna `carpeta_id` en `inventario_tienda` y
`mercado_listings`, y el bucket de Storage `carpetas`).

También necesitas agregar una variable de entorno nueva en Vercel:

| Variable | De dónde sale | Notas |
|---|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey (entra con tu cuenta de Google, "Create API key") | **Gratis** dentro de los límites de la capa gratuita de Gemini (un número generoso de fotos por minuto/día, sin tarjeta de crédito). Sin esta variable, "Carpetas" deja de detectar cartas automáticamente (el resto de la app sigue funcionando normal). |
| `GEMINI_MODEL` (opcional) | — | Normalmente no hace falta: el código le pregunta a Google qué modelos "flash" están disponibles en ese momento y elige el más nuevo automáticamente. Solo defínela si quieres forzar un modelo específico. |

Qué hace: en "Mi tienda" y "Vender en el Mercado" (desde el plan
**Amatista** en adelante), hay una sección **"📁 Carpetas"** donde puedes:

- Crear varias carpetas (álbumes) con su propio nombre.
- Subir fotos de las páginas de tu álbum físico a cada carpeta — se
  guardan ahí para siempre, como una galería.
- Cada foto que subes se manda a la IA con visión de Google (Gemini,
  capa gratuita) para que identifique cada carta visible.
- Te muestra una pantalla de revisión con lo que detectó (nombre, set e
  imagen si los encontró en el catálogo): puedes destildar las que no
  quieras publicar, corregir el nombre a mano si no se detectó bien,
  y ponerle precio y cantidad a cada una.
- Al confirmar, publica todas de un jalón, ya agrupadas por esa carpeta.

Limitaciones a tener en cuenta: la IA no es perfecta (letra pequeña,
cartas dañadas o fotos borrosas pueden fallar) — por eso siempre pasa
por la revisión antes de publicarse, nunca publica solo. Se le pide
explícitamente que ignore cualquier carta de "Pokémon TCG Pocket" (el
juego para celular, sin cartas físicas reales) y, además, el código
descarta por su cuenta cualquier detección que caiga en un set
exclusivo de Pocket, sin depender solo de que la IA obedezca. Si el
catálogo no encuentra imagen para alguna carta detectada, **es
obligatorio subirle una foto a mano** (botón "📷 Subir foto") antes de
poder incluirla en la publicación — no se permite publicar cartas sin
imagen desde Carpetas.

## 25. Perfil más personalizable + perfil público + Pokémon favoritos

Corre `supabase/migrations/020_perfil_publico.sql` y
`supabase/migrations/021_visibilidad_publica.sql` (en ese orden).

- En **Editar perfil** ahora puedes elegir hasta **3 Pokémon
  favoritos** (buscador igual al de la foto de perfil). Las cartas
  cuyo nombre coincida con alguno de esos 3 Pokémon aparecen primero
  en la vitrina "🔥 Recién publicado" de la pantalla de inicio —
  siempre después de las publicaciones con Boost, pero antes que el
  resto.
- Cada usuario (individual o tienda) tiene ahora un **perfil
  público**: se llega ahí tocando el nombre/avatar de un vendedor en
  el Mercado. Muestra su avatar, plan, Pokémon favoritos, sus cartas y
  producto sellado en venta (o un enlace a su tienda completa si es
  cuenta de tienda), su Wishlist y sus Carpetas.
- En **Editar perfil** hay checkboxes para elegir qué secciones se
  muestran en tu perfil público (publicaciones, wishlist, favoritos,
  carpetas) — todas activas por defecto, puedes desactivar las que
  quieras mantener privadas. La migración 021 agrega los permisos de
  Supabase (RLS) para que la Wishlist y las Carpetas de otra persona
  solo se puedan leer si esa persona no las ocultó.

## 26. Rediseño visual: sistema de gemas y ajustes de beneficios

Los 5 rangos ahora se muestran con nombre e ícono de gema (Cuarzo, Zafiro,
Amatista, Diamante, Aurora) en vez de Poké Balls — las keys internas
(`pokeball`/`superball`/`ultraball`/`masterball`/`enteball`) no cambiaron.

Ajustes a los beneficios de cada plan:

- **Zafiro**: el enlace directo dejó de incluir Google Maps para cuentas
  individuales (no tiene sentido sin un local físico) — ahora una cuenta
  individual desbloquea Instagram + WhatsApp + Facebook como enlaces
  directos visibles en su perfil público, mientras que una cuenta de
  tienda sigue desbloqueando Instagram + Google Maps (se ve en el
  detalle de la tienda). El componente `RedesSocialesEditor` ahora recibe
  un prop `esTienda` para saber cuál mostrar.
- **Carpetas** pasó de ser beneficio de Zafiro a beneficio de **Amatista**
  en adelante (`PLAN_INFO.superball.carpetas = false`,
  `PLAN_INFO.ultraball.carpetas = true`). También se actualizó el gate del
  lado del servidor en `api/carpetas/detectar.js`
  (`PLANES_CON_CARPETAS`).
- **Diamante** ahora tiene dos beneficios nuevos:
  - Una **decoración holográfica** (anillo giratorio con degradado) alrededor
    de su avatar, visible en su perfil público y en el detalle de su tienda
    (componente `HoloAvatar`).
  - Un **emblema** "💎 Diamante desde `<mes y año>`" (componente
    `DiamanteEmblema`), que muestra desde cuándo llegó a ese rango la
    primera vez. Corre `supabase/migrations/022_diamante_desde.sql` para
    agregar la columna `perfiles.diamante_desde` — se llena sola (una sola
    vez, no se pisa después) tanto al pagar de verdad
    (`api/mercadopago/webhook.js`) como al cambiarle el plan a un usuario
    a mano desde el panel de Admin.

También se reemplazaron los 5 archivos `public/branding/rango-*.png` por
íconos de gema (mismo nombre de archivo, sigue funcionando el mecanismo de
`DISENO.md`).

## 27. Confianza y comunidad: reportes, insignias, legal

Primer lote (de una lista más grande de 12 ideas) de mejoras de confianza
para el marketplace — el resto (reseñas con estrellas, contador de ventas,
recompensas, seguir tiendas, armar mazo, feed de comunidad) queda
pendiente para después. Se descartaron 3 de las 12 ideas originales:
estadísticas de vistas/mensajes por tienda, historial de precios con
gráfica, y páginas de tienda indexables por Google.

Corre `supabase/migrations/023_reportes.sql`.

- **Botón "🚩 Reportar"** en el perfil público de cualquier usuario y en
  el detalle de cada tienda (no aparece en tu propio perfil). Pide un
  motivo de una lista corta + un detalle opcional, y requiere sesión
  iniciada (así el reporte queda ligado a quién lo mandó). Se guarda en
  la tabla `reportes`.
- **Panel de Admin → pestaña "Reportes"**: lista los reportes pendientes
  (quién reportó, a quién/qué, motivo, detalle) con botones para marcar
  "revisado" o "descartado" — mismo patrón que la pestaña de Errores.
- **Aviso de Privacidad** y **Términos de Uso**: dos páginas nuevas
  (enlazadas desde un pie de página nuevo, visible en toda la app).
  Contenido genérico de referencia — **no es asesoría legal**; antes de
  confiar en ellos del todo, vale la pena que un abogado los revise y
  los adapte a tu caso real (razón social, domicilio, etc.).
- **Insignias por actividad**: "🗂️ Organizado" (tiene al menos 1
  carpeta), "📋 Coleccionista" (5+ cosas en su Wishlist) y "🕰️ Veterano"
  (cuenta con 6+ meses de antigüedad) — se calculan al vuelo con datos
  que ya existían, sin tabla nueva, y se muestran en el perfil público.
- **"Miembro desde `<mes y año>`"**: usa la columna `created_at` que
  Supabase ya le pone por defecto a `perfiles` — se muestra en el
  perfil público y en el detalle de tienda. Si tu tabla `perfiles` no
  tiene esa columna (poco probable, pero puede pasar si se creó a mano
  sin ella), este dato simplemente no aparece, sin romper nada.

## 28. Ventas confirmadas + reseñas de 1 a 5 estrellas

Corre `supabase/migrations/024_ventas_resenas.sql`.

Cómo funciona el flujo (para que una reseña cuente, primero tiene que
haber una venta confirmada por ambas partes — evita reseñas falsas de
gente que nunca compró/vendió nada):

1. En "Mi tienda" o "Vender en el Mercado", cada publicación tiene un
   botón **"✅ Vendida"**. El vendedor busca al comprador por su nombre
   (buscador en vivo contra los perfiles registrados) y confirma — esto
   borra la publicación y crea un registro de **venta pendiente**.
2. El comprador recibe una notificación y ve la venta en **"Mis compras
   y ventas"** (nuevo, en el menú), donde puede **confirmarla** o decir
   "No fue así" (la rechaza).
3. Solo cuando el comprador **confirma**, la venta cuenta para el
   contador de "🛒 X ventas completadas" del vendedor, y ambos (vendedor
   y comprador) pueden calificarse mutuamente con **1 a 5 estrellas** +
   comentario opcional, desde esa misma pantalla.
4. Las reseñas de un perfil se muestran en su perfil público con el
   promedio, el número total, y las últimas 5 con comentario — **esta
   sección no se puede ocultar** (no forma parte de `perfiles.visibilidad`
   como el resto de las secciones del perfil). El detalle de tienda
   también muestra el promedio/número de reseñas y el contador de
   ventas, de forma resumida.

Limitación a tener en cuenta: si el comprador rechaza una venta que sí
ocurrió (por error o mala fe), la publicación ya se borró al marcarla
como vendida — hoy no hay un "deshacer", el vendedor tendría que
volver a publicarla a mano. Si esto causa problemas en la práctica,
vale la pena agregar una opción de "restaurar publicación rechazada"
más adelante.

## 29. Sistema de recompensas: Destellos ✨

Corre `supabase/migrations/025_destellos.sql`.

Puntos ("Destellos ✨") separados por completo de los planes pagados —
se ganan con actividad real, no se compran:

| Acción | Destellos |
|---|---|
| Venta confirmada por el comprador (vendedor) | +20 |
| Confirmar una compra (comprador) | +10 |
| Tu primera venta o primera compra confirmada — una vez | +25 |
| Dejar una reseña | +5 |
| Recibir una reseña de 5 estrellas | +10 |
| Publicar una carta/producto nuevo (tope: 10/día) | +2 |
| Completar tu perfil (foto + Pokémon favorito + una red o WhatsApp) — una vez | +15 |

Todo se otorga solo, con triggers en la base de datos (tabla
`destellos_movimientos`, un histórico de movimientos) — nadie puede
inventarse puntos desde el navegador, ni siquiera editando el código
del sitio, porque el cliente no tiene permiso para insertar ahí
directamente.

**Niveles** (cosméticos, insignia pública en el perfil, no dan
descuentos en los planes pagados): Novato → Buscador → Cazador →
Maestro Cazador → Leyenda, según el total acumulado de Destellos.

**Canje**: desde la nueva sección **"🏆 Recompensas"** (en el menú),
puedes canjear Destellos por Boost gratis en una publicación tuya —
150 ✨ = 3 días, 300 ✨ = 7 días. El canje lo procesa
`api/recompensas/canjear.js` (requiere `SUPABASE_SERVICE_ROLE_KEY`,
que ya tienes configurada) — verifica tu sesión de verdad y tu saldo
antes de descontar, así no se puede canjear más de lo que tienes.

Decisión de diseño importante: los Destellos **no** se pueden canjear
por descuentos en los planes de pago (Zafiro, Amatista, etc.) — así el
sistema de recompensas no le quita ingresos por suscripción a la
plataforma, solo da beneficios que ya no cuestan nada extra (Boost e
insignias).

## 30. Seguir tiendas/vendedores + insignia de Vendedor + panel de Admin

Corre `supabase/migrations/026_ventas_lectura_publica.sql` y
`supabase/migrations/027_seguidores.sql` (en ese orden).

**Bug corregido de paso** (migración 026): el contador "🛒 X ventas
completadas" del perfil público en realidad siempre mostraba 0 para
cualquiera que no fuera el propio vendedor o comprador, porque la
única política de lectura de `ventas` era "solo los participantes".
Ahora las ventas ya **confirmadas** son de lectura pública (es un
registro de que el trato sí ocurrió, mismo criterio que las reseñas),
y el admin puede ver todas — incluidas pendientes y rechazadas.

**Seguir tiendas/vendedores** (migración 027): botón "+ Seguir" en
cualquier perfil público o detalle de tienda (no en el tuyo propio).
Se ve cuántos seguidores tiene cada quien. Cuando alguien que sigues
publica una carta o producto nuevo, te llega una notificación, y en la
nueva sección **"Siguiendo"** (menú) ves la lista de a quién sigues más
un feed combinado de lo último que han publicado.

**Insignia de Vendedor** (`VendedorBadge`, distinta de "✓ Verificado"
que depende del plan pagado): premia el volumen **y** la calidad de
ventas, no solo el plan:
- 🎖️ Vendedor Confiable: 5+ ventas confirmadas y 4.0+ estrellas de promedio.
- 🏆 Vendedor Destacado: 20+ ventas confirmadas y 4.5+ estrellas de promedio.

**Panel de Admin → pestaña "Vendedores"**: tabla de todos los perfiles
con sus ventas confirmadas, promedio de estrellas, número de reseñas y
su insignia de vendedor, ordenada de más a menos ventas, con un botón
para ir directo a su perfil público.

## 31. Armar mazo: buscador de decklist contra el mercado

No requiere migración — funciona con las tablas que ya existen.

En **"Armar mazo"** (menú, disponible sin iniciar sesión para buscar,
requiere sesión solo para "Contactar") pegas la lista de cartas que te
faltan, una por línea — acepta "4 Charizard ex", "Charizard ex x4" o
solo el nombre (implica 1 copia). Antes de buscar, se valida contra
las reglas oficiales del Pokémon TCG: **máximo 4 copias de una carta
que no sea Energía Básica** (la Energía Básica no tiene límite) — si
alguna línea se pasa, se avisa con un mensaje, pero no bloquea la
búsqueda (por si de verdad necesitas varias copias para intercambiar).

La búsqueda compara tu lista contra todo el inventario activo del
Mercado y de las tiendas (coincidencia de nombre, sin distinguir
mayúsculas ni requerir el nombre exacto completo), agrupa por vendedor,
y ordena de quién te puede completar más cartas de tu lista a menos,
mostrando el precio de cada una y si tiene suficiente cantidad.

## 32. Comunidad: feed de fotos (pulls, aperturas, logros)

Corre `supabase/migrations/028_comunidad.sql`.

Nueva sección **"Comunidad"** (menú, visible sin sesión, requiere
sesión para publicar/reaccionar): cualquiera con cuenta sube una foto
(pull, apertura de sobre, logro, u "otro"), con un texto opcional. El
feed es cronológico y público — se ve con o sin haber iniciado sesión.

- Reacciones simples tipo "me gusta" (❤️), una por persona por
  publicación — tabla `comunidad_likes`.
- Cada quien puede borrar sus propias publicaciones; el admin puede
  borrar cualquiera (moderación).
- Reutiliza el botón "🚩 Reportar" que ya existía para perfiles/tiendas
  (ahora también aplica a `publicaciones_comunidad`) — llega a la misma
  pestaña "Reportes" del panel de Admin.
- Las fotos se guardan en un bucket de Storage nuevo (`comunidad`),
  mismo patrón de permisos que `carpetas`/`cartas`: lectura pública,
  cada quien solo puede subir/borrar dentro de su propia carpeta
  (`{tu-id}/...`).

Con esto se completaron las 12 ideas originales de "confianza y
comunidad" (se descartaron 3: estadísticas por tienda, historial de
precios, páginas indexables por Google).

## 33. Técnico: Tailwind compilado en vez de cargado por CDN

Antes, el sitio cargaba `<script src="https://cdn.tailwindcss.com">` en
`index.html` — Tailwind generaba todos los estilos **en el navegador de
cada visitante**, cada vez que abrían la página (la documentación
oficial de Tailwind desaconseja esto en producción). Ahora los estilos
se compilan una sola vez, al desplegar, con Tailwind v4 integrado a
Vite (`@tailwindcss/vite`):

- Se agregó `tailwindcss` y `@tailwindcss/vite` como dependencias de
  desarrollo, y el plugin en `vite.config.js`.
- Nuevo archivo `src/index.css` (solo tiene `@import "tailwindcss";`),
  importado desde `src/main.jsx`.
- Se quitó el `<script>` del CDN de `index.html`.

No hay nada que configurar en Vercel — es un cambio de build, no de
variables de entorno. El resultado: el navegador ahora descarga un
archivo CSS ya compilado y pequeño (~19 KB) en vez de tener que
ejecutar JavaScript para generar los estilos cada vez.

## 34. Técnico: dividir src/App.jsx en módulos (primera parte)

`src/App.jsx` había crecido a 6,491 líneas con más de 70 componentes.
Como primer paso (el más seguro, sin tocar pantallas ni JSX), se
sacó la capa de "backend y configuración" a archivos propios:

- `src/lib/supabase.js`: conexión a Supabase (`sb`, `sbWrite`), registro
  e inicio de sesión, renovación automática del token, subida de
  fotos/imágenes a Storage.
- `src/lib/errorReporting.jsx`: captura de errores y el componente
  `ErrorBoundary` (ahora `src/main.jsx` lo importa directo de aquí).
- `src/lib/pokemonApi.js`: buscador de Pokémon (PokeAPI) y de cartas
  (TCGdex / pokemontcg.io de respaldo).
- `src/theme.js`: colores, fuentes, `PLAN_INFO` y los cálculos de plan/boost.

Detalle técnico relevante: dos variables internas (para avisar cuando
se renueva la sesión, y para saber qué usuario está conectado al
reportar un error) se actualizaban reasignándolas directamente desde
el componente principal. Un módulo de JavaScript no permite reasignar
así algo que se importa de otro archivo, así que ahora se actualizan
llamando a una función (`setOnSesionRefrescada`, `setUidActual`) en
vez de asignarlas directo — mismo comportamiento, pero compatible con
tenerlas en otro archivo.

`App.jsx` bajó de 6,491 a 6,093 líneas. Falta la parte más grande (los
más de 70 componentes de pantallas), que se hará por separado para no
arriesgar todo de un jalón.

## 35. Admin: crear tiendas + dar/quitar Amatista

Antes, las tiendas del directorio solo se podían dar de alta insertando
la fila directamente en Supabase — la web solo permitía vincularlas con
una cuenta o borrarlas, nunca crearlas. Ahora, en el panel de admin,
pestaña "Tiendas":

- **Crear tienda**: nombre, dirección, zona y teléfono. La dirección no
  necesita nada más — el mapa del perfil de la tienda ya la muestra
  sola (usa el texto de la dirección directo en Google Maps, sin llave
  de API). Se puede vincular con una cuenta de una vez, o dejarlo para
  después desde "Vincular tiendas" (como ya funcionaba).
- **Dar/quitar Amatista**: en "Todas las tiendas", un botón junto a
  cada tienda ya vinculada para ponerle o quitarle el plan Amatista a
  su cuenta directamente, sin ir hasta la pestaña "Planes". (Esa
  pestaña sigue sirviendo para cualquier otro plan o cuenta, y para
  poner fecha de vencimiento si hace falta.)

**Pendiente por aplicar**: migración `029_admin_crea_tiendas.sql`
(agrega el permiso para que un admin pueda insertar en `tiendas` — antes
solo existían los de borrar/actualizar). Cuando el conector de Supabase
esté disponible la aplico yo directo; si no, cópiala y pégala en
Supabase → SQL Editor → Run.

## 36. Apariencia: modo día/noche, temas por tipo de Pokémon y perfil personalizable

Nueva sección "Apariencia" (menú lateral, cuenta con sesión iniciada):

- **Modo día/noche** (Zafiro, Amatista, Diamante y Aurora): cambia fondo,
  texto y superficies de toda la web. Se guarda solo en el dispositivo
  (localStorage), no en la cuenta — si entras desde otro celular u otra
  computadora, hay que elegirlo de nuevo ahí.
- **Color según tipo de Pokémon** (Amatista, Diamante y Aurora): los 18
  tipos oficiales, cada uno con su propia paleta. Cambia el acento
  principal de botones y bordes de toda la web; el dorado de Aurora y el
  morado de Amatista (que ya tienen su propio significado en las
  insignias de plan) no cambian con el tipo elegido. También se guarda
  solo en el dispositivo.
- **Cómo funciona por dentro**: en vez de tocar los más de 700 lugares
  del código que ya usan los colores, `aplicarTema()` (en `src/theme.js`)
  cambia los valores del mismo objeto de colores compartido, y la app
  fuerza un refresco general para que se note en todos lados. Es un
  truco deliberadamente simple para no arriesgar una reescritura enorme
  sin pruebas automatizadas — el costo es que cambiar el tema reinicia
  el estado de lo que esté abierto en pantalla (por ejemplo, un texto a
  medio escribir en un formulario abierto se perdería), algo que no debería
  notarse en el uso normal ya que cambiar de tema es una acción deliberada,
  no algo que pasa a medio flujo.

Y en "Editar perfil", nuevo desde Zafiro en adelante:

- **Biografía** (hasta 280 caracteres), visible en el perfil público.
- **Color de acento propio**: el borde de tu tarjeta de perfil y los
  títulos de sus secciones usan tu color en vez del azul por defecto,
  para cualquiera que visite tu perfil (sin importar el tema que tenga
  activado esa persona).
- **Orden de tus secciones**: "En venta", "Wishlist" y "Carpetas" se
  pueden reordenar con flechas. (Las reseñas, redes sociales y Pokémon
  favoritos no se reordenan — viven dentro de la tarjeta superior, que
  es fija.)
- **Botón "Ver mi perfil público"**: para revisar cómo te ven los demás
  sin salir del modal de edición.

**Pendiente por aplicar**: migración `030_personalizacion_perfil.sql`
(agrega `bio`, `color_acento` y `orden_secciones` a `perfiles`). Aplica
igual que la anterior.

**Alcance**: esto vive en la vista de "Perfil público" (la que se abre
al ver el perfil de cualquier cuenta, individual o tienda). La página
de detalle de una tienda dentro del Mercado es una vista aparte y no
lleva estos cambios — se podría extender después si hace falta.

## 37. Apariencia: el tinte por tipo de Pokémon ahora se nota de verdad

Antes, elegir un tipo de Pokémon solo cambiaba el color de algunos
bordes y textos — muy poco perceptible. Ahora `aplicarTema()` también
mezcla el color del tipo con el fondo y las superficies (`mezclarHex()`
hace la mezcla de colores), y las bases de modo día/noche pasan a ser
neutras (sin su propio tinte azul) para que el color del tipo se vea
limpio encima. El cambio ahora se nota en toda la pantalla, no solo en
detalles chicos.

## 38. Admin: sub-perfiles administrados (poblar el Mercado sin crear un correo por cuenta)

Nueva pestaña "Sub-perfiles" en el panel de admin. Permite crear
cuentas de verdad — con su propio usuario de Supabase Auth — sin que
el admin tenga que pensar en un correo ni una contraseña para cada
una: se generan solas por dentro (un correo interno único, nunca
usado para nada más que identificar la cuenta). Cada sub-perfil:

- Aparece en la lista con su tipo (individual/tienda) y un selector
  para asignarle cualquier plan directo (Cuarzo a Aurora).
- Tiene un botón "Entrar como": genera una sesión real de esa cuenta y
  la usa el navegador del admin, así que a partir de ahí la web se
  comporta exactamente como si esa cuenta hubiera iniciado sesión —
  puede publicar en el Mercado, editar su perfil, todo lo que haría
  cualquier cuenta normal. Sin haber tocado ningún permiso (RLS)
  existente: es una sesión legítima, como cualquier otra.
- Al entrar a un sub-perfil aparece una barra dorada arriba ("Estás
  usando el sub-perfil…") con un botón para volver de inmediato a la
  cuenta de admin — se guarda aparte mientras tanto, no se pierde.

**Cómo funciona por dentro** (dos endpoints nuevos, ambos verifican
que quien llama sea admin):
- `api/admin/crear-subperfil.js`: crea el usuario de Auth (con la
  Admin API de Supabase, usando la llave de servicio) y su fila en
  `perfiles`, marcada con `gestionado_por` = el admin que la creó.
- `api/admin/entrar-subperfil.js`: genera un enlace mágico para el
  sub-perfil y lo canjea por una sesión real (access token + refresh
  token) sin necesitar su contraseña — el admin solo puede hacer esto
  con sub-perfiles que él mismo administra.

**Pendiente por aplicar**: migración `031_subperfiles_admin.sql`
(agrega `gestionado_por` a `perfiles`; no necesita ninguna política de
RLS nueva, ya existían las que hacían falta). Aplica igual que las
anteriores.

**Aviso de honestidad**: la parte de "entrar como" (el intercambio de
enlace mágico por una sesión, vía la Admin API de Supabase) la escribí
siguiendo la documentación pero no la pude probar en vivo contra tu
proyecto real desde este entorno (no tengo aquí la llave de servicio
para simular la llamada). Es la única pieza de todo lo que hice hoy que
no verifiqué de punta a punta — si al usar el botón "Entrar como" te
sale un error, dímelo con el mensaje exacto y lo reviso de inmediato.

## 39. Carpetas: detección más precisa + modo "foto por carta"

Se reportaron errores de identificación en Carpetas. Causa probable: una
sola foto de una página completa obliga a la IA a leer varias cartas
chiquitas a la vez (letra pequeña, brillo de las fundas), y el prompt no
pedía ningún nivel de confianza, así que un error se veía igual de
"seguro" que un acierto.

- **Nuevo: "📸 Foto por carta"**, junto al botón de siempre ("📷 Foto de
  la página"). Puedes seleccionar varias fotos a la vez (una por carta)
  y los resultados de todas se juntan en la misma pantalla de revisión.
  Cada carta fotografiada de cerca es mucho más fácil de leer para la
  IA que una entre varias en una sola foto — más lento de subir, pero
  bastante más preciso. El modo de página completa sigue igual, para
  cuando prefieras ir rápido.
- **Nivel de confianza por carta**: el prompt ahora le pide a Gemini que
  diga qué tan segura está de cada lectura. En la pantalla de revisión,
  las cartas con confianza "baja" se marcan con "⚠️ Revisar" y las de
  confianza "media" con una etiqueta dorada — para que sepas cuáles vale
  la pena checar a mano antes de publicar, en vez de confiar ciego en
  todo lo que detecta.
- **Prompt reforzado**: instrucciones más explícitas para no adivinar
  entre cartas parecidas (mismo Pokémon, distinta variante/arte) y
  basarse en el símbolo de set impreso en vez de suponer.

No hay una lista exhaustiva de todos los sets reales del TCG incluida en
el prompt (son más de 100 sets) — dársela a la IA como referencia fija
podría ayudar más adelante, pero por ahora la mejora principal viene de
la foto más clara y de la señal de confianza.

## 40. Directorio: filtro por zona + tienda más cercana (Zafiro+)

En "Directorio de tiendas", nuevo desde Zafiro en adelante:

- **Filtro por zona**: un selector con las zonas que ya tienen tiendas
  registradas (se arma solo a partir de lo que hay en la base, no es una
  lista fija).
- **"Usar mi ubicación"**: pide permiso de geolocalización al navegador
  (el usuario decide si lo da) y, si lo da, calcula la distancia en
  línea recta (fórmula de Haversine) entre esa ubicación y cada tienda
  que tenga coordenadas guardadas. Ordena el directorio de la más
  cercana a la más lejana, muestra la distancia en cada tarjeta y
  destaca cuál es la más cercana en un aviso arriba de la lista. Las
  tiendas sin coordenadas guardadas simplemente no entran al cálculo de
  distancia (siguen apareciendo, sin distancia).
- Sin plan Zafiro o superior, el directorio se ve igual que siempre —
  solo el bloque de filtro/ubicación se reemplaza por un aviso para
  mejorar de plan.

**Cómo se cargan las coordenadas de una tienda**: el panel de Admin
("Crear tienda", y también "✏️ Editar" en "Todas las tiendas" para una
que ya existe) tiene un botón **"📍 Buscar coordenadas por la
dirección"**: toma el texto ya escrito en "Dirección" y llama a
Nominatim (el geocodificador gratis de OpenStreetMap, sin API key ni
costo) para llenar solas la latitud y longitud. Si la dirección es muy
vaga o no se encuentra, avisa el error para que se intente con una más
completa (calle, número, colonia, ciudad); en ese caso, o si prefieres
más precisión, siguen ahí las otras dos formas: pegar las coordenadas
copiadas de Google Maps (clic derecho sobre el punto exacto — si
Google te las da en formato grados/minutos/segundos como
`25°42'44.4"N 100°22'20.9"W`, conviértelas a decimal con
`grados + minutos/60 + segundos/3600`, negativo si es Sur u Oeste), o
el botón "Usar mi ubicación" si el admin está físicamente en la tienda.

El botón "✏️ Editar" en "Todas las tiendas" abre además nombre,
dirección, zona y teléfono — antes solo se podía crear, vincular o
borrar una tienda, nunca editar sus datos ya guardados. Usa la política
de RLS `"tiendas: admin actualiza cualquiera"` que ya existía desde la
migración 017 (moderación de publicaciones), así que no hace falta
ninguna migración nueva para esto. Sin coordenadas, una tienda sigue
funcionando normal en todo lo demás (solo no participa del cálculo de
distancia).

**Pendiente por aplicar**: migración `033_tiendas_ubicacion.sql`
(agrega `lat`/`lng` a `tiendas` si no existían ya). Aplica igual que
las anteriores — copiar y pegar en Supabase → SQL Editor → Run.

## 41. Deck Builder visual: "Mis mazos" (Amatista+)

"Armar mazo" ahora tiene dos pestañas:

- **🧩 Mis mazos** (nuevo, Amatista/Diamante/Aurora): un deck builder
  visual al estilo Limitless TCG. Se crean varios mazos, cada uno con
  su propio nombre y etiquetas libres (ej. "Estándar", "Torneo",
  cualquier texto separado por comas). Dentro de un mazo, el mismo
  buscador visual de cartas que ya se usa al publicar en el Mercado
  (imagen, set y precio de referencia) sirve para agregar cartas; cada
  una lleva su cantidad propia con botones +/− (llegar a 0 la quita del
  mazo), y se avisa si alguna supera las 4 copias permitidas para una
  carta que no sea Energía Básica.
- **🃏 Buscar en el mercado** (la función que ya existía, sin cambios):
  pegar una decklist de texto y ver qué tiendas/vendedores del Mercado
  tienen esas cartas.
- Sin plan Amatista o superior, la pestaña "Mis mazos" muestra un aviso
  para mejorar de plan; "Buscar en el mercado" sigue siendo gratis para
  todos, como antes.

**Pendiente por aplicar**: migración `032_mazos.sql` (tablas `mazos` y
`mazo_cartas`, con RLS para que cada quien solo vea/edite sus propios
mazos). Aplica igual que las anteriores.

## 42. Admin: editar o borrar un anuncio ya publicado

En el panel de Admin → "Anuncios", nueva sección **"Publicados"** (los
últimos 50) debajo de "Pendientes" y "Programados". Cada uno tiene:

- **✏️ Editar**: abre el mismo formulario de título/contenido/imagen
  que al crear uno, precargado con lo que ya tenía. Guardar actualiza
  el anuncio en su lugar (no crea uno nuevo ni cambia su fecha de
  publicación).
- **Borrar**: pide confirmación y lo elimina por completo. Antes no
  existía ninguna forma de borrar un anuncio (ni pendiente, ni
  programado, ni publicado) — solo aprobar/rechazar los propuestos por
  tiendas.

**Pendiente por aplicar**: migración `034_noticias_admin_borra.sql`
(agrega la política de RLS que permite al admin borrar cualquier fila
de `noticias` — antes solo podía crear y actualizar, nunca borrar).

## 43. Buscador visual de cartas (número/set libres) estilo Pokellector

El buscador de cartas oficiales (`CardPicker`, usado al publicar una
carta, crear una alerta de Wishlist, etc.) y el buscador del Mercado
(pestaña "Buscar") ahora entienden número de carta y nombre de set sin
exigir un formato fijo. Todo esto encuentra la misma carta:

- `Sprigatito 016`
- `Sprigatito #016`
- `Sprigatito Journey Together`

**`CardPicker` (catálogo oficial)**: separa el número (con o sin "#")
del resto del texto; si lo que queda tiene más de una palabra, prueba
varias formas de partirlo entre "nombre de la carta" y "nombre del set"
(ej. "Sprigatito" + "Journey Together") y manda cada combinación como
filtro en paralelo — las combinaciones que no existen en el catálogo
simplemente no traen nada, así que no hace falta saber de antemano
cuáles palabras son el set. Los resultados se muestran en una
**cuadrícula visual de cartas** (imagen, nombre, set y número, estilo
Pokellector) en vez de una lista angosta de texto.

**Buscador del Mercado** (publicaciones ya existentes de tiendas/usuarios):
cada palabra que escribes debe aparecer en el nombre de la carta O en su
`set_nombre` guardado (que ya incluye cosas como "Journey Together
016/159") — así "Sprigatito" puede coincidir con el nombre y "016" o
"Journey Together" con el set, sin importar el orden.

### 43.1 Cambio de API: de TCGdex a pokemontcg.io (imágenes faltantes)

La primera versión usaba TCGdex para el buscador visual, pero varias
cartas (sobre todo de galería de arte / ilustración especial y sets
viejos — ej. "Mareep GG34" de Crown Zenith) aparecían sin imagen en la
cuadrícula, sin mostrar el set, y con una llamada extra al elegir la
carta. Causa: los resultados de la lista de TCGdex no siempre traen
imagen ni el nombre del set, y esta app ya tenía evidencia propia de
que **pokemontcg.io tiene mejor cobertura de esas variantes** — es la
razón por la que ya se usaba como respaldo de imagen en otras partes
(ver sección "Respaldo automático de imagen").

Ahora `buscarCartasVisual()` (en `src/lib/pokemonApi.js`) consulta
pokemontcg.io directamente en vez de TCGdex: cada resultado ya trae
imagen, nombre del set, número y precio de referencia en un solo
objeto, sin necesitar una segunda llamada al seleccionar una carta (más
rápido) y con mejor cobertura de cartas de galería/ilustración especial
y vintage. `buscarCartaTCGdex()` (usada solo para prellenar cartas
detectadas en Carpetas) no se tocó — sigue en TCGdex, es un flujo
distinto que no se reportó con problemas.

Si alguna carta muy específica sigue sin imagen ni en pokemontcg.io,
avisa con el nombre exacto y el número para revisarlo — puede ser una
variante todavía no catalogada en ninguna de las dos APIs.

## 44. Idioma de la carta: obligatorio al publicar

Al publicar una carta suelta (no aplica a producto sellado) ahora hay
que elegir su idioma — Inglés, Español o Japonés — antes de poder
publicarla; solo se puede elegir uno. El idioma aparece como una
etiqueta junto al nombre de la carta en todas las vistas que ve el
comprador (Directorio/tienda, Mercado entre usuarios, buscador,
perfil público), para que no haya dudas sobre en qué idioma está
impresa.

Cubre las tres formas de publicar una carta suelta:
- **Vender en el Mercado** (`MyMarketPanel`) y **Mi tienda** (`MyStorePanel`,
  "Cartas sueltas"): selector obligatorio en el formulario de cada
  carta — el botón de publicar/agregar queda deshabilitado sin elegirlo.
- **Carpetas** (fotos de álbum) e **Importador masivo** (Aurora, texto/CSV):
  como publican varias cartas de golpe, el idioma se elige **una sola
  vez por lote/revisión** (se asume que todas las cartas de esa
  carpeta o de esa lista vienen del mismo idioma) en vez de por cada
  fila — más simple y cubre el caso real de uso sin llenar la pantalla
  de selectores repetidos.

`inventario_tienda` ya tenía la columna `idioma` (el código siempre
mandaba "EN" fijo, sin que el vendedor pudiera elegir); `mercado_listings`
no la tenía.

**Pendiente por aplicar**: migración `035_idioma_carta.sql` (agrega
`idioma` a `mercado_listings` si no existía, con un `check` en ambas
tablas para que solo acepte `EN`/`ES`/`JP`).

## 45. Íconos nuevos: gemas de plan + rangos de participación

Handoff de diseño (`design_handoff_rangos_participacion`) con dos sets de íconos:

- **Gemas de plan** (`gemas-planes/`): reemplazan los 5 PNG que ya
  existían en `public/branding/rango-{pokeball,superball,ultraball,masterball,enteball}.png`
  — mismo nombre de archivo, no requirió ningún cambio de código
  (`RankIcon` ya los carga por convención de nombre).
- **Rangos de participación** (`rangos-participacion/`): el README del
  handoff decía que este era un sistema nuevo por construir desde cero,
  pero en realidad **ya existía** — es el sistema de niveles de
  Destellos (`NIVELES_DESTELLOS` / `NivelBadge`, sección de Recompensas),
  que ya tenía exactamente los mismos 5 nombres (Novato, Buscador,
  Cazador, Maestro Cazador, Leyenda) basados en el total de Destellos
  ganados, solo que mostraba un emoji en vez de un ícono propio. En vez
  de crear un sistema paralelo, se agregó un campo `slug` a cada nivel
  y un componente `NivelIcon` (mismo patrón que `RankIcon`: `<img
  src="/branding/nivel-{slug}.png">` con respaldo a emoji si la imagen
  falla), y `NivelBadge` ahora lo usa. Los 5 PNG se guardaron como
  `public/branding/nivel-{novato,buscador,cazador,maestro-cazador,leyenda}.png`.

No requiere ninguna migración ni cambio de base de datos — es solo
reemplazo/adición de imágenes y su conexión a un sistema que ya
funcionaba.

## 46. Bandeja de notificaciones: reconstruida para no cortarse nunca (portal + reposicionamiento)

Se seguía viendo cortada en celular a pesar del arreglo anterior
(sección 33/72). Encontramos dos causas reales, no una:

1. **El `<header>` tiene `backdrop-filter: blur(...)`**. Por regla del
   CSS (no un bug de este componente), eso convierte a cualquier
   descendiente `position: fixed` en fijo respecto al *header*, no al
   viewport real — así que aunque las coordenadas se calcularan bien
   (ya se hacía desde la sección 72), se aplicaban en el marco de
   referencia equivocado. **Arreglo**: el panel ahora se renderiza con
   `createPortal(..., document.body)`, así deja de ser descendiente del
   header y `fixed` vuelve a significar "fijo respecto a la pantalla"
   de verdad, sin importar qué estilos tenga el header ahora o en el
   futuro.
2. **El panel se anclaba solo al borde derecho del botón**, sin nunca
   comprobar si le cabía a la izquierda. Si la campanita no está pegada
   al borde derecho de la pantalla (ej. hay más íconos después, como el
   menú ☰), el panel de 320px se salía por la izquierda en vez de por
   la derecha. **Arreglo**: el cálculo de posición ahora recorta
   matemáticamente el panel para que `left` nunca sea menor que el
   margen ni haga que `left + ancho` pase del borde derecho — es
   imposible que se salga de la pantalla sin importar dónde esté el
   botón o qué tan angosta sea la pantalla.

También se agregó un listener de `resize` mientras el panel está
abierto, para que se reacomode si gira el celular o cambia el tamaño de
la ventana. Verificado visualmente en 320px, 375px y escritorio (1280px)
— el panel siempre queda completo, con márgenes, sin cortarse por
ningún lado.

## 47. Tutorial de bienvenida animado (onboarding)

Modal de 5 pasos que aparece la primera vez que alguien abre la web
(con o sin cuenta) y guía por lo esencial con animaciones cortas en vez
de capturas estáticas:

1. **Bienvenida** — logo con "pop" de escala.
2. **Búsqueda** — un campo de búsqueda de mentira "escribe" un ejemplo
   letra por letra, con 3 cartas flotando debajo.
3. **Gemas de confianza** — las 5 gemas de plan (Cuarzo→Aurora, mismos
   íconos `RankIcon` que ya usa el resto de la web) aparecen en cascada,
   de menor a mayor, con más brillo cada vez.
4. **Chat directo** — dos burbujas de conversación aparecen en secuencia.
5. **Rango de participación** — el ícono de nivel "Leyenda" (mismo
   `NivelIcon` del sistema de Destellos) con anillos dorados pulsando,
   simulando una subida de nivel.

Se guarda en `localStorage` (`ec_onboarding_seen`) para no volver a
aparecer solo una vez visto — igual que otras preferencias de esta app
(tema, notificaciones leídas, etc.), sin necesidad de tocar Supabase.
Se puede volver a ver en cualquier momento con el botón **"Ver
tutorial"** en el menú lateral (☰), disponible con o sin sesión
iniciada.

Construido igual que el resto del rediseño visual (sección 27-32):
`style={{...}}` con el objeto `COLORS` compartido, sin dependencias
nuevas. El panel se monta con `createPortal` a `document.body` (mismo
patrón que la campanita de notificaciones, sección 46) para que nunca
quede recortado por ningún contenedor. Las animaciones (`floatCard1-3`,
`ringPulse`, `typeBlink`, `chatIn1-2`, `badgePop`, `gemPop`) se agregaron
a la hoja de estilos global en `theme.js`, junto con una regla
`prefers-reduced-motion` que apaga las animaciones en bucle para quien
tenga esa preferencia activada en su sistema.

## 48. Estado de la carta, ficha de detalle, ofertas/comentarios y chat rediseñado

Feature grande con seis piezas relacionadas:

**1. Estado (condición) de la carta — obligatorio.** El campo `condicion`
(antes texto libre, con "NM" como valor por defecto sin validar nada) ahora
es un selector obligatorio de 6 valores fijos, la escala estándar de
condición de cartas coleccionables: `GM` Gem Mint, `NM` Near Mint, `LP`
Lightly Played, `MP` Moderately Played, `HP` Heavily Played, `DMG` Damaged
— cada uno con su significado en español al lado (`CONDICION_OPCIONES` en
`theme.js`). Aplicado en `MyMarketPanel` y `MyStorePanel` (selector
`EstadoCartaSelector`, mismo patrón que `IdiomaSelector`). En los flujos
por lote (`ImportadorMasivo`, que ya permitía condición por fila en texto
libre) se normaliza automáticamente el texto a uno de los 6 códigos
(`normalizarCondicion()`); en `CarpetasPanel` se agregó un selector a nivel
de lote (`estadoCarpeta`), igual que ya existía para el idioma. La
migración `036_estado_carta.sql` normaliza los valores ya guardados en la
base antes de agregar el `CHECK` (para no romper publicaciones existentes)
y agrega la columna `foto_real_url` a `mercado_listings` e
`inventario_tienda`.

**2. Foto real de la carta.** Aparte de `imagen_url` (la imagen de
referencia del catálogo oficial, para identificar la carta), ahora se
puede subir una foto de la carta física (`foto_real_url`, mismo control
`SubirFotoManual` ya existente, reutilizado con una segunda instancia).
En las miniaturas de toda la web, si existe `foto_real_url` se muestra esa
en vez de la imagen de catálogo — así el comprador ve el desgaste real
antes de contactar.

**3. Ficha de detalle de una publicación.** Nueva vista (`view ===
"cartaDetalle"`, componente `CartaDetalleView`): imagen grande, estado e
idioma, precio propio, y un precio de referencia **en vivo** (se vuelve a
consultar pokemontcg.io por el `card_api_id` exacto en el momento de abrir
la ficha, en vez de solo mostrar el precio guardado al publicar — que
puede quedar viejo). pokemontcg.io ya trae en la misma respuesta los
precios de TCGplayer y Cardmarket (con links directos a ambos), así que
cubre lo pedido de "tomar información de páginas como Pricecharting,
Collectr, TCGplayer" sin sumar otra integración de pago. Debajo, tarjeta
del vendedor (click → su perfil público) y botón "Contactar vendedor".
Se llega por click en **cualquier** tarjeta de publicación de toda la
web (Buscar, Mercado, vitrina de inicio, perfil de tienda, perfil
público) — los botones de "Contactar"/avatar dentro de la tarjeta siguen
funcionando igual (`stopPropagation` para no abrir el detalle sin
querer). También soporta compartir un link directo:
`?listing=<id>&tabla=mercado_listings|inventario_tienda|sellado_tienda`
se lee al abrir la web y salta directo a esa ficha.

**4. Comentarios y ofertas.** Nueva tabla `publicacion_ofertas`
(migración `037_publicacion_ofertas.sql`, lectura pública, publicar/borrar
solo lo propio) y componente `OfertasPanel` dentro de la ficha de
detalle: cualquiera con sesión puede dejar un comentario y/o un monto de
oferta; se muestran en orden cronológico con el nombre y avatar de quien
comentó. No incluye un flujo de "aceptar/rechazar" oferta — es solo el
canal de comunicación pública, el cierre del trato sigue pasando por el
chat.

**5. Chat: adjuntar imágenes + rediseño estilo Messenger web.**
Migración `038_mensajes_imagen.sql` agrega `mensajes.imagen_url` (y
vuelve `texto` opcional, para que un mensaje pueda ser solo una foto) más
el bucket de Storage `mensajes`. En el chat ahora hay un ícono de imagen
junto al campo de texto para adjuntar una foto (usa
`subirImagenMensaje()`, mismo patrón que las demás subidas). Además, el
chat dejó de ser un modal centrado que tapaba toda la pantalla: ahora es
un panel anclado abajo a la derecha (como Messenger en su versión de
escritorio), sin fondo oscuro detrás, así se puede seguir viendo y
navegando el resto de la web con el chat abierto. Se puede minimizar
(queda solo la barra con el nombre) o cerrar del todo.

**6. Papelera de chats.** Cada persona puede "borrar" una conversación
de su propia bandeja sin afectar la copia de la otra persona — se guarda
en una tabla nueva `mensajes_papelera` (migración
`039_mensajes_papelera.sql`, una fila por `perfil_id` + la otra persona +
el contexto de la conversación). La bandeja de Mensajes ahora tiene dos
pestañas: "Mensajes" (con un ícono de basura por conversación para
mandarla a la papelera) y "Papelera" (con cuenta regresiva de 7 días y
botón "Restaurar"). Pasados los 7 días, un cron diario nuevo
(`api/cron/limpiar-papelera-chats.js`, agregado a `vercel.json`) marca la
fila como definitiva (ya no se puede restaurar); si **ambas** personas de
esa conversación ya la marcaron como definitiva, ese mismo cron borra
físicamente los mensajes — si solo una persona la borró, la conversación
sigue intacta para la otra.

### Migraciones 036-039
Ya se corrieron en Supabase (confirmado).

## 49. Gradeo de la carta (opcional): empresa y calificación

Extensión del punto anterior: al publicar una carta (formulario individual
en `MyMarketPanel` y `MyStorePanel`), ahora hay una casilla opcional "Esta
carta está gradeada". Si se marca, aparecen dos selectores más:

- **Empresa que gradeó**: PSA, CGC, BGS, TAG, Value UP, u "Otro" (con un
  campo de texto para escribir el nombre a mano).
- **Calificación**: 1 a 10 para cualquier empresa, **excepto BGS**, donde
  el 10 se divide en tres niveles distintos — "10 Gem Mint", "10 Pristine"
  y "10 Black Label" — en vez de un simple "10" (`calificacionesDeEmpresa()`
  en `theme.js` decide qué lista mostrar según la empresa elegida).

Se guarda en 4 columnas nuevas (`gradeada`, `grado_empresa`,
`grado_empresa_otro`, `grado_calificacion`) en `mercado_listings` e
`inventario_tienda` — migración `040_carta_gradeada.sql`. Como es opcional
y poco frecuente, no se agregó a los flujos por lote (importador masivo,
Carpetas): es una casilla que aplica mejor al publicar una carta a la vez.
El badge (`GradeoBadge`, ej. "PSA 9" o "BGS 10 Black Label") se muestra en
todas las mismas vistas donde ya sale el estado/idioma de la carta:
Buscar, Mercado, vitrina de inicio, perfil de tienda, perfil público y la
ficha de detalle.

Igual que con `foto_real_url`, los campos de gradeo solo se mandan al
servidor cuando la carta de verdad está marcada como gradeada — así
publicar una carta normal (sin gradeo) sigue funcionando aunque la
migración 040 todavía no se haya corrido.

### Pendiente por aplicar en Supabase
Copiar y pegar en el SQL Editor: `040_carta_gradeada.sql`.

## 50. Link propio para cada perfil y cada tienda (slug)

Antes, la única forma de compartir un perfil o una tienda era la URL
genérica de la app — todos compartían el mismo link, sin importar a quién
se estuviera mostrando. Ahora cada perfil y cada tienda tiene su propia
URL corta basada en su nombre:

- `https://encuentracartasmx.com/?u=carta-magica-monterrey` → perfil
- `https://encuentracartasmx.com/?tienda=carta-magica-monterrey` → tienda

El "slug" se genera automáticamente a partir del nombre (minúsculas, sin
acentos, espacios y símbolos convertidos a guiones) al crear el perfil o
la tienda — no hay que escribir nada a mano. Si dos nombres generan el
mismo slug (ej. dos tiendas que se llaman "Carta Mágica"), al segundo se
le agrega automáticamente "-2", "-3", etc. en vez de bloquear el registro
o pedir un nombre distinto — así nadie se queda sin poder registrarse
solo porque alguien más ya usó un nombre parecido.

Un botón nuevo "Copiar link" (junto a las demás insignias, en el perfil
público y en el detalle de tienda) copia esa URL corta al portapapeles
para pegarla en Google Business Profile, redes sociales, WhatsApp, etc.

Detalles técnicos:
- El slug se genera en 3 lugares: al crear el perfil propio
  (`cargarOCrearPerfil`), al crear una tienda desde el panel de Admin
  (`crearTienda`), y al crear un sub-perfil administrado
  (`api/admin/subperfiles.js`) — los tres con la misma lógica de
  reintento con sufijo numérico.
- Al abrir la app con `?u=` o `?tienda=` en la URL, se busca el perfil o
  la tienda por slug y se abre directo esa vista (mismo mecanismo que ya
  existía para `?listing=&tabla=` en la ficha de detalle de una carta).
- La URL visible se actualiza sola (sin recargar la página) al entrar o
  salir de un perfil/tienda, usando `window.history.pushState`.
- Migración `041_slugs.sql`: agrega la columna `slug` (única, obligatoria)
  a `perfiles` y `tiendas`, generando y desduplicando los slugs de las
  filas que ya existían antes de aplicar el `UNIQUE`.

### Pendiente por aplicar en Supabase
Copiar y pegar en el SQL Editor: `041_slugs.sql`. **Importante:** a
diferencia de otras migraciones recientes (gradeo, foto real), esta
columna es obligatoria (`NOT NULL`) — hasta que se corra esta migración,
crear un perfil o una tienda nueva fallará con un error de "la columna
slug no existe". Correrla antes de (o al mismo tiempo que) este despliegue.

## 51. Tiendas afiliadas: entrega en buzón para publicaciones del Mercado

Nuevo mecanismo pensado para que un vendedor individual (o una cuenta de
tienda vendiendo en "Vender en el Mercado") pueda ofrecer dejar la carta en
tratos en el buzón de una tienda física de confianza, en vez de solo
coordinar entrega en persona o envío.

- **Admin → pestaña "Tiendas" → "Todas las tiendas"**: cada tienda tiene
  ahora un botón **"📦 Marcar afiliada" / "📦 Quitar afiliada"** —
  independiente de si esa tienda ya tiene o no una cuenta vinculada. Solo
  las tiendas marcadas como afiliadas van a aparecer como opción de buzón.
- **"Vender en el Mercado" (`MyMarketPanel`)**: al publicar una carta o
  producto sellado, si existe al menos una tienda afiliada aparece la
  casilla **"📦 Ofrezco entrega en buzón de una tienda afiliada
  (opcional)"** — al marcarla, se despliega un selector con **solo** las
  tiendas afiliadas (ej. si únicamente HQ y Kantocards están afiliadas,
  esas dos son las únicas opciones). Se guarda en
  `mercado_listings.buzon_tienda_id`.
- **Buzón por default**: arriba del formulario, un selector
  "Usar este buzón en todas mis publicaciones nuevas" guarda la preferencia
  en `perfiles.buzon_default_tienda_id` — a partir de ahí, cada publicación
  nueva ya sale con esa casilla marcada y esa tienda elegida, sin tener que
  repetirlo a mano. Se puede seguir cambiando o quitando el buzón en una
  publicación puntual sin afectar la preferencia guardada.
- **Visible en toda la app**: la insignia "📦 Buzón: `<nombre de la
  tienda>`" se muestra junto a las demás (idioma, estado, gradeo) en
  cualquier lugar donde ya aparecía una publicación del Mercado — tus
  propias publicaciones, la pestaña "Mercado", la vitrina de inicio, los
  resultados de "Buscar", el perfil público y la ficha de detalle de la
  publicación. No aplica al inventario propio de una tienda (`Mi tienda`),
  solo a publicaciones de "Vender en el Mercado".

Migración `042_buzon_tiendas_afiliadas.sql`: agrega `tiendas.afiliada`
(boolean, default `false`), `mercado_listings.buzon_tienda_id` y
`perfiles.buzon_default_tienda_id` (ambas `uuid references tiendas(id)`).
No requiere ninguna política de RLS nueva — `tiendas` ya es de lectura
pública y cada quien ya puede escribir su propio `mercado_listings`/`perfiles`.

### Pendiente por aplicar en Supabase
Copiar y pegar en el SQL Editor: `042_buzon_tiendas_afiliadas.sql`.

## 52. Panel de Admin: pestaña "Estadísticas" (crecimiento de la plataforma)

Nueva pestaña, primera al abrir el panel de Admin, pensada para monitorear
el crecimiento de la app con el tiempo sin tener que revisar la base de
datos a mano.

**Cifras al momento:**
- Usuarios registrados (sin contar sub-perfiles administrados por el
  admin, ver sección 38) y su distribución por los 5 planes (barra con el
  mismo color que ya tiene asignado cada plan en el resto de la app).
- Tiendas en el directorio y cuántas están afiliadas (sección 51).
- Reportes pendientes y calificación promedio de la plataforma (reseñas).
- Cartas y producto sellado **en venta ahora mismo** (suma de "Vender en
  el Mercado" + inventario de tiendas).
- Cartas y producto sellado **vendidos** (ventas confirmadas, ver sección
  28) — separados por tipo gracias a la nueva columna `ventas.tipo`
  (antes no se guardaba si lo vendido era carta o sellado, solo la tabla
  de origen; las ventas ya existentes se marcaron como "carta" al aplicar
  la migración).
- Monto total transactado entre usuarios (ventas confirmadas), ingresos
  totales por planes pagados y por Boost — estos dos últimos requieren
  que el admin pueda leer la tabla `pagos`/`boosts` de **todos** los
  usuarios (antes cada quien solo veía la suya), por eso la migración
  agrega una política de lectura para admin en ambas tablas.

**Gráficas de progreso en el tiempo** (acumulado semana a semana, sin
ninguna librería de gráficas nueva — SVG simple hecho a mano, con tooltip
al pasar el mouse sobre cada punto): usuarios registrados, ventas
confirmadas, y publicaciones creadas en total (esta última mide actividad
de publicación en el tiempo, no el inventario activo ahora — incluye lo
que ya se vendió o se borró; el dato de "activo ahora" está en las cifras
de arriba).

Migración `043_admin_estadisticas.sql`: agrega `ventas.tipo` y las
políticas de lectura de admin en `pagos`/`boosts`.

### Pendiente por aplicar en Supabase
Copiar y pegar en el SQL Editor: `043_admin_estadisticas.sql`.

## 53. Segundo TCG con catálogo real: Magic (piloto) + selector de TCG en el inicio

Primer paso de expandir más allá de Pokémon: el campo `tcg` ya existía desde
hace tiempo en "Vender en el Mercado"/"Mi tienda"/Wishlist (Yu-Gi-Oh,
Lorcana, Magic y One Piece ya se podían elegir), pero solo Pokémon tenía
catálogo real conectado — el resto era texto libre, sin imagen ni precio de
referencia. Se eligió **Magic** como piloto del segundo TCG porque su API
pública (Scryfall) es gratuita, no pide llave, y es la más completa y
estable del mercado — mejor terreno de prueba que Yu-Gi-Oh/Lorcana/One
Piece, cuyas opciones gratuitas de datos son bastante menos maduras.

**No requirió ninguna migración**: las columnas `tcg` de `mercado_listings`
e `inventario_tienda` ya eran texto libre desde antes de que existiera esta
carpeta de migraciones (tablas originales del proyecto), así que ya
aceptaban "magic" sin ningún cambio de esquema.

- **Buscador visual de Magic** (`buscarCartasMagic` en `src/lib/pokemonApi.js`,
  vía `api.scryfall.com`): mismo componente `CardPicker` que ya usaba
  Pokémon, ahora recibe un prop `tcg` y usa el catálogo correspondiente —
  imagen, set, número de coleccionista y precio de referencia (USD de
  Scryfall convertido a MXN). Disponible en los 3 lugares donde ya existía
  el selector de TCG: "Vender en el Mercado", "Mi tienda" (cartas sueltas)
  y Wishlist Premium.
- **Precio en vivo en la ficha de detalle**: igual que Pokémon consulta
  pokemontcg.io por el id exacto, una publicación de Magic ahora consulta
  Scryfall por su id (`obtenerPrecioRefActualMagic`) y trae también los
  links directos de compra (TCGplayer/Cardmarket) que Scryfall ya incluye.
- **Yu-Gi-Oh, Lorcana y One Piece** siguen en texto libre por ahora (sin
  imagen ni precio) — se pueden ir agregando uno por uno con el mismo
  patrón (`buscarCartasCatalogo`/`obtenerPrecioRefActualPorTcg` en
  `pokemonApi.js` son los "despachadores" que deciden qué catálogo usar
  según el TCG; agregar uno nuevo es sumar un caso ahí).
- **Producto sellado** (booster boxes, etc.) sigue siendo Pokémon-only por
  ahora — `sellado_tienda` no tiene columna `tcg`, es la siguiente pieza
  pendiente si se quiere vender sellado de otros TCG.

**Selector de TCG en el inicio**: en la pantalla "Buscar", debajo del
buscador principal, un grupo de botones ("Todos", Pokémon, Yu-Gi-Oh,
Lorcana, Magic, One Piece) para elegir qué TCG te interesa ver. Se guarda
solo en el dispositivo (`localStorage`, igual que el tema de Apariencia),
no en la cuenta. Filtra:
- Los resultados de la búsqueda en vivo (tiendas, Mercado).
- La vitrina "🔥 Recién publicado" y la pestaña "Mercado entre usuarios".

El producto sellado (que no tiene `tcg` guardado) se sigue mostrando
mientras el filtro esté en "Todos" o "Pokémon" (hoy todo el sellado
existente es Pokémon) y se oculta con cualquier otro TCG elegido, para no
mostrar sellado con la etiqueta equivocada.

**Nota de alcance** (ya resuelta en la sección 54 de abajo): el filtro de
TCG en esta primera versión solo vivía en la pantalla de inicio/Mercado —
el Directorio de tiendas y el detalle de una tienda no lo usaban todavía.

## 54. Los 5 TCG completos: Yu-Gi-Oh, Lorcana y One Piece + sellado multi-TCG + filtro en Tiendas

Segunda pasada, después del piloto de Magic (sección 53): se agregan los
tres TCG que faltaban, producto sellado para cualquier TCG, y el filtro de
TCG también en el Directorio de tiendas.

**Buscador de texto libre agregado a:**
- **Yu-Gi-Oh!** vía [YGOPRODeck](https://db.ygoprodeck.com/api-guide/)
  (`buscarCartasYugioh` en `pokemonApi.js`) — gratis, sin llave, con precio
  de referencia incluido en la misma respuesta.
- **Lorcana** vía [lorcana-api.com](https://lorcana-api.com) — con una
  diferencia: esta API no documenta de forma confiable una búsqueda
  parcial por nombre, así que en vez de arriesgar la sintaxis exacta del
  query se trae el catálogo completo **una sola vez** (son pocos cientos
  de cartas) y se filtra por nombre en el navegador — mismo patrón que ya
  usa el buscador de Pokémon para elegir foto de perfil. **Aviso de
  honestidad**: no se pudieron confirmar en vivo los nombres exactos de
  los campos de esa API desde este entorno (el proxy de red del sandbox
  bloquea dominios externos) — el código prueba varias variantes de
  nombre de campo por si acaso; si ves nombres o imágenes en blanco al
  buscar Lorcana, avisa para ajustar el mapeo exacto.
- Con esto, `TCG_CON_CATALOGO` (theme.js) ya incluye Pokémon, Magic,
  Yu-Gi-Oh y Lorcana — los 4 con buscador de una sola caja de texto.

**One Piece: por qué se quedó fuera del buscador de texto libre.** Se
investigaron varias opciones (apitcg.com, optcgapi.com, un proxy en
Cloudflare Workers) y ninguna resultó ser, a la vez, gratis, sin necesitar
llave/registro, y con una búsqueda por nombre confiable y verificable
desde este entorno — la más completa (`optcg-api` de GitHub) exige pedir
una llave por correo o estar en la lista blanca de otro dominio. En vez de
integrar algo no verificado que podría fallar en silencio, One Piece (y el
producto sellado de **todos** los TCG, ver abajo) usa el catálogo de
TCGplayer.

**Producto sellado para cualquier TCG** (antes solo existía para Pokémon):
- Migración `044_sellado_multi_tcg.sql`: agrega `sellado_tienda.tcg`
  (default `'pokemon'`, para no romper el sellado ya publicado).
- `TCGplayerPicker` (antes se llamaba `SealedPicker`, ahora generalizado):
  en vez de buscar por texto libre contra todo el catálogo (TCGplayer no
  lo permite), es un picker de 2 pasos — elige el set/expansión, luego
  busca el producto dentro de ese set. Sirve tanto para producto sellado
  de cualquier TCG como para cartas sueltas de One Piece.
- El **categoryId** de TCGplayer para cada juego (el número interno con el
  que identifican Pokémon, Magic, etc.) no está documentado públicamente y
  no es adivinable con confianza para juegos que agregaron hace poco
  (Lorcana, One Piece). En vez de hardcodear un número que podría fallar
  en silencio para siempre, `categoriaIdTCGplayer()` (pokemonApi.js) lo
  busca por nombre contra el catálogo de categorías en vivo de TCGCSV — se
  auto-corrige solo si TCGplayer cambia esos números.
- `CardPickerUniversal` (nuevo): decide automáticamente entre el buscador
  de texto libre (`CardPicker`) o el de 2 pasos (`TCGplayerPicker`) según
  el TCG — los formularios de publicar ("Vender en el Mercado", "Mi
  tienda", Wishlist Premium) ya no necesitan saber cuál es cuál. El
  selector de TCG ahora vive **fuera** de la rama "Carta suelta"/"Producto
  sellado" en esos 3 formularios, para que también aplique al publicar
  sellado (antes solo existía para cartas sueltas).

**Directorio de tiendas: filtro por TCG.** Mismo selector de botones que ya
tenía "Buscar" — se calcula qué TCG vende cada tienda a partir de su
inventario/sellado real (`inventario_tienda`/`sellado_tienda`) y se
filtran tanto la lista del directorio como el inventario/sellado dentro
del detalle de una tienda.

### Pendiente por aplicar en Supabase
Copiar y pegar en el SQL Editor: `044_sellado_multi_tcg.sql`. Hasta
entonces, elegir un TCG distinto de Pokémon al publicar producto sellado
va a fallar con "la columna tcg no existe" en `sellado_tienda`.

## 55. Admin: pestaña "Usuarios" (lista completa, cambiar plan, borrar cuentas)

Antes solo existía "Cambiar plan de un usuario" (buscador). Ahora hay una
pestaña "Usuarios" con la lista completa de todas las cuentas registradas
(oculta sub-perfiles por default, con casilla para mostrarlos), buscador por
nombre/correo, cambio de plan al vuelo y botón de borrado.

**Borrar una cuenta borra todo lo asociado.** Se revisaron las llaves
foráneas reales de la base de datos: casi todas las tablas que dependen de
`perfiles` son `ON DELETE CASCADE` (tienda, publicaciones, mensajes*,
wishlist, alertas, ventas, reseñas, destellos, seguidores, mazos, ofertas,
notificaciones, pagos, boosts, carpetas, reportes...), así que borrar el
usuario de Supabase Auth se lleva todo lo demás solo. La única excepción es
`mensajes` (su FK es `NO ACTION`, no cascada) — el endpoint borra esos
mensajes a mano antes de borrar la cuenta, si no la base de datos rechazaría
el borrado. No se puede borrar a otro administrador ni a la propia cuenta
desde este panel (por seguridad, para no perder acceso de admin por error).

- `api/admin/usuarios.js` (antes `subperfiles.js`, se renombró y se le
  agregó la acción `"borrar"` — seguía usando el mismo archivo por el límite
  de 12 funciones serverless del plan Hobby de Vercel).
- `UsuariosAdmin` (App.jsx): la lista, el buscador, el cambio de plan y el
  borrado con confirmación de dos pasos.

## 56. Login con Google/Facebook + teléfono de contacto

**Login social.** Botones "Continuar con Google" y "Continuar con Facebook"
en el modal de cuenta (tanto al crear cuenta como al iniciar sesión). Como la
app no usa el SDK de supabase-js (habla directo con la API REST de
Supabase Auth), el flujo se hizo a mano: el botón redirige a
`/auth/v1/authorize?provider=...`, Supabase habla con Google/Facebook y
regresa a la página con los tokens en el fragmento de la URL
(`#access_token=...`) — `leerSesionDeUrl()` (lib/supabase.js) los lee una
sola vez y limpia la URL.

Si es la primera vez que esa persona entra por Google/Facebook, todavía no
existe su fila en `perfiles` (Google no pregunta "¿tienda o individual?").
En ese caso aparece un modal nuevo, `CompletarPerfilOAuthModal`, que pide
tipo de cuenta + nombre (ya viene precargado desde Google/Facebook si está
disponible) + teléfono opcional, y crea el perfil.

**Por qué no hay botón de Instagram:** Meta dio de baja en diciembre de 2024
la API pública que permitía "iniciar sesión con Instagram" para cuentas
normales — hoy Instagram Login solo aplica a cuentas de negocio/creador para
publicar contenido, no sirve como método de autenticación de un usuario
cualquiera, y Supabase Auth tampoco lo lista como proveedor soportado. El
enlace de perfil a Instagram (ya existente, en "Editar perfil", Zafiro+)
se queda igual — solo no puede usarse para iniciar sesión.

**Importante — falta un paso manual:** para que los botones de Google/
Facebook funcionen de verdad hace falta ir a **Supabase → Authentication →
Providers** y activar Google y Facebook, cada uno con su Client ID/Secret
(se obtienen creando una app en Google Cloud Console y en Meta for
Developers respectivamente, con la URL de callback que Supabase indica en
esa misma pantalla). Esto no se puede hacer desde aquí porque requiere tus
propias cuentas de desarrollador — el código ya está listo para cuando los
actives.

**Teléfono de contacto.** `perfiles.telefono` ya existía en la base de datos
pero no se usaba en ningún lado — ahora se pide (opcional) al crear cuenta
individual, se puede agregar/editar después en "Tus redes" (mismo bloque de
WhatsApp/Facebook, mismo candado de Zafiro+), y se muestra en el perfil
público como enlace `tel:` para que un comprador pueda llamar o mandar SMS
directo.

## 57. Carrito: agregar cartas y mandar un solo mensaje a cada vendedor

Botón 🛒 junto a "Contactar" en los resultados de Buscar, en el tab Mercado,
en el detalle de una tienda y en el detalle de una publicación. El carrito
vive solo en este dispositivo (localStorage, igual que el tema o el filtro
de TCG) — no hace falta tabla nueva ni sincronizarlo entre dispositivos.

En la nueva vista Carrito (ícono junto a la campana de notificaciones), lo
agregado se agrupa por vendedor. Se escribe un solo mensaje y, al enviar, se
manda **una vez por cada vendedor distinto** (no una vez por carta) con la
lista de lo que le interesa de él — en vez de tener que abrir cada chat uno
por uno para preguntar lo mismo.

## 58. Catálogo por TCG: eras, sets y marcar Tengo/Quiero (Amatista+)

Nueva vista "Catálogo" (menú lateral): elige un TCG, luego una era, luego un
set, y ve la cuadrícula de cartas de ese set. Cada TCG se agrupa según lo
que su propia API realmente ofrece — no se inventó una estructura de "era"
donde la fuente no la tiene:

- **Pokémon** (pokemontcg.io): la era es `series` (Scarlet & Violet, Sword &
  Shield, Sun & Moon, etc.), tal como TCGplayer/Pokellector la organizan.
- **Magic** (Scryfall): no tiene "era" como tal — se agrupa por `set_type`
  (Expansión, Commander, Masters, etc.) como equivalente más cercano.
- **Yu-Gi-Oh** (YGOPRODeck): tampoco hay era oficial — se agrupa por año de
  lanzamiento (dato real de la API), en vez de usar nombres de era no
  oficiales que inventan algunos fans.
- **Lorcana**: son menos de una decena de sets — se listan todos directo,
  sin agrupar por era.
- **One Piece**: no entra por el buscador de texto libre (ver sección 54,
  sigue sin haber una API confiable para eso) — sus "sets" salen de TCGCSV
  (los mismos grupos que ya usa `TCGplayerPicker` para el producto sellado).

**Marcar Tengo/Quiero es exclusivo de Amatista en adelante** (mismo nivel
que la Wishlist Premium) — cualquiera puede *navegar* el catálogo gratis,
pero los botones de marcar están bloqueados con un aviso "Ver planes" si el
plan no alcanza. Marcar una carta como "Quiero" además la agrega
automáticamente a la Wishlist (si no estaba ya), tal como se pidió — así no
hay que agregarla otra vez a mano ahí.

- Migración `045_coleccion_usuario.sql` (ya aplicada directo a Supabase
  desde aquí, con el conector MCP — no hace falta pegarla a mano): tabla
  `coleccion_usuario` (perfil_id, tcg, card_api_id, carta, set_nombre,
  imagen_url, estado `tengo`/`quiero`), única por perfil+tcg+carta.
- `pokemonApi.js`: `obtenerErasYSetsCatalogo`/`obtenerCartasDeSetCatalogo`
  (despachador para los 4 TCG con catálogo) + una función por TCG.
- `CatalogoView` (App.jsx): navega los 3 niveles con el mismo patrón
  view/selectedX que el resto de la app (sin librería de router).

### Cambio de límites de plan
Se ajustó lo pedido sobre los planes: **Zafiro** ahora publica hasta **50**
cartas/productos (antes 20, igual que Cuarzo) y **Amatista en adelante** ya
no tiene límite de publicaciones (antes también 20 — el límite ilimitado
empezaba hasta Diamante). Diamante y Aurora se quedan igual (ilimitado).

## 59. Encabezado: menú de tres líneas separado de la foto de perfil

Antes un solo botón hacía las dos cosas (mostraba tu foto y abría el menú
lateral). Ahora son dos botones: tu foto abre "Editar perfil" directo, y el
ícono de tres líneas (☰, siempre visible, con o sin sesión) abre el menú
lateral con todo lo demás (Torneos, Wishlist, Planes, Ayuda, Admin, Cerrar
sesión, etc.).

## 60. Mercado: pestaña "Accesorios" (playmats, deckbox, micas, etc.)

Tercer "tipo" de `mercado_listings` (junto a carta y sellado), no una tabla
nueva — así reusa tal cual el límite de plan, el chat, el carrito, el boost
y la moderación de admin que ya existían para esa tabla. A diferencia de
una carta, un accesorio pide: nombre, **descripción** (nueva columna),
**foto obligatoria** (antes era opcional) y **etiquetas/palabras clave**
libres — sin estado, idioma ni gradeo, que no aplican.

**Por qué aparece en Buscar aunque no sea una carta.** Las etiquetas se
guardan dos veces: `etiquetas` (arreglo, para mostrarlas como chips) y
`etiquetas_texto` (las mismas, todo junto en minúsculas, para buscarlas con
ILIKE) — PostgREST no deja hacer un ILIKE parcial contra elementos de un
arreglo directo desde la URL, así que se mantiene esta copia en texto plano
en paralelo, cargada por el cliente al mismo tiempo que el arreglo. El
buscador principal ahora también compara cada palabra escrita contra
`etiquetas_texto` de `mercado_listings` — si un accesorio tiene la etiqueta
"sylveon", buscar "sylveon" lo encuentra aunque no sea una carta.

La pestaña "Mercado entre usuarios" ahora tiene sub-filtro Todo / Cartas /
Sellado / Accesorios.

### Pendiente por aplicar en Supabase
Copiar y pegar en el SQL Editor: `046_accesorios_mercado.sql` (agrega
`'accesorio'` al tipo de `mercado_listings` y a `ventas.tipo` — este último
para que "Marcar vendida" funcione también en un accesorio — más las
columnas `descripcion`, `etiquetas`, `etiquetas_texto`). Hasta entonces,
publicar un accesorio va a fallar.

## 61. Mazos: separados por TCG + avisos de reglas de construcción

Antes todos los mazos eran implícitamente de Pokémon (el picker de cartas
del Deck Builder solo buscaba en pokemontcg.io). Ahora:

- Cada mazo tiene un TCG (columna `mazos.tcg`, elegido al crearlo).
- "Mis mazos" tiene un filtro Todos / Pokémon / Yu-Gi-Oh! / Lorcana / Magic
  / One Piece.
- Al abrir un mazo, el buscador de cartas ya usa `CardPickerUniversal` con
  el TCG de ese mazo en vez de estar fijo a Pokémon.
- El aviso de "máximo de copias por carta" (antes solo existía para
  Pokémon: 4 copias, sin contar Energía Básica) ahora es por TCG: Magic 4,
  Yu-Gi-Oh 3, Lorcana 4, One Piece 4. También se agregó un aviso de tamaño
  de mazo esperado por juego (Pokémon 60 exactas, Magic mínimo 60, Yu-Gi-Oh
  entre 40 y 60 en el mazo principal, Lorcana mínimo 60, One Piece 50 sin
  contar el Líder). **Honestidad**: esto valida el formato "constructed"
  más común de cada juego, no cubre cada formato posible (Commander,
  Extra/Side Deck de Yu-Gi-Oh, etc.) — son avisos, no bloquean guardar.

### Pendiente por aplicar en Supabase
Copiar y pegar en el SQL Editor: `047_mazos_tcg.sql` (agrega `mazos.tcg`,
default `'pokemon'` para no romper los mazos que ya existen).

## 62. Catálogo: agregar cartas a un mazo + Master Sets

Dos funciones nuevas dentro de la vista Catálogo (ambas Amatista+, mismo
nivel que marcar Tengo/Quiero):

- **Agregar a un mazo directo desde el catálogo**: al abrir un set, si ya
  tienes un mazo de ese TCG aparece un selector de "mazo destino" y cada
  carta gana un botón "Agregar a mazo" — ya no hace falta ir al buscador
  del Deck Builder para agregar una carta que acabas de ver en el catálogo.
- **Master Sets**: pestaña nueva dentro de Catálogo ("🏆 Master Sets") que
  resume, para cada set, cuántas cartas ya marcaste como "tengo" contra el
  total de cartas del set (con barra de progreso y aviso de "¡Completo!" al
  100%) — reusa `coleccion_usuario`, no necesitó tabla nueva. Para One
  Piece (sin API de "total de cartas por set" verificado) solo muestra el
  conteo de las que marcaste, sin porcentaje, en vez de inventar un total.

## 63. Fix: catálogo flaky (sin cartas intermitente), Master Sets se regresaba a Explorar, precio de referencia por carta

Tres reportes del catálogo, todos con la misma causa raíz: las llamadas a
las APIs externas sin llave del catálogo (pokemontcg.io, Scryfall,
YGOPRODeck, lorcana-api.com, TCGCSV) no tenían reintento — cualquier 429
(límite de tasa) o caída breve de 5xx se atrapaba y se devolvía en
silencio una lista vacía, que del lado del usuario se veía como "no se
encontraron cartas para este set" o "sin resultados" de forma
intermitente ("a veces sí, a veces no"), aunque la carta/set sí existiera.
Además, varias listas (sets de Pokémon/Magic/Yu-Gi-Oh, categorías de
TCGplayer, catálogo completo de Lorcana) se guardaban en cache en memoria
incluso cuando el fetch había fallado, dejando ese catálogo "vacío" para
el resto de la sesión.

- **`src/lib/pokemonApi.js`**: nuevo helper `fetchConReintento` (3
  intentos, espera creciente 500ms/1s/1.5s) usado en todas las llamadas a
  pokemontcg.io, Scryfall, YGOPRODeck, lorcana-api.com y TCGCSV
  (categorías). `buscarCartasVisual` (buscador de Pokémon) ahora usa
  `Promise.allSettled` en vez de `Promise.all`: si una combinación de
  nombre/set de verdad no existe no tumba a las demás, pero si TODAS
  fallan por conexión se avisa un error real en vez de "sin resultados".
  Ningún cache en memoria (`_setsPokemonCache`, `_setsMagicCache`,
  `_setsYugiohCache`, `_lorcanaCache`, `_categoriasTCGplayerCache`) guarda
  ya un resultado vacío por error — solo cachean cuando el fetch sí llegó
  bien.
- **`CardPicker`** (buscador de cartas al publicar): ahora distingue un
  error real de conexión (ya con reintentos agotados) de "sin resultados"
  de verdad — antes ambos casos mostraban el mismo mensaje genérico, que
  es lo que hacía parecer que "agregar o borrar un espacio" arreglaba la
  búsqueda (en realidad solo disparaba un reintento nuevo del debounce).
- **Master Sets → "Ver cartas" ya no te deja varado en Explorar**: se
  agregó un estado `volverAMasterSets` que se activa al entrar a un set
  desde Master Sets; el botón "atrás" dentro de ese set ahora dice
  "← Master Sets" y regresa ahí en vez de a la lista genérica de sets de
  Explorar. Cambiar de pestaña manualmente (Explorar/Master Sets) limpia
  ese estado.
- **Precio de referencia por carta en el Catálogo**: cada tarjeta de carta
  dentro de un set ahora muestra su precio de mercado aproximado en MXN
  (o "Sin precio de referencia" si esa API no lo trae, como Lorcana). Para
  Pokémon/Magic/Yu-Gi-Oh ya venía en la misma respuesta de la API; para
  One Piece se agregó una segunda llamada a TCGCSV (`/prices`, mismo
  patrón que ya usa `TCGplayerPicker`) que se cruza por `productId`. El
  precio se vuelve a pedir fresco cada vez que abres un set (no hay
  cache), así que se mantiene actualizado sin necesitar un ticker de fondo
  que solo aumentaría la presión sobre APIs gratis ya limitadas de tasa.

## 64. Reemplazo de iconografía + fix de modo día

- **Iconos propios**: los 38 iconos de botones/nav de `lucide-react` se
  reemplazaron por un set de marca a la medida (`src/lib/icons.jsx` +
  fuente en `src/assets/icons/*.svg`). Misma API de props (`size`, `color`,
  `fill`, `className`) que lucide, así que solo cambió el import en
  `App.jsx` — ningún uso individual se tocó. Se quitó `lucide-react` de
  `package.json`.
- **Modo día — dos bugs de raíz corregidos** (antes se veía "roto"/feo):
  - ~45 botones usaban `COLORS.bg` como color de su propio texto sobre
    fondos claros (`azulPalido`, `azulClaro`, `gold`), asumiendo que `bg`
    siempre es oscuro — cierto de noche, falso de día (`bg` es claro ahí),
    así que el texto quedaba casi invisible. Se agregó `COLORS.textoOscuro`
    (fijo en ambos modos, nunca lo toca `aplicarTema`) para ese rol.
  - El header, el modal de bienvenida y el fondo animado (`BackgroundField`)
    tenían colores oscuros escritos directo en el código (no derivados de
    `COLORS`), así que se quedaban oscuros sin importar el modo — de día se
    veía una mezcla rota de header oscuro sobre contenido claro. Ahora usan
    `conAlpha(COLORS.bg/surface, alpha)` (helper nuevo en `theme.js`, hex →
    rgba) y `COLORS.fondoProfundo` (nuevo, un valor por modo).
  - De paso, `aplicarTema()` ahora tiñe `bg`/`surface` hacia el tono CLARO
    del tipo de Pokémon en modo día (antes siempre hacia el oscuro, incluso
    de día) — con el tinte oscuro, "surface" recibía más mezcla que "bg" y
    terminaba más apagado que la página en vez de "flotar" sobre ella.

## 65. Nuevos beneficios de plan (todos menos "acceso anticipado")

- **Modo día/noche gratis para todos los planes** (antes exclusivo Zafiro+):
  `AparienciaView` ya no bloquea esa sección detrás de `info.redesExtra` —
  solo el color según tipo de Pokémon se queda Amatista+.
- **Wishlist básica gratis para todos**: marcar "Quiero" en el Catálogo ya
  no exige `info.wishlistPremium` (solo "Tengo", que alimenta Master Sets,
  se queda Amatista+). La vista "Wishlist" (antes "Wishlist Premium") ahora
  siempre muestra arriba "Mi Wishlist" (tabla `wishlist`, gratis) y abajo,
  aparte, las alertas de precio con push (siguen Amatista+).
- **Boost gratis mensual escalonado**: Amatista 1/mes, Diamante 2/mes,
  Aurora 3/mes, como Destellos (150/300/450 — el mismo costo que cobra
  `api/recompensas/canjear.js` por 1/2/3 boosts de 3 días). Se otorga desde
  `api/cron/recordatorios.js` (el cron diario ya existente, con un `if
  (ahora.getDate() === 1)` adentro) en vez de un archivo de cron nuevo —
  el proyecto ya estaba en el límite de 12 funciones serverless de Vercel
  Hobby, así que sumar un archivo aparte lo hubiera roto.
- **"Mis estadísticas" para tiendas** (Diamante+, `info.diamante` — se le
  agregó ese flag también a Aurora, que antes no lo tenía a pesar de decir
  "Todo lo de Diamante" en su texto): panel nuevo en `MyStorePanel` con
  inventario activo, ventas confirmadas (monto + gráfica de crecimiento por
  semana), contactos (mensajes recibidos) y seguidores/reseñas — reusa
  `StatTile`/`MiniAreaChart`/`serieAcumuladaPorSemana`, los mismos
  componentes del panel de Estadísticas de Admin. No incluye "vistas de
  página" porque esa métrica no existe en el esquema — se omitió en vez de
  inventar un número falso.
- **Carrusel de tiendas Aurora** en el home del Mercado: se oculta solo si
  no hay ninguna tienda Aurora, rota cada 5s si hay más de una.
- **Insignia "Tienda verificada" con trámite real**: migración 048 agrega
  la tabla `verificaciones_tienda` (pendiente/aprobada/rechazada), separada
  de `tiendas` a propósito para no necesitar ni una función serverless ni
  un trigger que reviente si la tabla `tiendas` gana columnas — la RLS de
  esta tabla nueva ya impide que una tienda se apruebe a sí misma (solo
  puede insertar en 'pendiente'; solo un admin puede resolver a
  'aprobada'/'rechazada'). Nueva sección en `MyStorePanel` para solicitarla
  y una nueva pestaña dentro de Admin → Tiendas para aprobar/rechazar. La
  insignia (`TiendaVerificadaBadge`, ícono 🛡️ dorado) es distinta de
  "✓ Verificado" (ese sigue siendo automático solo por plan Zafiro+).

### Ya aplicado en Supabase
La migración `048_tienda_verificacion.sql` ya se aplicó directo a la base
de datos real vía el conector MCP de Supabase — no hace falta copiarla a
mano en el SQL Editor.

## 66. Foto real de frente y de atrás obligatorias al publicar

- **Qué cambia**: al publicar una carta, producto sellado o accesorio en
  el Mercado (vendedor individual) o al agregar una carta suelta al
  inventario de una tienda, ahora hay que subir **2 fotos reales**
  (frente y atrás) de manera obligatoria — antes `foto_real_url` (frente)
  era opcional para cartas y obligatoria solo para accesorios, y no
  existía ningún campo de reverso. Migración `049_foto_real_reverso.sql`
  agrega `foto_real_reverso_url` a `mercado_listings` e
  `inventario_tienda`.
- **Excepciones (solo para tiendas)**: el producto sellado de tienda
  (`sellado_tienda`) sigue sin pedir ninguna foto real — esa tabla nunca
  tuvo la columna, a propósito. El Importador Masivo (Ente Ball) tampoco
  pide fotos — es un código separado (`importar()` en `ImportadorMasivo`)
  que nunca pasó por `agregarCarta()`, así que la excepción ya existía
  sola sin tocarle nada. El vendedor individual **no** tiene esta
  excepción para su propio producto sellado: si publica sellado en el
  Mercado, también necesita las 2 fotos.
- **La miniatura sigue siendo la oficial**: en todas las tarjetas/grids
  del Mercado, Directorio, Perfil público, Home y carrito, la miniatura
  muestra la imagen oficial del catálogo (`imagen_url`), nunca la foto
  real — nuevo helper `miniaturaListing()` en `theme.js`. Única excepción:
  los accesorios no existen en ningún catálogo, así que su "miniatura
  oficial" es su propia foto real de frente.
- **En el detalle de la publicación** (`CartaDetalleView`) sí se ven las
  3 imágenes: la oficial arriba (igual que antes) y, debajo, la foto real
  de frente y de atrás lado a lado, al mismo tamaño que la oficial.
- Las filas de "Tus publicaciones" (Mercado) y "Cartas sueltas" (tienda)
  ahora tienen botones para cambiar cada una de las 2 fotos reales de una
  publicación ya existente, no solo al momento de crearla.

### Pendiente de aplicar en Supabase
La migración `049_foto_real_reverso.sql` **todavía no se aplicó** a la
base de datos real (el conector MCP de Supabase no estaba disponible en
esta sesión) — cópiala y pégala en Supabase → SQL Editor → Run antes de
usar esta función en producción.

## 67. Fix: texto negro invisible en portales + borrar anuncios pendientes/programados

- **Texto negro que se perdía en el tutorial, la bandeja de notificaciones
  y el chat flotante**: causa raíz encontrada — esos 3 son los únicos
  componentes que usan `createPortal` para renderizar directo a
  `document.body` en vez de dentro del árbol normal de la app. El div raíz
  de `EncuentraCartas` sí trae `color: COLORS.text` y por eso todo lo demás
  hereda un color legible sin tener que declararlo en cada `<p>`/`<h2>` —
  pero un portal escapa de ese árbol, así que cualquier texto sin `color`
  explícito caía al negro por default del navegador (`<body>` nunca tuvo
  un `color` propio), invisible sobre los fondos oscuros de esos 3 paneles.
  Arreglado agregando `color: COLORS.text` al div contenedor de cada
  portal (`OnboardingTutorial`, el panel de `NotificationBell`, y la
  ventana de chat flotante) en vez de parchar cada texto suelto uno por
  uno.
- **Admin → Anuncios: ahora sí se pueden borrar los pendientes y
  programados** — antes la función `borrarAnuncio` (DELETE en `noticias`)
  solo tenía botón en la lista de "Publicados"; un anuncio "Pendiente de
  aprobación" solo se podía Aprobar o Rechazar (y "Rechazar" no lo borra,
  solo lo saca de las 3 listas visibles), y uno "Programado" no tenía
  ningún botón de acción. Se agregó el mismo botón "Borrar" a esas dos
  secciones.

## 68. Navegación a prueba de tontos: máximo 5 botones arriba + pestañas + Catálogo más claro

- **Encabezado reducido a máximo 5 botones** (antes hasta 9, según plan y
  tipo de cuenta, y se sentía saturado): ahora siempre son los mismos 4
  para cualquiera (Buscar, Mercado, Tiendas, Catálogo) más "Mensajes" si
  ya iniciaste sesión. Todo lo demás (Mi tienda/Vender en el Mercado, Mis
  compras y ventas, Torneos, Armar mazo, Comunidad, Noticias, Lista de
  deseos, Recompensas, Apariencia, Mis pagos, Planes, Ayuda, Admin) se
  movió al menú lateral.
- **Menú lateral con pestañas** en vez de una lista larga sin agrupar:
  `Drawer` ahora recibe `navGrupos` (antes `navSecundarios`, una lista
  plana) y muestra 4 pestañas con nombres que no requieren explicación —
  **Vender** (acciones de vendedor: Mi tienda/Vender en el Mercado, Mis
  compras y ventas), **Comunidad** (Torneos, Armar mazo, Comunidad,
  Noticias, Tiendas que sigo), **Mi cuenta** (Lista de deseos,
  Recompensas, Apariencia, Mis pagos, Planes y precios) y **Ayuda**
  (Centro de ayuda, Ver el tutorial de bienvenida, Admin). Si una pestaña
  queda vacía por no tener sesión (ej. "Vender" para un invitado), en vez
  de verse en blanco muestra "Inicia sesión para ver esta sección" con un
  botón directo. El perfil (editar/cerrar sesión) se queda fuera de las
  pestañas, siempre visible abajo, tal como antes.
- **Renombres para quitar anglicismos y jerga confusa**: "Wishlist" →
  "Lista de deseos" (en el nav, el h2 de la vista, el selector de
  visibilidad del perfil y el editor de orden de secciones). "Anuncios y
  noticias" → "Noticias" en el nav (la vista conserva su título completo).
  "Planes" → "Planes y precios".
- **Catálogo reestructurado para que nadie se pierda**: antes el flujo
  (TCG → Era → Set → Cartas) no tenía ninguna señal de "dónde estoy", y
  el modo "🏆 Master Sets" usaba jerga sin explicar qué hacía. Ahora:
  - El subtítulo de arriba explica los 3 pasos de una sola vez ("Paso 1:
    elige el juego. Paso 2: elige una era y un set. Paso 3: marca cada
    carta...").
  - Cada sección trae su propia etiqueta "Paso 1 · Elige el juego",
    "Paso 2 · Elige una era/set", "Paso 3 · Marca cada carta".
  - "🔍 Explorar" y "🏆 Master Sets" se renombraron a "📖 Ver cartas y
    marcar" y "🏆 Mi progreso por set", cada uno con una línea corta
    debajo explicando qué hace.
  - Nueva migaja de pan (breadcrumb) siempre visible mientras navegas
    dentro de un TCG: `📍 Pokémon › Escarlata y Púrpura › 151`, con cada
    segmento anterior clicable para saltar directo ahí, en vez de solo un
    botón "← Eras"/"← Sets" ambiguo sobre a dónde regresa.

## 69. Auditoría: reporte de "contraseña sin encriptar"

Un usuario reportó (con razón de preocuparse) que el login parecía mandar
el correo/contraseña "sin encriptar". Se auditó todo el flujo de
autenticación (`authSignUp`/`authSignIn` en `src/lib/supabase.js`, y los
formularios de `AccountModal` en `App.jsx`):

- Ambas funciones mandan el correo/contraseña por **POST con body JSON**
  (nunca por query string ni GET) a `https://nulypgaaekexlbxbxdwq.supabase.co`
  — la URL está codificada con `https://` fijo, no hay ninguna ruta que use
  `http://`. El formulario tampoco usa un `<form>` nativo (que podría
  enviar por GET si no se cuida) — son `<input>` controlados por React y un
  botón que llama `fetch()` directo.
- **Conclusión: el tráfico ya viaja cifrado (TLS/HTTPS) de punta a punta.**
  Lo que muy probablemente vio la persona que reportó esto es el panel
  "Network" del navegador (DevTools) mostrando el *payload* de la
  petición en texto plano — eso es normal y no es una falla: HTTPS cifra
  los datos en tránsito por la red, pero el navegador (el propio emisor
  de la petición) siempre puede mostrarle a su dueño lo que está a punto
  de mandar, antes de cifrarlo. No es algo que un tercero en la red pueda
  leer.
- **Endurecimiento agregado de todos modos** (no estaba roto, pero cierra
  el único hueco teórico real): `vercel.json` ahora manda el header
  `Strict-Transport-Security` (`max-age=63072000; includeSubDomains;
  preload`) en todas las respuestas, para que el navegador recuerde no
  intentar nunca `http://` con este dominio ni con subdominios, ni
  siquiera en la primerísima visita antes de que ocurra el redirect
  automático de Vercel a HTTPS.

## 70. Fix real: inyección en filtros PostgREST + error verboso + clickjacking

El mismo usuario mandó un segundo reporte, este sí con una falla real de
verdad (no solo una confusión de DevTools): una coma en un nombre/búsqueda
podía "desmadrar" la consulta, y el mensaje de error que veía de regreso
traía la consulta completa. Se corrigieron los 3 puntos:

- **Inyección en filtros PostgREST vía coma/paréntesis (la causa real)**:
  PostgREST usa `,` `.` `(` `)` como caracteres reservados de su propia
  gramática de filtros (`columna=operador.valor`, y sobre todo dentro de
  `or=(...)`/`and=(...)`). El bug: `encodeURIComponent()` NO protege contra
  esto, porque el servidor decodifica la URL *antes* de parsear el filtro
  — un `,` que un usuario escribe en un nombre vuelve a ser un `,` literal
  justo cuando PostgREST decide dónde termina una condición y empieza la
  siguiente, dejando que el resto del texto se cuele como si fuera otra
  condición. Afectaba sobre todo al buscador público (`filtroPalabrasCartaOSet`,
  el que arma `and=(or(...),or(...))` a partir de las palabras que escribes
  en Buscar) y a la búsqueda de usuarios en Admin → Planes
  (`or=(nombre.ilike...,email.ilike...)`). Fix: nuevo helper `pgValor()` en
  `lib/supabase.js` que envuelve cualquier texto libre en comillas dobles
  (escapando `\` y `"` adentro) antes de codificarlo para la URL — la forma
  que la propia documentación de PostgREST pide para tratar un valor
  siempre como texto literal, sin importar en qué filtro se use. Se aplicó
  en las 6 consultas que interpolaban texto de usuario directo en un
  filtro (buscador público, búsqueda de usuarios en Admin, búsqueda de
  publicaciones en Admin, búsqueda de sellado, buscador de destinatario de
  mensaje).
- **El mensaje de error ya no expone la consulta ni el mensaje crudo de la
  base de datos**: `sb()`/`sbWrite()` armaban el `Error` con la ruta/query
  completa y el `message`/`hint` tal cual los mandaba PostgREST, y eso se
  mostraba directo en pantalla (`ErrorBox`) — un mapa gratis de nombres de
  tablas/columnas para cualquiera que force un error. Ahora el detalle
  técnico completo se manda a `reportarError()` (el mismo sistema de
  "Captura de errores + aviso al admin" de la sección 35, que hasta ahora
  nunca se enteraba de estos errores porque siempre se atrapaban en un
  `try/catch` local antes de llegar al listener global) y al usuario se le
  muestra un mensaje genérico ("No se pudo cargar/guardar. Intenta de
  nuevo"). El único caso donde el resto de la app necesitaba distinguir el
  tipo de error (duplicado, para reintentar con otro slug en
  `crearConSlugUnico`, o para no tratar como error real un
  `push_subscriptions` repetido) ahora usa `error.code === "23505"`
  (el código SQLSTATE real de Postgres para unique_violation) en vez de
  buscar la palabra "duplicate" dentro del mensaje mostrado al usuario.
- **Clickjacking**: `vercel.json` no mandaba `X-Frame-Options` ni
  `frame-ancestors`, así que en teoría cualquier sitio podía meter
  Encuentra Cartas dentro de un `<iframe>` invisible/disfrazado y engañar
  a alguien para que hiciera clic pensando que interactúa con otra cosa.
  Se agregó `X-Frame-Options: DENY` y
  `Content-Security-Policy: frame-ancestors 'none'` (más
  `X-Content-Type-Options: nosniff` de paso) en `vercel.json`.

## 71. Bajar el ruido de los avisos de error por caídas de APIs externas

Después del fix de la sección 70, siguió llegando el aviso "⚠️ Error
detectado" por un `HTTP 500` -- rastreado hasta `fetchConReintento()` en
`pokemonApi.js` (reintenta 3 veces las llamadas a pokemontcg.io/Scryfall/
YGOPRODeck/lorcana-api/TCGCSV, gratis y sin llave, así que fallan de vez
en cuando). El problema de fondo: los 3 despachadores que usa toda la
pantalla de Catálogo y el buscador de cartas (`obtenerErasYSetsCatalogo`,
`obtenerCartasDeSetCatalogo`, `buscarCartasCatalogo`) y
`categoriaIdTCGplayer` no atrapaban ese error -- se colaba como promesa
sin atrapar (`unhandledrejection`), y el listener global de
`errorReporting.jsx` lo mandaba derechito al correo del admin cada vez
que a alguien le tocaba una caída momentánea de una de esas APIs
gratuitas, algo que la app no puede arreglar y que no era realmente
accionable.

- Los 3 despachadores + `categoriaIdTCGplayer` ahora atrapan cualquier
  falla y devuelven `[]`/`null` en vez de dejarla reventar -- la pantalla
  ya sabía mostrar "no pudimos cargar los sets/cartas en este momento"
  cuando la lista viene vacía, así que la UX de una caída real no cambia,
  solo deja de generarle un correo al admin.
- De regalo, esto también corrige un bug real: el `useEffect` que carga
  las eras/sets en `CatalogoView` no tenía manejo de error, así que si la
  API fallaba se quedaba pegado en "Cargando sets..." para siempre (nunca
  llegaba a `setLoadingEras(false)`). Ahora sí lo hace, con `try/finally`.
- Los errores de verdad accionables (bugs de nuestro código, fallas de
  `sb()`/`sbWrite()` contra Supabase) siguen avisando al admin igual que
  antes -- este cambio solo afecta específicamente a las 4 funciones que
  hablan con catálogos externos de terceros.

## 72. Filtrar ruido de errores que no tienen nada que ver con la app

Tercer aviso de error el mismo día, esta vez `Uncaught Error: Error
invoking postMessage: Java object is gone`, con el stack apuntando a
`iabjs://navigation_performance_logger_android`. Ese `iabjs://` es el
navegador integrado de una app de Android (Gmail, Facebook, Instagram,
etc. cuando abres un link "dentro" de la app en vez de en Chrome) —
su propio script de medición de navegación truena cuando cierran esa
vista antes de que termine de llamar a su puente Java. No tiene nada que
ver con el código de Encuentra Cartas ni es algo que se pueda arreglar
desde la web.

En vez de ir tapando un patrón a la vez cada vez que llegue uno nuevo, se
agregó una lista de "ruido conocido" en `errorReporting.jsx`
(`RUIDO_CONOCIDO`) que se revisa ANTES de mandar el reporte -- si el
mensaje o el stack hace match, ni siquiera se manda la llamada de red.
Incluye, además del caso de arriba: navegadores integrados de Android en
general (`iabjs://`), la advertencia inofensiva de `ResizeObserver loop`
(muy común en Chrome/Safari, no rompe nada), el `Script error.` genérico
que mandan los navegadores cuando el script que falló es de otro origen
(casi siempre una extensión instalada, no nuestro bundle), y errores con
stack de una extensión del navegador (`chrome-extension://`,
`moz-extension://`, `safari-extension://`). Cualquier error real de
nuestro propio código sigue avisando exactamente igual que antes — esta
lista es deliberadamente específica (son patrones que ya llegaron por
correo, no una suposición) para no silenciar por accidente algo que sí
importa.

## 73. Fix: no se podía publicar (sin error visible) + buzón + búsqueda

- **El bug real: el botón de publicar se quedaba deshabilitado en silencio.**
  Desde que las 2 fotos (frente/atrás) se hicieron obligatorias (sección
  66), `agregar()`/`agregarCarta()` hacían un `return` mudo si faltaba
  algo -- sin `setError()`, así que quien no había subido las fotos (o le
  faltaba idioma/condición/precio/zona) solo veía el botón "+ Publicar"
  sin reaccionar, sin ninguna pista de por qué. Se reemplazó por una
  lista (`faltantes`/`faltantesCarta`) que junta en español exactamente
  lo que falta ("el idioma de la carta", "la foto de atrás", etc.) y se
  muestra como texto debajo del botón en `MyMarketPanel` y en la sección
  de "Cartas sueltas" de `MyStorePanel` -- el botón sigue deshabilitado
  mientras falte algo, pero ahora ya no es un misterio por qué.
- **Buzón de tienda afiliada ya no aparece al vender producto sellado**:
  un comprador recoge algo pequeño en el buzón de una tienda, no tiene
  sentido para cajas/booster boxes. La casilla y el selector desaparecen
  por completo cuando `tipo === "sellado"` en `MyMarketPanel` (antes
  salía para los 3 tipos), se limpia `buzon_tienda_id` al cambiar a ese
  tipo, y el payload de `agregar()` ya no lo manda aunque quedara alguno
  guardado de antes.
- **Búsqueda de cartas Pokémon (`buscarCartasVisual` en `pokemonApi.js`)**:
  encontrado un bug de fondo en `terminoDeCampo()` -- un nombre o set de
  una sola palabra ya buscaba con comodín parcial ("char*"), pero de dos
  palabras o más exigía la FRASE EXACTA entre comillas ("Pikachu VMAX").
  Mientras alguien seguía escribiendo ("Pikachu V", "Journey Toge...") no
  encontraba nada, como si el buscador estuviera roto. Ahora cada palabra
  del nombre/set se busca con su propio comodín parcial (`name:Pikachu*
  name:VMAX*`), sin importar cuántas palabras tenga ni si ya se terminó de
  escribir la frase completa.

### Seguía sin poder publicar aunque ya no faltara nada

Después del fix de arriba, seguía sin poder publicar aunque el nuevo
mensaje de "falta: ..." ya no mostrara nada pendiente. Causa más probable:
la migración `049_foto_real_reverso.sql` (agrega `foto_real_reverso_url`
a `mercado_listings` e `inventario_tienda`) quedó documentada como
**pendiente de aplicar** en la sección 66 y nunca se confirmó que alguien
la corriera — sin esa columna en la base de datos real, el `INSERT`
fallaba por completo apenas se mandaba `foto_real_reverso_url`, sin
ninguna relación con si el formulario estaba bien lleno o no.

No hubo forma de confirmar esto en vivo porque el conector MCP de
Supabase no estaba disponible en esta sesión (ver notas de las secciones
anteriores) para revisar el esquema real. Mientras tanto, `agregar()` en
`MyMarketPanel` y `agregarCarta()` en `MyStorePanel` ahora reintentan el
`INSERT` una vez sin `foto_real_reverso_url` si el primer intento falla
-- así publicar ya funciona de inmediato (guardando al menos la foto de
frente) aunque la migración siga sin correr. **Sigue pendiente correr la
migración 049 a mano** (copiar y pegar en Supabase → SQL Editor → Run)
para que la foto de atrás también se guarde:

```sql
alter table mercado_listings add column if not exists foto_real_reverso_url text;
alter table inventario_tienda add column if not exists foto_real_reverso_url text;
```

## 74. Descripciones de estado más claras + filtros de búsqueda en Mercado + moderación de fotos

- **Descripciones de estado de carta (`CONDICION_OPCIONES` en `theme.js`)**:
  las 6 categorías (GM/NM/LP/MP/HP/DMG) ya tenían un nombre en inglés pero
  no explicaban qué significa cada una en la práctica. Se reescribió
  `desc` de cada una con ejemplos concretos de qué esperar de la carta
  (ej. GM: "Carta súper perfecta, sin ningún detalle -- del sobre directo
  a la mica"; NM: "Carta sin detalles a simple vista, de sobre a mica";
  hasta DMG: "Carta dañada de verdad: rota, con hoyos, manchada fuerte o
  le falta un pedazo"). Se muestran en `EstadoCartaSelector` (texto
  persistente debajo de los botones una vez elegida una opción, más
  `title` en cada botón) y en `EstadoCartaBadge`.
- **Filtros de búsqueda en "Mercado entre usuarios"**: se agregó un botón
  "🔎 Filtros" junto a las pestañas de tipo, que abre un panel con precio
  mínimo/máximo, idioma, condición/estado y zona. El filtro se aplica con
  `pasaFiltrosMercado(item)` encadenado a los filtros que ya existían
  (TCG y tipo de producto), tanto para la cuadrícula como para el mensaje
  de "no hay resultados". Un botón "Limpiar filtros" resetea todo.
- **Moderación de fotos reales subidas (`SubirFotoManual`)**: antes de
  subir cualquier foto real de una carta/producto a Storage, se le pide a
  Gemini (con visión) que la revise y rechace solo si es contenido
  sexual/gráfico explícito o si la imagen claramente no tiene nada que
  ver con un producto de TCG -- una foto borrosa o de mala calidad de una
  carta real sigue siendo válida, el criterio es el tema, no la calidad.
  Por el límite de 12 funciones serverless del plan Hobby de Vercel (ya
  estaba al tope), esto no se hizo como endpoint nuevo: se agregó un modo
  `modo: "moderar"` dentro de `api/carpetas/detectar.js` (que ya llamaba
  a Gemini con visión para detectar cartas de carpetas), compartiendo la
  lógica de llamar a Gemini vía el nuevo `lib/gemini.js`. Del lado del
  cliente, `src/lib/moderacion.js` expone `moderarFotoReal(file)`, que
  `SubirFotoManual` llama antes de `subirImagenCarta`, mostrando el
  motivo del rechazo si aplica ("Revisando y subiendo..." mientras
  tanto). Es **fail-open** a propósito en cada capa (sin `GEMINI_API_KEY`
  configurada, sin conexión, o si Gemini falla) -- se deja pasar la foto
  en vez de bloquear una venta legítima por un problema técnico ajeno;
  esto no reemplaza el botón "Reportar" ni la revisión de Admin, es
  nada más una primera barrera automática.

## 75. Zona: selector de los 51 municipios de Nuevo León (en vez de texto libre)

Antes "zona" era un `<input>` de texto libre en cada publicación -- cada
quien escribía como quisiera ("San Pedro", "San pedro", "SPGG",
"San Pedro Garza García"), así que el filtro de zona (sección 74) nunca
hacía match entre variantes de una misma zona real. Se agregó
`MUNICIPIOS_NL` en `theme.js` con los 51 municipios de Nuevo León y un
componente `ZonaSelector` (`<select>` nativo, con opción `incluirTodas`
para usarlo también como filtro) que reemplaza el input de texto en:

- `MyMarketPanel`: publicar una carta/sellado/accesorio en el Mercado.
- `CarpetasPanel`: publicar en bloque desde una carpeta hacia el Mercado.
- El panel de filtros del Mercado (sección 74) -- ahora es el mismo
  selector de municipios en vez de un texto que tenía que coincidir a mano.

No se tocó la zona de tiendas en el panel de Admin (`AdminPanel` →
Tiendas) -- esa la captura un admin al dar de alta la tienda, no es parte
del flujo de "publicar una venta" que pidió el usuario.

## 76. Orden por precio en el filtro del Mercado

Se agregó un selector "Ordenar por" al panel de filtros de "Mercado entre
usuarios" (el mismo panel de la sección 74), con "Precio: menor a mayor" y
"Precio: mayor a menor" (además de "relevancia", el orden por default con
los boosts primero). A diferencia de los demás filtros del panel, el orden
no oculta publicaciones, solo cambia en qué secuencia se muestran -- por
eso vive en su propio estado (`ordenMercado`) en vez de sumarse a
`filtrosMercado` (que sí cuenta cuántos filtros están activos).

## 77. Los mismos filtros de Mercado, ahora también en "Buscar"

Los filtros (precio, idioma, estado, zona, orden de precio) vivían solo en
"Mercado entre usuarios" -- si buscabas "gardevoir" desde "Buscar" (que
junta resultados de tiendas, Mercado y sellado en una sola búsqueda con
texto) no había forma de acotar por esos mismos criterios. Se generalizó
el estado y las funciones (`filtrosMercado` → `filtros`, `pasaFiltrosMercado`
→ `pasaFiltros`, `ordenarMercado` → `ordenarPorPrecio`, etc. -- mismos
nombres más genéricos, mismo estado compartido) para que un solo panel de
filtros sirva en las dos vistas en vez de duplicar el código y el estado.

La única complicación real: la zona vive en columnas distintas según de
dónde sale cada resultado -- plana en `mercado_listings.zona`, pero
anidada bajo `tiendas.zona` en `inventario_tienda`/`sellado_tienda` (las
publicaciones de una tienda). Se agregó un helper `zonaDe(item)` que
revisa ambos lugares, y de paso el filtro de zona pasó de "contiene" a
comparación exacta (`===`) -- tiene sentido ahora que la zona siempre es
uno de los 51 municipios de la sección 75, ya no texto libre.

El panel de filtros en "Buscar" aparece debajo de la barra de búsqueda en
cuanto hay texto escrito, y se aplica a los 3 grupos de resultados
(tiendas, Mercado, sellado) por separado. El mensaje de "no hay
resultados" ahora distingue entre "no existe nada con ese nombre" y
"existe pero ninguno pasa esos filtros".

## 78. Correos de error en palabras simples + fix real de "seguidores" (400) + búsqueda de Pokémon más confiable

- **Explicación en español simple en los avisos de error**: el correo/push
  que le llega al admin cuando algo falla mandaba solo el mensaje técnico
  crudo (ej. `Error consultando (400) en seguidores?...: invalid input
  syntax for type uuid: "null"`), difícil de interpretar sin saber leer una
  consulta de base de datos. Se agregó `lib/explicarError.js`: reconoce
  patrones comunes (uuid inválido, violación de unique/foreign key, RLS,
  sesión expirada, 400/401/403/404/5xx, fetch fallido, `Cannot read
  properties of undefined`, límite de tasa, fallos de Gemini, etc.) y
  devuelve una frase corta en español explicando qué pasó -- si no
  reconoce el patrón, no inventa nada y solo se ve el mensaje técnico,
  igual que antes. Se agrega como un recuadro "🗣️ En palabras simples: ..."
  arriba del detalle técnico en el correo, y reemplaza el cuerpo del push
  y de la notificación en la bandeja del admin cuando hay una explicación.
- **El error real del ejemplo, ya arreglado**: `SeguirBoton` (el botón de
  "+ Seguir" en el perfil de una tienda) mandaba
  `seguido_perfil_id=eq.${seguidoPerfilId}` sin validar que hubiera un id
  -- si la tienda no tiene cuenta vinculada (`perfil_id` nulo, como una
  tienda dada de alta por el Admin sin cuenta propia), `seguidoPerfilId`
  llegaba `null` y el filtro terminaba mandando el texto literal
  `eq.null` a una columna `uuid`, que PostgREST rechaza con 400. Se agregó
  un guard en el propio componente (no intenta la consulta sin un id real)
  y en el punto donde se usa en el perfil de tienda, el botón simplemente
  no aparece si la tienda no tiene cuenta vinculada -- no hay a quién
  seguir.
- **Búsqueda de cartas de Pokémon menos flaky**: dos causas reales
  identificadas para el "a veces no encuentra nada si no agrego y borro un
  espacio":
  1. `buscarCartasVisual` (pokemonApi.js) mandaba hasta 5 combinaciones de
     nombre/set en PARALELO por cada búsqueda -- pokemontcg.io es gratis y
     sin llave (para no pedirle cuenta a quien busca), así que su límite
     de tasa es estricto, y 5 peticiones simultáneas por cada pausa al
     escribir lo saturaba seguido (un 429 se veía igual que "no existe esa
     carta"). Ahora se prueban en orden y se para en la primera
     combinación que sí trae algo, bajando bastante cuántas peticiones se
     mandan por búsqueda típica.
  2. `CardPicker` (el buscador visual en App.jsx) no protegía contra
     respuestas fuera de orden: si dos búsquedas llegaban a alcanzar a
     hacer su fetch (typing rápido con pausas de más de 400ms) y la más
     vieja tardaba más en responder, sus resultados (vacíos o de un texto
     ya viejo) sobrescribían a los de la búsqueda más reciente -- una
     carrera clásica. Se agregó un guard (`cancelado`) que ignora
     cualquier respuesta que ya no corresponda a la búsqueda vigente.

  No se recomienda cambiar de API por esto: pokemontcg.io sigue siendo la
  fuente con mejor cobertura (imagen + set + precio en la misma respuesta,
  sin llave) -- el problema era de cómo se le llamaba, no de la fuente en
  sí. Si después de esto sigue viéndose flaky, el siguiente paso sería
  conseguir una llave gratuita de pokemontcg.io (sube bastante el límite
  de tasa frente a llamar sin llave) en vez de cambiar de proveedor.

## 79. Ofertas de intercambio en publicaciones + apartado de ofertas ordenado

- **Migración 050** (aplicada en vivo vía el conector de Supabase, ya
  disponible en esta sesión): `publicacion_ofertas` gana `tipo` ('comentario'
  | 'precio' | 'intercambio', backfill automático según si ya traía
  `monto_oferta`), `cartas_ofrecidas` (jsonb: lista de `{tcg, carta,
  set_nombre, card_api_id, imagen_url, foto_real_url}`) y `efectivo_extra`
  (numeric). De paso se confirmó que la migración 049
  (`foto_real_reverso_url`, sección 73) sí estaba aplicada -- la
  incertidumbre de sesiones anteriores por no tener el conector queda
  resuelta.
- **Nuevo tipo de oferta: intercambio**. En cualquier publicación (Mercado
  o tienda -- `OfertasPanel` vive en `CartaDetalleView`, que atiende las
  tres tablas de listing), quien compra puede elegir "🔄 Proponer
  intercambio" y: buscar una o más cartas propias con el mismo buscador de
  catálogo de siempre (`CardPickerUniversal`, "+ Agregar otra carta" para
  varias), subir una foto de **solo el frente** de cada una (obligatoria,
  reutiliza `SubirFotoManual` -- pasa por la misma moderación de la
  sección 74 antes de guardarse), agregar una descripción libre (opcional)
  y, con una casilla aparte, sumar efectivo a la oferta (opcional, para
  cuando además de cartas se quiere completar con dinero). Las ofertas en
  puro efectivo (sin cartas) siguen existiendo como su propia pestaña
  ("💵 Oferta en efectivo"), separadas de "💬 Comentario".
- **Apartado de "Ofertas recibidas" para el vendedor**: `OfertasPanel` ya
  no mezcla todo en una sola lista cronológica -- separa "📥 Ofertas
  recibidas" (precio + intercambio, con badge y miniaturas de las cartas
  ofrecidas si aplica) de "💬 Comentarios", cada una en su propio orden
  (más reciente primero). Quien ve su propia publicación (`esMio`) ve
  ambos apartados pero sin el formulario para ofertar (no tiene sentido
  ofertarle a uno mismo).

## Qué falta / próximos pasos posibles

- Dejar que el admin también programe (en vez de publicar de inmediato) un anuncio ya aprobado de una tienda.
- Permitir editar un torneo ya publicado (hoy solo se puede borrar y crear uno nuevo) y adjuntarle una imagen.
- Mapa de Google en el detalle del torneo (hoy solo muestra la dirección en texto).
- Enlazar al perfil público también desde el chat/inbox y desde el detalle de tienda (hoy solo desde las tarjetas del Mercado).
- Restaurar una publicación si el comprador rechaza una venta que sí ocurrió (ver limitación de la sección 28).
- La búsqueda de "Armar mazo" hace match de nombre simple (contiene el texto) — si dos cartas distintas comparten parte del nombre (ej. "Pikachu" y "Pikachu VMAX"), puede haber falsos positivos leves; no ata el nombre a un ID exacto de la carta como sí hace el catálogo de TCGdex.
- Deuda técnica pendiente: falta dividir el resto de `src/App.jsx` (los componentes de cada pantalla) en módulos más chicos — ver sección 34.
- Extender el color de acento y la biografía a la página de detalle de tienda del Mercado (hoy solo aplica en "Perfil público").
