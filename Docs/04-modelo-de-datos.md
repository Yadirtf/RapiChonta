# 04 · Modelo de datos

El esquema vive en [`api/prisma/schema.prisma`](../api/prisma/schema.prisma) y la migración inicial en `api/prisma/migrations/`.

```mermaid
erDiagram
  USER ||--o{ ADDRESS : tiene
  USER ||--o| COURIER_PROFILE : "es domiciliario"
  USER ||--o{ ORDER : pide
  COURIER_PROFILE ||--o{ ORDER : entrega
  ESTABLISHMENT ||--o{ ORDER : "se compra en"
  ADDRESS ||--o{ ORDER : "se entrega en"
  ORDER ||--|{ ORDER_ITEM : contiene
  ORDER ||--o{ ORDER_STATUS_EVENT : registra

  USER { uuid id; enum role; string phone; string email; string locale }
  ADDRESS { uuid id; string line; string reference; geography location }
  COURIER_PROFILE { uuid user_id; string vehicle_type; bool is_available; geography last_location }
  ESTABLISHMENT { uuid id; string name; enum category; geography location; bool is_partner }
  ORDER { uuid id; string code; enum status; enum fulfillment_mode; decimal purchase_total; decimal delivery_fee }
  ORDER_ITEM { uuid id; string description; int quantity; decimal estimated_unit_price }
  ORDER_STATUS_EVENT { uuid id; enum status; uuid actor_id; datetime created_at }
```

## Decisiones

- **Un solo `User` con rol** (`CUSTOMER`, `COURIER`, `OPERATOR`, `ADMIN`). Los datos propios del domiciliario van en `CourierProfile`. Una persona puede tener un solo rol en el MVP.
- **El teléfono es el identificador principal** (único). Es lo que todos tienen, incluidos los extranjeros con SIM local; el correo es opcional.
- **Ubicaciones como `geography(Point, 4326)`** con índices GIST: distancias en metros reales y búsquedas por radio indexadas.
- **Ítems en texto libre** (`description`) porque en el MVP no hay catálogo de productos de los comercios. Cuando lleguen los comercios aliados se agrega `Product` y el ítem podrá referenciarlo opcionalmente.
- **Dos totales:** `estimatedTotal` (lo que el cliente cree que cuesta) y `purchaseTotal` (lo que dice la factura, confirmado por el domiciliario con foto en `receiptUrl`).
- **`OrderStatusEvent` es inmutable:** cada cambio de estado queda con quién y cuándo. Sirve para auditoría, para resolver reclamos y para la línea de tiempo que ve el cliente.
- **Dinero en `Decimal(12,2)`**, nunca en `float`.
- **`fulfillmentMode`** ya existe para soportar pedidos directos a comercios en el futuro.

## Consultas clave

Establecimientos cercanos (implementada):

```sql
SELECT id, name, ST_Distance(location, :origen) AS distancia
FROM establishments
WHERE is_active AND ST_DWithin(location, :origen, :radio_metros)
ORDER BY distancia LIMIT 50;
```

Domiciliarios disponibles más cercanos al establecimiento (fase 2, para el panel del operador):

```sql
SELECT user_id, ST_Distance(last_location, :establecimiento) AS distancia
FROM courier_profiles
WHERE is_available AND last_seen_at > now() - interval '2 minutes'
ORDER BY last_location <-> :establecimiento
LIMIT 10;
```

## Pendiente de definir

- Tabla de zonas de cobertura y tarifas por distancia (`DeliveryZone`, `FeeRule`).
- Liquidaciones con domiciliarios (`CourierSettlement`).
- Calificaciones (`Rating`) a partir de la fase 4.
