# 07 · Roadmap por fases

Cada fase termina con algo usable y desplegado en Render. Una fase no empieza hasta que la anterior cumple su criterio de terminado.

## Fase 0 · Base del proyecto ✅

- Ramas `main` y `develop`, estructura `api/`, `web/`, `app/` con arquitectura limpia.
- API: salud y búsqueda de establecimientos cercanos (en memoria o PostGIS), esquema de datos completo del MVP y migración inicial, dominio del pedido con máquina de estados y pruebas.
- Web y app: menú lateral + mapa centrado en Villagarzón con establecimientos cercanos.
- `render.yaml` y documentación.

**Terminado cuando:** el blueprint se despliega en Render y la web muestra el mapa con datos de la base.

## Fase 1 · Catálogo y pedido del cliente

- Módulo `identity`: registro e inicio de sesión con OTP, roles, sesiones; domiciliarios creados por el administrador.
- Panel de administración (web): establecimientos con punto y **área dibujada en el mapa**, menús (productos, precios, detalle, foto, tiempo de preparación), tarifas fijas.
- Carga del catálogo inicial de Villagarzón.
- Ficha del establecimiento con su menú, carrito y total con tarifa.
- Dirección por ubicación actual o punto en el mapa, también para otra persona.
- Crear pedido y "Mis pedidos" con estado e historial.
- Internacionalización es/en.
- CI en GitHub Actions: lint, pruebas y build de los tres proyectos en cada PR.

**Terminado cuando:** un cliente puede armar un pedido con el menú real de un local de Villagarzón y verlo en "Mis pedidos".

## Fase 2 · Operación del domiciliario y piloto

- Notificaciones push (FCM y Huawei Push Kit).
- Modo domiciliario en la app: disponibilidad, oferta de pedido con **Tomar pedido / No puedo**, cambio a modo cliente.
- Envío de ubicación del domiciliario y geocercas: llegada al local y llegada al cliente.
- Estados para el cliente con línea de tiempo y cuenta regresiva de preparación; avisos de "¿ya está listo?" al domiciliario.
- Chat estratégico para producto faltante o cambio de precio, con tiempo límite.
- Pantalla de entrega del cliente: **Recibí mi pedido / No lo recibí**; incidencias.
- Panel del operador: pedidos activos con alertas, línea de tiempo, ofrecer a un domiciliario, resolver incidencias.
- Cajas diarias: apertura por el administrador, movimientos automáticos por pedido, cierre con cuentas claras; modo "dinero propio".
- Publicación de la app para los 2 domiciliarios (distribución interna o prueba cerrada en tiendas).

**Terminado cuando:** se completan pedidos reales de punta a punta en Villagarzón con los 2 domiciliarios y las cajas cierran sin diferencias. **Aquí se lanza el piloto.**

## Fase 3 · Publicación y tiempo real

- Publicación en Google Play, App Store y Huawei AppGallery.
- WebSockets + Redis para actualizar las pantallas al instante.
- Repetir pedido, favoritos.
- Panel de métricas para operadores (tiempos, retrasos por local, incidencias).

## Fase 4 · Pagos y crecimiento

- Pago en línea dentro de la app (por ejemplo Wompi o Mercado Pago, con PSE, Nequi y Daviplata).
- Calificaciones de domiciliario y establecimiento.
- Cupones y promociones.
- Tarifas por distancia o zona si el negocio lo pide.

## Fase 5 · Comercios aliados

- Portal del comercio: menú propio, recepción de pedidos, tiempos reales de preparación.
- Modo `MERCHANT_DIRECT` para que el cliente elija entre pedido directo al comercio o compra por RapiChonta.
- Asignación automática de domiciliarios (proximidad, carga, calificación) con el operador como supervisión.
- Expansión a otros municipios del Putumayo.
