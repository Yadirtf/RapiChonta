# 02 · Stack tecnológico

Criterios usados para elegir: escalar sin reescribir, comunidad grande (fácil contratar y encontrar respuestas), un solo lenguaje donde se pueda, costo bajo en el MVP y que funcione en Huawei sin Google Play Services.

## Resumen

| Capa | Elección | Versión base |
| --- | --- | --- |
| API | NestJS + TypeScript | Nest 11, Node 22 |
| Base de datos | PostgreSQL + PostGIS | Postgres 16 |
| ORM y migraciones | Prisma | 6 |
| Tiempo real (fase 3) | Socket.IO sobre NestJS Gateways + Redis | — |
| Web | Next.js (App Router) + React + TypeScript | Next 15, React 19 |
| Estilos y animación | Tailwind CSS + Framer Motion + lucide-react | Tailwind 4 |
| Mapa web | MapLibre GL JS + OpenFreeMap / MapTiler | MapLibre 5 |
| App | Flutter + Riverpod + go_router + Dio | Flutter 3.35+, Riverpod 3 |
| Mapa app | flutter_map (OpenStreetMap) | 8 |
| Hosting de pruebas | Render (Blueprint `render.yaml`) | — |

## API: NestJS

**Por qué:** impone módulos, inyección de dependencias y capas, lo que encaja directamente con arquitectura limpia; es TypeScript, igual que la web, así se comparten tipos y personas; tiene soporte oficial para WebSockets, colas (BullMQ), validación, throttling y microservicios cuando haga falta separar (por ejemplo, el despacho de pedidos).

**Escalabilidad:** la API es *stateless* (los tokens viajan en cada petición), así que se escala horizontalmente agregando instancias. Lo que necesita estado compartido (sockets, colas, caché) va a Redis.

**Alternativas descartadas:**
- *Express/Fastify solos:* más libertad pero toca construir a mano la estructura que Nest ya da; en un equipo que crece se desordena.
- *Go o .NET:* excelente rendimiento, pero obliga a un segundo lenguaje distinto al de la web; el cuello de botella de RapiChonta no será CPU sino operación.
- *Firebase/Supabase como backend completo:* rápido al inicio, pero la lógica de negocio (estados del pedido, dinero, asignación) termina repartida en reglas y funciones difíciles de probar.

## Base de datos: PostgreSQL + PostGIS

**Por qué:** los pedidos, pagos y estados son datos relacionales con transacciones (no se puede perder un cambio de estado ni duplicar un cobro). PostGIS agrega consultas geográficas con índices espaciales: "establecimientos a menos de 3 km ordenados por distancia" y "domiciliarios disponibles más cercanos al establecimiento" son una sola consulta SQL indexada (`ST_DWithin`). Render ofrece Postgres administrado con PostGIS.

**Alternativas descartadas:**
- *MongoDB:* tiene consultas geográficas, pero las transacciones entre colecciones y la integridad de pedidos/pagos son más frágiles.
- *MySQL:* soporte espacial más limitado que PostGIS.

**Prisma:** migraciones versionadas y tipado fuerte. Prisma no modela columnas `geography` de forma nativa, así que esas consultas se escriben en SQL dentro del repositorio de infraestructura (ya implementado en `PrismaEstablishmentRepository`). Si el uso geográfico crece mucho, se puede cambiar a Drizzle sin tocar dominio ni casos de uso, justamente por la arquitectura limpia.

## Web: Next.js + Tailwind + Framer Motion + MapLibre

**Por qué:** Next.js es el framework React con mayor comunidad; renderizado en servidor para páginas públicas (SEO de establecimientos y landing) y componentes de cliente para el mapa. Tailwind permite un sistema visual propio sin parecerse a una plantilla. Framer Motion da las transiciones y microinteracciones (tarjetas que suben, marcadores que reaccionan, línea de tiempo del pedido animada) que hacen que la experiencia no sea monótona. MapLibre dibuja mapas vectoriales personalizables con colores de marca, rotación e inclinación 3D, sin costo por carga.

**Alternativas descartadas:**
- *Angular:* sólido, pero menos ecosistema para UI animada y mapas.
- *Vue/Nuxt:* buena opción, comunidad más pequeña en la región para contratar.
- *Google Maps JS:* cobra por carga de mapa y su estilo es el mismo de todas las apps.

## App: Flutter

**Por qué:** un solo código Dart genera Android, iOS, web y escritorio; el motor de dibujo propio hace que la app se vea igual en todos los dispositivos y permite animaciones fluidas a 60/120 fps. Para **Huawei** (sin Google Play Services) Flutter funciona sin cambios si se evitan dependencias de Google: por eso se usa `flutter_map` con OpenStreetMap y `geolocator` (que usa el LocationManager de Android). Para HarmonyOS NEXT existe el port de Flutter mantenido por la comunidad OpenHarmony, lo que deja la puerta abierta.

**Alternativas descartadas:**
- *React Native / Expo:* compartiría TypeScript con la web, que es su gran ventaja. Se descarta porque varias librerías clave (mapas, notificaciones de Expo) dependen de servicios de Google, lo que complica Huawei, y porque el rendimiento en animaciones complejas depende más del dispositivo. Es una alternativa válida si el equipo es 100 % TypeScript.
- *Nativo (Kotlin + Swift):* descartado por pedido explícito: dos o tres códigos distintos.
- *Ionic/Capacitor:* es una web empaquetada; la fluidez del mapa y las animaciones queda por debajo.

## Servicios externos propuestos

| Necesidad | MVP | Cuando crezca |
| --- | --- | --- |
| Teselas de mapa | OpenFreeMap (gratis) / OSM | MapTiler o Stadia (plan pago, estilo propio) |
| Geocodificación de direcciones | Nominatim (OSM) con caché | Google Geocoding o Mapbox (mejor precisión en Colombia) |
| SMS / WhatsApp OTP | Twilio Verify o proveedor local | Mismo |
| Archivos (fotos de factura) | Cloudflare R2 o S3 | Mismo |
| Notificaciones push | FCM (Android/iOS) + Huawei Push Kit | Mismo |
| Errores y métricas | Sentry (plan gratis) | Sentry + Grafana |
