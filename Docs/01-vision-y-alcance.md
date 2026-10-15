# 01 · Visión y alcance

## Problema

En la ciudad, pedir a domicilio depende de que el comercio tenga su propio servicio o esté en una plataforma grande. Muchos locales de comida rápida, tiendas y supermercados pequeños no están en ninguna, y los visitantes extranjeros no conocen los números ni los canales locales (WhatsApp, llamadas).

## Propuesta

RapiChonta permite pedir **cualquier cosa de cualquier establecimiento cercano**, esté o no afiliado. El cliente elige el lugar en un mapa, describe lo que quiere y un domiciliario de RapiChonta lo compra y se lo lleva.

## Actores

| Actor | Qué hace | Dónde lo hace (MVP) |
| --- | --- | --- |
| Cliente (local o extranjero) | Explora el mapa, crea el pedido, sigue su estado, paga | App y web |
| Operador / despachador | Recibe pedidos, asigna domiciliario manualmente, resuelve incidencias | Panel en la web (rol operador) |
| Domiciliario | Recibe asignación, compra, sube foto de la factura, entrega | App (modo domiciliario según su rol) |
| Administrador | Gestiona establecimientos, domiciliarios, tarifas y zonas | Panel en la web (rol admin) |
| Comercio aliado | Recibe pedidos directos | **Fuera del MVP** (fase de integración) |

## Modos de cumplimiento del pedido

1. **Compra por RapiChonta** (`COURIER_PURCHASE`) — único modo del MVP. El domiciliario compra en nombre del cliente.
2. **Pedido directo al comercio** (`MERCHANT_DIRECT`) — fase futura. El comercio aliado prepara el pedido y RapiChonta solo pone el domiciliario.

Ambos modos convivirán y el cliente elegirá. El modelo de datos ya contempla los dos (`fulfillmentMode`) para no rehacer nada después.

## Alcance del MVP

**Entra:**

- Pantalla principal con menú lateral a la izquierda y mapa en el resto de la pantalla, centrado en la ubicación del usuario.
- Restaurantes y comida rápida cercanos en el mapa (las demás categorías ya existen en el menú y se activan cuando haya catálogo).
- Ficha del establecimiento y creación de pedido con texto libre ("2 hamburguesas dobles sin cebolla"), presupuesto estimado y dirección de entrega.
- Registro e inicio de sesión del cliente con número de celular.
- Panel del operador: cola de pedidos, mapa de domiciliarios disponibles ordenados por distancia, asignación manual.
- Modo domiciliario en la app: disponibilidad, pedido asignado, cambio de estados, foto de la factura.
- Seguimiento del estado del pedido por el cliente.
- Pago contra entrega (efectivo o transferencia) con el total real de la factura más la tarifa.

**No entra (todavía):**

- Integración con comercios, menús y precios exactos por producto.
- Asignación automática de domiciliarios.
- Pasarela de pago en línea.
- Seguimiento del domiciliario en tiempo real en el mapa (se agrega en la fase 3).
- Programa de fidelización, cupones y calificaciones.

## Supuestos (validar)

- El lanzamiento es en **una sola ciudad** de Colombia (el uso de "domiciliario" y el mercado sugieren Colombia; se infiere, no está confirmado). El centro por defecto del mapa y las tarifas se ajustan cuando se confirme la ciudad.
- Al inicio hay pocos domiciliarios (5 a 20) y un operador por turno, por eso la asignación manual es viable.
- El catálogo de establecimientos lo carga el equipo (manual o importado de OpenStreetMap), no los comercios.

## Métricas de éxito del MVP

- Tiempo desde que se crea el pedido hasta que se asigna domiciliario (meta: menos de 3 minutos).
- Tiempo total de entrega.
- Porcentaje de pedidos cancelados y motivo.
- Pedidos recurrentes por cliente en 30 días.
- Diferencia entre presupuesto estimado y total real (mide qué tan bien estima el cliente).
