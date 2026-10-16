# 04 · Modelo de datos

> **Vista general del dominio.** Las decisiones de negocio de abajo siguen vigentes, pero el esquema real es el diseño normalizado de [14 · Base de datos](14-base-de-datos/README.md), implementado en `api/prisma/schema.prisma` desde E01: `users` solo guarda el acceso, los datos personales están en `people` y cada estado es una tabla catálogo (los `enum` del diagrama son ilustrativos). Ante cualquier diferencia, manda el 14.


```mermaid
erDiagram
  USER ||--o{ ADDRESS : tiene
  USER ||--o| COURIER_PROFILE : "es domiciliario"
  USER ||--o{ ORDER : pide
  USER ||--o{ DEVICE_TOKEN : "recibe push"
  ESTABLISHMENT ||--o{ PRODUCT : "menú"
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
  ORDER ||--o{ ORDER_OFFER : "ofertas a domiciliarios"
  DELIVERY_ZONE ||--o{ ORDER : "tarifa"

  ESTABLISHMENT { uuid id; string name; enum category; geography location; geography area }
  PRODUCT { uuid id; string name; decimal price; int prep_minutes; bool is_available }
  COURIER_PROFILE { uuid user_id; bool is_verified; enum funding_mode; bool is_available; geography last_location }
  ORDER { uuid id; string code; enum status; decimal items_total; decimal delivery_fee; decimal commission_rate; string delivery_proof_url }
  ORDER_OFFER { uuid id; uuid courier_id; enum mode; enum response }
  DELIVERY_ZONE { uuid id; string name; enum kind; geography area; decimal fee }
  ORDER_ADJUSTMENT { uuid id; enum reason; enum decision; datetime expires_at }
  CASH_BOX { uuid id; date business_date; decimal opening_amount; enum opening_method; enum status }
  CASH_MOVEMENT { uuid id; enum type; decimal amount; string method }
```

## Decisiones

- **Una cuenta con uno o varios roles** (`CUSTOMER`, `COURIER`, `OPERATOR`, `ADMIN`; ver [E01](14-base-de-datos/E01-identidad-y-acceso.md)). Los domiciliarios los crea un administrador con sus datos personales y quedan sin recibir pedidos hasta que se verifican. Un `COURIER` puede usar la app en modo cliente; un `CUSTOMER` nunca puede pasar a domiciliario por su cuenta.
- **El teléfono es el identificador principal** (único). El correo es opcional.
- **Establecimiento con punto y área:** `location` (punto, para el mapa y las distancias) y `area` (polígono dibujado a mano, para detectar que el domiciliario llegó). Ambos `geography` con índice GIST.
- **Menú administrado por RapiChonta (`Product`)** con precio, detalle, foto y tiempo de preparación. Solo se piden productos del menú.
- **`OrderItem` copia nombre, precio y tiempo** del producto al crear el pedido: si el menú cambia después, el pedido conserva lo que el cliente aceptó.
- **Dos totales:** `itemsTotal` (según el menú) y `purchaseTotal` (lo pagado realmente en el local, con foto de la factura en `receiptUrl`).
- **`OrderAdjustment`** guarda cada producto faltante o cambio de precio, la opción elegida por el cliente y el tiempo límite.
- **`Incident`** guarda los reportes del cliente ("no lo recibí") y la resolución de RapiChonta.
- **Dirección para otra persona:** `Address` tiene `recipientName` y `recipientPhone` opcionales.
- **Zonas con tarifa fija (`DeliveryZone`)**: el administrador dibuja en el mapa las zonas y les pone tarifa: los barrios del casco urbano (`URBAN`, una tarifa) y rangos para veredas y lugares aledaños (`RURAL`, una tarifa por rango). La tarifa del pedido es la de la zona donde cae la dirección de entrega; si la dirección no cae en ninguna zona, no se puede pedir.
- **Ofertas (`OrderOffer`)**: cada envío de un pedido a un domiciliario, en modo `SPECIFIC` (elegido por el operador) o `BROADCAST` (a todos). Guarda quién lo envió y la respuesta de cada domiciliario (aceptó, rechazó, venció, lo tomó otro). El "primero que acepta" se garantiza con una actualización condicional en la base de datos (`UPDATE ... WHERE status = 'OFFERED'`).
- **Comisión:** el domiciliario paga a RapiChonta un porcentaje **fijo** (el mismo sin importar cuántos servicios haga) del valor de cada domicilio completado; se configura en `commission.rate`. El porcentaje vigente se copia en el pedido (`commissionRate`, `commissionAmount`) para que un cambio futuro no altere pedidos pasados.
- **Entrega con foto:** si el cliente no confirma, el domiciliario toma la foto desde la app (`deliveryProofUrl`) y el pedido queda en `PENDING_REVIEW` hasta que el operador decida.
- **Configuración (`AppSetting`)**: valores que el administrador cambia sin desplegar, por ejemplo `commission.rate`, `orders.newCustomerMaxCop` (100.000), `offers.timeoutSeconds` (60), `adjustments.timeoutSeconds` (180), `delivery.arrivingMeters` (80), `delivery.proofAfterMinutes` (10).
- **Horario (`OperatingHours`)**: franjas por día de la semana en hora de Colombia.
- **Tasa de cambio (`ExchangeRate`)**: valor del dólar y del euro en pesos, actualizado una vez al día, solo para mostrar precios aproximados.
- **Dinero trazable:** cada domiciliario tiene un `fundingMode`:
  - `CASH_BOX`: el administrador abre una **caja diaria** (`CashBox`) registrando el monto y si lo entregó en efectivo o por transferencia. Cada compra, cobro y comisión es un `CashMovement` inmutable. Como en el MVP el cliente le paga al domiciliario (efectivo o QR de su cuenta), al cierre el sistema calcula: **base entregada + comisiones de los domicilios completados** = lo que el domiciliario devuelve a RapiChonta.
  - `OWN_FUNDS`: el domiciliario compra con su dinero; al cierre solo paga las comisiones de los domicilios completados.
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

- Calificaciones (`Rating`) a partir de la fase 4.
