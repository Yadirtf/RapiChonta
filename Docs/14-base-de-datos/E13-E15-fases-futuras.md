# E13 a E15 · Fases futuras

Estas épicas son de prioridad baja. Se documentan ahora para comprobar que el modelo del MVP las soporta **agregando tablas, sin rediseñar** las existentes. Los detalles se ajustan cuando se tome cada historia.

## E13 · Publicación y tiempo real

| Historia | Tablas |
| --- | --- |
| H13.1 Publicar en tiendas | Ninguna |
| H13.2 Tiempo real (Socket.IO + Redis) | Ninguna. Los eventos salen de las inserciones en los historiales; Redis guarda solo lo efímero (última ubicación, salas de socket) |
| H13.3 Repetir pedido y favoritos | `favorite_establishments (user_id, establishment_id, created_at)` con PK compuesta. "Repetir" no crea tablas: arma un carrito con la versión **vigente** de los productos de un pedido anterior (el precio pudo cambiar) |
| H13.4 Métricas | Vistas o vistas materializadas sobre `order_status_history`, `v_order_preparation`, `order_item_adjustments` e `incidents`. No se guardan métricas a mano |

```mermaid
erDiagram
  users ||--o{ favorite_establishments : ""
  establishments ||--o{ favorite_establishments : ""
```

## E14 · Pagos en línea y crecimiento

```mermaid
erDiagram
  orders ||--o{ payment_transactions : "pagos en línea"
  payment_gateways ||--o{ payment_transactions : ""
  payment_methods ||--o{ payment_transactions : ""
  payment_transaction_statuses ||--o{ payment_transactions : "estado actual"
  payment_transactions ||--|{ payment_transaction_status_history : "historial"
  orders ||--o| courier_ratings : ""
  orders ||--o| establishment_ratings : ""
  coupons ||--o{ coupon_redemptions : ""
  orders ||--o| coupon_redemptions : ""
  discount_types ||--o{ coupons : ""
  municipalities ||--o{ distance_fee_tiers : ""
  distance_fee_tiers ||--|{ distance_fee_tier_prices : "versiones"
  distance_fee_tier_prices ||--o{ orders : "tarifa por distancia"
```

### H14.1 Pago en línea (RF-90)

| Tabla | Regla |
| --- | --- |
| `payment_gateways` (sistema) | `WOMPI`, `MERCADO_PAGO` |
| `payment_gateway_methods` | `payment_gateway_id`, `payment_method_id`, PK compuesta: qué medios cobra cada pasarela (por ejemplo `NEQUI` en línea por Wompi) |
| `payment_transactions` | `order_id`, `payment_gateway_id`, `payment_method_id` (`PSE`, `CARD`, `NEQUI`), `amount`, `external_reference` (`UNIQUE` por pasarela), `status_id`, `created_at` |
| `payment_transaction_statuses` | `CREATED`, `PENDING`, `APPROVED`, `DECLINED`, `REFUNDED` con transiciones e historial estándar. Los webhooks de la pasarela insertan en el historial |

Un pedido pagado en línea no tiene `COLLECTION` en la caja: el cliente le pagó a RapiChonta. En ese caso RapiChonta le debe al domiciliario la compra y su parte de la tarifa, así que la caja necesitará un tipo `ONLINE_SETTLEMENT` (−1) y la vista de cierre asignará el pedido a la caja por su asignación en lugar de por el cobro. Es un cambio de datos (tipo nuevo) y de vista, no de tablas.

### H14.2 Calificaciones (RF-91)

Dos tablas en lugar de una polimórfica, para que cada calificación tenga su llave foránea real:

- `courier_ratings (order_id PK, score smallint CHECK 1..5, comment, created_at)`.
- `establishment_ratings (order_id PK, score smallint CHECK 1..5, comment, created_at)`.

Quién calificó no se guarda: es el cliente del pedido. A quién se calificó tampoco: es el domiciliario del pedido (`v_order_courier`, su última asignación) o el establecimiento del pedido. Solo se permite en pedidos `counts_as_delivered` (disparador).

### H14.3 Cupones (RF-92)

| Tabla | Regla |
| --- | --- |
| `discount_types` (sistema) | `PERCENTAGE`, `FIXED_AMOUNT`, `FREE_DELIVERY` |
| `coupons` | `code citext UNIQUE`, `discount_type_id`, `value numeric(12,2)` (nulo en `FREE_DELIVERY`), `municipality_id`, `starts_at`, `ends_at`, `max_redemptions`, `max_per_customer`, `min_items_total`, `created_by_user_id`, `deactivated_at` |
| `coupon_redemptions` | `order_id` PK, `coupon_id`. El descuento se calcula en `v_order_amounts`; no se guarda |

"Vencido" se calcula con `ends_at`; "agotado" con el conteo de redenciones. Ninguno es un estado guardado.

### H14.4 Tarifa por distancia (RF-93)

`distance_fee_tiers (id, municipality_id, from_meters, to_meters, deactivated_at)` con `distance_fee_tier_prices (id, tier_id, amount, created_by_user_id, created_at)` versionadas, igual que las zonas.

El pedido pasa a apuntar a **una de dos** tarifas: se agrega `orders.distance_fee_price_id` nulo, `delivery_zone_fee_id` pasa a nulo y un `CHECK (num_nonnulls(delivery_zone_fee_id, distance_fee_price_id) = 1)` exige exactamente una. `v_order_amounts` toma el monto de la que exista. Cuál esquema usa cada municipio es un catálogo `fee_schemes` (`ZONE_FLAT`, `DISTANCE`) con su elección versionada en `municipality_fee_schemes (id, municipality_id, fee_scheme_id, effective_on, created_by_user_id)`; no es un parámetro porque `setting_values` solo guarda números.

## E15 · Comercios aliados

> **Implementado (H15.1 y H15.2)** en la migración `20261031000000_partner_stores_e15`. H15.3 y H15.4 siguen como diseño.

```mermaid
erDiagram
  establishments ||--o{ establishment_partnerships : "convenios"
  files ||--o{ establishment_partnerships : "contrato firmado"
  users ||--o{ establishment_staff : "atiende"
  establishments ||--o{ establishment_staff : ""
  fulfillment_modes ||--o{ order_status_transition_modes : "su recorrido"
  order_status_transitions ||--o{ order_status_transition_modes : ""
  orders ||--o| merchant_order_acceptances : "el comercio acepta"
  merchant_order_acceptances ||--o| merchant_order_readiness : "y lo marca listo"
```

| Historia | Tablas |
| --- | --- |
| H15.1 Portal del comercio | Rol `MERCHANT` en `roles` con los permisos `store.respond_orders`, `store.manage_status` y `products.manage`; el convenio y el personal se manejan desde el panel con `partners.manage`. `establishment_partnerships (id, establishment_id, started_on, ended_on, agreement_file_id, created_by_user_id, created_at, ended_by_user_id)`: el local es aliado mientras tenga un convenio vigente en la fecha del municipio; un `EXCLUDE` con `daterange` impide dos convenios a la vez y terminar uno el mismo día que empieza lo anula. El contrato es un archivo privado (`PARTNERSHIP_AGREEMENT`). `establishment_staff (id, user_id, establishment_id, granted_by_user_id, granted_at, revoked_by_user_id, revoked_at)`: quién atiende cada local; un acceso activo por persona y local (índice parcial). La vista `v_merchant_establishments` cruza personal activo con convenio vigente: sin convenio el portal no muestra el local. El horario propio del local (`establishment_hours`) queda para después: hoy el comercio abre o pausa su local (`ACTIVE` ↔ `TEMPORARILY_CLOSED`, con auditoría) |
| H15.2 Pedido directo o compra por RapiChonta | `fulfillment_modes` gana `initial_status_id` (en qué estado nace el pedido) y `requires_partnership`; `MERCHANT_DIRECT` nace en `AWAITING_MERCHANT` y solo se ofrece con convenio vigente. `order_status_transition_modes (from_status_id, to_status_id, fulfillment_mode_id)` dice qué transiciones vale cada modo: el directo va `AWAITING_MERCHANT → PENDING_ASSIGNMENT → ACCEPTED → AT_ESTABLISHMENT → ON_THE_WAY`, sin compra ni preparación a cargo del domiciliario. `merchant_order_acceptances (order_id PK, accepted_by_user_id, preparation_minutes, accepted_at)` y `merchant_order_readiness (order_id PK, marked_by_user_id, ready_at)`, ambas inmutables. El rechazo del comercio es una cancelación con `cancellation_reasons.is_merchant_reason` (`MERCHANT_OUT_OF_STOCK`, `MERCHANT_TOO_BUSY`, `MERCHANT_CLOSING`). Al recoger, el domiciliario registra un movimiento `PURCHASE` de su caja por lo de los productos (le paga al local) y el pedido pasa a `ON_THE_WAY`. El aviso `MERCHANT_ORDER_READY` le llega al domiciliario; el operador ve la alerta `MERCHANT_SILENT` si el comercio no responde |
| H15.3 Asignación automática | `order_offers.sent_by_user_id` nulo indica que la envió el sistema; la estrategia es un catálogo `assignment_strategies` referenciado desde la oferta. La carga se calcula con asignaciones vigentes y la calificación con `courier_ratings` |
| H15.4 Otros municipios | Sin tablas nuevas: un municipio con `launched_at`, sus zonas, tarifas, horario, comisión, parámetros y roles con alcance a ese municipio |

Los locales sin convenio siguen como siempre: RapiChonta es el intermediario y el domiciliario compra por el cliente (`COURIER_PURCHASE`).
