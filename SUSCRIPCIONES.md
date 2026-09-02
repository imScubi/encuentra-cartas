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

## 80. Sorteos (Admin + tiendas Aurora, con referidos) y Subastas (Zafiro+, nueva pestaña)

**⚠️ Pendiente de aplicar a mano**: el conector de Supabase se desconectó
de esta sesión antes de llegar a esta parte, así que a diferencia de
migraciones anteriores en esta misma sesión, `051_sorteos.sql` y
`052_subastas.sql` **no se aplicaron en vivo** -- hay que copiarlas y
pegarlas en Supabase → SQL Editor → Run (en ese orden) para que estas dos
funciones lleguen a servir de verdad en producción.

### Sorteos (`051_sorteos.sql`)

Solo Admin y tiendas con plan **Aurora** (`enteball`) pueden organizar un
sorteo (`sorteos.perfil_id` + `tienda_id` opcional), validado directo en
la política de RLS de insert. Cualquier usuario con sesión "Participa"
(1 boleto en `sorteo_participantes`, único por sorteo+persona). Dos formas
de conseguir más boletos (más probabilidad de ganar, no una garantía):

- **Compartir el link** (+1 boleto, una sola vez): el botón usa
  `navigator.share` si el navegador lo soporta, o copia el link al
  portapapeles. El bono se reclama con la función `sorteo_reclamar_bono_compartir`
  (RPC, `security definer`) en vez de dejar que el cliente actualice
  `boletos` directamente por RLS -- si no, cualquiera podría mandarse
  boletos infinitos a mano con un PATCH.
- **Invitar a alguien nuevo** (+2 boletos): el link de cada participante
  lleva `?sorteo=<id>&ref=<su perfil_id>`. Se captura en `sessionStorage`
  al cargar la página (aunque pasen varias pantallas de registro de por
  medio) y, en cuanto la cuenta nueva termina de crearse
  (`handleAuthed`), se inserta una fila en `sorteo_referidos`
  (`nuevo_perfil_id` es `unique`, así que cada cuenta nueva solo puede
  disparar el bono de su referente una vez en toda su vida). Un trigger
  (`sorteo_procesar_referido`, `security definer`) hace las dos cosas
  atómicamente: +2 boletos a quien invitó, y entra automática la cuenta
  nueva al sorteo con su propio boleto.
- **Elegir ganador**: sorteo aleatorio ponderado por boletos (más boletos
  = más "números de la rifa", no más garantía), calculado del lado del
  cliente por quien organiza (o Admin) desde `SorteoDetalleView` -- cierra
  el sorteo (`estado='cerrado'`, `ganador_perfil_id`, `elegido_at`).

UI: nueva pestaña "🎁 Sorteos" en el menú (grupo Comunidad) con
`SorteosView` (activos + pasados) → `SorteoDetalleView` (participar,
compartir, link de referido, tabla de participantes, elegir ganador si
eres el organizador). Formulario de creación (`CrearSorteoForm`, con
imagen de portada vía el nuevo bucket `sorteos`) en `AdminPanel` (pestaña
"Sorteos", organiza "de Encuentra Cartas") y en `MyStorePanel` (gateado a
`planDe(perfil).sorteos`, solo tiendas Aurora).

### Subastas (`052_subastas.sql`)

Cualquier cuenta (individual o tienda) con plan **Zafiro o superior**
puede subastar una carta/producto/accesorio -- mismos requisitos de foto
real (frente obligatorio siempre, atrás obligatorio solo para cartas) que
ya exigía Mercado desde la sección 73. Cualquiera con sesión puede pujar
mientras la subasta siga activa; cada puja debe superar el precio actual
más el incremento mínimo, validado **también en el servidor** (la política
de RLS de insert en `subasta_pujas` rechaza una puja que no supere ese
mínimo, o si la subasta ya cerró, o si quien puja es el propio vendedor)
-- no basta con el chequeo del cliente. Un trigger actualiza
`subastas.precio_actual` con cada puja válida.

No hay cron para "cerrar" la subasta al llegar `fecha_fin` -- el plan
Hobby de Vercel solo permite crons de una vez al día (ver sección 27),
insuficiente para esto. En vez de eso, el cierre se calcula al vuelo:
cualquier vista que lea una subasta compara `now() > fecha_fin`, y el
ganador es, de una vez, quien tenga la puja más alta (no se guarda aparte
un `ganador_perfil_id`).

UI: nueva pestaña "🔨 Subastas" (grupo Vender), visible para cualquiera
navegando el Mercado sin importar su plan -- solo publicar una pide
Zafiro+ (si no calificas, el botón "+ Organizar subasta" te manda a un
`UpsellCard` en vez del formulario). `SubastasView` (activas + terminadas)
→ `SubastaDetalleView` (foto(s), precio actual, historial de pujas, pujar,
y si ya terminó y eres el vendedor, un botón directo para contactar por
chat a quien ganó).

## 81. Importar/exportar decklist en texto plano (Armar mazo)

Un mazo abierto ahora tiene un botón "📋 Importar / exportar" que abre un
panel con dos textareas, para los 5 TCG que soporta Deck Builder. Formato
por línea: **`Nombre número cantidad`** -- el número es opcional (si no
lo sabes, `Nombre cantidad` o incluso solo `Nombre` también funciona), y
también se acepta un prefijo `2x` en vez del número al final de la línea.

- **Pokémon**: `Blastoise 011/165 2` (número/total tal como aparece impreso).
- **Magic**: `Lightning Bolt 042 3` (número de colector del set, sin "/total").
- **Yu-Gi-Oh**: `Dark Magician LOB-001 1` (código de set, admite guion).
- **Lorcana**: `Elsa, Snow Queen 042 1`.
- **One Piece**: `Monkey D. Luffy 2` -- sin número de carta: el catálogo de
  One Piece en esta app viene de TCGplayer (`TCGplayerPicker`), que no
  expone un número de carta por single como sí hacen las demás APIs.

**Deliberadamente no se valida contra ningún catálogo en línea al
importar** (mismo criterio que ya usa el Importador Masivo de inventario,
sección 6): resolver imagen/precio de cada línea llamando a la API
correspondiente saturaría rápido APIs sin llave como pokemontcg.io con
una lista de 20-60 líneas de golpe (ver el fix de rate-limiting de la
sección 78). Las cartas importadas se guardan solo con nombre + número +
cantidad, y se ven sin imagen (ícono de placeholder, igual que cualquier
carta sin `card_api_id`) hasta que se busquen a mano con el buscador
visual de arriba si se quiere la imagen real.

**Importar reemplaza las cartas del mazo actual** (con confirmación si ya
tenía algo) en vez de sumarse a lo que ya había -- es el comportamiento
esperado al "pegar una decklist completa", igual que otros deck builders
de referencia. Exportar genera el mismo formato a partir de lo que ya
tiene el mazo (con un botón "Copiar" al portapapeles), así que
exportar → editar a mano → volver a importar funciona como round-trip.

## 82. Importar catálogo desde la tienda Shopify propia (Aurora)

Se investigó si se podía traer el inventario de una tienda desde su
propio sitio web (ejemplo real usado para probar: `juegodebelugas.com/collections/tcg`).
Hallazgo: la URL de ese ejemplo tiene la forma típica de una colección de
**Shopify**, que normalmente expone un endpoint público
`/collections/<handle>/products.json` con los productos ya estructurados
(sin tener que "raspar" HTML) -- pero al probarlo, ese sitio en particular
devolvió **403 Forbidden** tanto en la página como en ese endpoint
(protección anti-bots activa). No hay forma de saber de antemano si otra
tienda bloqueará el acceso o no.

Con eso claro, se construyó **el intento automático + una salida clara
cuando falla**, en vez de fingir que siempre va a funcionar:

- `api/tcgcsv.js` (ya existía como proxy de TCGCSV) ahora también atiende
  `?fuente=shopify` -- por el límite de 12 funciones serverless del plan
  Hobby de Vercel (ya al tope), no se hizo un archivo nuevo. El servidor
  arma la URL final él mismo a partir de un origen (`https://...`) y un
  nombre de colección validados por separado (nunca una ruta libre que
  mande el cliente), y rechaza hostnames que parezcan IPs o direcciones
  internas (`localhost`, `127.`, `10.`, `192.168.`, `169.254.`) -- así
  esto no se convierte en un proxy genérico hacia cualquier URL (riesgo
  de SSRF).
- Nuevo componente `ImportadorShopify` en `MyStorePanel` (junto al
  Importador Masivo, mismo gate de plan Aurora): pegas el link de una
  colección de tu tienda Shopify, se listan los productos encontrados
  (imagen, nombre, precio y cantidad editables, con checkbox) para
  revisar antes de publicar, con paginación ("Cargar más productos") y
  se importan como `sellado_tienda` (un catálogo externo no dice si cada
  producto es una carta suelta o sellado, así que se trata como producto
  general).
- **Si la tienda bloquea el acceso automático** (como en el ejemplo de
  arriba), se muestra un aviso claro y se señala el Importador Masivo de
  abajo (copiar/pegar a mano) como respaldo -- que ya existía desde antes
  y sigue funcionando siempre, sin depender de si un sitio externo
  permite o no el acceso automatizado.

## 83. Aviso previo de bloqueo Shopify + link a tu propio sitio web (Zafiro+)

Dos ajustes chicos pedidos después de la sección 82:

- **Aviso previo en el Importador Shopify**: antes solo se avisaba
  *después* de intentar traer el catálogo y fallar (`bloqueado`). Ahora
  hay un recuadro fijo, visible siempre (no solo cuando falla), que
  explica de entrada que muchas tiendas Shopify tienen protección
  anti-bots activa y que si tu tienda la tiene, ningún link va a
  funcionar -- y que el Importador Masivo (copiar/pegar a mano) siempre
  funciona como respaldo. La idea es que nadie pierda tiempo probando
  links si su tienda ya tiene esa protección.
- **Link a tu propio sitio web**: nueva columna `perfiles.sitio_web`
  (migración `053_sitio_web_tienda.sql`, mismo patrón que
  `instagram`/`google_maps_url`, mismo gate de plan Zafiro+). Se edita
  desde el panel de tienda (`RedesSocialesEditor`) y desde "Editar
  perfil" (`EditarPerfilModal`), y se muestra como botón "Sitio web" en
  el detalle público de la tienda, junto a Instagram y Google Maps. Como
  alguien puede escribir el dominio sin `https://` (ej. `tutienda.com`),
  se guarda tal cual y se le agrega el protocolo solo al armar el link
  (`conProtocolo`), sin tocar lo guardado.

**Pendiente de aplicar en Supabase** (el conector MCP sigue
desconectado): corre `053_sitio_web_tienda.sql` a mano en el SQL Editor.

## 84. Sorteos: boletos por publicar, destacado en Inicio, tiendas afiliadas + moderación del feed de comunidad

Ampliación de Sorteos (sección 80) y un pendiente aparte sobre el feed de comunidad:

- **Boletos automáticos por publicar**: al organizar un sorteo, una nueva
  casilla "Cada carta que un usuario publique en el Mercado mientras el
  sorteo esté activo le suma +1 boleto extra" (`sorteos.entrada_por_publicacion`,
  migración 054). Un trigger en `mercado_listings` (solo `tipo = 'carta'`)
  le suma +1 boleto en cada sorteo activo con esa opción prendida -- si el
  usuario todavía no participaba, lo entra automático con 1 boleto en vez
  de exigir que primero le dé "Participar". Publicar 5 cartas = 5 boletos,
  sin ninguna acción manual extra.
- **Destacar en Inicio**: el organizador (o Admin) puede marcar su sorteo
  activo como "⭐ Destacar en Inicio" (`sorteos.destacado`) desde el botón
  correspondiente en el detalle del sorteo. La primera pantalla (Buscar,
  cuando no hay texto escrito) muestra un banner grande con el sorteo
  destacado más reciente (`SorteoDestacadoBanner`) para que cualquiera que
  entre a la página lo vea de inmediato.
- **Desactivar un sorteo**: el organizador o Admin ahora tiene un botón
  "Desactivar sorteo" en el detalle (pasa a `cancelado` sin tener que
  elegir un ganador) -- antes solo existía "Elegir ganador ahora", que sí
  cierra el sorteo pero obliga a sortear.
- **Duplicar un sorteo**: botón "🔁 Duplicar" en las listas de Admin y de
  Mi tienda -- precarga un sorteo nuevo con el mismo título (+"(copia)"),
  premio, descripción, imagen y la opción de boletos por publicar, solo
  pidiendo una fecha de cierre nueva. Así no hay que volver a escribir
  todo para repetir un sorteo parecido en el futuro.
- **Tiendas afiliadas también pueden organizar sorteos** (no solo Aurora),
  pero entran en estado `pendiente` (ampliación del check de estado en
  sorteos) y necesitan que un Admin los apruebe (pasarlos a `activo`) antes
  de que se vean públicamente -- a diferencia de Admin/Aurora, que se
  publican activos de inmediato. Un trigger (`sorteo_validar_transicion`)
  bloquea que el propio organizador se autoapruebe: ese salto de estado
  solo lo puede hacer una cuenta con `es_admin = true`. AdminSorteosTab
  ahora tiene una sección aparte "Pendientes de aprobación" con botones
  Aprobar/Rechazar, y el detalle del sorteo también los muestra si Admin
  lo abre directo.
- **Moderación del feed de comunidad**: las fotos que se suben a
  "Comunidad" (pulls, aperturas, logros) ahora pasan por la misma
  moderación por IA que ya protegía las fotos reales de publicaciones del
  Mercado (`moderarFotoReal`, sección 209/74) antes de subirlas a
  Storage -- rechaza contenido inapropiado o fotos que no tienen nada que
  ver con cartas coleccionables/TCG, con el mismo criterio "fail-open" (si
  la moderación falla, se deja pasar la foto en vez de bloquear al
  usuario).

**Pendiente de aplicar en Supabase** (el conector MCP sigue
desconectado): corre `054_sorteos_v2.sql` a mano en el SQL Editor.

## 85. Carpetas: vitrina pública tipo álbum + agregar cartas sin foto

Se pidió replicar la idea de otro sitio (una tienda que muestra su
inventario organizado como si fueran páginas de un álbum físico, en vez de
una lista plana) pero sin depender de fotografiar cada carta. Hasta ahora
"Carpetas" (sección 24) era solo una etiqueta interna usada durante la
creación por foto + IA -- una vez publicadas, esas cartas se veían
mezcladas con el resto del inventario, sin ninguna vitrina especial para
el comprador (el perfil público solo mostraba el nombre de la carpeta y
las fotos crudas de las páginas subidas, nada navegable).

- **Tamaño de página** (`carpetas.columnas`/`filas`, migración 055): al
  crear una carpeta ahora se elige cuántas cartas caben por página (3×3,
  3×4, 4×3 o 4×4), simulando una página real de fundas.
- **Agregar cartas sin foto**: nuevo botón "🃏 Agregar cartas (sin foto)"
  en cada carpeta -- usa el buscador visual del catálogo (mismo
  `CardPickerUniversal` de siempre) para elegir la carta, con su imagen
  oficial, y solo pide precio/cantidad/condición/idioma. No pide foto real
  (a diferencia del alta individual normal), igual que ya hacían el
  Importador Masivo y la publicación por IA de esta misma sección --
  fotografiar cada carta manualmente no tiene sentido para un flujo
  masivo.
- **Vitrina pública** (`CarpetasStorefront`): en el perfil público y en el
  detalle de tienda ahora aparece una lista de carpetas con foto/tamaño/
  cantidad de cartas; al abrir una, se ve una cuadrícula de columnas×filas
  paginada (Anterior/Siguiente), en el orden en que se fueron agregando
  las cartas -- como hojear el álbum real. Cada carta lleva a su ficha de
  detalle de siempre. Reemplaza la galería estática que solo mostraba
  fotos de las páginas subidas.
- Lectura pública nueva sobre la tabla `carpetas` (antes solo el dueño
  podía verla) -- son solo metadatos (nombre, tamaño de página), no las
  fotos privadas de `carpeta_fotos`, que se quedan como estaban.

**Pendiente de aplicar en Supabase** (el conector MCP sigue
desconectado): corre `055_carpetas_vitrina.sql` a mano en el SQL Editor.

## 86. Carpetas de exhibición (las cartas no salen a la venta)

Ampliación directa de la sección 85: al crear una carpeta ahora se elige
si es **🛒 En venta** (como hasta ahora) o **🖼️ Solo exhibición**. Las
cartas de una carpeta de exhibición se siguen viendo en la vitrina
pública (para presumir la colección completa), pero no están a la venta:

- Migración 056: `mercado_listings.en_venta` / `inventario_tienda.en_venta`
  (default `true`) y `carpetas.tipo` (`'venta'` | `'exhibicion'`, default
  `'venta'`).
- Al publicar una carta en una carpeta (por foto+IA o con el modo manual
  de la sección 85), `en_venta` se pone según el tipo de esa carpeta.
- Se puede cambiar el tipo de una carpeta ya creada con un botón junto a
  su nombre (🛒/🖼️) -- el cambio se sincroniza en cascada con `en_venta`
  de todas las cartas que ya tenía adentro, para que no quede una carpeta
  de exhibición vendiendo cosas viejas (o viceversa).
- Una carta con `en_venta = false`: no aparece en el Mercado, en Buscar,
  en la vitrina de Inicio, en Armar mazo, ni en el feed de "Siguiendo";
  en su ficha de detalle no tiene botón de Contactar/Carrito, solo un
  aviso "🖼️ Esta carta es solo de exhibición"; y en la vitrina de
  carpetas (`CarpetasStorefront`) se marca con una etiqueta en vez de
  precio.
- El perfil/tienda dueño de la carpeta sigue viendo y administrando esas
  cartas con normalidad en su propio panel (Mi Mercado/Mi tienda) -- el
  filtro solo aplica a las vistas que descubren cosas para comprar.

**Pendiente de aplicar en Supabase** (el conector MCP sigue
desconectado): corre `056_carpetas_exhibicion.sql` a mano en el SQL Editor.

## 87. Boletín semanal de precios (Pokémon, Magic, Yu-Gi-Oh)

Se pidió un boletín cada lunes con las 20 cartas que más subieron y las
20 que más bajaron de precio en la semana, con un análisis fácil de
entender, dividido por TCG, alimentado por "varias fuentes como
Collectr", con opción de "me interesa" para recibirlo por correo y un
banner chico en Inicio.

**Antes de construirlo se investigó la parte de "Collectr y otras
fuentes"**: Collectr no tiene una API pública -- no hay forma legítima de
conectarse a su catálogo de precios (mismo tipo de limitación que ya se
encontró con el sitio de la sección 83: si no hay API o está bloqueada,
no se puede integrar de verdad sin raspar su web sin permiso). Se le
preguntó al usuario cómo proceder dado esto, y se decidió: **arrancar
solo con Pokémon, Magic y Yu-Gi-Oh** -- los tres TCG que ya tienen una
fuente de precio real integrada en la app (pokemontcg.io, Scryfall y
YGOPRODeck respectivamente). Lorcana no tiene un campo de precio
confirmado en su API gratuita y One Piece no tiene ninguna fuente de
precio integrada todavía -- se agregan el día que exista una fuente
confiable para cada uno, en vez de inventar números.

- **Universo de cartas rastreadas**: no es un "top" genérico de todo
  internet, sino las cartas que de verdad están publicadas en Encuentra
  Cartas (Mercado, tiendas) -- así el boletín es relevante para quien
  compra/vende aquí. Se limita a 60 cartas por TCG (`cartasRastreadasPorTcg`
  en `api/cron/recordatorios.js`) para que el cron no se pase del tiempo
  límite de la función.
- **Migración 057**: `precio_historial_semanal` (una fila por carta por
  semana, para comparar contra la semana pasada), `boletines` (el
  resultado ya armado por tcg/semana, lectura pública) y
  `boletin_subscripciones` (el "me interesa" de cada quien, por tcg).
- **`lib/precios.js`** (nuevo, compartido -- no cuenta contra el límite de
  12 funciones serverless): repite a propósito (en vez de importar) la
  lógica de precio de `src/lib/pokemonApi.js` para poder correr del lado
  del servidor sin cruzar la frontera del empaquetado de Vite.
- **El cálculo y envío corre dentro del cron diario que ya existía**
  (`api/cron/recordatorios.js`), y solo actúa si `hoy` es lunes -- así no
  se suma un cron nuevo (Vercel Hobby: máximo 2, ya estaban los 2 usados)
  ni una función serverless nueva (máximo 12, ya al tope). Se le agregó
  `maxDuration: 60` en `vercel.json` solo a esta función, para las
  ~180 llamadas a APIs externas que hace en el peor caso (60 cartas × 3
  TCG), con hasta 8 en paralelo a la vez.
- **Análisis en palabras simples**: se genera con Gemini (mismo que ya se
  usa para Carpetas/moderación, `llamarGeminiTextoConReintento` nuevo en
  `lib/gemini.js`, variante de solo texto) a partir de los números reales
  calculados -- si Gemini falla o no hay llave configurada, se arma un
  resumen simple sin IA en vez de dejar el boletín sin análisis.
- **Frontend**: nueva vista "Boletín de precios" (selector de Pokémon/
  Magic/Yu-Gi-Oh, análisis, las 20 que más subieron y las 20 que más
  bajaron con imagen/precio/% de cambio) y botón "🔔 Me interesa" por TCG
  que activa el correo semanal. Banner chico en Inicio (`BoletinBanner`)
  con el boletín más reciente, que lleva a la vista completa.

**Pendiente de aplicar en Supabase** (el conector MCP sigue
desconectado): corre `057_boletin_precios.sql` a mano en el SQL Editor.

## 88. Admin: quitar la participación de un usuario en un sorteo

`sorteo_participantes` no tenía ninguna policy de `DELETE` -- ni siquiera
el organizador podía quitar a nadie. Migración 058 agrega una policy
de borrado exclusiva para Admin (`es_admin = true`), y en el detalle del
sorteo (`SorteoDetalleView`) cada fila de la lista de participantes ahora
tiene un botón "Quitar" que solo ve un Admin -- pide confirmación (avisa
que se pierden los boletos y no se puede deshacer) y vuelve a cargar la
lista. No toca `sorteo_referidos` (el historial de quién refirió a
quién) -- solo saca al participante de la cuenta de boletos y del sorteo
en sí.

**Pendiente de aplicar en Supabase** (el conector MCP sigue
desconectado): corre `058_admin_quita_participante_sorteo.sql` a mano en
el SQL Editor.

## 89. Cantidad por publicación (playsets) + zoom de fotos en el detalle

Dos mejoras al flujo de compra/venta, sin migración nueva (el campo
`cantidad` ya existía en `mercado_listings`/`inventario_tienda`/
`sellado_tienda` desde antes, pero en varios formularios no había un
input visible para cambiarlo -- siempre se publicaba en 1 aunque el
vendedor tuviera varias copias idénticas, algo común con cartas
competitivas que la gente compra en playset de 4).

- **Cantidad al publicar**: se agregó un input "Cantidad" (numérico,
  mínimo 1) en el formulario de "Publicar" del Mercado individual
  (`MyMarketPanel`), en "Cartas sueltas" y "Producto sellado" de Mi
  tienda (`MyStorePanel`), y también como campo editable en cada fila ya
  publicada del Mercado individual (antes solo Mi tienda dejaba editar
  la cantidad después de publicar). El comprador sigue viendo el mismo
  aviso de siempre en el detalle ("N disponibles") cuando la cantidad es
  mayor a 1 -- eso ya existía y no necesitó cambios.
- **Zoom de fotos en el detalle**: nuevo componente `FotoZoomLightbox`
  (portal a pantalla completa) -- al picarle a la imagen oficial o a
  cualquiera de las dos fotos reales (frente/atrás) que subió el
  vendedor en `CartaDetalleView`, se abre en grande con zoom (rueda del
  mouse o pellizco con dos dedos en touch) y arrastre para moverse
  cuando está ampliada; doble clic/doble tap alterna entre 1x y 2.5x.
  Se cierra con la X, con Escape o tocando fuera de la imagen.

## 90. Fotos reales ya no bloquean publicar + subida más liviana

Reporte real: al publicar una carta, subir la foto de frente/atrás tardaba
muchísimo y a veces terminaba en "Failed to fetch". Dos causas de raíz y
un cambio de flujo:

- **Causa 1 -- fotos sin comprimir**: una foto de cámara de celular pesa
  varios MB, y esa foto se manda dos veces (a moderar con Gemini y luego a
  Storage) tal cual, sin redimensionar. Nuevo helper `comprimirImagen`
  (`src/lib/imagen.js`) reescala al lado más largo a 1600px y recodifica a
  JPEG calidad 0.82 antes de mandarla a cualquiera de los dos lados --
  normalmente baja el peso a unos cientos de KB. Se usa dentro de
  `SubirFotoManual`, así que aplica en todos los formularios que la usan
  (Mercado individual, Mi tienda, Carpetas, etc.) sin tocar cada uno.
- **Causa 2 -- sin margen de tiempo del lado del servidor**: la moderación
  llama a Gemini (`api/carpetas/detectar.js`, modo `"moderar"`) y ese
  archivo no tenía `maxDuration` configurado, así que corría con el límite
  por default de Vercel. Se le agregó `maxDuration: 60` en `vercel.json`
  (mismo patrón que ya tenía `api/cron/recordatorios.js`).
- **Cambio de flujo (lo que se pidió)**: las fotos reales (frente/atrás)
  ya NO son obligatorias para publicar, ni en el Mercado individual
  (`MyMarketPanel`) ni en Mi tienda (`MyStorePanel`, cartas sueltas). La
  publicación se crea de inmediato con la foto oficial del catálogo
  nada más; las fotos reales se pueden agregar en ese mismo momento (si ya
  se subieron) o después, sin límite de tiempo, desde el botón "Cambiar
  foto real" que ya existía en cada fila de la lista de publicaciones. En
  cuanto una foto termina de subir y pasar la moderación, se guarda en la
  publicación y aparece de inmediato con la función de zoom (sección 89) --
  no hace falta nada más porque `CartaDetalleView` ya mostraba las fotos
  reales de forma condicional. Mientras el detalle de una carta no tiene
  ninguna de las dos fotos reales, se le muestra al comprador un aviso
  chico ("El vendedor todavía no sube las fotos reales..."). Como
  protección menor: si una foto se está subiendo justo en el momento de
  publicar, el botón de publicar espera a que termine (para no perder esa
  subida), pero ya no exige haberla empezado siquiera.

## 91. Fix: no se podía agregar cartas sueltas a Mi tienda ("record has no field producto")

Reporte real (correo de error automático): `Error en POST inventario_tienda
(400): record "new" has no field "producto"`. La causa era un bug real
desde la migración 027 (sistema de "Seguir tiendas/vendedores"): el
trigger `notificar_nueva_publicacion_seguidores()` que avisa a los
seguidores cuando alguien publica algo nuevo hacía
`coalesce(NEW.carta, NEW.producto)` para cualquier tabla que no fuera
`mercado_listings` -- pero `inventario_tienda` (cartas sueltas de una
tienda) tiene columna `carta`, no `producto` (esa solo existe en
`sellado_tienda`). Postgres truena al leer un campo que no existe en el
registro, y como es un trigger `AFTER INSERT`, revienta la transacción
completa -- el insert nunca llegaba a completarse. Migración 059
(`create or replace function`) separa explícitamente por tabla:
`mercado_listings` e `inventario_tienda` usan `carta`, `sellado_tienda`
usa `producto`. No requiere ningún cambio de frontend.

**Pendiente de aplicar en Supabase** (el conector MCP sigue
desconectado): corre `059_fix_trigger_seguidores_producto.sql` a mano en
el SQL Editor -- esto es lo que va a arreglar el error real, hasta que se
aplique seguirá fallando.

## 92. Correo y push cuando te llega un mensaje nuevo

Cuando alguien te escribe (chat 1 a 1, o el mensaje masivo desde el
Carrito), ahora te enteras aunque no tengas la web abierta:

- **Mecanismo**: se reutiliza el mismo Database Webhook que ya usaba la
  Wishlist Premium (`notificar_alerta_wishlist()`, ver 003_webhooks.sql):
  esa función de trigger es genérica -- solo arma
  `{type, table: TG_TABLE_NAME, record}` y lo manda por `pg_net` a
  `/api/alertas/verificar`. Migración 060 cuelga esa MISMA función también
  de `mensajes` (`after insert`), y `api/alertas/verificar.js` ahora
  despacha según `table`: si es `"mensajes"`, corre
  `notificarMensajeNuevo()` en vez de la lógica de wishlist. No hizo falta
  sumar ninguna función nueva a `api/` (el plan Hobby de Vercel sigue al
  tope de 12).
- **Push**: si el destinatario tiene una suscripción activa en
  `push_subscriptions`, le llega "💬 {remitente} te escribió" con una
  vista previa del mensaje (o "📷 Te mandó una foto" si no hay texto).
- **Correo**: si el destinatario tiene correo guardado en su perfil, le
  llega un correo con el mismo contenido -- pero solo si no le mandamos
  otro correo de este mismo remitente en los últimos 5 minutos, para no
  inundarlo de correos en medio de una conversación activa (el push sí se
  manda siempre, es mucho menos intrusivo).
- **Fix relacionado**: antes de esto, el botón "Activar notificaciones"
  (que pide permiso al navegador y crea la fila en `push_subscriptions`)
  solo aparecía dentro de Wishlist Premium, un beneficio de plan pago --
  así que un usuario gratis nunca podía activar el push y jamás iba a
  recibir el de mensajes. Ahora también se ofrece, sin ningún gate de
  plan, arriba de la bandeja de "Mensajes" (disponible para cualquiera
  con sesión).

**Pendiente de aplicar en Supabase** (el conector MCP sigue
desconectado): corre `060_notificar_mensajes.sql` a mano en el SQL
Editor.

## 93. Tablón público "¿Buscas alguna carta?"

Nueva forma de encontrar cartas sin depender de que alguien ya la tenga
publicada: cualquiera con sesión puede decir qué carta anda buscando, y
cualquier otro usuario que la tenga puede contactarlo directo. Migración
061 (tabla `busquedas`, lectura pública, escritura/borrado solo del
dueño).

- **Banner "¿Buscas alguna carta?"** en Inicio: abre un modal
  (`BuscarCartaModal`) para elegir la carta (catálogo o manual, mismo
  patrón que el resto de la app) y una nota opcional ("cuánto pagarías",
  estado, etc.). Tope de 5 búsquedas activas por persona para que no se
  llene de spam.
- **Carrusel en Inicio** (`BusquedasCarrusel`): las búsquedas activas se
  deslizan solas en un loop horizontal (CSS puro, `@keyframes
  marqueeScroll` en `theme.js`, con la lista duplicada para que no se
  note el corte) -- clic en cualquier carta o en "Ver todas" lleva al
  apartado completo.
- **Apartado completo** (`BusquedasView`, nueva entrada de nav "Cartas que
  están buscando"): todas las búsquedas activas en cuadrícula, con botón
  "Yo la tengo" que abre el chat directo con quien la busca (mismo
  `abrirChat` que usa el resto del Mercado). El dueño de cada búsqueda ve
  en su lugar "Ya la encontré / quitar" para darla de baja (no se borra,
  se marca `activa = false`, por si se quiere reactivar después).

**Pendiente de aplicar en Supabase** (el conector MCP sigue
desconectado): corre `061_busquedas_publicas.sql` a mano en el SQL
Editor.

## 94. Fix real: el buscador de comprador (y otros 4 buscadores) nunca encontraba a nadie

Reporte: al marcar una carta como vendida, el buscador de comprador nunca
mostraba ni un usuario, sin importar qué se escribiera. La causa era un
efecto secundario no previsto del fix de seguridad de la sección 70
(`pgValor()`, que envuelve el texto de búsqueda en comillas dobles para
protegerlo de la gramática de filtros de PostgREST): envolver en comillas
un patrón de `ilike` (`"*texto*"`) también le apaga a PostgREST la
sustitución automática de `*` por `%` -- las comillas dejan el valor
como texto 100% literal, así que terminaba buscando la cadena literal
`*texto*` (que ningún nombre tiene) y por lo tanto daba **cero
resultados siempre**, para cualquier búsqueda.

Afectaba a los 5 lugares que usaban ese mismo patrón para `ilike`:
- `BuscadorComprador` (marcar como vendida) -- el que se reportó.
- Búsqueda de usuarios en Admin → Planes.
- Búsqueda de publicaciones en Admin (para borrar duplicados).
- El buscador principal de "Buscar" -- afectaba solo la mitad: el
  producto sellado (filtro `ilike` suelto) sí estaba roto, pero cartas de
  Mercado/tiendas seguían funcionando porque van dentro de un
  `or=(...)` armado por `filtroPalabrasCartaOSet`, que resultó no verse
  afectado.
- Ese mismo `filtroPalabrasCartaOSet`, por consistencia (aunque no
  estaba roto).

**Fix**: nuevo helper `pgLikeValor()` en `lib/supabase.js`, hecho
específicamente para patrones `ilike`/`like` -- en vez de comillas, quita
del texto los caracteres reservados de la gramática de filtros (`,` `.`
`(` `)`) antes de armar el `*texto*`. Perder alguno de esos caracteres en
una búsqueda de texto libre es aceptable, y así el comodín `*` sigue
funcionando de verdad. `pgValor()` (con comillas) se queda igual para
cuando de verdad se necesita texto literal exacto (`eq`/`neq`, no
`ilike`). No requiere ninguna migración -- es puro frontend.

## 95. Boletín: pasa a rastrear el mercado GLOBAL del TCG, no el inventario de la web

Corrección de intención: el boletín se pensó para informar sobre el
mercado del TCG en general (qué subió/bajó en todo Pokémon/Magic/Yu-Gi-Oh
esta semana), no sobre las pocas cartas que hay publicadas en Encuentra
Cartas -- que es justo lo que hacía antes (sección 87), y por lo que
salía vacío casi siempre (con pocas publicaciones activas de un TCG, no
hay universo que rastrear).

- **Antes**: `cartasRastreadasPorTcg` armaba el universo a partir de
  `mercado_listings`/`inventario_tienda`/`sellado_tienda` -- solo lo que
  alguien ya había publicado en la plataforma.
- **Ahora**: nueva `universoGlobalPorTcg()` en `lib/precios.js` le
  pregunta directo a la fuente de cada juego:
  - **Pokémon**: cartas de los 6 sets más recientes (pokemontcg.io),
    ordenadas por precio (de mayor a menor) del lado de este código.
  - **Magic**: Scryfall sí soporta ordenar por precio del lado del
    servidor (`order=usd`) -- se toman directo las cartas más valiosas de
    TODO Magic, no solo de sets recientes.
  - **Yu-Gi-Oh**: cartas de los 6 sets más recientes (YGOPRODeck),
    ordenadas por precio igual que Pokémon.
  - Se enfoca en cartas recientes/valiosas a propósito: una carta clásica
    de hace 20 años casi no cambia de precio en una semana, así que el
    % de cambio real casi siempre está en lo que se juega/colecciona
    ahora mismo.
- Ya no hace falta llamar `precioActualPorTcg` carta por carta (con
  límite de concurrencia) después -- el universo global ya trae el
  precio de una vez, así que el cron queda más simple y más rápido.
- El resto del mecanismo (guardar snapshot semanal, comparar contra la
  semana pasada, top 20 suben/bajan, análisis con IA) no cambió.
- Efecto de la transición: la primera vez que corra con el universo
  nuevo, las cartas que antes se rastreaban (y ya no forman parte del
  nuevo universo) simplemente dejan de compararse -- no truena nada, solo
  significa que esa semana en particular puede salir con menos
  coincidencias de las 60 hasta que el nuevo universo tenga ya dos
  semanas seguidas de historial.

No requiere ninguna migración -- mismas tablas, mismo cron, mismo
horario (lunes, 15:00 UTC / 9:00 a.m. hora de Monterrey).

## 96. Boletín: cadencia de cada 3 días (antes cada lunes)

Cambio de frecuencia: el boletín ya no espera una semana completa, ahora
se genera un boletín nuevo cada 3 días -- el mismo día que se activó este
cambio ya cuenta como una corrida válida.

- Nueva `tocaBoletinHoy()` en `api/cron/recordatorios.js`: en vez de
  `ahora.getUTCDay() === 1` (solo lunes), cuenta cuántos días completos
  han pasado desde una fecha ancla fija (`ANCLA_BOLETIN`, el día de este
  cambio) y toca generar cuando ese conteo es múltiplo de 3 -- así no
  depende del día de la semana y corre de 3 en 3 sin importar cuándo.
- La comparación contra "la corrida anterior" pasa de 7 a 3 días
  (`semanaPasada` ahora resta 3 días, no 7).
- Se actualizó todo el texto visible (vista del boletín, banner, correo,
  análisis generado por IA) de "semanal"/"cada lunes"/"esta semana" a
  reflejar la cadencia de 3 días, sin cambiar el nombre de las columnas
  en base de datos (`semana` en `boletines`/`precio_historial_semanal`
  sigue significando "la fecha de este corte", ya no literalmente una
  semana calendario -- no hizo falta ninguna migración).
- Efecto de la transición: las cartas que ya tenían un precio guardado
  hace 7 días (bajo la cadencia vieja) simplemente no calzan con la
  ventana de 3 días de la primera corrida nueva -- no truena nada, solo
  significa que esa primera corrida bajo la cadencia nueva puede salir
  con menos comparaciones hasta que se acumulen corridas seguidas de 3
  en 3 días.

No requiere ninguna migración -- mismo cron, mismo horario diario
(15:00 UTC / 9:00 a.m. hora de Monterrey), solo cambia qué días de esos
sí generan boletín.

## 97. Anuncios: adjuntar varias imágenes (antes solo una)

Antes un anuncio (el del admin o el que propone una tienda) solo podía
llevar una imagen (`imagen_url`). Ahora se le pueden adjuntar varias, y
se ven todas al publicarlo.

- **Migración 062** (`062_anuncios_multiples_imagenes.sql`): agrega
  `noticias.imagenes_urls` (`text[]`). `imagen_url` se conserva (guarda
  siempre la primera imagen) para no romper nada que todavía la lea
  directo; la migración también rellena `imagenes_urls` para los
  anuncios que ya existían con una sola imagen.
- `subirImagenAnuncio(file, session, indice)` (en `src/lib/supabase.js`)
  ahora recibe un índice que se mete en el nombre del archivo -- subir
  varias fotos casi al mismo tiempo (`Promise.all`) ya no corre el
  riesgo de que dos terminen con el mismo nombre (antes solo usaba
  `Date.now()`, que puede repetirse en el mismo milisegundo) y se
  pisen entre sí en el bucket.
- Nuevos componentes compartidos en `src/App.jsx`:
  - `SelectorImagenesAnuncio`: el picker para crear/editar un anuncio,
    con miniaturas y una × para quitar cada imagen (ya subida o recién
    elegida) antes de guardar. Reemplaza al picker de una sola imagen
    en los 3 lugares donde se crea/edita un anuncio (el admin al crear
    uno, el admin al editar uno ya publicado, y la tienda al proponer
    uno).
  - `GaleriaAnuncio`: cómo se ve un anuncio ya publicado -- si tiene una
    sola imagen se ve igual que antes; si tiene varias, se ve una tira
    horizontal con scroll. Se usa en las listas del admin (pendientes,
    programados, publicados) y en la vista pública "Anuncios y
    noticias".
  - `MiniaturaAnuncio`: para los espacios chicos donde no cabe una
    galería completa (el carrusel de "Anuncios recientes" en Inicio, y
    la lista compacta de "mis anuncios propuestos" de la tienda) --
    muestra solo la primera imagen con un "+N" si hay más.
- `imagenesDeAnuncio(n)`: helper que arma la lista a mostrar, usando
  `imagenes_urls` si existe y si no cae en `[imagen_url]` -- así los
  anuncios viejos (sin `imagenes_urls`, de antes de la migración 062)
  se siguen viendo bien sin tener que backfillear nada a mano.

## 98. Fix: buscador de cartas (Magic y los demás TCG con catálogo) mostraba "sin resultados" cuando en realidad era un error de conexión

Reporte: al publicar una carta de Magic, el buscador no traía absolutamente
ninguna carta, para cualquier nombre que se escribiera.

Causa real: `buscarCartasCatalogo` (en `src/lib/pokemonApi.js`) — el
despachador que usa `CardPicker` para buscar mientras se escribe — atrapaba
CUALQUIER error con un `try/catch` que regresaba `[]` sin distinguir nada.
Ese `try/catch` se agregó en la sección 202 pensando en `CatalogoView` (que
sí se quedaba pegada en "Cargando..." para siempre si la API fallaba), pero
se aplicó también, por error, al buscador de texto libre -- que es un caso
distinto: `CardPicker` YA tenía su propio manejo para separar "no se pudo
conectar" (mensaje: *"No se pudo conectar con el catálogo. Espera un
momento e intenta de nuevo."*) de "sin resultados" (mensaje: *"Sin
resultados. Prueba con otro nombre, número o set."*). Al atraparse también
en el despachador, una caída real de Scryfall (o de pokemontcg.io/
YGOPRODeck/lorcana-api, según el TCG) se disfrazaba de "esa carta no
existe" -- si la caída no era momentánea, se sentía como que el buscador
completo de ese TCG estaba roto, para cualquier búsqueda.

Arreglo: se quitó el `try/catch` de `buscarCartasCatalogo` (su único punto
de uso, `CardPicker`, ya maneja el error correctamente y no le avisa al
admin por esto, así que no hay riesgo de volver a generar el ruido que la
sección 202 quería evitar). `obtenerErasYSetsCatalogo` y
`obtenerCartasDeSetCatalogo` (los que sí alimentan `CatalogoView`, sin un
manejo de error propio) se quedan igual que antes, atrapando el error.

No requiere ninguna migración.

## 99. Optimizar el buscador de cartas al publicar (lento e inconsistente)

Reporte: el buscador de cartas al publicar tardaba mucho en responder y a
veces no traía las cartas buscadas -- para los 4 TCG con buscador de texto
(Pokémon, Magic, Yu-Gi-Oh, Lorcana), todos apoyados en APIs gratis y sin
llave (pokemontcg.io, Scryfall, YGOPRODeck, lorcana-api). Cambios, todos en
`src/lib/pokemonApi.js` salvo el último:

- **Cancelar la búsqueda anterior de verdad**: antes, al escribir la
  siguiente letra, la petición anterior se ignoraba pero se dejaba viva de
  todos modos -- seguía gastando ancho de banda y cupo del límite de tasa
  de la API compitiendo con la búsqueda que sí importa. Ahora `CardPicker`
  (en `src/App.jsx`) crea un `AbortController` por búsqueda y cancela el
  anterior en cuanto hay uno nuevo (o se cierra el buscador); `fetchConReintento`
  ya no reintenta un `AbortError` (cancelar a propósito no es una falla).
- **Cache corta de búsquedas repetidas** (`buscarCartasCatalogo`, 2
  minutos): escribir, pausar, borrar una letra y volver a escribirla, o
  reabrir el buscador para la misma carta ya buscada hace un momento, antes
  volvía a gastar una petición completa contra la API por algo que ya se
  sabía. Ahora esa repetición exacta (mismo TCG + mismo texto) responde al
  instante desde memoria.
- **Llave gratuita opcional de pokemontcg.io**: de las 4 fuentes, esta es
  la más castigada por su límite de tasa sin llave -- y Pokémon es, con
  mucho, el TCG con más búsquedas de la app. Se agregó soporte para una
  variable de entorno `VITE_POKEMONTCG_API_KEY` (Vercel → Settings →
  Environment Variables): si está puesta, se manda como header `X-Api-Key`
  en todas las llamadas a pokemontcg.io (búsqueda, Catálogo por sets,
  respaldo de imagen); si no está, todo sigue exactamente igual que antes.
  Conseguirla es gratis e instantáneo en https://pokemontcg.io/ (crear
  cuenta → la llave aparece en el dashboard) y sube bastante el límite de
  peticiones por minuto -- es, con diferencia, el cambio de mayor impacto
  posible para la lentitud/inconsistencia de Pokémon, pero requiere que
  alguien con acceso a Vercel la agregue como variable de entorno; no se
  puede activar solo con código.

Lo que se dejó igual a propósito: la búsqueda de Pokémon sigue probando sus
hasta 5 combinaciones de nombre/set EN ORDEN (no en paralelo) -- así se
dejó desde la sección 178 precisamente para no saturar el límite de tasa
sin llave. Revertir eso de forma segura sí conviene una vez que la llave de
pokemontcg.io esté puesta (más margen para probar combinaciones en
paralelo sin arriesgarse a los 429 de antes); queda como posible siguiente
paso, no se tocó en este cambio.

No requiere ninguna migración.

## 100. Ampliar cuándo sale precio de referencia (cartas muy nuevas)

Pregunta/reporte: algunas cartas, sobre todo las recién salidas, no traían
precio de referencia al elegirlas en el buscador.

Causa real: no es que la API "no tenga" la carta (por eso sí aparece en el
buscador) -- es que el precio "de mercado" (`market` en TCGplayer, `trendPrice`
en Cardmarket) se calcula con base en ventas reales, y una carta con días de
haber salido todavía no acumula suficientes para tener uno. Esto es una
limitación de cualquier fuente de precios (pokemontcg.io, Scryfall,
apitcg.com, la que sea) -- ninguna puede inventar un precio de mercado que
todavía no existe.

Lo que sí se puede hacer, y se hizo (`src/lib/pokemonApi.js`): en vez de
exigir SOLO el precio "de mercado", ahora se prueban también los precios
que las mismas fuentes sí calculan desde el primer día (el rango de precio
`mid`/`low` de TCGplayer, basado en publicaciones activas aunque no haya
ventas todavía; `averageSellPrice`/`avg1`/`lowPrice` de Cardmarket como
respaldo de `trendPrice`; `usd_etched`/`eur_etched` en Scryfall para
variantes que a veces traen ese precio pero no el normal; el precio de
CoolStuffInc como respaldo más en YGOPRODeck). Esto reduce, pero no
elimina del todo, los casos sin precio -- una carta genuinamente recién
anunciada, sin ninguna publicación activa en ningún lado todavía, seguirá
sin precio de referencia hasta que exista alguno real que mostrar (ahí sí
no hay atajo posible: quien publica simplemente escribe el precio a mano,
como con cualquier carta sin catálogo).

No se tocó `lib/precios.js` (el que arma el boletín de precios) a
propósito: ese sí debe seguir exigiendo el precio "de mercado" real, porque
compara semana contra semana -- mezclar ahí un precio estimado (`mid`/`low`)
ensuciaría la comparación de qué subió o bajó de verdad.

No requiere ninguna migración.

## 101. Cartas de tienda verificada ahora salen también en "Mercado entre usuarios"

Reporte: cuando una tienda verificada sube una carta suelta (inventario de
tienda, no producto sellado), esa carta no aparecía en "Mercado entre
usuarios" -- solo se veía en la vitrina de la tienda y en "Buscar".

Causa real: la pestaña "Mercado entre usuarios" (`src/App.jsx`) solo
consultaba `mercado_listings` (publicaciones de cuentas individuales) --
nunca consultó `inventario_tienda` (cartas sueltas de una tienda), a
diferencia de "Buscar" y la vitrina de inicio, que sí mezclan ambas fuentes
desde antes.

Arreglo: se agregó una segunda carga (`marketTiendas`, sin límite de
resultados, a diferencia del "Recién publicado" de la vitrina que sí
recorta a 10) y un helper `marketNormalizado()` que junta
`mercado_listings` + `inventario_tienda` en una sola lista -- cada tarjeta
ahora trae una insignia "Mercado" o "Tienda" para distinguir el origen, y
"Contactar"/carrito/abrir detalle apuntan a la tabla correcta según de
dónde vino cada resultado. El producto sellado de tienda (`sellado_tienda`)
se dejó fuera a propósito -- el reporte era específicamente sobre cartas,
y esa pestaña de "Sellado" ya muestra lo que suben cuentas individuales;
mezclar sellado de tienda ahí queda como posible siguiente paso si se pide.

No requiere ninguna migración.

## 102. Mostrar de dónde sale el precio de referencia (TCGplayer, Cardmarket, etc.)

Petición: que el precio de referencia diga de dónde salió (ej. "Referencia
de TCGplayer: $X") en vez de solo el número.

- **`src/lib/pokemonApi.js`**: las funciones que calculan el precio de
  referencia (Pokémon, Magic, Yu-Gi-Oh) ahora regresan también `fuente`
  además del precio -- "TCGplayer" o "Cardmarket" para Pokémon/Magic (así
  documenta Scryfall de dónde saca sus precios "usd"/"eur"); para Yu-Gi-Oh
  puede ser "TCGplayer", "eBay", "Amazon", "CoolStuffInc" o "Cardmarket"
  según cuál de esas trajo el número (YGOPRODeck junta varias fuentes en
  la misma respuesta). El picker de TCGplayer/TCGCSV (sellado y los TCG sin
  buscador de texto todavía) siempre reporta "TCGplayer".
- **Migración 063** (`063_precio_ref_fuente.sql`): agrega
  `precio_ref_fuente` a `mercado_listings`, `inventario_tienda`,
  `sellado_tienda` y `alertas` -- se guarda junto con `precio_ref_mxn` al
  momento de publicar/crear una alerta de precio, para poder mostrarlo
  después en la publicación ya guardada (no solo mientras se está
  publicando).
- Se muestra junto al precio en: el aviso "Precio de referencia" que sale
  al elegir una carta/producto en cualquier formulario de publicar
  (Mercado, Mi tienda, alertas de Wishlist), el "ref. mercado" que se ve
  en las tarjetas de publicaciones (Mercado, Buscar, Carrito, Mis compras
  y ventas), y el precio en vivo de la ficha de detalle de una publicación
  (`CartaDetalleView`, tanto el precio consultado al momento como el
  guardado desde que se publicó).
- Las cartas ofrecidas en una oferta de intercambio y el picker de
  Subastas guardan `precio_ref_fuente` en su estado por consistencia, pero
  no lo muestran en pantalla porque ninguno de los dos mostraba el precio
  de referencia antes tampoco.

## 103. Experimento aislado: JustTCG como posible reemplazo de las APIs de precio

Petición: probar JustTCG (justtcg.com) como alternativa a pokemontcg.io/
Scryfall/YGOPRODeck, pero solo como experimento -- sin tocar el buscador
real de la app.

- **`public/experimento-justtcg.html`**: página suelta, servida directo
  como archivo estático (mismo patrón que `privacidad.html`), sin liga
  desde ningún menú ni componente de React -- para llegar hay que escribir
  la URL a mano (`/experimento-justtcg.html`). Deja elegir TCG + buscar
  por nombre, muestra las cartas encontradas (imagen/set/precio si los
  trae) y siempre incluye un desplegable con la respuesta cruda de
  JustTCG, para poder diagnosticar sin adivinar si algo no calza.
- **`api/tcgcsv.js`**: se le agregó `fuente=justtcg` (mismo patrón que
  `fuente=shopify`, vive en el mismo archivo por el límite de 12 funciones
  serverless del plan Hobby, ya al tope). Reenvía la búsqueda a
  `api.justtcg.com` con la llave (`JUSTTCG_API_KEY`, variable de entorno
  en Vercel -- nunca en el navegador) y regresa la respuesta de JustTCG
  tal cual, con su código de estado, en vez de interpretarla.
- **Aviso de honestidad**: no se pudo confirmar en vivo desde este entorno
  (mismo proxy de red restringido que bloqueó también apitcg.com/Scrydex
  antes) la forma exacta del endpoint, los parámetros o la respuesta de
  JustTCG -- el endpoint/parámetros que usa el proxy (`GET /v1/cards?
  game=...&q=...`, header `x-api-key`) son la mejor suposición posible,
  no algo verificado. Por eso la página del experimento muestra la
  respuesta cruda siempre visible: si algo no coincide, el primer intento
  real (ya en producción, donde si hay salida a internet) lo va a decir
  con el error exacto de JustTCG, y de ahí se ajusta con datos reales en
  vez de adivinar una segunda vez.
- Para probarlo: agrega `JUSTTCG_API_KEY` en Vercel → Settings →
  Environment Variables con tu llave, espera a que redepliegue, y abre
  `https://tu-dominio.vercel.app/experimento-justtcg.html`.

No requiere ninguna migración.

## 104. Experimento JustTCG, parte 2: publicaciones reales + gráfica de historial

Petición: seguir con el mismo experimento aislado de la sección 103, pero
ahora (1) probarlo contra publicaciones que ya existen de verdad en la
app, y (2) agregar una gráfica de precio histórico por carta en el
experimento, al estilo de Collectr.

- **Parte 2 en `public/experimento-justtcg.html`** ("Comparar con
  publicaciones reales de tu web"): un botón que lee hasta 6 publicaciones
  de `mercado_listings` y 6 de `inventario_tienda` (las más recientes,
  cartas en venta) directo de Supabase con la llave pública anónima
  (la misma que ya usa toda la app en el navegador, no es una llave
  nueva ni un riesgo distinto), y por cada una busca esa carta en JustTCG
  para comparar el precio que ya tenemos guardado contra el de JustTCG.
  Las búsquedas se hacen una por una con una pequeña pausa entre cada
  una (350ms) para no golpear de más la API de JustTCG.
- **Gráfica de historial de precio**: si una carta se encontró en
  JustTCG, aparece un botón "Ver historial de precio" que llama a
  `api/tcgcsv.js` (ahora con un modo nuevo, `cardId=...`, mismo proxy de
  la sección 103) y, si la respuesta trae algún campo con historial,
  dibuja una gráfica de líneas simple (hecha a mano con SVG, sin agregar
  ninguna librería nueva al proyecto) con el precio a través del tiempo,
  parecido a como lo muestra Collectr.
- **Mismo aviso de honestidad que la parte 1**: no se pudo confirmar en
  vivo desde este entorno si JustTCG realmente expone un endpoint de
  detalle/historial en `GET /v1/cards/{id}` ni qué forma tiene esa
  respuesta -- es la mejor suposición posible, no algo verificado. Si el
  campo de historial no aparece con ninguno de los nombres que se
  intentan reconocer, la página lo dice claramente ("no encontramos
  historial de precio para esta carta") en vez de mostrar una gráfica
  vacía o inventada. El primer intento real en producción va a decir si
  el endpoint/plan de JustTCG sí trae ese dato o no.
- Para probarlo: abre `/experimento-justtcg.html` (mismo link de la
  sección 103) y baja hasta "Comparar con publicaciones reales de tu
  web".

No requiere ninguna migración.

## 105. Experimento JustTCG: corregir 429, slugs de juego y panel de diagnóstico compartido

Petición (seguimiento de la 104, con capturas de pantalla reales del
experimento en producción): el comparador se topaba con error 429
("demasiadas peticiones") en varias filas pese al primer intento de
espaciar las búsquedas, y una carta de tienda ("Mega Greninja ex") hacía
match con una versión "jumbo" que no era la misma carta publicada.

- **429 con reintento real**: el proxy (`api/tcgcsv.js`) ahora reenvía el
  header `Retry-After` de JustTCG como `retryAfterMs`, y la página
  reintenta automáticamente esperando ese tiempo (o 2s/4s/8s si no lo
  manda) en vez de reportar error de inmediato. También se subió la
  pausa entre búsquedas del comparador de 350ms a 1.2s.
- **Bug real encontrado con los datos de prueba**: los slugs de juego
  que se le mandaban a JustTCG para One Piece y Lorcana (`onepiece`,
  `lorcana`) eran inválidos -- JustTCG regresó en un error 400 su lista
  completa de slugs aceptados, y los correctos son
  `one-piece-card-game` y `disney-lorcana`. Esto hacía que **toda**
  búsqueda de esos dos TCG fallara con 400, no que las cartas no
  existieran en JustTCG como se pensó al principio. Ya corregido en el
  selector de la parte 1 y en el mapa `JUEGO_JUSTTCG` de la parte 2.
- **Aviso de versión distinta (set no coincide)**: como JustTCG solo
  empareja por nombre, ahora compara el `set_nombre` guardado en la
  publicación real contra el set que regresó JustTCG, y muestra
  "⚠️ El set no coincide con el nuestro" cuando no se parecen -- así se
  detectó el caso de Mega Greninja ex (nuestro set "Chaos Rising"
  vs. el "jumbo-cards-pokemon" que regresó JustTCG).
- **Fix de UX en el diagnóstico**: el panel compartido "Ver respuesta
  cruda" se estaba pisando solo -- como el comparador sigue buscando
  fila por fila en segundo plano, para cuando el usuario abría el panel
  después de pedir el historial de una carta, ya mostraba la respuesta
  de una fila distinta más abajo en la lista. Ahora las búsquedas
  automáticas del comparador ya no tocan ese panel compartido; cada fila
  guarda su propia respuesta y tiene su botón "Ver respuesta cruda de
  esta fila" para inspeccionarla sin que se sobreescriba.

No requiere ninguna migración.

## 106. Cancelar el experimento JustTCG

Después de varias rondas de pruebas reales (secciones 103-105), no
convenció como reemplazo -- se cancela y se regresa todo a la normalidad.

- Se borró `public/experimento-justtcg.html` por completo.
- Se quitó `justTcgProxy` y la rama `fuente=justtcg` de `api/tcgcsv.js`
  (queda igual que antes de la sección 103, solo con `fuente=shopify`).
- El buscador/catálogo real de la app (pokemontcg.io/Scryfall/YGOPRODeck)
  nunca se tocó durante el experimento -- no hay nada más que revertir.
- Si en el futuro se quiere retomar la idea, las secciones 103-105 quedan
  como referencia de lo que ya se investigó (incluyendo los slugs de
  juego correctos que confirmó JustTCG y el problema de límite de
  peticiones de su plan gratuito).

No requiere ninguna migración (la columna `precio_ref_fuente` de la
sección 102 no tiene relación con este experimento y se queda igual).

## 107. Filtrar más ruido conocido en la captura de errores

Llegaron tres avisos de error (sección 35) que no eran bugs reales:
`window.__firefox__.refresh_youtube_quality_...`,
`window.__firefox__.reader` y `window.ethereum.selectedAddress`.

- Los primeros dos son el puente interno de Firefox para Android (su
  modo lectura y su control de calidad de YouTube), que se inyecta en
  cada página que visitas -- nada que ver con nuestro código.
- El tercero es de una extensión de billetera cripto (tipo MetaMask)
  instalada en el navegador de quien visita.
- Se agregaron `/window\.__firefox__/i` y `/window\.ethereum/i` a la
  lista `RUIDO_CONOCIDO` de `src/lib/errorReporting.jsx` (mismo patrón
  que el resto de la lista: cada entrada es un caso real que ya llegó
  por correo), para que dejen de mandar aviso.

No requiere ninguna migración.

## 108. Botón grande "Vende tus cartas" en la pantalla de inicio

Petición: un botón grande en la primera pantalla que diga "Vende tus
cartas" y lleve directo a la función de vender.

- Se agregó en la vista "Buscar" (pantalla de inicio), justo debajo del
  buscador y los filtros de TCG -- dorado, con ícono, para que resalte
  del resto de botones (violeta/azul).
- Sin sesión: abre "Mi cuenta" (crear cuenta o iniciar sesión), igual
  que el resto de accesos que requieren sesión.
- Con sesión: manda directo a "Mi tienda" si el perfil es de tienda, o a
  "Vender en el Mercado" si es cuenta individual -- mismo criterio que
  ya usa el menú "Vender" del Drawer.

No requiere ninguna migración.

## 109. Correcciones de una revisión externa (frontend)

Petición: un programador externo revisó la web y mandó una lista de
hallazgos; se atendieron los que eran arreglos de código concretos y
seguros de hacer sin rediseñar media app.

- **Fix real: el logo no regresaba a Home.** El logo del header no tenía
  `onClick` -- ahora lleva a la vista "Buscar" (Home), sin necesidad de
  refrescar la página como tenía que hacer antes quien lo probó.
- **Fix real: no había forma de iniciar sesión sin abrir el menú.**
  Junto a la campana/carrito/hamburguesa ahora siempre hay un ícono de
  persona: si hay sesión es tu foto de perfil (como ya era), y si no hay
  sesión es un ícono que abre "Mi cuenta" directo, sin tener que entrar
  al Drawer primero.
- **Fix real: el Catálogo mostraba información redundante ya avanzado
  el flujo.** El texto "Paso 1/2/3..." y los botones para elegir el
  juego se quedaban visibles incluso viendo ya las cartas de un set
  elegido (Paso 3), saturando la pantalla sin aportar nada en ese
  momento -- ahora se ocultan una vez que ya se eligió un set (para
  cambiar de juego, se usa el breadcrumb de "volver" que ya existía).
- **Scrollbar a juego con el diseño**: se agregó un estilo de scrollbar
  delgado y con los colores de la app (antes era el gris genérico del
  navegador, que desentonaba con el fondo oscuro) -- `theme.js`,
  aplica a toda la web.
- **Aclaración, no bug: el dominio de vercel.app aparece tras iniciar
  sesión.** El código que arma el link de login social (`urlLoginSocial`
  en `supabase.js`) ya construye el redirect dinámicamente con el
  dominio desde el que se entró (`window.location.origin`), no con uno
  fijo -- así que si después del login aparece `encuentra-cartas-nmcc-
  seven.vercel.app` en vez de `encuentracartasmx.com`, es porque el
  dominio propio no está en la lista de "Redirect URLs" permitidas de
  Supabase (Authentication → URL Configuration), no un bug de la app.
  Esto probablemente también explica el otro hallazgo de "se pierde la
  sesión al volver a home" -- si el login llega a dejarte en el dominio
  de vercel, la sesión se guarda en el localStorage de ESE dominio, y al
  volver a `encuentracartasmx.com` (otro origen) no la ve. Revisar y
  agregar `https://encuentracartasmx.com` a esa lista en el dashboard de
  Supabase debería resolver ambos hallazgos a la vez.
- **Aclaración, no bug: `?tienda=slug` "expone endpoints".** Ese query
  param es el deep-link público de la sección 139 (perfil de tienda por
  slug) -- no es una ruta de backend, es como el nombre de usuario en la
  URL de cualquier red social. El directorio de tiendas ya lista
  públicamente todas las tiendas, así que el slug no es información
  sensible que "se pueda sacar" jugando con la URL.
- **Aclaración, no bug: sugerencia de `CREATE VIEW` para que el
  catálogo cargue más rápido.** El catálogo (Pokémon/Magic/Yu-Gi-Oh/
  Lorcana/One Piece) no sale de tablas propias -- sale de APIs externas
  (pokemontcg.io, Scryfall, YGOPRODeck, TCGCSV) en el momento de la
  consulta, así que una vista de SQL no aplica aquí (no hay tabla propia
  que "ver"). La lentitud es el tiempo de red de esas APIs; ya existen
  reintentos (sección 178) para que al menos no parezca "sin resultados"
  cuando en realidad es una de esas APIs tardando.
- **Ya existía, no hacía falta tocar**: el carrusel "Cartas que están
  buscando" ya se muestra en Home (`BusquedasCarrusel`, justo debajo del
  buscador) -- puede que no lo haya visto quien revisó si en ese momento
  no había búsquedas publicadas para mostrar.
- **Pendiente de decisión, no se tocó**: rediseñar "Editar perfil" de
  modal a una pantalla completa con pestañas (datos personales / ventas
  / historial de compras) es un cambio de arquitectura más grande, y
  parte de lo pedido (ventas e historial) ya existe como una vista
  separada ("Mis compras y ventas") -- puede que solo haga falta hacerla
  más fácil de encontrar en vez de reconstruir todo el flujo de perfil.
  No se tocó en esta pasada para no arriesgar una reescritura grande sin
  antes platicarlo.
- **Pendiente de decisión, no se tocó**: el isotipo/logo "se pierde en
  el fondo" es un tema del archivo de imagen (`/branding/logo.png`) en
  sí, no de código -- necesitaría un archivo de logo nuevo.

No requiere ninguna migración.

## 110. Logo día/noche + "Mi cuenta" como pantalla completa (retomando la sección 109)

Petición: de los dos pendientes que se dejaron marcados como "decisión
tuya" en la sección 109, el usuario pidió hacer ambos.

- **Logo según el modo**: se agregó `public/branding/logo-noche.png`
  (el archivo que mandó el usuario -- mismo isotipo pero con las letras
  "ENCUENTRA CARTAS" en blanco, hecho para fondo oscuro). El header
  ahora elige el logo según `localStorage.getItem(TEMA_MODO_KEY)`: modo
  día sigue usando el `logo.png` de siempre (letras azul marino, pensado
  para fondo claro), modo noche (el predeterminado) usa el nuevo. Así
  ninguno de los dos se pierde contra su propio fondo.
- **"Mi cuenta" de modal a pantalla completa**: `EditarPerfilModal` se
  convirtió en `MiCuentaView`, una vista más (como "Mercado" o
  "Catálogo") en vez de un modal que tapaba la pantalla. Tiene dos
  pestañas: "Datos personales" (todo lo que ya traía el modal: foto,
  WhatsApp/redes, Pokémon favoritos, qué se ve en el perfil público,
  bio, color de acento, orden de secciones) y "Compras y ventas" (que
  reutiliza `ComprasVentasView` tal cual -- ya traía sus propias
  sub-pestañas Compras/Ventas, así que no hizo falta duplicar esa
  lógica). El ícono de perfil del header y la opción "Editar perfil"
  del Drawer ahora navegan a esta vista (`setView("miCuenta")`) en vez
  de abrir el modal.

No requiere ninguna migración.

## 111. Cartas promo/premio/liga/staff en español de Pokémon (ej. Leafeon ex PRE ES)

Petición: agregar todas las cartas promo/premio/de liga/de staff, en
español, etc. de Pokémon -- ejemplo real: "Leafeon ex" (PRE ES 006/131,
una promo de liga en español de Prismatic Evolutions) no salía en el
buscador al publicar.

- **Por qué no salía**: el buscador de cartas de Pokémon (al publicar,
  en Mercado/Mi tienda/Subastas) solo consulta pokemontcg.io, que
  cataloga el mercado de EE.UU./inglés -- no tiene promos regionales en
  español, de liga, de staff, ni casi nada que no sea un set de venta
  normal en inglés. Esto no es un bug: pokemontcg.io simplemente no
  tiene esos datos, sin importar qué tan real sea la carta.
- **Fix 1, mejora automática de la búsqueda**: se agregó un respaldo en
  TCGdex (`api.tcgdex.net/v2/es/...`), que sí tiene soporte de español y
  mejor cobertura de promocionales -- se intenta automáticamente
  cuando pokemontcg.io conectó bien pero de plano no encontró nada.
  Aviso honesto: no hay garantía de que TCGdex tenga TODAS las promos
  regionales jamás impresas (nadie tiene un catálogo 100% completo de
  eso) -- amplía bastante las probabilidades, pero no es un "ahora sí
  sale cualquier carta". Las cartas que se encuentren así no traen
  precio de referencia (TCGdex no da precio de mercado), se deja en
  blanco en vez de inventar uno.
- **Fix 2, la solución de verdad -- "escribirla manualmente"**: en
  Mercado (`MyMarketPanel`), Mi tienda (`MyStorePanel`) y Subastas
  (`CrearSubastaForm`), publicar una carta suelta dependía por completo
  de encontrarla en el catálogo -- no había manera de continuar si el
  buscador no la encontraba (a diferencia del producto sellado y la
  búsqueda de Wishlist, que sí ya tenían esta opción). Ahora las tres
  tienen el mismo "¿No la encuentras? Escribirla manualmente": se
  escribe el nombre (y opcionalmente el set/edición) a mano, sin precio
  de referencia automático, y se sube una foto real de la carta como
  siempre. Esto es lo que de verdad garantiza que CUALQUIER carta se
  pueda publicar -- promo, premio, de liga, de staff, en japonés, en
  coreano, de un torneo local, lo que sea -- sin depender de que algún
  catálogo externo la tenga.

No requiere ninguna migración.

## 112. Fix: "Buscar foto" nunca encontraba nada en Magic/Yu-Gi-Oh/Lorcana + Importador masivo guardaba todo como Pokémon

Petición (reporte real de una tienda): tras una carga masiva de cartas de
Magic (escaneadas con ManaBox, exportadas a CSV y subidas con el
Importador masivo), el botón "🔄 Buscar foto" de cada carta contestaba
"No se encontró la versión exacta" absolutamente siempre.

Dos bugs distintos, uno escondía al otro:

- **Bug 1 -- "Buscar foto" ignoraba el TCG real**: `ReintentarImagen`
  (el componente detrás del botón) llamaba SIEMPRE a la búsqueda de
  imagen de Pokémon (pokemontcg.io), sin importar el TCG real de la
  carta -- para Magic, Yu-Gi-Oh o Lorcana nunca podía encontrar nada
  porque ni siquiera intentaba con la API correcta. Se agregó
  `buscarImagenRespaldoPorTcg` en `pokemonApi.js` (despacha a Scryfall
  para Magic, YGOPRODeck para Yu-Gi-Oh, o al caché de lorcana-api para
  Lorcana) y `ReintentarImagen` ahora recibe el `tcg` de la publicación
  y usa ese despachador.
- **Bug 2, el más importante -- el Importador masivo guardaba TODO como
  "pokemon"**: `ImportadorMasivo` (el importador de texto/CSV/Excel,
  "Ente Ball") tenía `tcg: "pokemon"` fijo en el código al insertar,
  sin importar qué TCG fuera el lote real. Así que aunque el Bug 1 se
  arregle, esas cartas de Magic ya importadas seguían mal etiquetadas
  en la base de datos como si fueran de Pokémon -- el buscador de foto
  (y también el de precio de referencia) seguía consultando la API
  equivocada para ellas. Se agregó un selector de TCG al importador
  (arriba del idioma, aplica a todo el lote) y ya no asume Pokémon.
- **Las cartas que ya se importaron mal siguen mal** -- este fix solo
  corrige las cargas masivas nuevas. Las filas de esa carga de Magic ya
  quedaron guardadas con `tcg = 'pokemon'` y hay que corregirlas a mano
  una sola vez desde Supabase → SQL Editor (ajustando el filtro a la
  fecha/hora real de esa carga, para no tocar otro inventario):
  ```sql
  update inventario_tienda
  set tcg = 'magic'
  where tienda_id = '<id de tu tienda>'
    and tcg = 'pokemon'
    and created_at between '2026-08-XX 00:00' and '2026-08-XX 23:59';
  ```

No requiere ninguna migración de esquema (sí requiere que cada tienda
afectada corrija a mano, una sola vez, sus filas ya importadas mal --
ver el `update` de arriba).

## 113. Experimento aislado: Wikidex como fuente extra de datos de cartas

Se preguntó si es viable usar Wikidex (wikidex.net) para enriquecer las
cartas del catálogo con datos que hoy no tenemos completos en español:
ataques, habilidades, ilustrador. Que un sitio permita ser indexado por
buscadores (`robots.txt`) no tiene nada que ver con tener una API para
consultarlo en vivo desde la app -- son cosas distintas. Wikidex, al ser
un wiki basado en MediaWiki, sí expone la API estándar de MediaWiki
(`action=query`, `action=parse`), que es la forma correcta de
consultarlo (no scraping de HTML).

No se puede verificar desde este entorno de desarrollo si la URL base
exacta (`https://www.wikidex.net/api.php`) es la correcta ni si los
nombres de los parámetros de la plantilla de carta que usa Wikidex
(`ilustrador`, `habilidad`, etc.) coinciden con los que se están
probando -- ese entorno no tiene salida de red hacia sitios externos.
Por eso, igual que se hizo antes con el experimento de JustTCG, se armó
un experimento **aislado** para probar en el sitio real ya desplegado,
sin tocar nada del catálogo ni del flujo de publicación:

- **`api/tcgcsv.js`**: se agregó un modo `fuente=wikidex` (reutilizando
  el mismo archivo, no uno nuevo, porque el plan Hobby de Vercel ya está
  al tope de 12 funciones serverless). Este proxy NO interpreta la
  respuesta de Wikidex -- la devuelve tal cual (el JSON crudo de
  MediaWiki y el código de estado real), justamente porque no se puede
  confirmar su formato exacto desde aquí.
- **`public/experimento-wikidex.html`**: página aislada (no aparece en
  ningún menú, tiene `noindex`) con: (1) una caja de búsqueda por nombre
  de carta, que usa `action=query&list=search` de MediaWiki, y (2) una
  caja para ver una página exacta por título, que usa
  `action=parse&prop=wikitext`. Intenta extraer ilustrador/habilidad/
  ataque con una expresión regular sobre varios nombres de parámetro
  probables, pero si ninguno aparece lo marca explícitamente como "no
  se pudo determinar" -- nunca inventa un dato. Siempre muestra también
  la respuesta cruda completa en un desplegable, para poder juzgar la
  calidad real de la información con tus propios ojos.

**Siguiente paso (para ti, no para mí):** entra a
`/experimento-wikidex.html` en el sitio ya desplegado y prueba buscar
cartas reales (por ejemplo la Leafeon ex de la sección 111). Si los
datos que trae son consistentes y confiables, se puede construir la
integración de verdad (guardar esos campos en la base de datos y
mostrarlos en el detalle de la carta); si el formato es muy irregular
entre páginas o la cobertura es baja, mejor no invertir tiempo en
automatizarlo.

El experimento no dio resultado en la prueba real (no se llegó a
diagnosticar la causa exacta -- pudo ser la URL base del API, el nombre
de los parámetros esperados, o algo del lado de Wikidex), así que por
ahora queda archivado sin usarse. El código se deja tal cual en vez de
borrarlo, por si más adelante se quiere retomar con más detalle de qué
devolvió exactamente la respuesta cruda.

## 114. Mejoras de experiencia: estado inicial, checklist de publicar y vista previa

Primer bloque de una tanda de mejoras de UX pedidas explícitamente para que la
página se sienta más fluida y fácil de entender, cuidando que no se sienta
sofocante para quien recién llega:

- **Inicio menos saturado para quien recién llega**: antes, entrar a la
  página por primera vez mostraba de entrada 4 banners promocionales
  apilados (sorteo destacado, boletín de precios, "¿buscas una carta?",
  búsquedas de la comunidad) ANTES de siquiera llegar al buscador -- eso es
  justo lo que se pidió evitar. Ahora, mientras la persona no haya visto el
  tutorial de bienvenida (mismo criterio que ya existía para mostrarlo,
  sección 113/114 del historial de tutorial), esos 4 banners se colapsan en
  un solo botón "Ver sorteos, boletín de precios y otras novedades" y, en su
  lugar, aparece una guía corta de 3 pasos ("1. Busca o explora · 2. Contacta
  al vendedor · 3. Acuerden la entrega") justo debajo del buscador principal.
  Alguien que ya vio el tutorial (visitante recurrente) sigue viendo todo
  desplegado como antes -- cero cambio de comportamiento para quien ya
  conoce la página.
- **Checklist visual al publicar** (`ChecklistPublicacion`): reemplaza el
  texto plano "Para publicar, falta: el precio, la zona..." (había que leer
  la oración completa) por una lista con checkmarks y una barra de progreso
  que se llena en vivo mientras se completa el formulario -- en el
  formulario de Mercado (`MyMarketPanel`), el de cartas sueltas de tienda
  (`MyStorePanel`) y el de Subastas (`CrearSubastaForm`).
- **Vista previa en vivo** (`PreviewPublicacion`): mientras se llena el
  formulario de una carta/producto en `MyMarketPanel` y `MyStorePanel`,
  aparece una mini tarjeta con la misma pinta que tendría en el Mercado real
  (foto, badges de idioma/estado/gradeo, precio) -- para confirmar de un
  vistazo que se ve bien antes de publicar, en vez de descubrirlo después.
- **Plantillas rápidas ("Duplicar")**: botón nuevo en cada fila de
  `MyMarketPanel` y en las cartas sueltas de `MyStorePanel` que precarga el
  formulario de arriba con los datos de esa publicación (nombre, set, tcg,
  idioma, condición, fotos, precio) para publicar otra copia sin volver a
  capturar todo -- solo hay que ajustar lo que cambió (normalmente el
  precio o la cantidad) y publicar. Queda en modo "escribir manualmente"
  porque el `card_api_id` original ya no está garantizado a coincidir con
  el picker del catálogo si esa carta se buscó hace tiempo.

## 115. Tiempo de respuesta del vendedor + resumen semanal por correo

Segundo bloque de la misma tanda de mejoras de UX (ver sección 114):

- **Indicador "Responde en..." (migración 064)**: badge nuevo (⏱ Responde
  en minutos / en unas horas / en menos de un día / en varios días) en el
  detalle de una publicación, en el perfil público de tienda y en el
  perfil público de una persona -- para que quien está por contactar sepa
  qué tan probable es recibir respuesta pronto. Se calcula con un
  **trigger en la base de datos** (`actualizar_tiempo_respuesta`, corre
  después de cada mensaje nuevo) que mantiene un promedio corrido en dos
  columnas nuevas de `perfiles` (`tiempo_respuesta_promedio_minutos`,
  `tiempo_respuesta_conteo`) -- lo calcula el servidor, NO el navegador
  leyendo mensajes ajenos (los mensajes son privados; solo agregados como
  "cuántos minutos en promedio" son públicos, igual que el resto del
  perfil). Con menos de 3 respuestas registradas no se muestra nada
  todavía -- una sola respuesta no dice nada confiable de qué tan rápido
  responde alguien en general.
- **Resumen semanal por correo, cada lunes** (extiende
  `api/cron/recordatorios.js`, mismo archivo por el límite de 12
  funciones serverless): cada tienda con correo registrado recibe un
  correo con cuántos mensajes nuevos, ventas confirmadas y seguidores
  nuevos tuvo en los últimos 7 días -- para que una tienda que no entra
  seguido igual se entere de que algo pasó, sin tener que revisar "Mis
  estadísticas" (que además es exclusivo Diamante+; este correo es
  gratis para cualquier tienda). Si no hubo NINGUNA novedad esa semana,
  no se manda correo -- evita ruido de un resumen vacío.

No requiere ninguna acción manual aparte de correr la migración 064 en
Supabase → SQL Editor -- esa misma migración incluye un backfill de una
sola vez que recalcula el promedio con el historial de mensajes que ya
existía, así que el indicador no arranca en blanco para todos.

## 116. Skeletons de carga (cierre de la tanda de mejoras de UX)

Último punto de la tanda de mejoras de UX (secciones 114-116): se
reemplazó el spinner genérico ("Cargando...") por un `SkeletonGrid` --
tarjetas placeholder con un pulso suave que ya insinúan la forma del
contenido que está por llegar -- en los tres lugares donde antes había
solo un ícono girando en el centro de la pantalla: la vitrina de Inicio
("Recién publicado"), el Mercado entre usuarios, y las cartas de un set
en el Catálogo.

**Sobre la otra mitad del punto, "code-splitting" (dividir el bundle
grande en pedazos más chicos):** ya estaba parcialmente hecho -- la
librería `xlsx` (429 kB) que usa el Importador masivo ya se carga por
separado con `import()` dinámico, solo cuando alguien de verdad la usa.
Lo que falta para bajar el bundle principal (655 kB) es dividir
`src/App.jsx` en módulos separados por archivo (hoy son 12,000+ líneas
en un solo archivo, así que React.lazy no tiene qué cargar por
separado) -- eso es justo la sección 34/99 de este historial ("dividir
src/App.jsx en módulos"), un trabajo grande y de por sí ya identificado
por separado. No se intentó aquí para no mezclar un refactor de esa
escala con esta tanda de mejoras de UX, sin el tiempo dedicado que
merece para probarlo bien.

## 117. Fix urgente: migración 064 nunca corrida + herramienta para completar fotos faltantes en bloque

Justo después de desplegar la sección 115 (tiempo de respuesta del
vendedor), el sitio se veía roto: no salían tiendas y las publicaciones
al abrirlas se veían "como borradas". La causa exacta, confirmada
directo en los logs de Supabase: el código ya pedía las 2 columnas
nuevas (`tiempo_respuesta_promedio_minutos`, `tiempo_respuesta_conteo`)
en varias consultas, pero la migración 064 que las crea nunca se había
corrido en la base de datos real -- cualquier consulta que las pidiera
fallaba entera con error 400 (`column ... does not exist`), y como la
app trata "no pude cargar esto" igual que "ya no existe", tiendas y
publicaciones se veían como borradas sin que se hubiera tocado ningún
dato real. Se aplicó la migración 064 directo (agrega las columnas +
backfill del historial, nada destructivo) y todo volvió a la normalidad
de inmediato -- **si clonas este repo de cero, asegúrate de correr
TODAS las migraciones pendientes en orden antes de desplegar código que
ya las dé por hechas.**

Aparte, se reportó que muchas cartas de Magic en el inventario de una
tienda (534 cartas, 465 sin foto) se habían quedado sin imagen -- son
justo las que se subieron con el importador masivo (ManaBox) antes del
fix de la sección 112. El botón "🔄 Buscar foto" de cada fila ya
funciona bien, pero dar clic uno por uno en 465 filas no es razonable.
Se agregó una herramienta nueva en **AdminPanel → Tiendas → "🖼️
Publicaciones sin foto"** que:

- Detecta automáticamente, agrupado por tienda y TCG, cuántas
  publicaciones de cualquier tienda no tienen imagen.
- Con un clic, busca la foto de cada una en el catálogo correspondiente
  (mismo despachador por TCG que ya usa el botón individual) y la
  guarda, con una pausa chica entre carta y carta para no saturar la
  API externa, mostrando progreso en vivo.
- Corre en el navegador del propio admin (no en un cron ni en el
  servidor) porque necesita salida real a internet hacia cada catálogo
  -- por eso lo dispara un clic en vez de que se arregle solo.
- Migración 065: agrega el permiso que le faltaba al admin para
  actualizar (no solo borrar) el inventario de cualquier tienda, ya
  que antes solo el dueño de la tienda podía editar sus propias filas.

No se puede prometer que encuentre el 100% -- depende de qué tan bien
coincida el nombre/set guardado con el catálogo real (algunas tierras
básicas y reimpresiones comunes pueden tener nombres de set ligeramente
distintos entre ManaBox y Scryfall). Lo que no encuentre se puede seguir
completando con el botón individual de esa fila, o subiendo la foto a
mano.

Además, esa herramienta salió con un mensaje de "🔍 Probar conexión" por
grupo (una consulta cruda a una sola carta, mostrando el HTTP status y
la respuesta real) porque la primera corrida real dio "0 encontradas" y
había que ver la verdad en vez de adivinar por qué -- ver sección 118.

## 118. Fix: boletín semanal llevaba 2 semanas sin mandarse (sin que nadie se enterara)

Se reportó que no había boletín de precios hacía dos semanas. Revisando
`api/cron/recordatorios.js` se encontraron **dos agujeros de
observabilidad** que ya venían de antes (no algo que se rompió con un
cambio reciente), cualquiera de los dos explica el silencio:

1. El cron hace varias cosas en la misma corrida diaria (recordatorios
   de plan, boosts, torneos, destellos mensuales, boletín, resumen
   semanal), pero solo el boletín y el resumen semanal tenían su propio
   manejo de errores. Si algo tronaba en una sección de ANTES (planes,
   boosts o torneos -- ej. una fila con un dato inesperado), se caía
   todo el `try/catch` del handler completo y las secciones de abajo
   (incluido el boletín) simplemente nunca llegaban a correr ESE día --
   sin ningún aviso más allá del log interno de Vercel.
2. Adentro del boletín mismo, si generar el boletín de un TCG fallaba
   (o si la fuente de precios devolvía cero resultados, algo que por
   diseño no se trata como error para no molestar por un hipo pasajero
   de una API externa), el `catch` solo hacía `console.error` -- otro
   callejón sin salida donde nadie se entera.

Se corrigió ambas cosas:

- Cada sección del cron (planes, boosts, torneos, destellos) ahora
  corre en su propio `try/catch` independiente -- una falla puntual en
  una ya no le quita su turno a las demás.
- Se agregó `avisarFalloCron()`, que reutiliza el mismo sistema de
  avisos que ya existía para errores del navegador (sección 35): guarda
  el error en `errores_app` (visible en AdminPanel → Errores) y notifica
  a todos los admins por bandeja + correo -- con el mismo criterio de
  "no repetir el aviso si ya se avisó de este mismo error en la última
  hora" que ya usaba ese sistema.
- Si se intenta generar boletín para algún TCG hoy y NINGUNO produce
  resultado (algo que antes se tragaba en silencio, tratándolo como "tal
  vez la fuente está caída hoy"), ahora también avisa -- porque si pasa
  día de boletín tras día de boletín, ya no es un hipo pasajero.

No se pudo confirmar la causa EXACTA de estas dos semanas en concreto
(la conexión directa a Supabase/Vercel de esta sesión se cayó a media
conversación, así que no hay forma de leer el log real de esos días) --
pero con este cambio, la próxima vez que algo le impida mandarse al
boletín, vas a recibir un aviso real en vez de silencio.

## 119. Fix: "boosts por vencer" tronaba el cron con un error críptico

Un admin reportó el correo "⚠️ Falló una parte del cron diario" con el
mensaje `(filas || []) is not iterable`. La causa: la consulta de boosts
por vencer pedía `tiendas(perfil_id,perfiles(email))` -- pero `perfiles`
tiene dos relaciones distintas con `tiendas` (`tiendas.perfil_id` y
`perfiles.buzon_default_tienda_id`, agregada en la sección 141), así que
PostgREST rechaza el embed por ambiguo y devuelve un objeto de error en
vez de un arreglo. El resto del código ya resolvía esto mismo con
`perfiles!perfil_id(...)` (ver sección 147); a esta consulta del cron
se le había quedado sin el sufijo. Se corrigió igual que las demás, y
además se agregó una verificación explícita (`r.ok` + `Array.isArray`)
para que, si vuelve a fallar por cualquier otra razón, el aviso al admin
traiga el error real de PostgREST en vez de un `TypeError` sin contexto.

## 120. Tiendas sin local físico

Varias tiendas venden solo en línea (envíos, redes sociales) y no tienen
una dirección real que mostrar -- antes el formulario de alta y edición
de tiendas (AdminPanel → Tiendas) exigía dirección sí o sí.

- Migración 066: `tiendas.sin_local boolean not null default false`.
- "Crear tienda": nueva casilla "Esta tienda no tiene local físico
  (vende solo en línea/envíos)". Al marcarla, la dirección deja de ser
  obligatoria para crear la tienda.
- "Todas las tiendas": nuevo botón "🏠 Marcar/Quitar 'sin local'" (mismo
  patrón que "Marcar afiliada") para cambiar esta bandera en tiendas que
  ya existen, sin tener que borrarlas y recrearlas.
- El formulario de edición respeta la bandera: si la tienda está marcada
  como sin local, guardar cambios ya no exige escribir una dirección.
- Donde antes se mostraba la dirección en público (directorio de tiendas
  y perfil de tienda), una tienda sin local ahora muestra "Sin local
  físico — venta en línea" en su lugar; el mapa embebido simplemente no
  se muestra si no hay dirección ni coordenadas (ya se comportaba así).

## 121. Una cuenta de tienda ya nace siendo una tienda real del directorio

Antes, crear una cuenta de tipo "tienda" solo creaba el `perfiles` --
la fila real en `tiendas` (la que aparece en el directorio, con
inventario, dirección, etc.) solo la podía crear un Admin a mano desde
AdminPanel, y luego había que vincularla. Alguien podía registrarse
como tienda y quedar "flotando" sin aparecer en ningún lado hasta que
un admin se enterara y la diera de alta.

- Migración 067: nuevas políticas RLS `"tiendas: dueño crea la suya"`
  (INSERT) y `"tiendas: dueño edita la suya"` (UPDATE), ambas con
  `perfil_id = auth.uid()`. Antes el INSERT/UPDATE de `tiendas` era
  admin-only (ver migración original de tiendas); sin esto, el alta
  automática de abajo hubiera fallado en silencio por RLS.
- `AccountModal.handleSignUp`: si el tipo de cuenta elegido es
  "tienda", justo después de crear el `perfiles` también se crea la
  fila en `tiendas` (mismo nombre, `perfil_id` de la cuenta nueva). El
  formulario de registro ahora pide, solo para tiendas: teléfono
  (opcional), la misma casilla "no tiene local físico" que ya existía
  en AdminPanel (sección 120), dirección (opcional) y municipio
  (opcional, con `ZonaSelector`). Si no marcó la casilla pero tampoco
  puso dirección, igual queda como sin local -- no se le exige elegir
  una cosa u otra.
- Si Supabase exige confirmar el correo antes de dar sesión, la cuenta
  se crea hasta el primer login (`cargarOCrearPerfil`, ya existía este
  camino para el `perfiles`); ahora ese mismo camino también crea la
  tienda, usando los datos que se guardaron en `user_metadata` al
  registrarse originalmente.
- Mismo tratamiento en `CompletarPerfilOAuthModal` (registro por
  Google/Facebook, que no pasa por `user_metadata` porque ya hay
  sesión): mismos campos, misma creación de tienda al confirmar.
- Si la creación de la tienda falla por cualquier motivo, NO tumba el
  registro de la cuenta (que ya se creó con éxito) -- solo se registra
  en consola; la tienda queda pendiente de vincular a mano como
  funcionaba antes de este cambio, así que no hay forma de perder una
  cuenta nueva por esto.
- Como ahora el dueño puede crear su tienda sin pasar por un Admin,
  también necesitaba poder editarla él mismo (antes SOLO el Admin
  podía tocar `tiendas`). Se agregó un panel "✏️ Editar información" en
  MyStorePanel (nombre, casilla sin local, dirección, municipio,
  teléfono, coordenadas por dirección o por ubicación del navegador) --
  mismos campos y mismos helpers (`buscarCoordenadasPorDireccion`) que
  ya usaba AdminPanel, ahora también disponibles al dueño de la tienda
  gracias a la migración 067.

## 122. Una cuenta puede controlar varias tiendas

Caso real: un cliente tiene dos locales con nombres distintos pero los
maneja la misma persona/cuenta. Antes el código en todos lados asumía
"una cuenta = una tienda" (`MyStorePanel` pedía `tiendas?...&limit`
implícito y se quedaba con `rows[0]`, `AdminPanel` excluía del selector
de vincular a cualquier cuenta que ya tuviera una tienda). No hizo
falta migración nueva -- la RLS de la 067 (`perfil_id = auth.uid()`)
ya permitía tener más de una fila en `tiendas` por cuenta, solo el
frontend no lo aprovechaba.

- `MyStorePanel`: ahora carga TODAS las tiendas de la cuenta
  (`misTiendas`) y cuál está activa (`tiendaActivaId`, se recuerda en
  localStorage por cuenta). Arriba del panel aparece un selector en
  forma de pastillas con el nombre de cada tienda -- click y cambia
  (recarga solo inventario/sellado/verificación/sorteos de esa tienda,
  no la página completa). Cada tienda se administra 100% por separado
  (su propio inventario, dirección, zona, verificación, sorteos), pero
  comparten cuenta y plan/suscripción.
- Botón "+ Agregar otra tienda" (mismos campos que dar de alta la
  primera: nombre, casilla sin local, dirección, zona, teléfono) --
  usa la misma RLS de owner-insert de la migración 067, así que el
  dueño puede agregarse una segunda tienda él mismo sin pasar por un
  Admin.
- El estado vacío ("aún no tienes tienda") ahora también deja crear la
  tienda ahí mismo, en vez de solo decir "pídele al administrador".
- `AdminPanel` → Tiendas → "Vincular tiendas": ya no excluye a las
  cuentas que ya tienen una tienda vinculada del selector -- solo les
  anota cuántas tienen ("ya tiene 1 tienda") para que el admin sepa que
  está vinculando una adicional a propósito, no por error. Así también
  se puede armar el caso del cliente con dos locales completamente
  desde el lado del Admin si hace falta.
- `RecompensasView` (canjear Destellos por boost gratis): antes solo
  consideraba la primera tienda de la cuenta para elegir qué destacar;
  ahora junta las publicaciones de todas.
- Límite conocido, no se tocó: el perfil público (`PerfilPublicoView`)
  todavía solo muestra la zona de una tienda como subtítulo bajo el
  nombre de la cuenta -- con varias tiendas, muestra la primera que
  regrese la consulta. Es solo cosmético (un renglón de texto), no
  afecta que cada tienda tenga su propia página completa en el
  directorio.

## 123. Fix: cuentas nuevas se quedaban sin poder confirmar su correo

Un usuario reportó "For security purposes, you can only request this
after 48 seconds" al intentar crear su cuenta de tienda. Revisando los
logs de Auth de Supabase se encontró el problema real (no era solo ese
mensaje): a esa persona SÍ le llegó el correo de confirmación, pero
cada vez que le daba clic al link, Supabase respondía "403: Email link
is invalid or has expired" / "One-time token not found" -- seis veces
seguidas, incluso en el primer clic. Al revisar cuántas cuentas más
estaban en ese mismo estado (correo nunca confirmado, nunca iniciaron
sesión), aparecieron **10 cuentas reales más** desde el 20 de julio.

**Causa real**: el link que manda Supabase por default apunta
directo a su propio endpoint `GET /auth/v1/verify`, que gasta el token
de un solo uso con el simple hecho de que alguien (o *algo*) le haga
un GET -- y varios clientes de correo y filtros de seguridad (Gmail,
Outlook/Safe Links, antivirus corporativos) "previsualizan"/escanean
automáticamente los links de un correo apenas llega, haciendo ese GET
ellos mismos antes de que la persona alcance a tocarlo. Para cuando el
usuario de verdad da clic, el token ya está quemado. Es un problema
conocido de Supabase (y de cualquier magic link de un solo uso), no
tiene que ver con el dispositivo, el navegador en el que se abrió
(WhatsApp, Chrome, etc.) ni con haber hecho algo mal.

**Arreglo**:
- `lib/supabase.js`: nueva función `authVerifyOtp(tokenHash, type)` --
  llama `POST /auth/v1/verify` con `{ type, token_hash }` (en vez del
  link GET de Supabase) y devuelve la sesión.
- Nuevo componente `ConfirmarCorreoModal` en `App.jsx`: se activa con
  `?confirmar=1&token_hash=...&type=...` en la URL, y a propósito NO
  confirma solo con que la página cargue -- exige que la persona le dé
  clic a un botón "Confirmar mi cuenta". Cargar la página no gasta el
  token (es una página normal de la app, no el endpoint de Supabase);
  solo el clic real dispara el POST que sí lo gasta. Así un escáner
  automático puede visitar la página todo lo que quiera sin romper
  nada, porque nunca le da clic al botón.
- **Pendiente de un paso manual en el Dashboard de Supabase** (no hay
  forma de tocar plantillas de correo desde aquí): hay que cambiar la
  plantilla "Confirm signup" (Authentication → Email Templates) para
  que el link ya no sea `{{ .ConfirmationURL }}` sino
  `{{ .SiteURL }}/?confirmar=1&token_hash={{ .TokenHash }}&type=signup`.
  Sin este cambio de plantilla, el correo sigue mandando el link viejo
  y el bug sigue ahí -- el código de la app ya está listo para
  recibirlo en cuanto se haga el cambio.
- Las 11 cuentas afectadas (incluida la de este reporte) se marcaron
  como confirmadas directamente en la base de datos, ya que el
  problema era de la plataforma y no de ellas -- ya pueden iniciar
  sesión normal con su correo y contraseña.

## 124. Fix visual (Anuncios) + se quitó por completo el Boletín de precios

**Fix**: las tarjetas de "Anuncios y noticias" (y las 3 vistas de
Anuncios en AdminPanel) se veían rotas cuando un anuncio tenía varias
fotos -- la galería interna (que ya tenía su propio scroll horizontal)
empujaba TODA la página hacia los lados en vez de quedarse contenida.
Causa: la tarjeta es hija directa de un `grid`, y por default un hijo
de grid/flex no se encoge más allá del contenido que tiene adentro
(`min-width: auto`), así que el grid agrandaba la columna entera para
caber la galería en vez de dejar que ella sola hiciera scroll. Se
arregló agregando `min-w-0` a esas 4 tarjetas -- el fix clásico de
Tailwind para este caso. De paso se quitó un banner de debug ("🔌
Conectado en vivo a tu base de datos real de Supabase") que aparecía
arriba de TODAS las vistas de la app -- un mensaje interno que nunca
debió llegarle a un usuario final.

**Se quitó por completo** el Boletín de precios (banner en Inicio,
vista dedicada, botón "Me interesa" por TCG, y la generación
automática cada 3 días en el cron): componentes `BoletinBanner` /
`BoletinView` / `FilaBoletin` borrados de `App.jsx`, la generación
(`generarYEnviarBoletines` y todo lo que dependía de ella) borrada de
`api/cron/recordatorios.js`, `lib/precios.js` borrado por completo (ya
no lo usaba nadie más), y migración 069 que borra las tablas
`boletines`, `boletin_subscripciones` y `precio_historial_semanal`.

## 125. Fix: Catálogo se quedaba en "no hay sets disponibles" al cambiar rápido

Se reportó que en Catálogo, al cambiar de categoría (Pokémon/Magic/Yu-Gi-Oh/
etc.) rápido, salía "no hay sets disponibles" y solo se corregía al
entrar y salir 2-3 veces -- y que dentro de un set a veces pasaba lo
mismo con las cartas.

Causa: condición de carrera clásica. El `useEffect` que carga sets se
vuelve a disparar en cada cambio de `tcgSel`, y `abrirSet()` en cada
clic a un set -- pero ninguno de los dos cancelaba ni ignoraba una
respuesta que ya no correspondía a la selección vigente. Si cambiabas
de Pokémon a Magic rápido, se quedaban dos peticiones en el aire; si la
de Pokémon (la vieja) tardaba más y respondía después, pisaba el
estado con sus datos (o con `[]` si esa fue la que falló) aunque ya
estuvieras viendo Magic. Nada volvía a intentarlo hasta que algo más
disparaba el efecto de nuevo -- de ahí el "entrar y salir 2-3 veces".

Arreglo: mismo patrón en los dos lugares -- un token/bandera que se
marca "ya no vigente" en cuanto se dispara una petición más nueva, y
antes de aplicar cualquier `setEras`/`setCartas`/`setError` se checa
que la respuesta siga siendo la de la selección actual. Si no lo es,
se descarta en silencio (la petición más nueva es la que manda).

## 126. Cambio de logo

Se reemplazó el logo de la marca (ícono + wordmark) por el nuevo diseño
que mandó el dueño (un ícono estilo anteojos/mariposa en tono café/tan
sobre fondo café oscuro, con "ENCUENTRA CARTAS" debajo). Se recortó el
ícono y el texto de la imagen original, se hicieron transparentes, y se
armaron de nuevo como un lockup horizontal (ícono a la izquierda, texto
a la derecha) porque el header muestra el logo a una altura fija -- la
imagen original traía el texto debajo del ícono, apilado, lo que no
cabía en ese espacio. Se generaron tres archivos en `public/branding/`:
`logo.png` (versión oscura, para modo día), `logo-noche.png` (versión
en el tono tan original, para modo noche) y `logo-icon.png` (solo el
ícono, cuadrado, sobre fondo café oscuro sólido -- usado como favicon y
como insignia chica). No se tocó ningún código: el header, el favicon
y el `og:image` ya apuntaban a esos tres nombres de archivo desde antes.

## 127. Modo Evento (Amatista+): control de ventas en eventos presenciales

Se agregó "Modo Evento", pensado para vendedores que venden cara a cara
en un evento (expo, torneo, bazar). Exclusivo Amatista y Diamante y
Aurora (`info.modoEvento` en `theme.js` -- Diamante se incluyó también
aunque el dueño solo mencionó Amatista y Aurora, porque su propio texto
de beneficios dice "Todo lo de Amatista" y dejarlo fuera habría sido
quitarle una función al subir de plan).

Cada evento (tabla `eventos`: nombre, lugar, fechas, estado
activo/cerrado) junta:

- **Inventario del evento** (tabla `evento_ventas`, `vendida=false`
  mientras sigue en la mesa): se arma a mano, o importando de un solo
  jalón las publicaciones activas del perfil (`mercado_listings` si es
  cuenta individual) o de todas las tiendas vinculadas a la cuenta
  (`inventario_tienda` + `sellado_tienda`, igual que ya suma
  `RecompensasView` para cuentas con más de una tienda) -- cada fila
  importada guarda `origen_tabla`/`origen_id` para no duplicarla si se
  vuelve a importar, y una `carpeta` de texto libre (con autocompletado
  vía `<datalist>` de las carpetas ya usadas en ese evento) para
  organizarlo en cajas/categorías, que es lo que pidió el dueño de
  "poder separarlo por carpetas".
- **Ventas** (`vendida=true`): al marcar una pieza como vendida (o al
  agregarla directo como ya vendida) se le pone costo real, precio de
  venta real (puede diferir del `precio_lista` sugerido por el regateo
  típico de un evento) y el día -- opcionalmente eligiendo la carta con
  el mismo `CardPickerUniversal` que ya usa el resto de la app (autocompleta
  nombre e imagen contra el catálogo oficial), o a mano si no está en
  ningún catálogo.
- **Gastos** (tabla `evento_gastos`): cede/mesa, comida, transporte u
  otro, con monto y día opcional.

Con esos tres datasets, `EventoDetalle` calcula en el cliente (sin
ninguna función serverless nueva -- ya estamos en las 12 del plan
Hobby): ingresos, costo de mercancía vendida, gastos operativos,
ganancia neta, valor del inventario sin vender (a costo), y un
desglose por día. Un botón genera un reporte en PDF (vía `jspdf`,
cargado solo con `import()` dinámico al generar el reporte para no
engordar el bundle principal de quien no usa esto) con el mismo
resumen, la tabla por día, los gastos, las ventas y lo que quedó sin
vender.

Archivos: migración `070_modo_evento.sql` (tablas `eventos`,
`evento_ventas`, `evento_gastos`, RLS dueño-solo vía `perfil_id =
auth.uid()`), `theme.js` (`modoEvento` en `PLAN_INFO`), `App.jsx`
(`ModoEventoView`, `EventoDetalle`, `FormVentaEvento`, `FilaVentaEvento`,
nueva entrada de nav "Modo Evento" dentro de "Vender"), `lib/icons.jsx`
(ícono `Download` nuevo, para el botón del PDF), y `jspdf` agregado a
`package.json`.

## 128. Cartas nuevas que no aparecen (ej. promos "First Partner") + publicar con foto propia cuando no está en el catálogo

Se reportó que las cartas promo "First Partner" (de la era Mega Evolution,
2026) no aparecían ni en el buscador de Pokémon ni en el catálogo. Causa
real, confirmada por fuera del sandbox (la API de pokemontcg.io está
bloqueada desde este entorno, así que se investigó por búsqueda web):
**pokemontcg.io pasó a modo legado** -- su propio equipo movió el
desarrollo activo a Scrydex (un producto de paga) y ya no agrega cartas ni
sets nuevos. Cualquier set/promo que salga de ahora en adelante puede
tardar mucho -- o no llegar nunca -- a pokemontcg.io, que es la fuente
principal de `buscarCartasVisual` (el buscador al publicar) y de
`obtenerErasYSetsPokemon`/`obtenerCartasDeSetPokemon` (la vista Catálogo).

Arreglo aplicado al buscador (`lib/pokemonApi.js`): el respaldo en TCGdex
(que sí sigue actualizándose activamente) ahora se intenta primero en
inglés y, si no trae nada, en español (antes solo intentaba español) --
`buscarCartasVisualTCGdexIdioma` + `buscarCartasVisualTCGdex`. Esto no
garantiza que TCGdex ya tenga indexado cualquier set recién salido, pero
amplía las probabilidades reales sin arriesgar nada (solo se prueba si
pokemontcg.io ya conectó bien y de verdad no trajo nada). **Ojo:** la
vista dedicada "Catálogo" (era → set → cartas, ver `CatalogoView`) sigue
sin este respaldo -- fusionar dos taxonomías de sets distintas (la de
pokemontcg.io y la de TCGdex) sin duplicar sets que ya están en ambas es
un cambio bastante más grande y arriesgado, que no se intentó en esta
pasada por no poder probarlo en vivo desde este sandbox (red bloqueada
hacia ambas APIs). Sigue pendiente si hace falta.

Además, se pidió explícitamente: que si de plano no se encuentra la carta
específica, se pueda subir una foto propia "en su lugar" y que cuente
como la carta ya elegida, permitiendo publicar. Esto **ya existía a
medias** -- se podía escribir el nombre a mano (botón "¿No la
encuentras? Escribirla manualmente") y subir una foto real más abajo
(opcional, en una sección genérica separada), y esa foto sí terminaba
siendo la imagen pública de la publicación (`miniaturaListing` en
`theme.js` ya prefería `imagen_url || foto_real_url`) -- pero era fácil
no darse cuenta de que ese camino existía o de que la foto sí "contaba"
como la carta. Se mejoró la experiencia en los dos formularios donde se
publica una carta suelta (`MyMarketPanel` para cuentas individuales,
`MyStorePanel` para tiendas):

- El cuadro de búsqueda (`CardPicker`) ahora muestra, dentro del mismo
  "Sin resultados", un botón directo "✏️ Escribirla a mano y agregar tu
  propia foto" (prop nueva `onNoEncontrada`, ver también
  `CardPickerUniversal`) -- antes ese camino solo existía como un link
  gris aparte, fácil de pasar por alto.
- El bloque de "escribir a mano" ahora trae su propia foto integrada
  ahí mismo (no hasta abajo del formulario, mezclada con otros campos):
  en cuanto se sube, se ve una miniatura + insignia "Carta seleccionada",
  igual que cuando sí se elige del catálogo -- para que se sienta como
  una selección completa y no como un campo opcional cualquiera.
- La foto de "frente" genérica de más abajo (que antes se mostraba
  siempre) ya no se repite cuando se está en modo manual, para no tener
  dos botones de subir foto a la vista pidiendo lo mismo.

No se hizo obligatoria la foto para publicar (sigue el mismo criterio que
ya tenía toda la app: las fotos nunca bloquean publicar, se pueden
agregar después) -- el cambio es de claridad y descubribilidad, no de
validación.

## 129. Piloto: apitcg.com como último respaldo del buscador de cartas

El dueño encontró una API key y pidió probar si convenía mudar el
catálogo de cartas a un API nuevo, con la condición explícita de que nada
de lo que ya funciona se rompiera. La key resultó ser de **apitcg.com**
(no de Scrydex, que se había mencionado en la sección 128 -- se confirmó
por descarte y con el spec OpenAPI real que mandó el dueño, ya que
docs.apitcg.com/api.apitcg.com están bloqueados desde este sandbox y no se
pudo probar la conexión en vivo desde aquí).

apitcg.com es un solo API que cubre 16 TCG (Pokémon, Magic, Yu-Gi-Oh,
Lorcana, One Piece, Riftbound y más) con un esquema consistente: cada
"producto" (carta o sellado) trae imagen, atributos, y precio real de
TCGplayer (`markets.tcgplayer.prices.market/mid/low`) en la misma
respuesta. Autenticación simple (un solo header `x-api-key`, sin el
"Team ID" aparte que sí pedía Scrydex) y cuenta gratis para conseguir la
key. A diferencia de pokemontcg.io/Scryfall/YGOPRODeck/lorcana-api (todas
sin llave o con llave opcional, llamadas directas desde el navegador),
esta key hay que mantenerla en secreto de verdad -- por eso NO se llama
directo desde `pokemonApi.js` como las demás.

**Qué se implementó** (piloto, no reemplazo):

- `api/tcgcsv.js` gana un tercer modo `fuente=apitcg`: reenvía la petición
  a `https://api.apitcg.com/{path}` mandando la key desde el servidor
  (`process.env.APITCG_API_KEY`, nunca una variable `VITE_...` -- esas sí
  quedan visibles en el bundle que le llega al navegador). Vive en el
  mismo archivo que ya multiplexaba Shopify y el experimento de Wikidex,
  para no pasar del límite de 12 funciones serverless del plan Hobby.
- `lib/pokemonApi.js`: `buscarCartasVisualApiTCG()` llama a ese proxy y
  traduce la respuesta al mismo formato interno que ya usan las demás
  fuentes. `buscarCartasCatalogo()` (el despachador que usa `CardPicker`
  al publicar) ahora la prueba como **último recurso**, después de la
  fuente principal de cada TCG (y, en Pokémon, después de TCGdex también)
  -- nunca antes, nunca en vez de. También se activa si la fuente
  principal falló de plano (no solo si volvió vacía), así una caída
  momentánea de Scryfall/pokemontcg.io/YGOPRODeck/lorcana-api ya no se ve
  igual que "no se pudo conectar" si apitcg.com sí responde.
- Si `APITCG_API_KEY` no está configurada en Vercel, o si apitcg.com
  falla, todo se degrada en silencio a como estaba antes -- ningún camino
  existente cambió de comportamiento.

**Pendiente, que solo puede hacer el dueño:**

1. Confirmar que la key es válida y suya (creada en apitcg.com/register).
2. Ponerla en Vercel → Settings → Environment Variables como
   `APITCG_API_KEY` (Production **y** Preview), sin el prefijo `VITE_`.
   No se pudo hacer desde aquí: la sesión de Claude Code no tenía en ese
   momento acceso a las herramientas de Vercel para leer/escribir
   variables de entorno.
3. Volver a desplegar (o esperar al siguiente push) y probar buscando algo
   que hoy falle en las demás fuentes (ej. una promo "First Partner", ver
   sección 128) para confirmar que de verdad está respondiendo.

**Qué NO se hizo todavía** (a propósito, para no arriesgar nada de golpe):
no se cambió el orden de ninguna fuente existente, no se agregó Riftbound
ni ningún TCG nuevo a `TCG_OPCIONES` (agregar un TCG completo implica
mucho más que tener sus datos: formularios, filtros, validaciones en toda
la app), y no se tocó la vista "Catálogo" (era → set → cartas) ni el
producto sellado (`TCGplayerPicker`/TCGCSV). Si después de probar el
piloto funciona bien, la migración completa (volverla la fuente principal,
o reemplazar TCGCSV/pokemontcg.io/Scryfall/YGOPRODeck/lorcana-api por
completo) sería el siguiente paso a decidir -- no se intentó en esta
pasada por no poder validar nada en vivo desde este sandbox.

## 130. apitcg.com pasa a ser la primera fuente (ya no la última)

El dueño ya puso `APITCG_API_KEY` en Vercel y probó buscando "First
Partner" -- seguía sin aparecer nada, y pidió que apitcg.com se probara
**primero** en vez de al final. Dos cambios:

1. **Orden invertido en `buscarCartasCatalogo`**: ahora apitcg.com se
   prueba primero para los 4 TCG con catálogo (Pokémon, Magic, Yu-Gi-Oh,
   Lorcana); si no responde o no encuentra nada, recién ahí se cae a la
   cadena de siempre (pokemontcg.io+TCGdex, Scryfall, YGOPRODeck,
   lorcana-api), que no se quitó ni se modificó -- sigue siendo el
   respaldo si apitcg.com falla o se queda sin cupo.
2. **Buscar por nombre de SET, no solo de carta**: "First Partner" es el
   nombre de la colección/set, no el de ninguna carta individual (las
   cartas se llaman "Charmander", "Squirtle", etc.) -- el filtro
   `?name=` de apitcg.com busca por nombre de PRODUCTO, así que buscar
   literal "First Partner" ahí nunca iba a encontrar nada, sin importar
   qué tan al día esté su catálogo. Se agregó un segundo intento
   (`buscarCartasVisualApiTCG` en `lib/pokemonApi.js`): si la búsqueda por
   nombre de carta no trae nada, se busca el texto contra la lista de
   sets del TCG (`GET /api/{tcg}/sets`, cacheada en memoria, pedida
   ordenada por fecha de salida descendente para que un set recién
   anunciado quede en los primeros 100 aunque el TCG tenga cientos en
   total) y, si hay coincidencia, se traen las cartas de ese set.

Sigue sin poder probarse en vivo desde este sandbox (api.apitcg.com y
encuentracartasmx.com están bloqueados aquí) -- el push que trae este
cambio también sirve como el redeploy que hace falta para que Vercel
recoja la variable de entorno nueva, así que después de este push es buen
momento para volver a probar "First Partner" (o cualquier carta del set)
en producción.

## 131. Fix: "Charmander 038" no encontraba la carta aunque "038" solo sí

El dueño probó en vivo con la key ya puesta: buscar solo "038" sí
encontraba la carta, pero "Charmander 038" (nombre + número juntos, como
la gente busca normalmente) no traía nada. Tres bugs encadenados en
`buscarCartasVisualApiTCG` (`lib/pokemonApi.js`):

1. El filtro `?name=` de apitcg.com no incluye el número de carta -- había
   que separar "Charmander" de "038" antes de buscar (con
   `extraerNumeroDeTexto`, ya existente) y ordenar los resultados por
   coincidencia de número después, en el cliente.
2. La búsqueda por nombre de set (sección 130) solo miraba el primer set
   que hiciera match (`.find()`), pero apitcg.com tiene **dos** sets
   distintos con "First Partner" en el nombre ("First Partner Pack" y
   "First Partner Collection 2026") -- cambiado a `.filter().slice(0, 3)`
   + `Promise.all` para traer cartas de hasta 3 sets que coincidan, no
   solo del primero.
3. El fetch por nombre solo pedía 24 resultados como máximo. Charmander
   tiene 74 impresiones distintas en apitcg.com, así que la variante
   "038" podía quedar fuera de esos primeros 24 (vienen en el orden que
   apitcg.com decida, no por número). Cambiado a pedir siempre el máximo
   que permite apitcg.com (`limit: "100"`) antes de ordenar por
   coincidencia de número y recién ahí recortar al límite pedido.

De paso, el dueño pidió que cuando se busca solo por nombre (sin número),
se muestre la lista completa en vez de recortarla a 8 o 24 -- ahora ese
caso regresa los 100 resultados sin recortar.

## 132. Rediseño "cozy": paleta, tipografía, grid orgánico y menos botones apretados

El dueño pidió cambiar la vibra de la web de "elegante/profesional" a
algo más acogedor y relajado, usando como referencia el logo ya
publicado y una paleta de marca (crema/café/tan con azul de acento).
Aprobó primero un mockup (canvas de Design Components) y después dio luz
verde a implementarlo directo en la app real ("me gusta implementa").

**Paleta y tipografía** (`src/theme.js`, `index.html`): los colores base
de `COLORS`, `MODOS_COLOR.dia/.noche` y `TIPOS_POKEMON_COLOR.default` se
reescribieron a la paleta cozy (crema `#E0CEBA`-ish, café `#433324`,
azules `#1F3A6E`/`#2A4C91`/`#6882AD` de acento). Como el resto de la app
lee `COLORS.xxx` en vivo en cada render (nunca copia el valor), cambiar
solo estas constantes recoloreó las ~700 referencias existentes sin
tocar componente por componente. Tipografía: "Space Grotesk" (títulos) y
"Rajdhani"/"Space Mono" (texto/precios) se reemplazaron por "Rye"
(títulos, sustituto de la fuente "Rock Bro" de la referencia -- no es
una Google Font real) y "Cabin" (texto), cargadas vía Google Fonts en
`index.html`.

**Bug encontrado antes de publicar** (no reportado por el dueño, se
encontró probando en vivo con Playwright): el sistema de acento por tipo
de Pokémon (`aplicarTema()`, feature de Amatista+) mezcla un color de
acento sobre la base con un porcentaje fijo -- ese porcentaje (22-34%)
estaba calibrado para la base azul marino vieja, y sobre la nueva base
color crema producía un gris-lavanda visible en vez de un tinte sutil.
Se bajó a 10-16%.

**Grid orgánico**: las cuadrículas de tarjetas (Inicio, Mercado,
Siguiendo, Subastas) pasaron de `grid` a `columns-N` (CSS multi-column,
con `break-inside-avoid` en cada tarjeta) para un acomodo escalonado en
vez de filas parejas. Se dejó **a propósito sin cambiar** la cuadrícula
de Catálogo (era → set → cartas): es para hojear cientos de cartas de
referencia rápido, y ahí una cuadrícula estricta y escaneable sirve
mejor que una escalonada.

**Filtro de TCG en Mercado**: la vista de Mercado ya filtraba
internamente por `tcgFiltro`, pero no tenía ningún control visible para
cambiarlo ahí (sí existía en "Directorio de tiendas"). Se agregó la
misma fila de pastillas de TCG que ya existía en Tiendas.

**Botones menos apretados (Mi tienda, Mi mercado, Admin)**: las filas de
acciones de cada publicación (Reintentar imagen, subir fotos, Boost,
Marcar vendida, Duplicar, Borrar) venían todas en una sola fila
`flex-wrap` junto con el nombre/precio, lo que se sentía apretado sobre
todo en móvil. Se reorganizaron en tarjetas de 2-3 filas: info arriba,
precios en medio, acciones abajo en su propia fila con separador --
aplicado en "Mis publicaciones" (Mercado), "Cartas sueltas" y "Producto
sellado" (Mi tienda), y en la lista "Todas las tiendas" del panel de
Admin (la única fila ahí que de plano no tenía `flex-wrap` y podía
desbordarse en móvil con sus 5 botones).

No se pudo probar visualmente con datos reales (Supabase de producción
está bloqueado desde este sandbox), pero sí se verificó que compila
(`npm run build`) y que el patrón replicado es idéntico al ya probado en
pantalla en el mockup aprobado.

## 133. Fix: favicon con caché atascada + error crudo de sesión expirada al publicar un anuncio

Dos reportes del dueño después del rediseño:

1. **El ícono de la pestaña seguía siendo el viejo.** El archivo ya
   estaba actualizado desde una sesión anterior (`logo-icon.png`), pero
   los navegadores cachean el favicon de forma especialmente agresiva --
   a veces ignoran hasta un recargado normal. Se le agregó `?v=2` a la
   URL en `index.html` para forzar que se trate como un recurso nuevo.
2. **Al publicar un anuncio (panel Admin) salió el error crudo `"exp"
   claim timestamp check failed`** en vez de un mensaje entendible. La
   causa: `sb()`/`sbWrite()` (`lib/supabase.js`) sí traducen cualquier
   error a un mensaje amable en español antes de mostrarlo (y de paso
   reintentan solos si la sesión expiró, refrescando el token) -- pero
   las tres funciones de subir imágenes a Storage (`subirAvatar`,
   `subirImagenAnuncio`, `subirImagenABucket`, esta última usada también
   por `subirImagenCarta`/`subirImagenMensaje`) se quedaron con el
   mensaje crudo de Supabase (`data.message`) sin traducir, así que
   cuando el token expiraba a medio subir una imagen, el texto interno
   del validador de JWT se le mostraba tal cual al usuario. Se corrigió
   para que las tres reporten el detalle real solo al equipo (vía
   `reportarError`, igual que `sb()`/`sbWrite()`) y le muestren al
   usuario un mensaje amable ("No se pudo subir la imagen. Intenta de
   nuevo en un momento."). De paso, `pareceSesionExpirada()` ahora
   también reconoce esta redacción específica del error de expiración
   (antes solo buscaba "jwt expired"/"invalid jwt"), para que el
   reintento automático con refresh_token se dispare también en este
   caso y no solo cuando el status es 401.

## 134. Fusión de Inicio y Mercado, botón Vender en el nav, y carrito flotante

El dueño pidió unificar la página principal (antes "Buscar") y el Mercado
en una sola pestaña "Inicio" (accesible dando clic al logo, que ya
navegaba ahí), liberando el lugar del nav que ocupaba "Mercado" para un
botón vistoso de "Vender", y bajar el carrito de un ícono discreto arriba
a un botón flotante llamativo.

- **Nav** (`navEsenciales`): se quitó la entrada `market`; `search` se
  renombró a "Inicio" en la etiqueta (el id interno `search` no cambió,
  para no tocar los ~30 lugares que ya navegan ahí). En su lugar hay un
  botón "Vender" con gradiente dorado (mismo tratamiento visual que el
  CTA del hero) que reutiliza la misma función `irAVender` que ya usaba
  ese botón: sin sesión abre el modal de cuenta, con sesión manda a "Mi
  tienda" o "Vender en el Mercado" según el tipo de cuenta.
- **Vista "Inicio"**: cuando no hay texto de búsqueda, el bloque resumido
  "🔥 Recién publicado" (10 tarjetas sin filtros) se reemplazó por el
  contenido completo que antes vivía en la pestaña Mercado -- carrusel de
  tiendas, tabs de tipo (Todo/Cartas/Sellado/Accesorios), panel de
  filtros completo (precio, idioma, condición, zona, orden) y el grid
  unificado de tienda+mercado. La vista `market` como tal se borró por
  completo (nada más navegaba ahí salvo el botón "Ver Mercado", que
  también se quitó por redundante).
- **Carrito**: el ícono del nav se quitó; ahora es un botón circular fijo
  abajo a la izquierda (no choca con el chat, que se ancla a la derecha),
  con el mismo doble halo `ringPulse` que ya usaba el badge de Boost
  (`theme.js`), pulsando cada ~1.8s para llamar la atención sin
  interrumpir.
- Verificado con Playwright en el dev server local (sin datos reales de
  Supabase, que sigue bloqueado desde este sandbox): el nav fusionado
  renderiza bien en escritorio y móvil, "Vender" abre el modal de cuenta
  cuando no hay sesión, y el carrito flotante se ve correctamente en la
  esquina inferior izquierda.

## 135. Fix: publicar/borrar una carta "reiniciaba" toda la pantalla de vender + grid 3×3 en carpetas + selección múltiple en Tus publicaciones/Cartas sueltas

El dueño probó el rediseño de Carpetas (sección 132) y reportó tres cosas:

1. **El bug más molesto**: publicar o borrar una carta (dentro o fuera de
   una carpeta) hacía que la pantalla de "Vender" se sintiera como si se
   recargara de cero, y en particular, agregar una carta dentro de una
   carpeta cerraba el modal de esa carpeta de golpe. Causa real: el
   `cargar()` de `MyMarketPanel` y `MyStorePanel` (las funciones que
   recargan "Tus publicaciones"/"Mi tienda" después de cualquier acción)
   ponían `loading=true` en CADA llamada, no solo en la carga inicial --
   y como ambos paneles tienen un `if (loading) return <Loading .../>`
   al principio de su render, cualquier acción de fondo (agregar, borrar,
   el `onPublicado` de una carpeta, subir una foto, marcar vendida, etc.)
   desmontaba TODO el panel un instante, incluyendo el modal de detalle
   de la carpeta que estuviera abierto -- exactamente el mismo bug que ya
   se había corregido dentro de `CarpetasPanel` en la sección 132, pero
   sin haberse propagado a sus dos componentes padre. Se aplicó el mismo
   arreglo (una ref `primeraCargaHecha` que solo deja bloquear la
   pantalla completa en la primera carga) en el `cargar()` de
   `MyMarketPanel` y de `MyStorePanel`.
2. **Grid 3×3 dentro de una carpeta**: la lista de cartas del modal de
   detalle de una carpeta pasó de una fila por carta a una cuadrícula de
   3 columnas (imagen + nombre + precio, checkbox superpuesto en la
   esquina) -- más parecida a hojear un álbum.
3. **Selección múltiple en "Tus publicaciones" y "Cartas sueltas"/
   "Producto sellado"**: mismo patrón que ya existía dentro de una
   carpeta -- checkbox por fila y una barra de "Duplicar"/"Borrar" que
   aparece en cuanto hay algo seleccionado, para editar varias
   publicaciones de un jalón en vez de una por una. Se mantuvo el
   formato de fila (no cuadrícula) en estas dos listas porque cada fila
   ya trae controles de edición en vivo (precio, fotos, boost, marcar
   vendida) que no caben bien en una tarjeta de cuadrícula compacta --
   si se prefiere también en cuadrícula ahí, es un ajuste aparte.

## 136. Separar las cartas de exhibición de las de venta en Tus publicaciones/Cartas sueltas

El dueño reportó que, al revisar o gestionar su inventario, las cartas
que solo están en exhibición (carpetas marcadas "🖼️ Solo exhibición",
`en_venta=false`) se mezclaban con las que sí están a la venta y
estorbaban constantemente. "Tus publicaciones" (Mercado) y "Cartas
sueltas" (tienda) ahora filtran por `en_venta` y muestran dos grupos:
la lista principal (en venta, como siempre) y, debajo, una sección
colapsada por default "🖼️ En exhibición (N)" que solo se despliega si
se le da clic -- misma fila/controles que la lista principal (incluida
la selección múltiple), solo separada para que no estorbe. No aplica a
"Producto sellado" porque ese tipo de publicación no se agrupa en
carpetas ni tiene el concepto de exhibición.

## 137. Link público por carpeta, ocultar cartas, y exportar CSV/Excel/PDF

El dueño pidió que cada carpeta tenga su propio link para compartir, que
el dueño pueda ocultar/marcar vendida/borrar una carta y que el link ya
lo refleje, un diseño propio para verla cómodamente, y exportar el
contenido a CSV/Excel/PDF desde su panel. Se confirmó con el dueño que
"en tiempo real" significa que el link siempre muestra el estado actual
de la base de datos al abrirse/recargarse -- no push instantáneo por
WebSocket (eso hubiera significado meter Supabase Realtime, una pieza de
infraestructura que hoy no usa ninguna otra parte de la app).

- **Migración `072_carpeta_oculta.sql`**: agrega `oculta boolean not
  null default false` a `inventario_tienda` y `mercado_listings`. Es un
  concepto nuevo y distinto de `en_venta` (exhibición): una carpeta de
  exhibición sigue siendo visible pero no vendible; una carta oculta no
  debe aparecer en NINGÚN lado público.
- **Ocultar/mostrar**: en el modal de detalle de una carpeta
  (`CarpetasPanel`), la barra de selección múltiple ganó dos botones más
  ("👁️ Ocultar" / "Mostrar") junto a Duplicar/Borrar -- mismo patrón de
  `PATCH ... ?id=in.(...)` que ya usaban esas dos acciones. Las cartas
  ocultas se siguen viendo en el panel del dueño (atenuadas, con una
  insignia "👁️ Oculta") para poder mostrarlas de nuevo, pero se filtran
  (`oculta=eq.false` / `!item.oculta`) tanto en la carpeta pública nueva
  como en `CarpetasStorefront` (la vitrina ya embebida en perfil/tienda).
  "Marcar vendida" y "Borrar" no necesitaron ningún cambio: ya existían
  y ya borran la fila de la base de datos (`MarcarVendidaModal` mueve el
  registro a `ventas` y borra el original), así que la carpeta pública
  -- que siempre re-consulta al abrirse -- ya los refleja solos.
- **Link público**: cada carpeta se comparte por su `id` (no tiene
  slug propio, un uuid ya es suficientemente no adivinable) vía
  `?carpeta=<id>`, mismo patrón que ya usan perfil (`?u=`) y tienda
  (`?tienda=`) -- `CopiarLinkBoton` (ya existente) en el encabezado del
  modal de detalle de la carpeta, y una rama nueva en el `useEffect` de
  deep-links que abre la vista `carpetaPublica` directo si la URL trae
  ese parámetro.
- **`CarpetaPublicaView`** (nuevo componente, standalone -- no depende
  de haber cargado el perfil/tienda completo primero): portada grande
  con el color/cintilla de la carpeta, datos del dueño con link a su
  perfil/tienda, y una cuadrícula tipo masonry de las cartas visibles
  (mismo estilo que Mercado/Inicio) -- cada una abre el detalle normal
  (`abrirDetalle`, con Contactar/Carrito ya integrados ahí, sin tocar
  nada de eso).
- **Exportar CSV/Excel/PDF**: tres botones en el modal de detalle de la
  carpeta, usando `cardsCarpeta` (ya cargado, sin pedir nada nuevo a la
  BD). CSV se arma a mano con un `Blob`+`<a download>` (sin librería
  nueva); Excel usa `xlsx` (`XLSX.utils.json_to_sheet` +
  `XLSX.writeFile`, ya es dependencia del proyecto -- hoy solo se usaba
  para LEER un archivo subido en el Importador Masivo, aquí se usa por
  primera vez para escribir); PDF usa `jspdf` con el mismo patrón de
  tabla manual (`doc.text` en columnas fijas + paginación) que ya usa el
  reporte de Modo Evento. Ambas se cargan con `import()` dinámico, igual
  que ya hacían esas dos librerías, para no engordar el bundle principal.

**Pendiente, que solo puede hacer el dueño**: correr
`072_carpeta_oculta.sql` en Supabase → SQL Editor antes de que
ocultar/mostrar funcione en producción (sin la migración, esas dos
acciones van a fallar al intentar guardar la columna que todavía no
existe -- el resto de esta sección, incluido el link público y los
exports, no depende de la migración y ya funciona sin ella).

## 138. Fix: portada de carpeta encimada en la vista pública + 8 TCG nuevos vía apitcg.com

Dos pendientes de la sesión anterior:

1. **Fix visual**: `CarpetaCover` forzaba `aspect-[3/4]` siempre; en la
   carpeta pública se envolvía en un `<div style={{height:140}}>`
   esperando que eso la hiciera un banner angosto, pero `aspect-ratio`
   ignora una altura puesta en el padre -- se renderizaba casi cuadrada
   (a partir del ancho completo del contenedor) y su cintilla terminaba
   encimada con el título/contador de abajo. Se le agregó un prop
   opcional `alto` que, cuando se pasa, usa una altura fija en vez de
   aspect-ratio -- los demás usos (carrusel, miniatura del modal) siguen
   igual, sin `alto`.
2. **8 TCG nuevos**: el dueño pidió agregar Cardfight Vanguard, Digimon,
   Dragon Ball Super Fusion World, Dragon Ball Super Masters, Flesh and
   Blood, Gundam, hololive y Riftbound (de los 16 que cubre apitcg.com --
   ver sección 129), con los slugs que confirmó directo desde la
   documentación de apitcg.com. A diferencia de Magic/Yu-Gi-Oh/Lorcana
   (que tienen su propia fuente aparte, con apitcg.com solo de respaldo),
   estos 8 dependen ÚNICAMENTE de apitcg.com -- no tienen ningún otro
   catálogo integrado. Como `buscarCartasCatalogo`/`CardPicker` ya eran
   100% genéricos (nada hardcodeado a un TCG en particular), agregarlos
   fue solo:
   - `theme.js`: 8 entradas nuevas en `TCG_OPCIONES` (aparecen solas en
     cualquier selector de TCG de la app) y en `TCG_CON_CATALOGO` (para
     que usen el buscador real -- `CardPicker` -- en vez de cortarse a
     `TCGplayerPicker`/TCGCSV, que no tiene estos juegos).
   - `lib/pokemonApi.js`: 8 entradas nuevas en `TCG_SLUG_APITCG` (nuestra
     clave interna → slug de apitcg.com).
   - Nada más -- esto también responde lo que el dueño pidió antes ("que
     todo lo de carpetas/el nuevo API sirva para los demás TCG"): el
     modo manual de Carpetas ("Agregar cartas sin foto") ya usaba
     `CardPickerUniversal` de forma genérica, así que ya funciona con
     estos 8 sin tocar nada de Carpetas.
   - **Lo que sigue sin cubrir a propósito** (mismo límite que ya tenía
     One Piece, no es nuevo): producto sellado y la pantalla "Catálogo"
     (era → set → cartas) siguen sin datos para estos 8 -- ninguno tiene
     categoría en TCGCSV ni un dispatcher de sets propio, así que
     simplemente se degradan a "sin resultados"/vacío en vez de romperse
     (`categoriaIdTCGplayer`/`obtenerErasYSetsCatalogo` ya devuelven
     null/`[]` con gracia para cualquier TCG que no reconozcan). Tampoco
     se tocó la detección por foto con IA de Carpetas (`buscarCartaTCGdex`
     + `/api/carpetas/detectar`) -- sigue siendo Pokémon-only, ya que usa
     TCGdex específicamente; extenderla a estos TCGs sería un trabajo
     aparte, no cubierto por este cambio.

## 139. Modo Evento: método de pago, intercambios y cartas que entraron (compras)

El dueño pidió que en Modo Evento cada transacción pueda indicar si el
pago fue efectivo/transferencia/tarjeta, que se pueda marcar como
intercambio (con o sin dinero extra en cualquier dirección), y que se
pueda registrar que compró una carta en el evento -- todo reflejado en
el resumen y el PDF junto a lo que ya existía.

**Migración nueva:** `073_evento_pagos_intercambios.sql` (el dueño debe
correrla en Supabase → SQL Editor antes de que esto funcione en
producción):
- `evento_ventas` gana `metodo_pago` (efectivo/transferencia/tarjeta),
  `tipo_operacion` (`venta` default o `intercambio`), e
  `intercambio_ajuste` (el dinero extra que cambió de manos en un
  intercambio -- positivo si el vendedor lo recibió, negativo si lo dio,
  null si fue trueque puro).
- Tabla nueva `evento_adquisiciones`: cada fila es una pieza que ENTRÓ
  al inventario durante el evento -- compra directa (`costo` = lo que
  pagó) o la carta recibida en un intercambio (`origen_venta_id` apunta
  a la venta; `costo` queda en 0 porque el dinero de ese intercambio ya
  se contó una vez en `intercambio_ajuste` de esa venta, para no
  duplicarlo).

**UI:** al marcar una pieza como vendida (tanto al agregarla ya vendida
como al editar una existente) aparece un componente compartido
(`CamposOperacionEvento`) con:
- Venta / Intercambio (botones).
- Si es venta: selector de método de pago (opcional).
- Si es intercambio: si hubo dinero extra y en qué dirección ("me
  dieron" / "yo di"), su monto y método, y un campo opcional para anotar
  qué carta recibió a cambio.

Nueva sección "🛍️ Cartas que entraron" (mismo patrón que Gastos) para
registrar compras sueltas, con su propio botón de borrar.

**Semántica contable** (decisión propia, no confirmada explícitamente
con el dueño más allá de lo que pidió -- revisar con uso real): en una
fila de intercambio, el ingreso que cuenta para ganancias es solo
`intercambio_ajuste` (puede ser negativo), no `precio_venta × cantidad`
-- `precio_venta` queda como "valor estimado" opcional, solo para
referencia. El costo de la pieza vendida se sigue restando siempre
(salió del inventario de cualquier forma). El resumen, el desglose por
día y el PDF ahora muestran "Compras" (lo que entró) junto a Ventas y
Gastos.

## 140. Fix: importar inventario a Modo Evento por carpeta completa, no pieza por pieza

El dueño reportó que al importar su inventario a un evento tenía que
marcar el checkbox de cada producto uno por uno (tardadísimo si tiene
muchos), y que el campo "Carpeta" de esa pantalla en realidad no
buscaba nada -- era solo una etiqueta de texto libre que se pegaba por
igual a todo lo que se importara en ese momento, sin relación con las
carpetas reales del usuario.

Se reemplazó la lista plana de checkboxes por una agrupada por carpeta
real: cada carpeta del usuario (`carpetas` con su `carpeta_id` en
`mercado_listings`/`inventario_tienda`) aparece como una sola fila con
un icono de color, su nombre, cuántas piezas tiene, y un solo checkbox
que selecciona/deselecciona toda la carpeta de un jalón (con estado
indeterminado si solo hay algunas marcadas); un botón junto al nombre
la expande para marcar piezas sueltas si hace falta afinar. Todo lo que
no pertenece a ninguna carpeta (incluye producto sellado, que nunca
tuvo carpeta) cae en un grupo genérico "📦 Inventario (fuera de
carpetas)" con el mismo comportamiento. El buscador por nombre se
mantiene y sigue filtrando dentro de los grupos.

De regalo, ya no hace falta escribir a mano el nombre de la carpeta al
importar: cada pieza importada guarda automáticamente el nombre de su
carpeta real (o queda sin carpeta) en el registro de la venta del
evento, en vez de depender de que el usuario tecleara algo.

## 141. Inventario del evento agrupado por carpeta: grid horizontal de 3 de alto

Complemento directo de la sección 140: ahora que importar una carpeta
completa le pone a cada pieza el nombre real de su carpeta, el
"📦 Inventario del evento (pendiente de vender)" agrupa automáticamente
por esa etiqueta -- cada carpeta (con piezas importadas o agregadas a
mano con el mismo nombre) aparece como una sección plegable
("📁 Nombre (N)"), y al desplegarla se ve un grid de 3 cartas de alto
con scroll horizontal (`grid-flow-col grid-rows-3`, no una lista
vertical) -- se puede tener varias carpetas desplegadas a la vez, cada
una con su propio scroll lateral. Cada tarjeta tiene un botón "Vender"
que abre el mismo formulario de edición de siempre (venta/intercambio/
método de pago) justo debajo del grid, y un botón de borrar. Al
importar una carpeta se despliega sola automáticamente. Lo que no tiene
carpeta se sigue mostrando como lista normal, sin cambios.

## 142. Modo Evento: buscar la carta exacta recibida en un intercambio + "Te costó" explícitamente opcional

Dos ajustes al flujo de intercambios de la sección 139:

1. **Buscar la carta exacta recibida a cambio.** El campo "¿Qué
   recibiste a cambio?" ya no es solo texto libre -- ahora usa el mismo
   buscador de catálogo del resto de la app (`CardPickerUniversal`, con
   su propio selector de TCG independiente del de la carta que se
   vendió/cambió, porque el intercambio puede cruzar juegos distintos),
   con el mismo patrón de "¿No la encuentras? Escribirlo a mano" como
   respaldo si no está en el catálogo. La carta elegida guarda también
   su imagen, que ahora viaja hasta `evento_adquisiciones.imagen_url`
   (la columna ya existía desde la migración 073, solo no se estaba
   llenando) y se ve junto al nombre en "🛍️ Cartas que entraron" y en el
   PDF.
2. **"Te costó" ya se veía como opcional en el código** (nunca fue
   obligatorio, se guarda como 0 si se deja vacío) pero no lo decía en
   la pantalla y confundía -- ahora la etiqueta dice explícitamente
   "Te costó (opcional)" tanto al agregar como al editar una pieza.

Sin migración nueva -- ambos cambios usan columnas que ya existían.

## 143. Migrar a apitcg.com: artista + descripción de cartas y sellado, selector visual de sellado, traducción opcional

El dueño pasó el OpenAPI completo de apitcg.com y pidió que cada
publicación (carta o sellado) incluya el artista/ilustrador y la
descripción (texto de reglas -- ataques, habilidades -- en cartas; qué
trae la caja, en sellado), que el selector de producto sellado sea
visual (cuadrícula por nombre, o logos de set y dentro sus productos), y
un botón opcional de traducir la descripción (viene en inglés).

**Migración nueva:** `074_artista_descripcion_api.sql` -- agrega
`artista`, `descripcion_api` y `descripcion_api_es` a `mercado_listings`,
`inventario_tienda` y `sellado_tienda` (`artista` queda siempre null en
sellado, no aplica ahí).

**De dónde salen los datos:** `attributes.Artist` y `attributes.Description`
viven en el mismo objeto `Product` de apitcg.com para cartas (`type=card`)
y sellado (`type=sealed`) -- mismo endpoint `/api/products`. El proxy
(`apitcgProxy` en `api/tcgcsv.js`) ya pasaba la respuesta cruda sin
recortar; solo hacía falta que el cliente empezara a leer esos dos
campos. `mapearProductoApiTCG` (`src/lib/pokemonApi.js`) ahora también
devuelve `artista` y `descripcionApi` (limpio de HTML ligero con el
helper nuevo `limpiarHtmlLigero` -- no hay ningún sanitizador de HTML en
el repo, así que la descripción se guarda como texto plano en vez de
arriesgar un `dangerouslySetInnerHTML`).

**Selector visual de sellado:** nuevo componente `SelladoPickerVisual`
(reemplaza a `TCGplayerPicker` en la rama `soloSellado` de
`CardPickerUniversal`) -- dos modos: buscar por nombre (cuadrícula de
imágenes, vía `buscarSelladoVisualApiTCG`) o buscar por set (cuadrícula
de logos, vía `obtenerSetsVisualesApiTCG`, con un ícono de color de
respaldo si el set no trae logo -- no todos lo tienen -- y dentro del
set, la cuadrícula de sus productos vía `buscarSelladoDeSetApiTCG`).
`TCGplayerPicker`/TCGCSV se conserva como respaldo manual ("¿No lo
encuentras? Buscar en TCGplayer") por si apitcg.com todavía no tiene un
producto en particular -- el catálogo de sellado de apitcg.com es el
mismo de TCGplayer (las imágenes vienen del mismo
`tcgplayer-cdn.tcgplayer.com`), así que no debería perderse cobertura.
De paso, One Piece se agregó a `TCG_CON_CATALOGO` (`theme.js`) -- ya
tenía a apitcg.com como fuente para cartas sueltas pero por un descuido
seguía usando el picker de texto en vez del visual.

**Al publicar:** los formularios de carta individual (`mercado_listings`),
carta de tienda (`inventario_tienda`) y sellado de tienda
(`sellado_tienda`) guardan `artista`/`descripcion_api` de lo que devuelve
el picker, y muestran una vista previa chica (sin traducir -- eso vive en
la vista pública) para que el vendedor confirme que es la publicación
correcta.

**Al ver el detalle (comprador):** `CartaDetalleView` +
`cargarDetalleListing` muestran "🎨 Ilustrado por..." y la descripción,
con un botón "🌐 Traducir". La traducción usa el endpoint gratuito de
Google Translate (sin API key) vía una rama nueva `fuente=traducir` en
`api/tcgcsv.js` -- requiere sesión válida (cualquier usuario logueado,
no solo el dueño), y si viene `tabla`+`id` cachea el resultado en
`descripcion_api_es` con el **service role key** (server-side, sin RLS)
para que el siguiente visitante no vuelva a gastar la traducción -- el
cacheo tiene que ser server-side porque cualquier visitante puede
traducir, no solo el dueño de la publicación.

**Migrar lo ya publicado:** nueva rama `fuente=migrar-descripciones` en
`api/tcgcsv.js` (gateada a `perfiles.es_admin`, mismo patrón de
`api/admin/usuarios.js`) -- solo cubre publicaciones cuyo `card_api_id`
ya tiene el prefijo `apitcg:` (se buscaron con apitcg.com como fuente),
porque esas se pueden volver a consultar directo por `/api/products/{id}`.
Las de fuentes viejas (pokemontcg.io, TCGdex, Scryfall, YGOPRODeck,
lorcana-api, TCGCSV) o escritas a mano quedan fuera de este primer paso
-- no hay forma confiable de volver a encontrarlas sin una búsqueda por
nombre con riesgo de match incorrecto. Procesa lotes de 25 con cursor
(idempotente: una fila ya migrada, o que apitcg.com no tiene datos para
ella, no se vuelve a consultar en la misma pasada). Nuevo tab
"Migrar API" en `AdminPanel` con un botón por tabla que llama este
endpoint en bucle mostrando el avance en vivo, y se puede detener en
cualquier momento -- **apitcg.com tiene límite de peticiones al mes**, así
que esto lo dispara el dueño a mano, a su ritmo, nunca automático.

No se creó ningún archivo nuevo bajo `api/` -- Vercel Hobby ya tenía las
12 funciones serverless topadas, así que todo esto vive como ramas
`?fuente=` nuevas dentro de `api/tcgcsv.js`, que ya tenía esa forma de
despacho.

## 144. Respaldo automático a TCGplayer cuando apitcg.com no trae sellado

Para cartas sueltas de Pokémon/Magic/Yu-Gi-Oh/Lorcana, `buscarCartasCatalogo`
ya caía solo a la fuente propia de cada uno si apitcg.com regresaba vacío
(sin resultados, caído, o cuota mensual agotada -- las tres se ven igual:
un arreglo vacío). `SelladoPickerVisual` (sección 143) tenía el mismo
respaldo a `TCGplayerPicker`/TCGCSV pero como botón manual -- ahora
también es automático: si la búsqueda por nombre no trae nada, si no hay
sets para ese TCG, o si un set no tiene producto sellado en apitcg.com
todavía, se cae solo al buscador de TCGplayer sin que el usuario tenga
que darle clic a nada. El link "← Volver a la búsqueda visual" sigue ahí
por si quiere reintentar (limpia la búsqueda vacía al volver, si no, el
mismo efecto automático lo regresaría de inmediato al respaldo). El botón
manual "¿No lo encuentras? Buscar en TCGplayer" también se conserva, para
cuando apitcg.com sí trae resultados pero no el producto exacto que se
busca (ahí no hay nada "vacío" que detectar automático).

Sigue sin haber ningún respaldo para One Piece (cartas sueltas) ni para
los 8 TCG que dependen únicamente de apitcg.com (Cardfight Vanguard,
Digimon, Dragon Ball Super Fusion World, Dragon Ball Super Masters, Flesh
and Blood, Gundam, hololive, Riftbound) -- apitcg.com es su único
catálogo real, no hay a qué otra API caer si se le acaba la cuota.

## 145. Botón flotante de chats (con no leídos) + notificaciones movidas a la esquina

El dueño pidió que los mensajes se abrieran desde un botón flotante
llamativo (como el del carrito) en vez de tener que encontrar el ícono de
"Mensajes" arriba, con un numerito de mensajes sin leer en un color que
siga el tema de Apariencia -- y de paso movió también las notificaciones
a otro botón flotante, en la esquina superior derecha, con un ícono que
más adelante va a poder cambiar por TCG (pokébola, Yu-Gi-Oh, Magic...).

**Migración nueva:** `075_mensajes_leido.sql` -- agrega `leido boolean
not null default false` a `mensajes` (nunca había existido el concepto de
"leído"; antes solo se listaban todos). Un índice parcial
(`where leido = false`) para que contar los no leídos sea barato.

**Botón de chats** (`fixed bottom-4 left-20`, junto al carrito, mismo
halo `ringPulse` que ya usaba el carrito pero en `COLORS.violeta` para no
confundirse): abre `setView("inbox")`, la misma vista de siempre, solo
cambia cómo se llega. El numerito usa `COLORS.azulPalido` -- ese color
sí cambia con el modo/tipo elegido en Apariencia (`aplicarTema` en
`theme.js` lo muta en vivo), así que el badge "se personaliza" solo, sin
tener que construir nada nuevo para eso.

**No leídos:** `cargarMensajesNoLeidos()` (nuevo, en el componente raíz)
consulta `mensajes?para_perfil_id=eq.<uid>&leido=eq.false` en cuanto hay
sesión (independiente de haber visitado la bandeja alguna vez).
`cargarInbox()` también actualiza el numerito gratis con las filas que ya
trae. `ChatModal` marca como leídos los mensajes de esa conversación al
abrirla (`PATCH ... leido=true`) y avisa al botón vía la nueva prop
`onLeido` para que baje el numerito de inmediato.

**Se quitó del header:** "Mensajes" de `navEsenciales` y el ícono de
`NotificationBell` (ya no vive ahí).

**Notificaciones:** `NotificationBell` ahora es un botón flotante propio
(`fixed top-20 right-4`, debajo del header para no encimarse con el
avatar/menú) en vez de un ícono dentro del `<nav>` -- la lógica interna
(el panel, marcar leídas, etc.) no cambió, solo dónde vive el botón. Su
ícono sale de un componente nuevo, `IconoNotificacionFlotante`, que hoy
solo devuelve la campana genérica de Lucide pero es el único lugar que
hay que tocar cuando lleguen los íconos por TCG que va a dar el dueño
(mapear el tema elegido a una URL de imagen ahí, en vez de un ícono
fijo).

## 146. Rediseño de navegación exclusivo de celular: cintilla de abajo + carrito/chats junto al logo

El dueño pidió que en celular (nunca en escritorio) los botones de arriba
(Inicio, Tiendas, Catálogo, Vender) se movieran a una cintilla de abajo
con ícono arriba y texto abajo, estilo app nativa, y que el carrito y los
chats (los botones flotantes grandes que ya existían) se movieran a un
desplegable chico junto al logo para no chocar con la cintilla nueva.

Todo es puramente responsivo (`sm:hidden`/`hidden sm:flex` de Tailwind) --
nada de esto toca la base de datos ni cambia ningún destino, solo dónde
se tocan.

- **`CintillaMovilAbajo`** (nueva, junto a `NotificationBell`): barra fija
  abajo (`sm:hidden`, con `env(safe-area-inset-bottom)` para el notch),
  con los mismos 4 destinos que antes vivían arriba
  (`search`/`directory`/`catalogo` + `irAVender`), ícono arriba y label
  abajo, con un fondo redondeado detrás del ícono activo.
- **`CintillaMovilCarritoChats`** (nueva, junto al logo dentro del mismo
  grupo flex -- así nunca lo tapa, la propia flexbox los acomoda uno junto
  al otro): colapsada muestra el ícono de carrito (y el de chats, si hay
  sesión) en miniatura, y parpadea (`pulseGlow`) si hay algo en el
  carrito o mensajes sin leer. Al tocarla se despliega hacia el lado
  mostrando los dos botones completos con su numerito -- igual que los
  botones flotantes de escritorio, pero en un menú chico en vez de dos
  botones grandes abajo (que en celular ya no caben, ese espacio ahora es
  de la cintilla de navegación).
- Los botones flotantes de escritorio (carrito, chats) y el `<nav>` de
  arriba (Vender + Inicio/Tiendas/Catálogo) se conservan intactos, solo
  se les agregó `hidden sm:flex` -- en escritorio no cambió nada.
- `ChatModal` (el chat de una conversación abierta) se subió de
  `bottom-0` a `bottom-16` en celular (`sm:bottom-4` sigue igual en
  escritorio) para que, incluso minimizado, no tape la cintilla de
  navegación de abajo.
- `<main>` gana `pb-24` en celular (`sm:py-10` sigue igual en escritorio)
  para que la cintilla fija de abajo no tape lo último del contenido.

Verificado con capturas en viewport de celular (390×844) contra el dev
server local: la cintilla de abajo se ve y navega correctamente, y el
desplegable de carrito/chats se abre junto al logo sin taparlo y sin
mostrar "Chats" cuando no hay sesión (mismo criterio que el botón
flotante de escritorio).

## 147. Ícono de notificaciones personalizable por TCG (Pokémon, Magic, One Piece, Riftbound, Lorcana, Yu-Gi-Oh!)

Seguimiento de la sección 145: `IconoNotificacionFlotante` dejó de ser
siempre la campana genérica -- ahora es elegible en Apariencia.

- **`theme.js`**: nueva llave `TEMA_ICONO_KEY` (mismo patrón que
  `TEMA_MODO_KEY`/`TEMA_TIPO_KEY`, se guarda en `localStorage`).
- **`public/notificaciones/*.png`**: los 6 emblemas oficiales que mandó
  el dueño (`pokemon.png`, `magic.png`, `onepiece.png`, `riftbound.png`,
  `lorcana.png`, `yugioh.png`), 500×500, silueta negra sobre transparente.
  Un primer intento de mandarlos pegándolos directo en el chat no llegó
  como archivo a este entorno (no había forma de leerlos del disco, así
  que se intentó con aproximaciones dibujadas a mano -- descartadas por
  completo en esta misma sesión en cuanto sí se pudieron recuperar los
  archivos reales, extrayéndolos del propio historial de la conversación
  ya que ahí sí quedan embebidos).
- **`App.jsx`**: `ICONOS_NOTIFICACION_TCG` (lista `{key, label, img}`,
  junto a `NotificationBell`) es el único lugar que hay que tocar para
  agregar un TCG nuevo al selector -- solo hace falta su PNG en
  `public/notificaciones/` y una entrada aquí. `EmblemaNotificacionImg`
  envuelve cada PNG en una "moneda" clara fija (no cambia con el tema)
  para que la silueta negra se siga viendo bien sin importar si el modo
  día/noche o el tinte por tipo de Pokémon oscurece el fondo del botón.
  `IconoNotificacionFlotante` lee `TEMA_ICONO_KEY` de `localStorage` en
  cada render (igual que el logo día/noche) y muestra el emblema
  correspondiente, o la campana genérica si no hay ninguno elegido.
- **`AparienciaView`**: sección "Ícono de notificaciones" (gratis para
  cualquier plan, como el modo día/noche) con un botón por emblema; al
  elegir uno se guarda y se aplica de inmediato (mismo `onCambio()` →
  `setTemaVersion` que ya usan modo/tipo para forzar que toda la app
  vuelva a leer `localStorage`).

Verificado: los 5 PNG se decodificaron y se confirmaron 500×500 con
fondo transparente antes de copiarlos al repo, y se armó una previsualización
fuera de la app (Playwright, sobre el color de fondo real del botón) para
confirmar que la "moneda" clara detrás de cada emblema se ve bien en modo
noche. El flujo completo dentro de la app (elegir en Apariencia → ver el
cambio en el botón flotante) no se pudo probar de punta a punta en este
sandbox porque Apariencia requiere sesión iniciada y aquí no hay forma de
loguearse contra el Supabase real.

## 148. Integración con Limitless TCG en "Armar Mazo": importar decklists reales, marcar qué tienes, y pestaña "Competitivo"

Limitless TCG (`play.limitlesstcg.com`) es la API pública de resultados de
torneos de Pokémon TCG (entre otros juegos). Casi toda su API es pública
sin API key (solo `/games/{id}/decks`, reglas de arquetipos, pide una key
gated que no usamos aquí). Se integró en tres frentes:

- **`api/tcgcsv.js`**: nueva rama `?fuente=limitless&path=...` (mismo
  patrón que `apitcg`/`shopify`/`wikidex` -- Vercel Hobby sigue en el
  límite de 12 funciones, así que se agregó a este archivo compartido en
  vez de uno nuevo). Lista blanca de rutas: solo `tournaments*` y
  `games*`. Cachea 15 minutos (`Cache-Control: s-maxage=900`).
- **`supabase/migrations/076_mazos_limitless.sql`** (⚠️ falta correrla en
  Supabase): `mazo_cartas.tengo` (boolean, uso general -- cualquier
  carta de cualquier mazo se puede marcar como "ya la tengo", no solo
  las importadas) y `mazos.limitless_tournament_id` /
  `mazos.limitless_player` (trazabilidad de qué mazo se importó de
  dónde, solo informativo).
- **`src/lib/pokemonApi.js`**: `parsearDecklistLimitless(decklist)` lee
  el campo `decklist` de un standing de Limitless. La documentación
  oficial **no expande la forma exacta de ese JSON** para Pokémon TCG
  (dice que "depende del juego"), así que el parseo es deliberadamente
  defensivo: recorre cualquier propiedad-array del objeto (la forma más
  probable, agrupado en categorías tipo Pokémon/Trainer/Energy) y si no
  encuentra nada así, intenta tratar el propio `decklist` como array
  plano. Si de plano no reconoce nada, regresa `[]` y quien importa ve
  "no se pudo leer este decklist" en vez de tronar. `resolverCartaLimitless`
  busca cada carta contra el catálogo ya integrado
  (`buscarCartasCatalogo`) para conseguirle `card_api_id`/imagen; si no
  encuentra nada confiable, la carta se guarda solo con su nombre (igual
  que ya hacía el importador de texto plano).
- **`App.jsx` -- `importarDecklistLimitlessEnMazo`**: función compartida
  (no de componente) que trae el standings de un torneo, encuentra al
  jugador, parsea y resuelve su decklist, y reemplaza las cartas del
  mazo (con confirmación si ya tenía cartas) -- la usan tanto "Mis
  mazos" (botón "🏆 Importar desde Limitless TCG", pide ID de torneo +
  jugador, solo visible si el mazo es de Pokémon) como "Competitivo"
  (crea el mazo de una vez a partir de un arquetipo).
- **Marcar qué tienes / buscar quien vende lo que falta**: cada carta del
  mazo (en "Mis mazos") tiene un checkbox "Tengo esta carta" (PATCH
  directo a `mazo_cartas.tengo`). Si no la tienes y sí tiene
  `card_api_id` (viene del catálogo, no solo nombre suelto), un botón
  "🔍 Buscar quien la vende" busca en `mercado_listings`/
  `inventario_tienda` activos por `card_api_id` exacto (a diferencia del
  buscador viejo de "Buscar en el mercado", que hace match de nombre por
  substring) -- si hay una sola coincidencia abre su publicación directo,
  si hay varias las lista para elegir, si no hay ninguna avisa que nadie
  la vende todavía.
- **Pestaña nueva "🏆 Competitivo"** (`CompetitivoView`, tercera pestaña
  de `ArmarMazoSection` junto a "Mis mazos" y "Buscar en el mercado"):
  lista los torneos recientes de Pokémon TCG de Limitless
  (`tournaments?game=PTCG&limit=15`, sin sesión requerida -- son
  endpoints públicos). Al abrir un torneo, trae su `standings` una sola
  vez y agrupa por `deck.id` (el arquetipo que Limitless mismo detecta)
  para calcular, en el cliente, popularidad (% de jugadores que lo
  llevaron) y winrate (wins acumulados de esos jugadores) -- Limitless no
  entrega esto precalculado, pero es barato sacarlo de una respuesta que
  ya es liviana (no hace falta tabla de caché propia ni cron para esta
  primera versión). Cada arquetipo tiene un botón "Importar este mazo"
  que trae el decklist del jugador con mejor posición de ese arquetipo en
  ese torneo -- ver la sección se puede sin plan, pero importar sigue
  gateado a Ultraball+ (`info.mazoBuilder`, mismo criterio que crear
  mazos a mano).

**Limitación conocida y honesta**: como el shape exacto del `decklist` en
JSON no está 100% confirmado por la documentación oficial, conviene
probar una importación real en cuanto esto esté en producción y avisar
si algo no se lee bien, para poder ajustar `parsearDecklistLimitless`
sin tener que tocar nada más. Limitado a mazos de Pokémon TCG únicamente
(Limitless no cubre los otros TCGs de la app).

Verificado con `npm run build`. No se pudo probar contra datos reales de
Limitless ni de Supabase en este sandbox (ambos APIs son inalcanzables
desde aquí) -- falta correr `076_mazos_limitless.sql` en Supabase y
probar una importación real.

## 149. La integración con Limitless TCG (sección 148) baja a Zafiro en adelante

`PLAN_INFO` (en `theme.js`) gana una bandera nueva, `competitivo`, en
`true` desde Zafiro (`superball`) en adelante (`false` solo en Cuarzo).
El Deck Builder manual completo (crear un mazo a mano, agregarle cartas
una por una con el buscador visual, importar/exportar como texto) sigue
siendo exclusivo de Amatista en adelante (`info.mazoBuilder`, sin
cambios) -- lo que se movió a Zafiro es específicamente lo nuevo de la
sección 148:

- Entrar a "Mis mazos" para ver/abrir tus propios mazos (antes el tab
  entero estaba bloqueado si no tenías Amatista+).
- El botón "🏆 Importar desde Limitless TCG" dentro de un mazo abierto.
- El checkbox "Tengo esta carta" y el botón "🔍 Buscar quien la vende".
- La pestaña "🏆 Competitivo" ya se podía **ver** sin plan (torneos/
  popularidad/winrate son de solo lectura) -- ahora **importar** un mazo
  desde ahí pide Zafiro (`info.competitivo`) en vez de Amatista
  (`info.mazoBuilder`).

Un usuario Zafiro sin Amatista que entra a "Mis mazos" ve la lista de
sus mazos (vacía hasta que importe uno desde Competitivo, o desde el
botón de Limitless dentro de un mazo que ya tenga) pero **no** ve el
formulario de "+ Nuevo mazo" a mano, ni "Agregar carta", ni
"Importar/exportar" de texto, ni los botones +/- de cantidad (se
reemplazan por un aviso invitándolo a importar desde Competitivo o a
mejorar a Amatista) -- todo eso se queda gateado a `info.mazoBuilder`
como antes. `PLAN_INFO.superball.beneficios` ya trae la línea nueva
("Competitivo: importa mazos reales de torneos...") para que se vea
sola en la página de Planes, sin tocar nada ahí.

Verificado con `npm run build`.

## 150. "Competitivo" se muda a su propia sección de Comunidad, con sub-pestañas Torneos/Decks

La pestaña "🏆 Competitivo" (sección 148) dejó de vivir dentro de "Armar
Mazo" -- ahora es su propia sección top-level dentro del menú Comunidad
(`navGrupos`, item nuevo `{ id: "competitivo", label: "Competitivo", icon:
Trophy }`, con el ícono `Trophy` nuevo en `lib/icons.jsx`), separada de
`ArmarMazoSection` (que vuelve a sus 2 pestañas de siempre: Mis mazos /
Buscar en el mercado). `CompetitivoSection` (`App.jsx`) tiene dos
sub-pestañas propias:

- **🏆 Torneos**: exactamente el flujo de antes -- lista de torneos
  recientes de Pokémon TCG, al abrir uno se ven sus arquetipos con
  popularidad/winrate calculados de su `standings`.
- **🃏 Decks**: ranking agregado de arquetipos entre los últimos
  `TORNEOS_MUESTRA_DECKS` (6) torneos -- una sola pasada de
  `Promise.all` sobre sus standings al entrar a la pestaña (6 peticiones,
  cada una cacheada 15 min por el proxy, así que reabrir la pestaña
  dentro de esa ventana no vuelve a pegarle a Limitless). Trae un
  buscador de texto (por nombre de arquetipo) y un select de orden
  (más/menos popular, mejor/peor winrate) -- todo cálculo y filtro es en
  el cliente sobre los datos ya agregados, sin peticiones extra.

En ambas pestañas, cada arquetipo se puede expandir ("Ver cartas ▼") para
ver su decklist real de forma visual -- esto es **perezoso**: solo se
resuelve contra un catálogo cuando alguien de verdad lo abre, nunca de
antemano para toda la lista. Dos fuentes de "visual" sin gastar cuota de
apitcg.com (la fuente principal, de paga):

1. **`IconosArquetipo`**: Limitless ya manda `deck.icons` (sprites chicos
   del/de los Pokémon del arquetipo) en la respuesta de `standings` --
   se muestran tal cual, sin pasar por ninguna API nuestra ni por
   `resolverCartaLimitless`, cero peticiones extra.
2. **`DeckCardsGrid`**: al expandir un arquetipo, resuelve su decklist
   completo con `resolverDecklistLimitless` (nuevo en `pokemonApi.js`,
   factorizado de la lógica que ya usaba `importarDecklistLimitlessEnMazo`
   para no repetirla) -- a propósito llama `buscarCartasVisual`
   (pokemontcg.io + TCGdex de respaldo) en vez de `buscarCartasCatalogo`
   (que prueba apitcg.com primero), justo para que abrir varios mazos en
   esta pantalla no le meta tráfico de más a la fuente principal de pago.
   Se cachea en memoria por nombre+número de carta (`_cacheCartaLimitless`
   en `pokemonApi.js`) porque cartas muy jugadas (ej. "Professor's
   Research") se repiten en casi todos los mazos que se abran en la
   misma sesión.

Importar un mazo real a tu perfil (desde cualquiera de las dos
sub-pestañas) sigue pidiendo Zafiro+ (`info.competitivo`, sección 149) --
ver la lista y expandir el detalle visual de un deck es libre para
cualquiera, con o sin sesión.

Verificado con `npm run build`.

## 151. Corrección de exactitud: el arte de un mazo de Limitless ya nunca muestra la impresión equivocada de una carta

Bug real encontrado por el dueño probando la sección 150: el "Dreepy" o
"Drakloak" de un mazo importado podían salir con el arte de una
reimpresión de hace 10+ años (ya ilegal en Estándar) en vez de la
impresión real que trae ese mazo, y lo mismo con energías básicas
("Darkness Energy" mostrando una versión viejísima). Causa: `resolverCartaLimitless`
(sección 148) buscaba solo por NOMBRE contra pokemontcg.io
(`buscarCartasVisual`) y con eso NO alcanza -- una carta puede tener
docenas de reimpresiones a lo largo de los años, y una búsqueda de texto
no tiene manera de saber cuál de todas es la del mazo real. El campo
`set`/`numero` que ya traía cada carta parseada (`parsearDecklistLimitless`)
ni se usaba.

**Cómo muestra Limitless las cartas exactas en su propia página**: se
investigó el HTML real de una página de decklist de Limitless (el dueño
la había mandado como `.mht` para la sección 148) -- Limitless en
realidad NO incrusta imágenes ahí, cada carta es solo texto con un link a
`https://limitlesstcg.com/cards/{SET}/{NUMERO}` (ej.
`.../cards/TWM/128` para ese Dreepy exacto). Ese `{SET}` es el código
oficial de 2-4 letras que imprime Play! Pokémon Online en cada carta
(el mismo que usa pokemontcg.io como `set.ptcgoCode`) -- **y ese código
+ número es EXACTAMENTE lo que ya nos manda la API de Limitless por
cada carta del decklist**, solo que no se estaba aprovechando.

**Fix**: `resolverCartaLimitless` (`pokemonApi.js`) ahora recibe
`(set, numero, signal)` en vez de `(nombre, numero, signal)`, y usa una
función nueva, `buscarCartaExactaPokemonTCG`, que consulta pokemontcg.io
con `set.ptcgoCode:{SET} number:{NUMERO}` -- una sola impresión posible,
cero ambigüedad. **Si no hay set+número, o esa impresión exacta todavía
no está en pokemontcg.io** (le puede tardar en tener sets recién
salidos, ver sección 128), la carta se guarda SIN imagen en vez de
adivinar por nombre -- se prefiere "sin arte" a "arte equivocado". El
nombre que se muestra siempre es el real (viene de Limitless
directamente), nunca depende de esta búsqueda.

**Investigado y descartado**: el MCP Server de Limitless TCG
(`mcp.so/servers/limitlesstcg-mcp`, la pregunta original que arrancó
toda esta integración) es un proyecto de terceros (no oficial) que solo
envuelve como recursos MCP los mismos endpoints de torneos/standings/
pairings que ya usamos directo -- no expone ninguna base de datos de
cartas ni URLs de arte, así que no aplica aquí.

**Punto de incertidumbre honesto que sigue en pie** (heredado de la
sección 148): el nombre exacto de las llaves `set`/`number` en el JSON
real de Limitless no está 100% confirmado por su documentación --
`normalizarCartaLimitless` prueba variantes razonables
(`set`/`setCode`/`set_code`, `number`/`num`). El HTML de Limitless SÍ
confirma que su propio modelo de datos trae set+número para TODAS las
cartas (incluidas energías básicas, aunque el texto plano del decklist
no lo muestre para esas), así que es muy probable que el JSON también
los traiga -- pero conviene abrir un mazo real en producción y
confirmar que las cartas sí muestran arte (o avisar cuáles no, para
ajustar los nombres de campo sin tener que rediseñar nada más).

Verificado con `npm run build`. No se pudo probar la consulta real a
pokemontcg.io en este sandbox (egress bloqueado también hacia
`api.pokemontcg.io` aquí, aunque en producción sí funciona -- es la
misma API que ya usa el resto de la app).

## 152. Catálogo (era → set → cartas) para los 8 TCG que solo tienen apitcg.com

La vista "📚 Catálogo" (Paso 1: elige el juego) ya dejaba elegir cualquiera
de los 13 TCG en el botonera de arriba, pero para los 8 agregados vía
apitcg.com (Cardfight Vanguard, Digimon, Dragon Ball Super Fusion World,
Dragon Ball Super Masters, Flesh and Blood, Gundam, hololive, Riftbound --
ver sección 138) el Paso 2 se quedaba vacío -- `obtenerErasYSetsCatalogo`/
`obtenerCartasDeSetCatalogo` (`pokemonApi.js`) solo cubrían Pokémon/Magic/
Yu-Gi-Oh/Lorcana (One Piece usa su propio camino aparte, vía TCGCSV, sin
tocar).

- **`obtenerErasYSetsApiTCG(tcg, signal)`** (nueva): reutiliza
  `obtenerSetsVisualesApiTCG` (el mismo que ya usa el selector visual de
  producto sellado) y lo envuelve en la forma `[{ era: null, sets: [...] }]`
  que ya espera `CatalogoView` -- estos 8 TCG no tienen concepto de "era"
  en apitcg.com, así que se listan todos los sets juntos, mismo criterio
  que ya usaba Lorcana.
- **`obtenerCartasDeSetApiTCG(tcg, setId, signal)`** (nueva): pide las
  cartas de un set con `pedirProductosApiTCG({ tcg, type: "card", set,
  limit: 100, page })`, paginando hasta agotar el set -- apitcg.com no
  documenta con certeza su parámetro de paginación, así que el loop se
  corta solo en cuanto una página no trae ninguna carta nueva (por si
  `page` no hiciera nada de verdad), con un tope duro de 5 páginas.
- Los dos despachadores (`obtenerErasYSetsCatalogo`/
  `obtenerCartasDeSetCatalogo`) ahora caen a estas dos funciones para
  cualquier TCG que esté en `TCG_SLUG_APITCG` y no sea `onepiece`
  (Pokémon/Magic/Yu-Gi-Oh/Lorcana siguen resolviéndose antes, por sus
  propias fuentes de siempre) -- **cero cambios en `CatalogoView`**, el
  selector de juego y toda la navegación de era/set/cartas ya eran
  genéricos y solo hacía falta llenar el hueco de datos.
- Se aprovechó para agregarle a "Paso 2 · Elige un set" un mensaje de
  "No pudimos cargar los sets de X en este momento" cuando la lista sale
  vacía (antes ese caso -- que ya le pasaba a Lorcana también si fallaba
  -- se quedaba en blanco sin ninguna explicación).

Como es la misma apitcg.com que ya usa el buscador de publicar y el
selector de producto sellado, aplica la misma limitación: necesita
`APITCG_API_KEY` configurada en Vercel (ver sección 129) para traer datos
reales -- sin ella, el Catálogo de estos 8 TCG se ve vacío con el mensaje
de arriba en vez de romperse.

Verificado con `npm run build` y visualmente en el dev server local (la
navegación Paso 1 → Paso 2 funciona y degrada a "no pudimos cargar" en
vez de quedarse en blanco -- no se pudo probar con datos reales porque
apitcg.com no es alcanzable desde este sandbox).

## 153. Segundo respaldo EXACTO (TCGdex) para el arte de cartas de Limitless

Seguimiento de la sección 151: el dueño probó el arte visual de un mazo
real de Competitivo y varias cartas (Drakloak, Dragapult ex, Meowth ex)
seguían sin imagen -- pokemontcg.io (legado, no recibe sets/promos
nuevos, ver sección 128) simplemente no tenía esa impresión exacta
todavía, aunque el set+número sí eran correctos.

`resolverCartaLimitless` ahora prueba una SEGUNDA fuente antes de
rendirse: `buscarCartaExactaTCGdex(set, numero, signal)`, que hace
exactamente el mismo tipo de búsqueda EXACTA por set+número que
`buscarCartaExactaPokemonTCG`, solo que contra TCGdex (que se sigue
actualizando y suele tener sets/promos recientes antes que pokemontcg.io).
TCGdex expone el mismo código corto de Play! Pokémon Online que usa
Limitless como el campo `tcgOnline` de cada set -- se busca el set con
ese código, se busca la carta por `localId` exacto dentro de sus cartas,
y se pide el detalle completo (imagen incluida), mismo patrón de doble
petición que ya usaba el respaldo de TCGdex para el buscador de publicar
(`buscarCartasVisualTCGdexIdioma`).

**Sigue sin haber riesgo de mostrar la carta equivocada** (la prioridad
que pidió el dueño en la sección 151): las dos fuentes son búsquedas
exactas por set+número, nunca por nombre -- si ninguna de las dos tiene
esa impresión, la carta se sigue guardando sin imagen en vez de adivinar.
Se cachea la lista de sets de TCGdex en memoria (una sola petición por
sesión) y el nombre del campo `tcgOnline` se prueba con un par de
alternativas razonables (`ptcgoCode`, `code`) por si acaso -- si el
nombre real fuera otro, este respaldo simplemente no encuentra nada
(igual que hoy), nunca rompe ni empeora lo que ya funcionaba.

**Honesto**: si una carta sigue sin imagen incluso con las dos fuentes,
es porque de verdad no está en ninguna de las dos todavía (una impresión
recién salida) -- no hay una tercera fuente EXACTA fácil de agregar hoy
(apitcg.com no tiene un campo equivalente al código corto de Limitless
sin antes resolver el nombre completo del set, que no tenemos). Si esto
sigue pasando seguido, la siguiente idea sería: cuando OTRA carta del
MISMO set dentro del mismo mazo sí se resuelva por pokemontcg.io/TCGdex,
reusar el nombre real de ese set (que sí conocemos en ese momento) para
buscar en apitcg.com por nombre completo -- no implementado todavía,
para no complicar esto de más sin evidencia de que hace falta.

Verificado con `npm run build`. No se pudo probar contra TCGdex real en
este sandbox (egress bloqueado hacia `api.tcgdex.net` aquí también) --
falta confirmar en producción que el campo `tcgOnline` es el correcto y
que las cartas que fallaban ahora sí traen imagen.

## 154. Sorteos exclusivos por link/código de campaña (para videos de redes sociales)

Pensado para campañas tipo "trade challenge" en redes: el dueño sube un
video anunciando un sorteo (ej. una carta de Charizard) y solo quien
entra por el link/QR específico de ese video puede participar -- no
cualquier usuario que ya tenga cuenta y esté navegando la lista normal de
Sorteos. Extiende el sistema de sorteos ya existente (sección de
`051_sorteos.sql` en adelante), no lo reemplaza.

- **`supabase/migrations/077_sorteos_exclusivos_campana.sql`** (⚠️ falta
  correrla en Supabase): dos columnas nuevas en `sorteos` --
  `exclusivo` (boolean) y `codigo_campana` (texto corto, único,
  A-Z0-9-, 3-24 caracteres). Cierra la policy de INSERT de
  `sorteo_participantes` (y la de `sorteo_referidos`, el bono de
  referidos de siempre) para que NO se pueda entrar directo a un sorteo
  exclusivo -- la única puerta es la función nueva
  `sorteo_unirse_por_campana(p_codigo)` (security definer), que resuelve
  todo del lado del servidor a partir de `auth.uid()` y el código (nunca
  recibe un `sorteo_id`/`perfil_id` que mande el cliente, así que no hay
  nada que falsificar) y entra al usuario con exactamente 1 boleto
  plano -- los bonos de compartir/publicar/referir de los sorteos
  abiertos no aplican aquí (bloqueados también del lado del servidor, por
  si la UI algún día se equivoca).
- **Link**: `?sorteo=<id>&c=<codigo>` -- mismo patrón que el link de
  referido de siempre (`&ref=`), solo que con `&c=`. Sirve tanto para una
  cuenta que se registra por primera vez como para alguien que ya tenía
  cuenta y solo necesita "reclamar su lugar" -- las dos rutas terminan en
  la misma función.
- **Arreglo de Google en el camino**: al investigar el flujo real, se
  encontró que quien de verdad crea el perfil de alguien que se registra
  por primera vez con Google es `CompletarPerfilOAuthModal` (no el efecto
  que lee el token de la URL, como parecía a primera vista) -- su
  `onCreado` nunca disparaba el procesamiento de "cuenta nueva", así que
  el bono de referidos de siempre Y esto nuevo se perdían en silencio
  para cualquiera que se registrara con Google. `cargarOCrearPerfil`
  ahora regresa si de verdad creó un perfil nuevo, y los 3 caminos reales
  de alta (correo directo, confirmar correo y volver, Google) más el
  caso de iniciar sesión ya confirmado sin pasar por el link de
  confirmación, todos convergen en una función compartida nueva,
  `procesarNuevoRegistro`, que ahora sí funciona igual sin importar el
  método de registro.
- **Transparencia**: la página del sorteo ya mostraba la lista de
  participantes y el ganador sin pedir sesión (confirmado leyendo el
  componente) -- se le agregó un badge "🔒 Exclusivo por campaña" y un
  texto explicando la regla, para que cualquiera (incluso sin cuenta) que
  abra el link entienda por qué no ve un botón normal de "Participar" y
  confíe en que la lista es pública de verdad.
- **UI del organizador**: `CrearSorteoForm` gana un checkbox "🔒 Sorteo
  exclusivo" + campo de código (autogenerado, editable). Al crearse (o
  desde el detalle del sorteo, solo visible para el organizador) se
  muestra el link + un QR generado con una API pública gratuita
  (`api.qrserver.com`, sin librería nueva -- la app ya confía en
  imágenes de terceros vía `<img src>` en todos lados) para pegar en la
  descripción del video. Esa caja de link/QR es **solo del organizador**
  -- nunca aparece en la página pública, porque si cualquiera pudiera
  verla, cualquiera podría copiar el código sin haber visto el video.
- Disponible para el mismo grupo que ya puede crear sorteos (Admin,
  tienda Aurora, o afiliada con aprobación pendiente) -- sin restricción
  extra, es de bajo riesgo por el diseño de la función de unión.

Verificado con `npm run build` y visualmente en el dev server (la
pantalla de Sorteos carga sin errores). No se pudo probar el flujo
completo de principio a fin en este sandbox (requiere sesión real de
Supabase) -- falta correr la migración y probar en producción: crear un
sorteo exclusivo, abrir su link en incógnito (cuenta nueva) y con una
cuenta ya existente, con los dos métodos de registro (correo y Google), y
confirmar que en ambos casos se entra con 1 boleto y se cae de vuelta en
la vista del sorteo.

## 155. Rediseño de la Wishlist: carpeta visual compartible por link + imagen descargable (Zafiro+)

La "Lista de deseos" mezclaba dos cosas distintas en una pantalla: una
lista de texto plano de cartas "quiero" (tabla `wishlist`, sin imagen,
gratis) y las Alertas de precio con push (tabla `alertas`, Amatista+).
Peor: lo único que se mostraba públicamente en un perfil bajo la
etiqueta "Lista de deseos" en realidad eran las Alertas de precio, no
las cartas que de verdad se buscan -- un bug real de etiquetado, no solo
de producto.

- **Nueva bandera de plan**: `wishlistCompartible` (`theme.js`), `true`
  desde Zafiro en adelante -- deliberadamente NO se reutilizó
  `wishlistPremium` (que sigue Amatista+, sin tocar, gateando "Tengo"/
  Master Sets y las Alertas de precio con push). Si se hubiera reusado
  esa bandera, mover "la wishlist" a Zafiro habría filtrado esas dos
  cosas también, sin querer. `ultraball.resumen` se reescribió de "Todo
  Zafiro + Wishlist Premium" a "Todo Zafiro + Alertas de precio con
  push" -- ya no aplicaba una vez que Zafiro tiene su propia wishlist.
- **Tabla base: `coleccion_usuario` con `estado='quiero'`** (no la vieja
  `wishlist`, que solo guardaba el nombre en texto -- se dejó de escribir
  ahí, `CatalogoView.marcar()`, sin borrar la tabla por seguridad/
  reversibilidad). `coleccion_usuario` ya traía imagen/card_api_id/set y
  su propio `unique(perfil_id, tcg, card_api_id)`, perfecto para una
  carpeta visual.
- **`supabase/migrations/078_coleccion_usuario_wishlist_publica.sql`**
  (⚠️ falta correrla): política de lectura pública en `coleccion_usuario`
  para `estado='quiero'`, con el chequeo de `visibilidad.wishlist`
  **embebido en la propia policy** (mismo patrón que ya usan
  `alertas`/`carpetas` en `021_visibilidad_publica.sql`) -- no basta con
  chequearlo solo del lado de la app, porque cualquiera puede pegarle a
  PostgREST directo con la anon key (ya pública en el bundle de JS).
  Nunca se expone `estado='tengo'` públicamente (revelaría qué cartas
  valiosas tiene alguien y dónde).
- **`MiWishlistView`** (nuevo, dentro de `AlertasPanel` -- ahora 2
  pestañas: "🎁 Mi Wishlist" / "🔔 Alertas de precio", esta última sin
  cambios): grid visual (igual estilo que `CarpetaPublicaView`), buscador
  para agregar cartas directo (antes solo se podía marcar "quiero" desde
  el Catálogo -- maneja el choque 23505 con una carta que ya tenías
  marcada "tengo", haciendo `PATCH` en vez de fallar), botón de copiar
  link, botón "Verla como público", y el generador de imagen.
- **`WishlistPublicaView`** (nuevo) + link `?wishlist=<slug-del-perfil>`
  (mismo patrón de resolución que `?u=<slug>`, ya que una wishlist no es
  una fila con su propio id -- es "las cartas quiero de este perfil"):
  sin sesión, RLS decide qué se ve. No distingue "no existe" de "está
  oculta" (mismo criterio que `CarpetaPublicaView`).
- **`api/tcgcsv.js`, rama nueva `?fuente=imgproxy`**: necesaria para
  generar la imagen sin romper el canvas -- las cartas vienen de +6 CDNs
  de terceros (pokemontcg.io, Scryfall, TCGdex, apitcg.com, TCGplayer,
  Limitless, YGOPRODeck) más Supabase Storage, y dibujar una imagen
  cross-origin sin CORS permisivo "mancha" el canvas (bloquea
  `toBlob()`). A diferencia de `origenValido` (pensada para que el
  SERVIDOR arme la ruta, nunca una libre que mande el cliente), aquí el
  cliente sí manda una URL completa -- así que se usa una lista blanca de
  hosts conocidos (no solo "no es IP privada") y se bloquean
  redirecciones (`redirect:"manual"`) para cerrar un hueco de SSRF-vía-
  redirección que sí aplica aquí (la wishlist pública no pide sesión,
  cualquiera puede llamar esta ruta). ⚠️ Los hostnames de imagen de
  pokemontcg.io/apitcg.com/TCGplayer se infieren del uso conocido de
  cada API, no se pudieron confirmar en vivo desde este sandbox -- si
  una carta se queda sin imagen en producción, agregar su host real es
  un cambio de una línea.
- **`src/lib/wishlistImagen.js`** (nuevo): dibuja con Canvas2D nativo
  (sin librería nueva, mismo criterio que el QR de sorteos) un grid de
  4 columnas con el arte de cada carta (vía el proxy de arriba), el
  nombre/perfil del dueño, "Encuentra Cartas" como marca, y el link como
  texto en el pie -- exporta un PNG vía `canvas.toBlob()`. El botón
  "Generar imagen" (`BotonGenerarImagenWishlist`, compartido entre
  `MiWishlistView` y `WishlistPublicaView`) ofrece descargar o compartir
  (Web Share API con archivo, si el navegador lo soporta).
- La sección "wishlist" del perfil público (`PerfilPublicoView`) ahora sí
  muestra las cartas "quiero" de verdad (antes mostraba Alertas de
  precio por error) con un grid visual y un link "Ver completa".

Verificado con `npm run build` y visualmente en el dev server (la ruta
pública `?wishlist=<slug>` degrada bien a la página de inicio cuando el
slug no existe, sin errores de React -- no se pudo probar con datos
reales porque Supabase y los CDNs de imágenes no son alcanzables desde
este sandbox).

## 156. Corrección: avatar faltante en la imagen de Wishlist + el botón "atrás" (navegador y celular) ya funciona en toda la app

Dos reportes después de confirmar que la sección 155 "funciona
perfectamente": (1) el avatar no salía en la imagen PNG generada de la
Wishlist; (2) el botón "atrás" del navegador y el gesto/tecla atrás de
Android no regresaban a la pantalla anterior en ningún lado de la app --
al usarlo (incluso dos veces) sacaba de la app o mandaba directo al
inicio, sin importar en qué pantalla estuviera.

- **Avatar faltante**: causa fue la misma lista blanca de hosts del
  proxy de imágenes (`HOSTS_IMAGENES_PERMITIDOS`, sección 155) --
  `raw.githubusercontent.com` (donde vive el avatar Pokémon por
  default/elegido, `randomPokemonAvatar()`/`pokemonSpriteUrl()` en
  `pokemonApi.js`) y `lh3.googleusercontent.com` (foto de perfil de
  quien se registró con Google) no estaban en la lista, así que el
  proxy los rechazaba con 400 y `wishlistImagen.js` (ya diseñado para no
  tronar por una imagen rota) se quedaba con el círculo vacío en vez de
  la foto. Se agregaron ambos hosts a `HOSTS_IMAGENES_PERMITIDOS`
  (`api/tcgcsv.js`) -- mismo criterio de lista blanca explícita que el
  resto (nunca "cualquier host"), verificado con un chequeo de sintaxis
  del módulo (no se pudo probar en vivo, GitHub/Google no son
  alcanzables desde este sandbox).
- **Botón/gesto "atrás" roto en toda la app**: causa raíz fue que la app
  nunca escuchaba el evento `popstate` -- cero listeners en todo el
  código. El único uso de `window.history` era `actualizarUrlCompartible`
  (`pushState`, y solo para las 8 pantallas con link compartible --
  detalle de carta, perfil, tienda, sorteo, subasta, carpeta, wishlist),
  mientras que las ~40 llamadas a `setView(...)` del resto de la app
  (drawer, pestañas, botones sueltos) nunca tocaban el historial. Como
  nada escuchaba "atrás", la app seguía mostrando lo mismo aunque el
  navegador sí retrocediera en su propio historial interno -- hasta que
  se acababan las entradas apiladas y ahí sí sacaba de la página.
  - **Arreglo, deliberadamente mínimo** (para no arriesgar el resto de
    la navegación, que es central en toda la app): un solo efecto
    reactivo en el componente raíz observa `view` + los 7
    "seleccionados" de nivel raíz (`selectedListing`, `selectedPerfilId`,
    `selectedStore`, `selectedSorteoId`, `selectedSubastaId`,
    `selectedCarpetaPublicaId`, `selectedWishlistPerfilId`) y hace
    `pushState` cada vez que cualquiera cambia -- sin tocar ninguno de
    los ~40 sitios que llaman `setView` uno por uno. Un solo listener de
    `popstate` restaura la pantalla exacta reusando las funciones que YA
    existen para abrir cada una (`abrirDetalle`, `verPerfil`,
    `verTiendaDesdePerfil`, `abrirSorteo`, `abrirSubasta`,
    `abrirCarpetaPublica`, `abrirWishlistPublica`) -- nunca lógica de
    "restaurar" duplicada. `actualizarUrlCompartible` cambió su
    `pushState` por `replaceState` (una línea): deja de crear entradas
    del historial (eso ahora lo hace el efecto nuevo, una sola vez por
    navegación real) y se queda solo con mantener la URL visible/
    compartible correcta -- sus 13 sitios de llamada no se tocaron.
  - **Fuera de alcance a propósito**: los modales (login, chat, confirmar
    correo, etc.) no se agregan al historial -- "atrás" no los cierra,
    solo navega entre pantallas. Estado interno de cada pantalla
    (pestañas dentro de un panel, formularios) es invisible para este
    efecto y no participa. Caso raro aceptado sin blindar: presionar
    "atrás" varias veces muy rápido justo en una pantalla que re-pide
    datos (perfil/tienda/sorteo/subasta/carpeta/wishlist, no así detalle
    de carta) podría, en una carrera de tiempos, dejar una entrada de
    más en el historial -- no rompe nada, en el peor caso hace falta una
    pulsada extra en esa pantalla puntual.
- Verificado con `npm run build` (sin errores) y con una prueba real de
  Playwright contra el dev server: navegación Inicio → Catálogo →
  Tiendas → Sorteos (por header y drawer), luego tres `goBack()`
  seguidos -- la app retrocedió exactamente Sorteos → Tiendas → Catálogo
  → Inicio, en ese orden, confirmado por el título visible de cada
  pantalla en cada paso. Captura final confirmó que la app terminó en el
  inicio normal, sin pantalla en blanco ni estado atorado. ⚠️ No se pudo
  probar con sesión real de Supabase desde este sandbox (bloqueado),
  ni el gesto físico de "atrás" de un celular Android real -- pendiente
  que el dueño lo pruebe en producción, en un teléfono real, navegando
  varias pantallas seguidas.

## 157. Modo Evento funciona sin internet: cola de sincronización

Modo Evento (sección 70/140/141/151, Amatista+) dependía 100% de la
conexión -- si se cortaba el wifi en el evento (el escenario típico de
una expo), ni se podía abrir la lista de eventos, y cualquier venta o
gasto que se intentara registrar en ese momento se perdía. Ahora, una
vez que un evento ya cargó al menos una vez, se puede seguir viendo y
agregando ventas/gastos/compras sin señal -- los cambios se guardan
solos en Supabase en cuanto vuelve la conexión.

- **Por qué es viable sin rediseñar la pantalla**: las 4 tablas de Modo
  Evento (`eventos`/`evento_ventas`/`evento_gastos`/
  `evento_adquisiciones`) usan `id uuid primary key default
  gen_random_uuid()` -- ese default solo aplica si el INSERT omite la
  columna. Ahora cada guardado nuevo genera su propio `id`
  (`crypto.randomUUID()`) del lado del cliente, así que un registro
  tiene su ID final desde que se crea en el navegador, sin importar si
  llega a Supabase al toque o minutos después -- nunca hace falta
  "reemplazar un ID temporal por el real" en ninguna FK
  (`evento_id`, `origen_venta_id`).
- **`src/lib/offlineEventos.js`** (nuevo): `sbWriteConCola` reemplaza a
  `sbWrite` en los ~11 guardados de Modo Evento -- si `sbWrite` tira por
  una razón de red (`TypeError`, cubre "Failed to fetch"/"NetworkError"/
  "Load failed" de Chrome/Firefox/Safari por igual), encola la operación
  en `localStorage['ec_evento_queue']` y devuelve una fila marcada
  `_pendiente: true` para que la pantalla siga funcionando igual. Si
  tira por cualquier otra razón (validación, permisos), no se encola --
  eso sí es un error real y se muestra en el momento.
- **`sincronizarCola`**: reintenta la cola **en orden estricto** (nunca
  en paralelo, nunca reordenada) -- las policies RLS de las tablas hijas
  exigen que el evento padre ya exista al insertar una venta/gasto/
  compra, así que el orden de sincronización no es una optimización, es
  un invariante duro. Si un evento (o sus ventas/gastos) se crearon
  offline y luego se editaron o borraron también offline, todo eso se
  reproduce en el mismo orden en que pasó.
- **Corrección real encontrada al revisar el diseño con un segundo
  agente** (ver `sbWrite` en `src/lib/supabase.js`): si la conexión se
  corta justo después de que el servidor sí guardó una fila pero antes
  de que el cliente termine de leer la respuesta, antes eso se colaba
  como un guardado "exitoso" con datos vacíos (`data: null`), y cada
  sitio que hace `const [fila] = await sbWrite(...)` truena feo al
  desestructurar `null`. Ahora `sbWrite` lo trata como un error
  (`error.ambiguoDeRed = true`) en vez de devolver `null` en silencio --
  y como no sabemos si sí se guardó o no, `sincronizarCola` lo trata
  igual que un error de red: lo reintenta, y si el reintento choca con
  la llave única (`error.code === "23505"`) confirma que sí se había
  guardado la primera vez, y lo quita de la cola sin reportarlo como
  falla. Sin esto, cada corte de señal a medio guardar hubiera generado
  un error confuso en vez de resolverse solo.
- **Fallas reales durante la sincronización** (ej. el evento se borró
  desde otro dispositivo mientras este estaba offline, así que sus
  ventas hijas ya no tienen dónde caer): se acumulan en una lista, no en
  un solo mensaje -- un evento borrado puede tumbar varias filas hijas
  de un jalón, y quitar cada una de la cola (en vez de bloquearla para
  siempre por una sola) es lo que deja que la cola llegue a vacío de
  todos modos.
- **`guardarEdit`** (marcar vendida/editar una venta) dejó de confiar en
  la fila que regresa el servidor -- arma la fila localmente con los
  mismos datos que ya tenía en mano, porque offline no hay ninguna
  respuesta real que confiar (y el resultado es idéntico estando
  online).
- **Caché local reactiva**: un efecto que observa
  `[ventas, gastos, adquisiciones]` (mismo patrón que ya se usó para el
  fix del botón atrás, sección 156) guarda la vista actual en
  `localStorage` en cada cambio -- así recargar la página sin señal
  restaura exactamente lo que se estaba viendo, incluyendo cambios
  todavía no sincronizados. Mismo criterio para la lista de eventos.
  Nunca se pisa el estado local con un fetch nuevo mientras la cola
  tenga algo pendiente de ese evento -- se sincroniza primero.
- **UI**: una barra (`EstadoOfflineBar`, compartida entre la lista de
  eventos y el detalle de uno) muestra cuántos cambios están sin
  sincronizar y un botón "Sincronizar ahora" -- el evento `online` del
  navegador dispara un intento automático, pero no es 100% confiable en
  Android, así que el botón manual es la vía principal. Insignia
  "🕓 pendiente" en cada venta/gasto/compra/evento todavía sin
  sincronizar.
- **Fuera de alcance, a propósito**: "Importar de mi inventario"
  necesita leer las publicaciones en vivo del perfil, así que sigue
  requiriendo internet (avisa con un mensaje si no hay conexión, en vez
  de fallar sin explicación). Reabrir la app totalmente cerrada sin
  señal tampoco funciona -- no existe un service worker que cachee el
  shell de la app (eso sería un proyecto aparte, mucho más grande);
  mientras la pestaña siga abierta (aunque sea en segundo plano), todo
  lo de arriba funciona. Dos dispositivos editando el mismo evento
  mientras uno está offline no se reconcilian -- gana lo último que se
  sincroniza, sin aviso de conflicto (aceptable para el uso real: una
  persona, un celular, su propio evento).

Verificado con `npm run build` y con una prueba aislada en Node
(mockeando `fetch`/`localStorage`, ya que Supabase no es alcanzable
desde este sandbox de todos modos) que cubrió: cola que se llena al
fallar por red y se vacía al reintentar con éxito, el caso 23505
(insert que sí había llegado) contándose como éxito y no como falla,
fallas reales acumulándose en una lista sin bloquear el resto de la
cola, y el orden FIFO preservado en una cadena evento→venta→adquisición
creada offline. No se pudo probar el guardado real contra Supabase
desde este sandbox (bloqueado) -- pedirle al dueño probarlo de verdad
en un evento con wifi débil una vez desplegado.

## 158. Colección/Portafolio personal + intercambios (Zafiro+), y Modo Evento ahora acepta varias cartas recibidas en un intercambio

Botón nuevo "Colección" en la cintilla móvil (junto a Inicio/Tiendas/
Catálogo/Vender) y en el menú de escritorio -- un portafolio tipo
Collectr: tu colección real (lo que tienes, con cantidad y valor de
referencia), una función de intercambio (eliges qué das y qué recibes,
con dinero extra opcional) con historial de entradas/salidas, y acceso
directo a tus carpetas de venta existentes.

- **`coleccion_usuario`** (ya usada por la Wishlist y "Tengo esta
  carta") se extiende con `cantidad`, `precio_ref_mxn`,
  `precio_ref_actualizado_en`, `costo_adquisicion` -- no se creó una
  tabla nueva para "lo que tengo", se le agregó lo que le faltaba para
  ser un portafolio de verdad.
- **`coleccion_historial`** (nueva, `079_coleccion_personal.sql`):
  una fila por movimiento (entrada/salida, motivo compra/venta/
  intercambio/ajuste_manual), con un `grupo_id` opcional que agrupa
  ambos lados de un mismo intercambio -- sin tabla padre aparte (mismo
  criterio que ya usa Modo Evento: `origen_venta_id` como FK simple, no
  un objeto padre, para la misma relación).
- **Dos funciones RPC** (`coleccion_registrar_entrada`/
  `coleccion_registrar_salida`) hacen el alta/baja de forma ATÓMICA
  (`cantidad = cantidad + excluded.cantidad` en SQL, nunca "leer y
  sumar" del lado del cliente -- eso sí sería una carrera real: dos
  cartas iguales en el mismo intercambio, o dos pestañas abiertas,
  perderían un incremento) e IDEMPOTENTE por un `p_historial_id`
  generado en el cliente (`insert ... on conflict (id) do nothing`,
  seguido de un `if not found then return` que corta el resto de la
  función) -- necesario porque estas mismas llamadas pueden pasar por
  la cola offline de Modo Evento (sección 157): un reintento con el
  mismo id nunca vuelve a sumar la cantidad, aunque el insert anterior
  sí haya llegado a Supabase y solo se haya perdido la respuesta.
  **Verificado de verdad**, no solo revisado: se levantó un Postgres 16
  local en este sandbox (`service postgresql start`, sin red hacia
  Supabase pero corriendo la migración real) y se corrieron las
  funciones a mano -- primera entrada crea la fila con cantidad 1,
  segunda entrada (id de historial distinto) suma a 2, **reintentar el
  mismo id de historial NO vuelve a sumar** (se queda en 2, con solo 2
  filas de historial, no 3), salida parcial resta bien, salida total
  borra la fila, una salida de una carta que nunca estuvo en la
  colección no truena (solo registra el historial), y una entrada con
  `card_api_id` nulo (carta escrita a mano) se queda solo en el
  historial sin tocar `coleccion_usuario`.
- **Deliberadamente descartado: `Prefer: resolution=merge-duplicates`**
  (PostgREST) y el patrón que ya usa `MiWishlistView.agregarCarta`
  (POST → catch 23505 → PATCH a un valor fijo) -- ninguno de los dos
  sirve para "sumar": `merge-duplicates` sobreescribe columnas con el
  valor nuevo (mandar `cantidad: 1` la dejaría en 1, no la
  incrementaría), y un PATCH calculado del lado del cliente (leer
  cantidad actual, mandar cantidad+1) es una carrera real. La suma
  tiene que resolverse en SQL, atómica.
- **Colección 100% privada, a propósito**: no se agregó ningún toggle
  de visibilidad ni sección pública en el perfil para esto. La propia
  migración 078 (la que sí hizo pública la Wishlist) explica por qué
  nunca se hizo lo mismo con `estado='tengo'` -- revela qué cartas
  valiosas tiene alguien. Agregar cantidad y precio de referencia
  encima lo hace peor, no mejor, así que se decidió no construir la
  capacidad en absoluto (ni el toggle ni la política RLS pública) en
  vez de dejarla apagada por default.
- **Sin refresco masivo de precios**: los precios de referencia
  (`obtenerPrecioRefActualPorTcg`) son llamadas una-por-carta, sin
  caché ni lote, a tres APIs de terceros distintas -- pedirle a cada una
  el precio de 200 cartas de un jalón cada vez que se abre la pantalla
  no es un patrón seguro en este código. El "valor total" se calcula
  sumando del lado del cliente el precio YA GUARDADO en cada fila; cada
  carta tiene su propio botón "Precio" (una sola llamada, igual que ya
  hace `CartaDetalleView`), y el total dice explícitamente "puede estar
  desactualizado".
- **Modo Evento: intercambios con varias cartas recibidas**
  (`CamposOperacionEvento`, la queja original -- "ahora solo deja una"):
  el campo pasó de escalar a un arreglo `recibidas`, con "+ Agregar
  otra carta recibida" y un componente nuevo (`CartaRecibidaAgregar`)
  reusado también en el builder de intercambio general. Se corrigió de
  paso un hueco real: el picker de cartas ya traía `card_api_id` y
  `precio_ref_mxn` (`CardPickerUniversal`/`CardPicker.seleccionar`)
  pero `CamposOperacionEvento` los descartaba -- sin `card_api_id` no
  había con qué hacer el alta en la colección personal. Una carta
  escrita a mano (sin ficha del catálogo) se sigue guardando en el
  registro del evento pero no entra a la colección -- se avisa en la
  UI, no falla en silencio.
- **Asimetría intencional**: lo que SALE en un intercambio de Modo
  Evento (la venta en sí) no se intenta quitar de la colección
  personal automáticamente -- `evento_ventas` no guarda `card_api_id`
  (solo un `carta_ref` jsonb libre), así que no hay con qué ligarla de
  forma confiable sin arriesgar borrar la fila equivocada de la
  colección real de alguien.
- **Builder de intercambio** (fuera de Modo Evento, `IntercambioBuilderView`):
  "tu lado" junta tus publicaciones en venta (`mercado_listings`/
  `inventario_tienda`) + tu colección personal en un solo buscador con
  checkboxes; "su lado" reusa el mismo picker de Modo Evento (la otra
  persona no necesita cuenta). Al confirmar: lo que diste que estaba en
  venta se borra de la publicación, lo que diste de tu colección se
  descuenta (`coleccion_registrar_salida`), lo que recibiste entra
  (`coleccion_registrar_entrada`) -- todo ligado por un mismo `grupo_id`.
  Usa `sbWrite` normal (sin cola offline): esta pantalla vive fuera de
  Modo Evento y no la necesita.
- **"Mis carpetas"** (segunda pestaña de la pantalla nueva): para
  cuentas individuales embebe `CarpetasPanel` tal cual, sin tocarlo.
  Para cuentas de tienda, en vez de duplicar cómo se resuelve el
  `tienda_id` (ya lo hace bien "Mi Tienda"), se manda ahí con un botón
  -- evita repetir esa lógica en dos lugares.
- Gate: `coleccionPersonal` en `theme.js`, bandera nueva desde Zafiro
  en adelante (nunca se reusó `wishlistCompartible` ni `carpetas` --
  son funciones distintas). "Mis carpetas" dentro de la pantalla nueva
  sí reusa a propósito la bandera `carpetas` (Amatista+) ya existente,
  porque es literalmente la misma función con una entrada nueva -- un
  usuario Zafiro puede ver "Mi colección" funcionando y un upsell en
  "Mis carpetas" en la misma pantalla; es intencional, no un bug.

Verificado con `npm run build` y con Playwright contra el dev server
(la pestaña "Colección" aparece en la cintilla de 5 botones sin romper
el layout, y sin sesión muestra el aviso de login correcto, no una
pantalla en blanco). Las funciones RPC se probaron de verdad contra un
Postgres real levantado en este sandbox (ver arriba) -- lo único que no
se pudo probar es el flujo completo end-to-end contra Supabase (no
alcanzable desde aquí) ni la carga de `mercado_listings`/
`inventario_tienda` con datos reales.

## 159. Modo Evento: "Modo rápido" (POS) para capturar ventas/compras a golpe de teclado + pulido visual

Pedido explícito: una forma de capturar ventas y compras en un evento
tan rápido como una terminal de cobro real (referencia: la pantalla
"Cobrar" de Mercado Pago -- monto grande + teclado numérico), sin tener
que llenar el formulario detallado de siempre en el momento -- y de
paso, pulir el look de la pantalla de Modo Evento (sin cambiarle el
flujo ni la estructura, confirmado con el dueño antes de tocar nada).

- **`ModoEventoPOS`** (nuevo, botón "⚡ Modo rápido" junto a "Importar
  de mi inventario"): switch Venta/Compra arriba, un monto grande que
  se arma con teclado numérico (buffer de centavos, no de texto --
  `centavos = centavos*10 + dígito`, evita los problemas típicos de
  parsear un input de texto como dinero), una descripción opcional, y
  un botón grande para confirmar. **Es un atajo adicional, no
  reemplaza nada**: los formularios detallados de siempre (costo, día,
  intercambio, etc.) se quedan exactamente igual para cuando sí hace
  falta ese detalle -- confirmado con el dueño antes de construirlo.
- Al confirmar, el registro se guarda DE INMEDIATO (mismo criterio que
  una terminal de cobro real: nunca bloquea la siguiente captura
  esperando más datos) -- una venta rápida crea una fila en
  `evento_ventas` ya marcada `vendida`, una compra rápida crea una fila
  en `evento_adquisiciones`. Sin nombre específico, se guarda como
  "Venta rápida"/"Compra rápida" -- no se bloquea la captura por falta
  de un nombre.
- **Enriquecer después** (justo lo que se pidió: "con la opción de
  asignarle una carta... después de generar el registro"): tras
  guardar, aparece un aviso con "Asignar carta" (opcional, no bloquea
  seguir capturando) con tres formas de completarlo -- buscar en el
  catálogo (`CardPickerUniversal`, igual que en el resto de la app),
  elegir de tu propio inventario (reusa la misma carga que ya usa
  "Importar de mi inventario" -- se separó esa carga en una función
  aparte, `cargarInventarioSiHaceFalta`, para no duplicarla ni abrir el
  panel del importador de paso), o escribir un concepto libre.
- Todo el modo rápido pasa por `sbWriteConCola` (la cola offline de la
  sección 157) -- es justo el escenario donde más importa: cobrar en el
  momento con wifi débil de una expo.
- **Pulido visual** (sin restructurar, según lo confirmado): el
  encabezado del evento ahora vive en una tarjeta con degradado sutil
  en vez de texto suelto; cada tarjeta de resumen (Ingresos, Gastos,
  Ganancia neta, etc.) tiene un emoji y un acento de color a la
  izquierda para escanearse más rápido; cada evento en la lista tiene
  un ícono circular en vez de solo texto.

Verificado con `npm run build`. No se pudo probar el flujo capturado
con sesión real (Modo Evento requiere Amatista+ y Supabase no es
alcanzable desde este sandbox, misma limitación que el resto de Modo
Evento) -- cada campo que escribe el modo rápido se revisó a mano
contra el esquema real de `evento_ventas`/`evento_adquisiciones` (ya
confirmado con Postgres real en la sección 158) para no adivinar
nombres de columna.

## 160. Tablón de venta: generar una imagen con tu inventario/carpetas seleccionadas (nombre, precio, idioma, estado)

Pedido: un lugar en "Vender" (Mi Mercado para individuales, Mi Tienda
para tiendas) donde elegir cartas/producto de tu inventario o tus
carpetas y armar una sola imagen con todo lo elegido -- nombre, foto,
precio, idioma y estado (condición) -- para compartir sin mandar el
link (igual que ya existía para la Wishlist).

- **`TablonVentaView`** (nuevo, botón "🖼️ Tablón de venta" junto a
  "Tus publicaciones"/"Cartas sueltas"): mismo patrón de selección
  agrupada por carpeta que ya se usó dos veces antes en esta sesión
  (el importador de Modo Evento y el builder de intercambio de la
  Colección) -- checkboxes por carpeta completa o por pieza suelta, con
  buscador. Se reescribió en vez de reusar esos dos directamente porque
  ambos viven anidados dentro de otro componente con su propio estado.
  Disponible para cualquier vendedor, sin gate de plan -- las carpetas
  mismas ya están gateadas por `CarpetasPanel`.
- **`src/lib/tablonVentaImagen.js`** (nuevo): dibuja el póster con
  Canvas2D (mismo enfoque que la Wishlist, sin librería nueva), 3
  líneas de texto por carta en vez de las 2 de la Wishlist -- nombre,
  precio, y "idioma · estado" cuando aplica (producto sellado no tiene
  ninguno de los dos, se omite esa línea sin dejar un hueco raro).
- **Refactor sin cambio de comportamiento**: las utilidades de Canvas2D
  que ya tenía `wishlistImagen.js` (proxy de imágenes, carga, texto
  truncado, rectángulo redondeado, placeholder) se movieron a
  `src/lib/imagenCartasCanvas.js`, compartidas entre los dos
  generadores -- antes de este cambio hubiera tocado duplicar ~50
  líneas idénticas para el tablón.
- El link del pie de la imagen apunta al perfil público del vendedor
  (`?u=<slug>`) -- mismo patrón que ya usa `CopiarLinkBoton` en el resto
  de la app.

Verificado con `npm run build`. No se pudo probar generando la imagen
de verdad con datos reales (necesita sesión + Supabase, no alcanzable
desde este sandbox) -- se revisaron a mano los nombres de columna
(`idioma`/`condicion` sí existen en `mercado_listings` e
`inventario_tienda`, confirmado contra las migraciones 035/036; no
existen en `sellado_tienda`, manejado como `null`).

## 161. Cintilla de navegación móvil: rediseño flotante

Pedido explícito con capturas de referencia: la barra de abajo en
celular (Inicio/Tiendas/Catálogo/Colección/Vender) debía verse como una
píldora flotante separada del borde, no pegada de lado a lado como
antes.

- `CintillaMovilAbajo`: pasa de `bottom-0 left-0 right-0` (pegada,
  esquinas rectas) a `left-3 right-3` con `bottom: calc(env(safe-area-
  inset-bottom) + 12px)`, esquinas redondeadas (`rounded-2xl`), sombra
  y fondo semitransparente con blur -- mismo criterio visual que las
  capturas de referencia.
- `<main>` (el contenedor de toda la página) ganó un poco más de
  `padding-bottom` (`pb-24` → `pb-28`) para que el nuevo espacio que
  deja la cintilla flotante no tape el final del contenido.

Verificado con `npm run build` y una captura de pantalla en viewport
móvil (390×844) contra el dev server -- se ve igual que la referencia,
sin overlap con el contenido.

## 162. Tipografía de los títulos: de "Rye" (estilo vaquero) a "Baloo 2"

Pedido explícito: la fuente "Rye" que se usaba en todos los títulos
("Encuentra la carta que estás cazando", nombres de sección, etc.)
tenía un estilo western/vaquero que ya no encajaba con el resto de la
página. Se cambió por "Baloo 2" (Google Fonts) -- una fuente redonda,
gruesa y moderna, que combina bien con "Cabin" (la que ya se usaba para
texto normal/números) y encaja mejor con una app de cartas
coleccionables.

- Cambio mecánico de una sola cadena repetida 65 veces en `App.jsx`
  (`fontFamily: "'Rye', serif"` → `fontFamily: "'Baloo 2', sans-serif"`),
  hecho con `sed` en vez de 65 ediciones manuales -- se confirmó primero
  que la cadena exacta era idéntica en las 65 apariciones antes de
  reemplazar.
- El `<link>` de Google Fonts en `index.html` y el `@import` equivalente
  en `src/theme.js` (`FONTS`, usado como CSS global) se actualizaron
  igual, pidiendo los pesos 500/600/700/800 de Baloo 2 (los títulos usan
  negritas fuertes).

Verificado con `npm run build` y una captura de pantalla del dev server
-- el título de la portada ya se ve con la tipografía nueva, sin
overflow ni corte de texto donde antes cabía "Rye" (Baloo 2 es más
ancha, pero los títulos ya tenían suficiente espacio).

## 163. Varias colecciones privadas ("tableros", tipo "Choose Portfolio" de Collectr)

"Mi colección" dejó de ser una sola lista plana -- ahora se pueden
crear varias colecciones privadas nombrables (como el selector de
portafolios de Collectr que mandó el dueño de referencia: Main,
Wishlist Darkrai, komiya... cada una con su propio conteo), y la
pantalla de Colección se ve dividida en dos bloques siempre visibles
(no pestañas que se tapan): tus carpetas de venta arriba, tus
colecciones privadas nuevas abajo.

- **Hallazgo antes de construir nada**: "que se creen las carpetas
  también en tu inventario y viceversa" ya estaba resuelto de origen --
  `CarpetasPanel` (la función de carpetas de venta) ya soporta crear/
  borrar varias carpetas con su propia UI, y es la MISMA tabla
  compartida entre "Vender" y la pestaña de Colección -- no hizo falta
  construir ninguna sincronización, solo dejar de esconder esa función
  atrás de pestañas.
- **`coleccion_tableros`** (nueva, `080_coleccion_tableros.sql`): un
  tablero por colección privada (`nombre`, `es_principal`).
  `coleccion_usuario` (estado='tengo') gana `tablero_id` -- la MISMA
  carta ahora puede vivir en dos tableros distintos con cantidades
  independientes (antes solo había una fila posible por carta por
  usuario, sin importar cuántas "colecciones" quisieras tener).
- **El índice único que ya existía se partió en dos** (uno por carta
  por usuario, sin importar el tablero, ya no alcanza si quieres que la
  misma carta viva en dos tableros con cantidades separadas): la
  Wishlist (`estado='quiero'`) se quedó con EXACTAMENTE la misma regla
  de antes (`unique(perfil_id, tcg, card_api_id)`, sin tocar); "tengo"
  pasó a ser único POR TABLERO (`unique(tablero_id, tcg, card_api_id)`).
  Esto es lo más delicado de este cambio -- **verificado de verdad**
  contra un Postgres 16 real levantado en este sandbox (igual que las
  secciones 157/158): se confirmó que la Wishlist sigue chocando en
  23505 al agregar una carta repetida exactamente igual que antes (cero
  regresión ahí), que la misma carta en dos tableros crea dos filas
  independientes con sus propias cantidades, y que el nombre real de la
  restricción vieja de Postgres (`coleccion_usuario_perfil_id_tcg_
  card_api_id_key`) es el que se asumió para poder quitarla.
- **Dos funciones RPC nuevas**: `coleccion_resolver_tablero_principal()`
  (resuelve o crea el tablero "Principal" de un usuario nuevo de forma
  seguRA ante llamadas casi simultáneas -- probado de verdad simulando
  dos altas seguidas de un perfil sin tableros todavía, nunca crea dos
  "Principal") y `coleccion_marcar_tablero_principal(id)` (cambia cuál
  tablero es el principal en una sola transacción atómica, para que
  nunca haya una ventana con cero o dos tableros principales al mismo
  tiempo -- dos PATCH sueltos desde el cliente sí hubieran tenido ese
  hueco).
- **`coleccion_registrar_entrada`/`salida` ganan `p_tablero_id`**
  (opcional, con default `null` -- Modo Evento sigue llamándolas sin
  cambiar una sola línea, siempre cae en el tablero Principal). Los
  llamadores nuevos (`MiColeccionView`, `AgregarAColeccionForm`,
  `IntercambioBuilderView`) sí mandan el tablero activo.
- **`MiColeccionView`**: selector de tableros arriba en forma de chips
  (nombre + ⭐ si es el principal), con "+ Nueva", y un menú (✏️
  renombrar, ⭐ marcar como principal, 🗑️ borrar) en el tablero activo
  -- borrar pide confirmación explícita con cuántas cartas se van a
  borrar en cascada, y está bloqueado si es el único tablero o el
  marcado como principal (primero hay que quitarle la estrella).
- La colección privada se sigue quedando 100% privada -- nada de esto
  le agregó visibilidad pública a ningún tablero.

Verificado con `npm run build`, Playwright (la pantalla de Colección
navega sin tronar) y las pruebas SQL contra Postgres real ya descritas
arriba. Falta correr `080_coleccion_tableros.sql` en Supabase (después
de `079_coleccion_personal.sql`, si no se había corrido ya) y probar el
flujo completo con datos reales.

## Qué falta / próximos pasos posibles

- Agregar Lorcana y One Piece al boletín el día que haya una fuente de precio real integrada para cada uno.
- Dejar que el admin también programe (en vez de publicar de inmediato) un anuncio ya aprobado de una tienda.
- Permitir editar un torneo ya publicado (hoy solo se puede borrar y crear uno nuevo) y adjuntarle una imagen.
- Mapa de Google en el detalle del torneo (hoy solo muestra la dirección en texto).
- Enlazar al perfil público también desde el chat/inbox y desde el detalle de tienda (hoy solo desde las tarjetas del Mercado).
- Restaurar una publicación si el comprador rechaza una venta que sí ocurrió (ver limitación de la sección 28).
- La búsqueda de "Armar mazo" hace match de nombre simple (contiene el texto) — si dos cartas distintas comparten parte del nombre (ej. "Pikachu" y "Pikachu VMAX"), puede haber falsos positivos leves; no ata el nombre a un ID exacto de la carta como sí hace el catálogo de TCGdex.
- Deuda técnica pendiente: falta dividir el resto de `src/App.jsx` (los componentes de cada pantalla) en módulos más chicos — ver sección 34.
- Extender el color de acento y la biografía a la página de detalle de tienda del Mercado (hoy solo aplica en "Perfil público").
- La vista "Catálogo" (era → set → cartas) de Pokémon sigue sin respaldo de TCGdex -- solo se agregó al buscador de publicar (ver sección 128). Un set nuevo puede tardar en aparecer ahí aunque ya se pueda publicar con él a mano.
- Evaluar migrar de pokemontcg.io (ahora legado, sin cartas/sets nuevos) a Scrydex (su sucesor oficial, de paga) si el catálogo automático se empieza a sentir viejo de verdad -- ver sección 128.
- Falta poner `APITCG_API_KEY` en Vercel y confirmar que el piloto de apitcg.com funciona de verdad en producción (ver sección 129) -- y, si funciona bien, decidir si conviene volverla la fuente principal o migrar todo el catálogo (incluido producto sellado/TCGCSV) a ella.
- Falta correr `071_carpetas_ubicacion.sql` en Supabase (ver sección 132) para que el color/zona/envío/punto de encuentro de las carpetas funcionen en producción -- sin la migración, crear una carpeta seguirá fallando al intentar guardar esas columnas.
- Falta correr `072_carpeta_oculta.sql` en Supabase (ver sección 137) para que ocultar/mostrar cartas de una carpeta funcione en producción -- el link público de la carpeta y los exports CSV/Excel/PDF no dependen de esta migración y ya funcionan sin ella.
- Falta correr `076_mazos_limitless.sql` en Supabase (ver sección 148) para que "Tengo esta carta" y la importación desde Limitless TCG funcionen en producción -- y falta probar una importación real para confirmar que `parsearDecklistLimitless` lee bien el decklist real (la documentación oficial no confirma el shape exacto del JSON).
- Falta correr `077_sorteos_exclusivos_campana.sql` en Supabase (ver sección 154) para que los sorteos exclusivos por link de campaña funcionen en producción -- y falta probar el flujo completo end-to-end (cuenta nueva y cuenta existente, correo y Google) una vez desplegado.
- Falta correr `078_coleccion_usuario_wishlist_publica.sql` en Supabase (ver sección 155) para que el link público de la Wishlist rediseñada funcione en producción -- y falta confirmar en vivo que los hostnames de imagen del proxy nuevo (`?fuente=imgproxy`) son los correctos para pokemontcg.io/apitcg.com/TCGplayer (se infirieron, no se pudieron probar desde este sandbox). El avatar (GitHub/Google) ya se confirmó y arregló -- ver sección 156.
- Falta que el dueño pruebe en un celular Android real el gesto/tecla física de "atrás" (ver sección 156) -- se verificó con Playwright que el botón "atrás" del navegador funciona correctamente, pero el gesto físico de un teléfono real no se pudo probar desde este sandbox.
- Falta correr `079_coleccion_personal.sql` Y `080_coleccion_tableros.sql` en Supabase, en ese orden (ver secciones 158 y 163) para que la Colección/Portafolio, los intercambios y las varias colecciones privadas funcionen en producción -- las funciones RPC y el cambio del índice único ya se probaron de verdad contra un Postgres real en este sandbox (idempotencia, suma, resta, casos sin card_api_id, que la Wishlist no se afectó), pero falta el flujo end-to-end contra Supabase real y con datos de `mercado_listings`/`inventario_tienda` reales.
