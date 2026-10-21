# E07 · Asignación de pedidos por el operador

Historias: H07.1 a H07.5. Módulo de la API: `dispatch`.

El esquema provisional guardaba en cada `OrderOffer` el modo y quién la envió, repetidos por cada domiciliario de un envío "a todos". Aquí se separa la **oferta** (un envío del operador) de sus **destinatarios** (cada domiciliario y su respuesta) y de la **asignación** (quién quedó con el pedido).

## Diagrama

```mermaid
erDiagram
  orders ||--o{ order_offers : "envíos"
  offer_modes ||--o{ order_offers : ""
  users ||--o{ order_offers : "envió (operador)"
  order_offers ||--|{ order_offer_recipients : "a quién"
  courier_profiles ||--o{ order_offer_recipients : ""
  offer_recipient_statuses ||--o{ order_offer_recipients : "respuesta"
  order_offer_recipients ||--o| order_assignments : "aceptó"
  orders ||--o{ order_assignments : ""
  assignment_release_reasons ||--o{ order_assignments : ""

  order_offers {
    uuid id PK
    uuid order_id FK
    smallint offer_mode_id FK
    uuid sent_by_user_id FK
    timestamptz created_at
    timestamptz expires_at
  }
  order_offer_recipients {
    uuid order_offer_id PK,FK
    uuid courier_user_id PK,FK
    smallint status_id FK
    timestamptz responded_at
  }
  order_assignments {
    uuid id PK
    uuid order_id FK
    uuid order_offer_id FK
    uuid courier_user_id FK
    timestamptz assigned_at
    timestamptz released_at
    smallint release_reason_id FK
    uuid released_by_user_id FK
  }
```

## Tablas

### `order_offers` (H07.3, RF-32)

| Columna | Tipo | Nulo | Regla |
| --- | --- | --- | --- |
| `order_id` | FK `orders` | no | Índice `(order_id, created_at)` |
| `offer_mode_id` | FK `offer_modes` | no | `SPECIFIC` (un domiciliario elegido), `BROADCAST` (todos los disponibles) |
| `sent_by_user_id` | FK `users` | sí | Operador o administrador. Nulo solo cuando la asignación automática de E15 la envía |
| `created_at` | `timestamptz` | no | |
| `expires_at` | `timestamptz` | no | `created_at + offers.timeout_seconds` ([excepción](README.md#excepciones-deliberadas)). `CHECK (expires_at > created_at)` |

`offer_modes` (sistema) con `max_recipients smallint` nulo (1 para `SPECIFIC`): un disparador impide más destinatarios de los permitidos (bloquea la fila de `orders` para que dos inserciones no lo pasen a la vez).

### `order_offer_recipients`

PK `(order_offer_id, courier_user_id)`. `courier_user_id` es FK a `courier_profiles (user_id)`, así que solo se puede ofrecer a domiciliarios.

`offer_recipient_statuses` (sistema):

| code | is_initial | is_terminal | Uso |
| --- | --- | --- | --- |
| `PENDING` | sí | | Esperando respuesta |
| `ACCEPTED` | | sí | Tomó el pedido |
| `REJECTED` | | sí | "No puedo" |
| `EXPIRED` | | sí | Venció sin responder |
| `WITHDRAWN` | | sí | Otro lo tomó primero o el operador canceló |

Las respuestas son un solo paso (`PENDING` → final) con su hora en `responded_at`, así que no llevan tabla de historial: la fila misma es el historial. Un disparador impide cambiar una respuesta final.

### `order_assignments`

Quién tiene el pedido. Puede haber varias por pedido si se reasigna, pero **una sola vigente**.

| Columna | Tipo | Nulo | Regla |
| --- | --- | --- | --- |
| `order_id` | FK `orders` | no | Índice único parcial `(order_id) WHERE released_at IS NULL`: **garantiza que el primero que acepta gana** |
| | | | Índice único parcial `(courier_user_id) WHERE released_at IS NULL`: un domiciliario lleva **un pedido a la vez** (dos aceptaciones simultáneas del mismo domiciliario no pasan) |
| `order_offer_id`, `courier_user_id` | | no | FK compuesta → `order_offer_recipients`: solo se asigna a quien recibió la oferta. `UNIQUE (order_offer_id, courier_user_id)` |
| `assigned_at` | `timestamptz` | no | |
| `released_at` | `timestamptz` | sí | |
| `release_reason_id` | FK `assignment_release_reasons` | sí | `COURIER_RELEASED`, `OPERATOR_REASSIGNED`, `ORDER_CANCELLED`, `ORDER_COMPLETED`. `CHECK ((released_at IS NULL) = (release_reason_id IS NULL))` |
| `released_by_user_id` | FK `users` | sí | |

La oferta debe pertenecer al mismo pedido: FK compuesta `(order_offer_id, order_id)` → `order_offers (id, order_id)` (con `UNIQUE (id, order_id)` en `order_offers`).

**Vida de una asignación.** Se libera siempre que el domiciliario deja de tener el pedido: si lo suelta, si lo reasignan, si se cancela y también cuando el pedido llega a un estado terminal (`ORDER_COMPLETED`, en la misma transacción que la fila `→ DELIVERED`). Así:

- **Domiciliario ocupado** = tiene una asignación vigente ([E08](E08-modo-domiciliario.md#disponibilidad-h081-rf-40)).
- **Domiciliario del pedido** = la asignación vigente o, en un pedido terminado, la última (`v_order_courier`).
- Qué estados llevan domiciliario lo dice el catálogo: `order_statuses.requires_courier` (verdadero de `ACCEPTED` a `DISPUTED`). Un disparador diferido exige **asignación vigente ⇔ `requires_courier`** al confirmar la transacción, sin códigos de estado escritos en el SQL.

## Aceptar una oferta (H07.3 / H08.2), en una transacción

1. Bloquear el pedido (`SELECT ... FROM orders WHERE id = :pedido FOR UPDATE`): dos domiciliarios que aceptan a la vez quedan en fila, y el segundo ya ve el pedido tomado.
2. Marcar la respuesta, solo si sigue pendiente y no venció:

   ```sql
   UPDATE order_offer_recipients r
   SET status_id = :accepted, responded_at = clock_timestamp()
   FROM order_offers o
   WHERE o.id = r.order_offer_id
     AND r.order_offer_id = :oferta AND r.courier_user_id = :domiciliario
     AND r.status_id = :pending AND clock_timestamp() < o.expires_at;
   -- 0 filas: se explica por qué (ORDER_ALREADY_TAKEN, OFFER_EXPIRED u OFFER_CLOSED).
   ```
3. `INSERT INTO order_assignments`. Los dos índices únicos parciales son la red de seguridad: ni dos asignaciones vigentes por pedido ni dos por domiciliario (`COURIER_BUSY`).
4. Historial del pedido `OFFERED → ACCEPTED`.
5. Los demás destinatarios `PENDING` del pedido pasan a `WITHDRAWN`; un disparador encola `OFFER_WITHDRAWN` en la bandeja de E06 (y `ORDER_OFFERED` al crear cada destinatario), y el código llama a `Notifier.kick()`.

Si el operador vuelve a enviar mientras el pedido está en `OFFERED` (por ejemplo, de uno a todos), se agrega otra oferta sin otra fila de historial. `BROADCAST` excluye a quien ya dijo no o ya tiene el pedido en pantalla; `SPECIFIC` permite insistirle a quien dijo no.

## Vencimiento (H07.4)

Un reloj en la API (`DispatchClock`) duerme hasta el próximo vencimiento (no consulta cada segundo; si no hay ofertas vivas, revisa cada 5 min). Marca `EXPIRED` a los destinatarios `PENDING` de ofertas vencidas y, si el pedido sigue en `OFFERED` sin asignación vigente, inserta en el historial `OFFERED → PENDING_ASSIGNMENT` con fuente `TIMER`.

Si **todos** los destinatarios dicen "No puedo" antes del plazo, el pedido vuelve al panel en ese momento con la fuente `OFFERS_DECLINED` (catálogo `status_sources`), sin esperar el vencimiento. El panel resalta los pedidos cuyo último cambio fue cualquiera de los dos y la campana vuelve a sonar.

## Domiciliarios cercanos (H07.2, RF-31)

Todos los disponibles, verificados y libres, ordenados por cercanía al local (el mapa los muestra todos):

```sql
SELECT c.user_id, ST_Distance(l.location, e.location) AS distancia
FROM v_dispatchable_couriers c
JOIN v_open_availability a ON a.courier_user_id = c.user_id      -- E08
JOIN v_courier_last_location l ON l.courier_user_id = c.user_id  -- E08
JOIN establishments e ON e.id = :establecimiento
WHERE l.recorded_at > now() - interval '2 minutes'
  AND NOT EXISTS (SELECT 1 FROM order_assignments x
                  WHERE x.courier_user_id = c.user_id AND x.released_at IS NULL)
ORDER BY distancia;
```

## Auditoría del personal (H07.5, RNF-07)

Quién asignó, reasignó o canceló ya está en `order_offers.sent_by_user_id`, `order_assignments.released_by_user_id` y `order_status_history.changed_by_user_id`. La vista `v_staff_activity` une esas tablas con `audit_logs` ([00](00-transversal.md#auditoría)) sin copiar nada:

| Origen | Acción mostrada |
| --- | --- |
| `audit_logs` | Su código de `audit_actions` (personal, configuración, catálogo) |
| `order_offers` con `sent_by_user_id` | `ORDER_OFFERED` con modo y número de destinatarios |
| `order_status_history` hecho con un rol de personal (salvo `→ OFFERED`, que ya es la oferta) | `ORDER_STATUS_CHANGED` u `ORDER_CANCELLED`, con la nota |
| `order_assignments` liberadas por alguien distinto del domiciliario | `ORDER_REASSIGNED` con el motivo |

`GET /admin/audit` filtra por días (hora de Colombia), persona y pedido, y pagina con un cursor `(occurred_at, id)`. Un administrador con municipio ve solo lo de su municipio; lo que no es de un pedido lo ve el administrador general. Todas las tablas de origen son de solo inserción.
