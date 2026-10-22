# E10 · Entrega, confirmación e incidencias

Historias: H10.1 a H10.5. El cobro contra entrega (H10.2) se registra en la caja: ver [E11](E11-cajas-y-comisiones.md#cobro-contra-entrega-h102-rf-61). Módulo de la API: `orders`.

**Quién confirmó y cuándo** ya está en `order_status_history`: la fila que lleva el pedido a `DELIVERED` dice si fue el cliente (rol activo `CUSTOMER`) o un operador al revisar la foto o resolver una incidencia. Por eso aquí no hay una tabla "entregas" que lo repita; solo se guarda lo que el historial no tiene: la foto, la incidencia con su resolución y el motivo de cancelación.

## Diagrama

```mermaid
erDiagram
  orders ||--o| order_delivery_codes : "código de entrega"
  orders ||--o{ delivery_code_attempts : "intentos fallidos"
  users ||--o{ delivery_code_attempts : "domiciliario"
  orders ||--o| order_delivery_proofs : "foto de entrega"
  files ||--o| order_delivery_proofs : ""
  orders ||--o{ incidents : ""
  incident_types ||--o{ incidents : ""
  incident_statuses ||--o{ incidents : "estado actual"
  incidents ||--|{ incident_status_history : "historial"
  incident_resolution_types ||--o{ incidents : "resolución"
  order_statuses ||--o{ incident_resolution_types : "estado que deja al pedido"
  orders ||--o| order_cancellations : "motivo"
  cancellation_reasons ||--o{ order_cancellations : ""

  order_delivery_codes {
    uuid order_id PK,FK
    char code
    timestamptz created_at
  }
  delivery_code_attempts {
    uuid id PK
    uuid order_id FK
    uuid courier_user_id FK
    timestamptz attempted_at
  }
  order_delivery_proofs {
    uuid order_id PK,FK
    uuid file_id FK,UK
  }
  incidents {
    uuid id PK
    uuid order_id FK
    smallint incident_type_id FK
    uuid reported_by_user_id FK
    text description
    smallint status_id FK
    smallint resolution_type_id FK
    text resolution_notes
    timestamptz created_at
  }
  order_cancellations {
    uuid order_id PK,FK
    smallint cancellation_reason_id FK
    text notes
  }
```

## Código de entrega (RF-60)

`order_delivery_codes` (1:1 con el pedido, inmutable): `code` de 4 dígitos (`CHECK ^[0-9]{4}$`) creado al pasar a `ON_THE_WAY`. El cliente lo ve en el detalle del pedido solo mientras está en `ON_THE_WAY` o `ARRIVING`; el domiciliario nunca lo recibe de la API.

`delivery_code_attempts` (inmutable): una fila por código equivocado, con el domiciliario asignado (disparador). Con 5 intentos (`DELIVERY_CODE_MAX_ATTEMPTS`) el código se bloquea y la foto se habilita de una vez. Los aciertos no se guardan aquí: son la fila `→ DELIVERED` del historial con rol `COURIER`.

**Llegué:** `ON_THE_WAY → ARRIVING` también con rol `COURIER` (respaldo manual de la geocerca).

## Confirmación del cliente (H10.1, RF-60)

No crea filas propias: "Ya lo recibí" es el cambio a `DELIVERED` con rol activo `CUSTOMER`, desde `ON_THE_WAY`, `ARRIVING` o `PENDING_REVIEW`. "No lo recibí" es `PENDING_REVIEW → DISPUTED` con rol `CUSTOMER`. Ninguna pantalla es bloqueante: el código ya cierra la entrega sin que el cliente haga nada en la app.

Cerrar la entrega (código, cliente o foto) libera la asignación con el motivo `ORDER_COMPLETED`: `PENDING_REVIEW` y `DISPUTED` tienen `requires_courier = false`, así que el domiciliario queda disponible mientras se revisa.

## Entrega con foto (H10.4, RF-63)

`order_delivery_proofs` (1:1 con el pedido):

| Columna | Tipo | Nulo | Regla |
| --- | --- | --- | --- |
| `order_id` | FK `orders` | no | PK |
| `file_id` | FK `files` | no | `UNIQUE`. Propósito `DELIVERY_PROOF` (`requires_camera`), subido por el domiciliario asignado (disparador). Al entregar se llenan `files.captured_at` y, si hay ping reciente, `captured_location` |

Quién la tomó es `files.uploaded_by_user_id` (debe ser el domiciliario asignado, disparador) y cuándo, `files.captured_at`; no se repiten. `captured_location` se toma del último ping del domiciliario (si es de los últimos 10 minutos). Solo se permite si pasaron `delivery.proof_after_seconds` (300 s) desde que el pedido entró a `ARRIVING`, o si el código quedó bloqueado (caso de uso).

En la misma transacción: la foto, el historial `ARRIVING → PENDING_REVIEW` y la liberación del domiciliario. El cliente ve la foto y confirma o reporta; el operador también puede cerrar o abrir disputa (H10.5). Si nadie responde en `delivery.review_auto_close_seconds` (7200 s), el reloj de la API pasa el pedido a `DELIVERED` con origen `TIMER`.

## Incidencias (H10.3, H10.5, RF-62)

| Tabla | Regla |
| --- | --- |
| `incident_types` (sistema) | `NOT_RECEIVED`, `WRONG_ORDER`, `DAMAGED`, `OTHER`. Columna `opens_dispute boolean`: si al reportarla el pedido pasa a `DISPUTED` (sí en `NOT_RECEIVED`; no en los reclamos sobre un pedido ya entregado) |
| `incident_statuses` (sistema) | `OPEN` (inicial), `IN_REVIEW`, `RESOLVED` (terminal). Nivel completo |
| `incident_status_transitions` | `OPEN→IN_REVIEW`, `OPEN→RESOLVED`, `IN_REVIEW→RESOLVED` |
| `incident_status_history` | Patrón estándar: quién la tomó y quién la resolvió, y cuándo |
| `incident_resolution_types` (sistema) | `RESOLVED_AS_DELIVERED`, `RESOLVED_AS_CANCELLED`, `NO_ORDER_CHANGE`. Columna `resulting_order_status_id` FK `order_statuses`, nula: a qué estado pasa el pedido (`DELIVERED`, `CANCELLED`, o ninguno en reclamos sobre pedidos ya entregados) |

`incidents`:

| Columna | Tipo | Nulo | Regla |
| --- | --- | --- | --- |
| `order_id` | FK `orders` | no | Una sola incidencia sin resolver por pedido (disparador que bloquea la fila del pedido) |
| `incident_type_id` | FK | no | |
| `reported_by_user_id` | FK `users` | no | El cliente del pedido, o un operador cuando la abre al rechazar una foto de entrega (`PENDING_REVIEW → DISPUTED`) |
| `description` | `text` | sí | |
| `status_id` | FK `incident_statuses` | no | Estado actual (disparador del historial) |
| `resolution_type_id` | FK `incident_resolution_types` | sí | Lleno si y solo si el estado es `RESOLVED` (lo verifica el disparador del historial al pasar a `RESOLVED`) |
| `resolution_notes` | `text` | sí | |
| `created_at` | `timestamptz` | no | |

La resolución va en la propia incidencia porque ocurre una sola vez; quién y cuándo resolvió están en la fila `→ RESOLVED` del historial.

Un disparador diferido sobre `order_status_history` exige que todo pedido que entra a `DISPUTED` tenga una incidencia sin resolver.

Resolver (H10.5), en una transacción: llenar `resolution_type_id` y `resolution_notes`, historial de la incidencia `→ RESOLVED`, historial del pedido `DISPUTED → resulting_order_status_id` (si no es nulo) y notificaciones `INCIDENT_RESOLVED` al cliente y al domiciliario.

## Cancelaciones

`order_cancellations` (1:1 con el pedido): `cancellation_reason_id` y `notes`. Quién y cuándo canceló están en la fila `→ CANCELLED` del historial; un disparador diferido exige que todo pedido cancelado tenga su motivo.

`cancellation_reasons` (**sistema**, porque el programa usa algunos códigos, con nombres en `cancellation_reason_translations`): `CUSTOMER_REQUEST`, `NO_COURIER_AVAILABLE`, `ESTABLISHMENT_CLOSED`, `ALL_ITEMS_UNAVAILABLE`, `CUSTOMER_UNREACHABLE`, `INCIDENT_RESOLUTION`. Columna `is_automatic boolean` para las que usa el sistema.

## Alertas del panel (H10.5, RF-64)

Ninguna alerta se guarda; todas salen de `v_active_order_alerts`:

| Alerta | Condición |
| --- | --- |
| Sin asignar | Estado `PENDING_ASSIGNMENT` |
| Nadie aceptó | Último cambio `OFFERED → PENDING_ASSIGNMENT` con fuente `TIMER` |
| Preparación retrasada | `v_order_preparation.is_delayed` |
| Decisión vencida | Decisión `EXPIRED_REMOVED` en los últimos minutos |
| Foto por revisar | Estado `PENDING_REVIEW` |
| Incidencia | Incidencia sin resolver |
| Entregado sin cobro | Pedido `counts_as_delivered` sin movimiento `COLLECTION` ([E11](E11-cajas-y-comisiones.md)) |
