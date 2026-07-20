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

## 3. Crear tu cuenta de Mercado Pago

1. Entra a https://www.mercadopago.com.mx/developers y crea una cuenta (o usa tu cuenta normal de Mercado Pago).
2. Ve a **Tus integraciones** → crea una aplicación → **Credenciales de prueba**.
3. Copia el **Access Token de prueba** → pégalo como `MP_ACCESS_TOKEN` en Vercel.
4. Con credenciales de prueba puedes pagar con [tarjetas de prueba de Mercado Pago](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards) sin mover dinero real.
5. Cuando quieras cobrar de verdad: activa tu cuenta de Mercado Pago para producción (te van a pedir datos fiscales/bancarios) y cambia `MP_ACCESS_TOKEN` por el **Access Token de producción**.

El flujo ya está construido: "Planes" → Suscribirme → Mercado Pago Checkout →
al aprobarse el pago, `api/mercadopago/webhook.js` activa el plan en Supabase
por 30 días automáticamente. Por ahora la renovación es manual (el usuario
vuelve a pagar cada mes); una suscripción recurrente automática con
Mercado Pago (`preapproval`) se puede agregar después si la quieres.

## 4. Notificaciones push reales (Wishlist Premium)

Ya está el código (service worker, VAPID, botón "Activar notificaciones").
Falta un paso manual en Supabase para que se disparen automáticamente:

1. Supabase → **Database** → **Webhooks** → *Create a new hook*.
2. Repite esto 3 veces, una por cada tabla: `mercado_listings`, `inventario_tienda`, `sellado_tienda`.
   - Evento: `INSERT`
   - Tipo: `HTTP Request`
   - URL: `https://TU-DOMINIO/api/alertas/verificar`
   - Método: `POST`
3. Guarda. Desde ese momento, cada vez que alguien publique una carta, se revisan las alertas de los usuarios Ultra Ball+ y se les manda push si coincide.

## 5. Importador masivo (Ente Ball)

Ya funciona sin configuración extra: en "Mi tienda", si el perfil tiene plan
`enteball`, aparece la caja para pegar una lista de texto o subir un
CSV/Excel. Formato esperado:

- Texto: `nombre, set (opcional), condición (opcional), precio, cantidad (opcional)` — una carta por línea.
- Excel/CSV: columnas `carta`, `set_nombre`, `condicion`, `precio`, `cantidad`.

## Qué falta / próximos pasos posibles

- **Boost / destacados de pago** (subir una publicación al tope de resultados por 3-7 días): es la idea #1 que mencionaste, no está incluida en esta pasada — la dejamos para cuando quieras.
- **Renovación automática** de la suscripción (Mercado Pago `preapproval`) en vez de pago manual mes a mes.
- Insignia de plan en el encabezado del chat (hoy solo aparece en directorio, búsqueda, mercado y detalle de tienda).
