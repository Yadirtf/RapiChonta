# 04 · Modelo de datos

El esquema vive en [`api/prisma/schema.prisma`](../api/prisma/schema.prisma) y la migración inicial en `api/prisma/migrations/`.

```mermaid
erDiagram
  USER ||--o{ ADDRESS : tiene
  USER ||--o| COURIER_PROFILE : "es domiciliario"
  USER ||--o{ ORDER : pide
  USER ||--o{ DEVICE_TOKEN : "recibe push"
  ESTABLISHMENT ||--o{ PRODUCT : "menú"
  ESTABLISHMENT ||--o{ DELIVERY_FEE_RULE : "tarifa propia"
  ESTABLISHMENT ||--o{ ORDER : "se compra en"
  COURIER_PROFILE ||--o{ ORDER : entrega
  COURIER_PROFILE ||--o{ CASH_BOX : "caja diaria"
  CASH_BOX ||--|{ CASH_MOVEMENT : registra
  ADDRESS ||--o{ ORDER : "se entrega en"
  ORDER ||--|{ ORDER_ITEM : contiene
  PRODUCT ||--o{ ORDER_ITEM : "se pidió"
  ORDER ||--o{ ORDER_STATUS_EVENT : "línea de tiempo"
  ORDER ||--o{ ORDER_ADJUSTMENT : "producto faltante"
  ORDER ||--o{ INCIDENT : "reportes"
  ORDER ||--o{ CASH_MOVEMENT : "dinero"

  ESTABLISHMENT { uuid id; string name; enum category; geography location; geography area }
  PRODUCT { uuid id; string name; decimal price; int prep_minutes; bool is_available }
  COURIER_PROFILE { uuid user_id; bool is_verified; enum funding_mode; bool is_available; geography last_location }
  ORDER { uuid id; string code; enum status; decimal items_total; decimal delivery_fee; enum payment_method; bool prep_delayed }
  ORDER_ADJUSTMENT { uuid id; enum reason; enum decision; datetime expires_at }
  CASH_BOX { uuid id; date business_date; decimal opening_amount; enum opening_method; enum status }
  CASH_MOVEMENT { uuid id; enum type; decimal amount; string method }
```

## Decisiones

- **Un solo `User` con rol** (`CUSTOMER`, `COURIER`, `OPERATOR`, `ADMIN`). Los domiciliarios los crea un administrador con sus datos personales (`CourierProfile`, `isVerified`). Un `COURIER` puede usar la app en modo cliente; un `CUSTOMER` nunca puede pasar a domiciliario por su cuenta.
- **El teléfono es el identificador principal** (único). El correo es opcional.
- **Establecimiento con punto y área:** `location` (punto, para el mapa y las distancias) y `area` (polígono dibujado a mano, para detectar que el domiciliario llegó). Ambos `geography` con índice GIST.
- **Menú administrado por RapiChonta (`Product`)** con precio, detalle, foto y tiempo de preparación. Solo se piden productos del menú.
- **`OrderItem` copia nombre, precio y tiempo** del producto al crear el pedido: si el menú cambia después, el pedido conserva lo que el cliente aceptó.
- **Dos totales:** `itemsTotal` (según el menú) y `purchaseTotal` (lo pagado realmente en el local, con foto de la factura en `receiptUrl`).
- **`OrderAdjustment`** guarda cada producto faltante o cambio de precio, la opción elegida por el cliente y el tiempo límite.
- **`Incident`** guarda los reportes del cliente ("no lo recibí") y la resolución de RapiChonta.
- **Dirección para otra persona:** `Address` tiene `recipientName` y `recipientPhone` opcionales.
- **Tarifas fijas (`DeliveryFeeRule`)**: una tarifa general y, opcionalmente, tarifas por establecimiento. Se administran desde el panel; no dependen del kilometraje.
- **Dinero trazable:** cada domiciliario tiene un `fundingMode`:
  - `CASH_BOX`: el administrador abre una **caja diaria** (`CashBox`) registrando el monto y si lo entregó en efectivo o por transferencia. Cada compra, cobro y valor de domicilio es un `CashMovement` inmutable. Al cierre, el sistema muestra cuánto debe devolver y entregar el domiciliario.
  - `OWN_FUNDS`: el domiciliario compra con su dinero; solo rinde cuentas del valor de los domicilios.
- **`OrderStatusEvent` es inmutable:** cada cambio de estado queda con quién y cuándo (trazabilidad para el operador y línea de tiempo para el cliente).
- **`DeviceToken`** guarda los tokens push por proveedor (`FCM` o `HMS` para Huawei).
- **Dinero en `Decimal(12,2)`**, nunca en `float`.

## Consultas clave

Establecimientos cercanos (implementada):

```sql
SELECT id, name, ST_Distance(location, :origen) AS distancia
FROM establishments
WHERE is_active AND ST_DWithin(location, :origen, :radio_metros)
ORDER BY distancia LIMIT 50;
```

Domiciliarios disponibles más cercanos al establecimiento, para ofrecer el pedido:

```sql
SELECT user_id
FROM courier_profiles
WHERE is_available AND is_verified AND last_seen_at > now() - interval '2 minutes'
ORDER BY last_location <-> :establecimiento
LIMIT 5;
```

¿El domiciliario ya llegó al local?

```sql
SELECT ST_Covers(area, :posicion_domiciliario) FROM establishments WHERE id = :id;
```

¿Está llegando donde el cliente?

```sql
SELECT ST_DWithin(:posicion_domiciliario, a.location, 80)
FROM orders o JOIN addresses a ON a.id = o.address_id WHERE o.id = :id;
```

## Pendiente de definir

- Reparto del valor del domicilio entre domiciliario y RapiChonta (ver preguntas abiertas en [10](10-aspectos-adicionales.md)).
- Calificaciones (`Rating`) a partir de la fase 4.
