# Sistema de rangos / suscripciones
<!-- ping deploy directo a main 2026-07-21 16:33 UTC -->


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
| `PUBLIC_BASE_URL` | tu dominio en Vercel, ej. `https://encuentra-cartas.vercel.app` | sin `/` al final |
| `VAPID_PUBLIC_KEY` | `BBPa0Sb2JnCX1McAm78espGKsZw8B7lYD2CFV4F_-F_9EghLKVjuhmSnVYh8YRkLgTibA5l5b5OKoujZD3_Dn8c` | ya generada, coincide con la que está en `src/App.jsx` |
| `VAPID_PRIVATE_KEY` | te la doy en el resumen de este chat (no está en ningún archivo del repo) | cópiala directo a Vercel, no la subas a git |
| `VAPID_SUBJECT` | `mailto:tu-correo@dominio.com` | cualquier correo de contacto |
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
para el volumen actual. Si más adelante consigues un dominio propio, se
puede migrar a un servicio como Resend para mandar volúmenes mayores con
mejor entregabilidad.

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

## Qué falta / próximos pasos posibles

- Dejar que el admin también programe (en vez de publicar de inmediato) un anuncio ya aprobado de una tienda.
- Permitir editar un torneo ya publicado (hoy solo se puede borrar y crear uno nuevo) y adjuntarle una imagen.
- Mapa de Google en el detalle del torneo (hoy solo muestra la dirección en texto).
- Subir foto manual también en el formulario de "agregar" (hoy solo en las filas ya publicadas).
- Enlazar al perfil público también desde el chat/inbox y desde el detalle de tienda (hoy solo desde las tarjetas del Mercado).
- Restaurar una publicación si el comprador rechaza una venta que sí ocurrió (ver limitación de la sección 28).
- La búsqueda de "Armar mazo" hace match de nombre simple (contiene el texto) — si dos cartas distintas comparten parte del nombre (ej. "Pikachu" y "Pikachu VMAX"), puede haber falsos positivos leves; no ata el nombre a un ID exacto de la carta como sí hace el catálogo de TCGdex.
- Deuda técnica pendiente: falta dividir el resto de `src/App.jsx` (los componentes de cada pantalla) en módulos más chicos — ver sección 34.
- Extender el color de acento y la biografía a la página de detalle de tienda del Mercado (hoy solo aplica en "Perfil público").
