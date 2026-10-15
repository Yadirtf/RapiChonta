# 07 · Roadmap por fases

Cada fase termina con algo usable y desplegado en Render. Una fase no empieza hasta que la anterior cumple su criterio de terminado.

## Fase 0 · Base del proyecto ✅ (este PR)

- Ramas `main` y `develop`, estructura `api/`, `web/`, `app/` con arquitectura limpia.
- API: salud y búsqueda de establecimientos cercanos (en memoria o PostGIS), esquema de datos y migración inicial, dominio del pedido con máquina de estados y pruebas.
- Web y app: menú lateral + mapa con establecimientos cercanos.
- `render.yaml` y documentación.

**Terminado cuando:** el blueprint se despliega en Render y la web muestra el mapa con datos de la base.

## Fase 1 · Pedido del cliente

- Módulo `identity`: registro e inicio de sesión con OTP, roles, sesiones.
- Direcciones del cliente con selección en el mapa y referencia ("casa azul, segundo piso").
- Crear pedido (texto libre, presupuesto estimado, dirección, método de pago) desde web y app.
- "Mis pedidos" con estado actual e historial.
- Catálogo inicial de establecimientos de la ciudad cargado (importación desde OpenStreetMap + revisión manual).
- Internacionalización es/en.
- CI en GitHub Actions: lint, pruebas y build de los tres proyectos en cada PR.

**Terminado cuando:** un cliente real puede crear un pedido y verlo en "Mis pedidos".

## Fase 2 · Operación: despacho y domiciliario

- Panel del operador en la web: cola de pedidos, mapa con domiciliarios disponibles por distancia, asignación y reasignación manual.
- Modo domiciliario en la app: disponibilidad, envío de ubicación periódica, aceptar/rechazar, cambiar estados, foto de la factura y total real.
- Panel de administración: establecimientos, domiciliarios, tarifas por distancia.
- Línea de tiempo del pedido para el cliente (consulta periódica).
- Liquidación diaria de domiciliarios.

**Terminado cuando:** se completa un pedido de punta a punta en la calle con un domiciliario real. **Aquí se lanza el piloto.**

## Fase 3 · Tiempo real y notificaciones

- WebSockets + Redis: estado del pedido y ubicación del domiciliario en vivo en el mapa del cliente.
- Notificaciones push (FCM y Huawei Push Kit) y SMS/WhatsApp de respaldo.
- Chat dentro del pedido entre cliente y domiciliario (con número enmascarado).
- Publicación en Google Play, App Store y Huawei AppGallery.

## Fase 4 · Pagos y crecimiento

- Pasarela de pagos en línea (por ejemplo Wompi o Mercado Pago, con PSE, tarjetas, Nequi y Daviplata).
- Calificaciones de domiciliario y establecimiento.
- Cupones, repetir pedido, favoritos.
- Analítica de negocio (embudos, tiempos, zonas calientes).

## Fase 5 · Comercios aliados

- Portal del comercio: menú con productos y precios, recepción de pedidos, horarios.
- Modo `MERCHANT_DIRECT` para que el cliente elija entre pedido directo al comercio o compra por RapiChonta.
- Asignación automática de domiciliarios (proximidad, carga, calificación) con el operador como supervisión.
- Extraer `dispatch` como servicio independiente si el volumen lo pide.
