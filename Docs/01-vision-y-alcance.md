# 01 · Visión y alcance

## Problema

En Villagarzón (Putumayo) pedir a domicilio depende de que cada local tenga su propio servicio y de conocer su número de WhatsApp. Los visitantes y extranjeros no conocen esos canales, y nadie da trazabilidad del pedido ni del dinero.

## Propuesta

RapiChonta permite pedir de los establecimientos registrados en la plataforma. El cliente elige el local en un mapa, arma su pedido con el menú (precios y tiempos de preparación actualizados por RapiChonta) y un domiciliario verificado de RapiChonta lo compra y se lo lleva. El cliente ve en todo momento **en qué estado está su pedido**, sin ver la ubicación del domiciliario.

## Lanzamiento

- **Ciudad:** Villagarzón, Putumayo, Colombia. La app y la web abren centradas en Villagarzón.
- **Equipo inicial:** 2 operadores y 2 domiciliarios, con la posibilidad de registrar más.
- **Cobertura:** solo los establecimientos registrados por RapiChonta. No se puede pedir en lugares que no estén en la plataforma.

## Actores

| Actor | Qué hace | Dónde lo hace (MVP) |
| --- | --- | --- |
| Cliente (local o extranjero) | Explora el mapa, arma el pedido con el menú, sigue el estado, decide si falta un producto, confirma la entrega y paga | App y web |
| Domiciliario | Recibe la notificación del pedido y decide si lo toma, compra, marca "listo", entrega y cobra | App (modo domiciliario; puede cambiar a modo cliente) |
| Operador | Ve los domiciliarios cercanos y envía cada pedido a uno o a todos, supervisa, revisa fotos de entrega, atiende incidencias y actualiza menús | Panel en la web |
| Administrador | Todo lo del operador, más establecimientos (con su área en el mapa), domiciliarios, zonas y tarifas, comisión, horario y cajas diarias | Panel en la web |
| Comercio aliado | Recibe pedidos directos | **Fuera del MVP** (fase de integración) |

## Modos de cumplimiento del pedido

1. **Compra por RapiChonta** (`COURIER_PURCHASE`) — único modo del MVP. El domiciliario compra en nombre del cliente.
2. **Pedido directo al comercio** (`MERCHANT_DIRECT`) — fase futura. El comercio aliado recibe el pedido y RapiChonta solo pone el domiciliario.

Ambos modos convivirán y el cliente elegirá. El modelo de datos ya contempla los dos (`fulfillmentMode`).

## Alcance del MVP

**Entra:**

- Pantalla principal con menú lateral a la izquierda y mapa centrado en el usuario (o en Villagarzón si no comparte ubicación), con los establecimientos registrados.
- Menú de cada establecimiento con precios, detalles y tiempo estimado de preparación por producto, administrado por RapiChonta.
- Carrito y pedido con dirección por ubicación actual o elegida en el mapa (también para enviar a otra persona).
- Registro e inicio de sesión del cliente con número de celular.
- Domiciliarios registrados y verificados por RapiChonta, con rol propio.
- El operador ve los domiciliarios cercanos y envía el pedido a uno específico o a todos; el primero que acepta lo toma.
- Horario de operación: fuera de horario se ve el mapa pero no se puede pedir.
- Español e inglés, con precios aproximados en dólares o euros para extranjeros.
- Estados automáticos por ubicación: "en el establecimiento" (al entrar al área del local) y "llegando" (a pocos metros del cliente).
- Aviso al domiciliario cuando se cumple el tiempo de preparación para que marque "listo" o "sigue en preparación".
- Chat estructurado (opciones cerradas) cuando falta un producto o cambió el precio.
- Confirmación de entrega por parte del cliente ("Recibí mi pedido"), reporte de "no lo recibí" y entrega con foto revisada por el operador si el cliente no confirma.
- Pago contra entrega: efectivo, Nequi, Daviplata o transferencia con el QR de la cuenta del domiciliario. La tarifa la paga siempre el cliente; no hay promociones en el MVP.
- Tope de 100.000 COP por pedido para clientes nuevos.
- Caja diaria por domiciliario con trazabilidad del dinero, o modo "compra con dinero propio". El domiciliario paga a RapiChonta un porcentaje de cada domicilio completado.
- Panel de administración: establecimientos y su área, menús, domiciliarios, zonas con tarifa fija (barrios y veredas), comisión, horario, cajas.

**No entra (todavía):**

- Integración directa con comercios.
- Ubicación del domiciliario en vivo para el cliente (decisión de producto: el cliente ve estados, no el mapa del domiciliario).
- Tarifas por kilometraje (se usan zonas con tarifa fija).
- Promociones y cupones.
- Pasarela de pago en línea dentro de la app.
- Calificaciones y fidelización.

## Métricas de éxito del MVP

- Tiempo desde que se crea el pedido hasta que un domiciliario lo acepta.
- Tiempo total de entrega y cuánto se desvía del tiempo de preparación estimado.
- Porcentaje de pedidos con producto faltante y qué decide el cliente.
- Pedidos con incidencia ("no recibido") y tiempo de resolución.
- Cajas diarias cerradas sin diferencias.
- Pedidos recurrentes por cliente en 30 días.
