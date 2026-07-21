# Sistema de rangos / suscripciones

Guía para dejar funcionando de verdad lo que se agregó: los 5 rangos (Poké Ball,
Super Ball, Ultra Ball, Master Ball, Ente Ball), cobro con Mercado Pago,
Wishlist Premium con notificaciones push, y el importador masivo de Ente Ball.

## 1. Base de datos (obligatorio, hazlo primero)

Abre tu proyecto en Supabase → **SQL Editor** → *New query*, pega el contenido
de `supabase/migrations/002_suscripciones.sql` y dale **Run**. Es seguro
volver a correrlo si algo falla a medias.

Esto agrega:
- `perfiles.plan` (`pokeball` por defecto), `plan_vence`, `instagram`, `google_maps_url`
- Tabla `alertas` (Wishlist Premium)
- Tabla `push_subscriptions`
- Tabla `pagos`

Si quieres regalar Master Ball 90 días a las tiendas que ya tienes cargadas
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

## 5. Importador masivo (Ente Ball)

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

## Qué falta / próximos pasos posibles

- Dejar que el admin también programe (en vez de publicar de inmediato) un anuncio ya aprobado de una tienda.
- Permitir editar un torneo ya publicado (hoy solo se puede borrar y crear uno nuevo) y adjuntarle una imagen.
- Mapa de Google en el detalle del torneo (hoy solo muestra la dirección en texto).
- Subir foto manual también en el formulario de "agregar" (hoy solo en las filas ya publicadas).
