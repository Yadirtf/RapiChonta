# 05 · Flujos y experiencia de usuario

## Principios

1. **Pedir en pocos toques:** elegir lugar en el mapa → agregar productos del menú → confirmar dirección y pago. Nada de formularios largos.
2. **Sin ambigüedad:** cada pantalla tiene una sola acción principal (botón amarillo grande). El cliente siempre sabe en qué estado está su pedido y cuánto va a pagar, y cada decisión que se le pide tiene opciones cerradas.
3. **El mapa es la casa:** la pantalla principal no es una lista, es el mapa de su zona. Es lo que diferencia a RapiChonta de las apps de catálogo.
4. **Movimiento con propósito:** las animaciones explican qué pasó (la tarjeta del lugar sube desde el marcador, la línea de tiempo del pedido avanza), no decoran.
5. **Bilingüe desde el día uno:** español e inglés, detectado por el idioma del teléfono y cambiable en "Mi cuenta".
6. **Accesible:** contraste AA, botones de mínimo 48 px, textos que escalan con la configuración del sistema.

## Pantalla principal

```
┌──────────────┬─────────────────────────────────────────┐
│ RapiChonta   │          (Cerca de ti · 12 lugares)     │
│              │                                         │
│ EXPLORAR     │      📍        🍔                       │
│ ▣ Comida     │              🔵 tú                      │
│   rápida     │   🍕                  🛒                │
│ ▣ Restau-    │                                         │
│   rantes     │        ┌───────────────────────┐        │
│ □ Super-     │        │ Burger Demo · 450 m   │        │
│   mercados   │        │ [     Pedir aquí     ]│        │
│ □ Tiendas    │        └───────────────────────┘        │
│ □ Farmacias  │                                         │
│──────────────│                                         │
│ Mis pedidos  │                                     [+] │
│ Mi cuenta    │                                     [-] │
└──────────────┴─────────────────────────────────────────┘
```

- **Web y tableta:** menú fijo a la izquierda (se colapsa a íconos en pantallas medianas), mapa en el resto.
- **Teléfono:** el mismo menú como panel deslizable (drawer) para no quitarle espacio al mapa.
- Las categorías del menú funcionan como filtros del mapa (se pueden combinar).
- Al tocar un marcador sube la tarjeta del establecimiento con distancia y el botón "Pedir aquí".

## Flujo del cliente

```mermaid
flowchart LR
  A[Abre la app] --> B{¿Comparte ubicación?}
  B -- Sí --> C[Mapa centrado en él]
  B -- No --> C2[Mapa centrado en Villagarzón<br/>+ invitación a activarla]
  C --> D[Toca un establecimiento registrado]
  C2 --> D
  D --> E[Arma el pedido con el menú<br/>precio y tiempo de cada producto]
  E --> F{¿Tiene sesión?}
  F -- No --> G[Número de celular + código SMS]
  F -- Sí --> H
  G --> H[Dirección: mi ubicación o punto en el mapa<br/>+ quién recibe si es para otra persona]
  H --> I[Ve total + tarifa y elige cómo pagará]
  I --> J[Pedido creado<br/>código RC-XXXX]
  J --> K[Sigue el estado]
```

- La sesión se pide **solo al confirmar**, no al abrir la app.
- Solo se puede pedir en establecimientos registrados; no existe "pedir en otro lugar".
- La dirección puede ser la ubicación actual o un punto elegido en el mapa, con referencia ("casa azul, segundo piso"). Si el pedido es para otra persona, se registra su nombre y teléfono.
- El total se calcula con los precios del menú más la tarifa del domicilio configurada por el administrador.

## Asignación: el operador decide, el domiciliario acepta

1. El pedido nuevo entra al panel del operador/administrador con alerta sonora.
2. El panel muestra en un mapa el establecimiento, el punto de entrega y los domiciliarios disponibles ordenados por cercanía al establecimiento (solo el personal de RapiChonta ve esta información).
3. El operador elige una de dos opciones:
   - **Enviar a un domiciliario específico.**
   - **Enviar a todos los disponibles:** el primero que acepte se queda con el servicio; a los demás se les retira la oferta ("ya fue tomado").
4. El domiciliario recibe una notificación push que abre una pantalla con el establecimiento, los productos, el total a comprar y la tarifa, y dos botones: **Tomar pedido** / **No puedo**.
5. Si acepta, el cliente recibe "Tu pedido está en proceso".
6. Si nadie acepta en el tiempo definido (propuesta: 60 s), el pedido vuelve al panel resaltado para que el operador lo envíe a otro o a todos.
7. Cada oferta, a quién se envió, quién la envió y la respuesta de cada domiciliario quedan registradas (`OrderOffer`).

## Estados que ve el cliente

El cliente **no ve la ubicación del domiciliario**, solo una línea de tiempo con el estado:

| Estado | Lo que ve el cliente | Quién lo cambia |
| --- | --- | --- |
| `PENDING_ASSIGNMENT` / `OFFERED` | Buscando domiciliario | Sistema |
| `ACCEPTED` | Tu pedido está en proceso, el domiciliario va al establecimiento | Domiciliario (acepta) |
| `AT_ESTABLISHMENT` | El domiciliario está en el establecimiento haciendo tu pedido | **Automático:** la app detecta que entró al área del local |
| `AWAITING_CUSTOMER` | Necesitamos tu decisión sobre un producto | Domiciliario (reporta) |
| `PREPARING` | Tu pedido se está preparando (con cuenta regresiva) | Domiciliario (pagó en el local) |
| `PREPARING` + retraso | El local tiene mucha demanda, tu pedido sigue en preparación | Domiciliario (responde al aviso) |
| `ON_THE_WAY` | Tu pedido va en camino | Domiciliario (marca "listo") |
| `ARRIVING` | Tu pedido está llegando | **Automático:** distancia domiciliario–cliente bajo el umbral |
| `DELIVERED` | Entregado | **Cliente** ("Recibí mi pedido") |
| `DISPUTED` | Reportaste un problema; RapiChonta lo está revisando | Cliente ("No lo recibí") |

```mermaid
stateDiagram-v2
  [*] --> PENDING_ASSIGNMENT
  PENDING_ASSIGNMENT --> OFFERED: se notifica a un domiciliario
  OFFERED --> ACCEPTED: el domiciliario toma el pedido
  OFFERED --> PENDING_ASSIGNMENT: rechaza o no responde
  ACCEPTED --> AT_ESTABLISHMENT: entra al área del local (automático)
  AT_ESTABLISHMENT --> AWAITING_CUSTOMER: falta un producto / cambió el precio
  AWAITING_CUSTOMER --> AT_ESTABLISHMENT: el cliente decide (o vence el plazo)
  AT_ESTABLISHMENT --> PREPARING: pedido pagado en el local
  PREPARING --> ON_THE_WAY: el domiciliario marca "listo"
  ON_THE_WAY --> ARRIVING: a pocos metros del cliente (automático)
  ARRIVING --> DELIVERED: el cliente confirma
  ARRIVING --> DISPUTED: el cliente reporta "no lo recibí"
  ON_THE_WAY --> DELIVERED: el cliente confirma antes de la detección
  ON_THE_WAY --> DISPUTED
  ARRIVING --> PENDING_REVIEW: entrega con foto
  PENDING_REVIEW --> DELIVERED: el operador revisa
  PENDING_REVIEW --> DISPUTED: el operador revisa
  ACCEPTED --> PENDING_ASSIGNMENT: se reasigna
  AT_ESTABLISHMENT --> PENDING_ASSIGNMENT: se reasigna
  DISPUTED --> DELIVERED: RapiChonta resuelve
  DISPUTED --> CANCELLED: RapiChonta resuelve
  PENDING_ASSIGNMENT --> CANCELLED
  OFFERED --> CANCELLED
  ACCEPTED --> CANCELLED
  AT_ESTABLISHMENT --> CANCELLED
  AWAITING_CUSTOMER --> CANCELLED
  DELIVERED --> [*]
  CANCELLED --> [*]
```

La lista completa de transiciones y quién puede hacer cada una está en [14 · E04](14-base-de-datos/E04-pedido-del-cliente.md#máquina-de-estados-del-pedido), donde vive como datos (`order_status_transitions`). La semilla del catálogo (`ORDER_TRANSITIONS` en `api/src/database/seed/catalogs.ts`) la carga y un disparador la hace cumplir en cada cambio de estado. Desde `PREPARING` el pedido ya no se puede cancelar porque el dinero ya se gastó; cualquier problema posterior se maneja como incidencia.

## Detección automática por ubicación (geocercas)

- **Área del establecimiento:** al registrar un local, el administrador dibuja en el mapa un polígono que cubre el local y su entrada (columna `area`). No basta un punto porque el GPS tiene error de 10 a 30 m.
- Mientras el pedido está en `ACCEPTED`, la app del domiciliario envía su ubicación cada pocos segundos; la API comprueba con PostGIS si está dentro del área (`ST_Covers`) y, tras dos lecturas seguidas dentro, pasa el pedido a `AT_ESTABLISHMENT`.
- En `ON_THE_WAY`, cuando la distancia al punto de entrega baja del umbral (propuesta: 80 m), el pedido pasa a `ARRIVING` y el cliente recibe la notificación.
- La ubicación del domiciliario solo se guarda mientras tiene un pedido activo o está disponible, y **nunca se envía al cliente**.

## Tiempo de preparación

- Cada producto del menú tiene un tiempo estimado; el del pedido es el del producto que más tarda.
- Al pasar a `PREPARING` se calcula la hora estimada (`estimatedReadyAt`) y el cliente ve una cuenta regresiva.
- Al cumplirse, el domiciliario recibe un aviso con dos botones: **Ya está listo** (pasa a `ON_THE_WAY`) o **Sigue en preparación** (se marca el retraso, el cliente ve el mensaje de alta demanda y el aviso se repite en unos minutos).

## Producto no disponible o con otro precio: chat estratégico

No es un chat libre. El domiciliario elige el producto con problema y el motivo; el cliente recibe una notificación y una pantalla con **opciones cerradas**:

- **Cambiar por:** lista de productos del mismo establecimiento (sugeridos primero los de la misma categoría y precio parecido).
- **Quitar el producto** y seguir con el resto.
- **Aceptar el nuevo precio** (si el motivo es cambio de precio).
- **Cancelar el pedido.**

La decisión tiene un tiempo límite visible de **3 minutos** porque el domiciliario está esperando. Si vence, **se quita el producto** y se sigue con el resto; si era el único producto, el pedido se cancela. Cada decisión queda registrada en `OrderAdjustment`.

## Entrega y confirmación

La entrega no depende de que el cliente se acuerde de marcar nada. Funciona como el PIN de DiDi Food o el código de Rappi, adaptado a cobro contra entrega y a celulares sin datos:

1. **Código de entrega.** Cuando el domiciliario sale del local (`ON_THE_WAY`), el pedido recibe un código de 4 dígitos. El cliente lo ve en un pase amarillo en el detalle del pedido (web y app) y en la notificación. Si recibe otra persona, el cliente se lo envía por WhatsApp con un toque.
2. **Llegué.** La geocerca pasa el pedido a `ARRIVING`; si no lo detecta, el domiciliario toca **Llegué** (funciona sin señal: queda en la cola y se envía al volver la conexión).
3. **Entregar con el código.** El cliente paga (efectivo, o Nequi, Daviplata o transferencia al QR personal del domiciliario) y le dicta el código. El domiciliario lo escribe y el pedido queda `DELIVERED`: el domiciliario queda libre de inmediato. El código se valida solo en el servidor; tras 5 intentos fallidos se bloquea y se habilita la foto.
4. **Ya lo recibí.** El cliente también puede cerrar la entrega desde su pantalla (en camino, llegando o tras una entrega con foto). Libera al domiciliario igual que el código.
5. **Sin código (nadie abre, el cliente no tiene datos).** Pasados `delivery.proof_after_seconds` en `ARRIVING` (5 minutos), o de una vez si se agotaron los intentos, el domiciliario puede **Entregar con foto**: la toma con la cámara dentro de la app y queda con fecha, hora y la última ubicación conocida. El pedido pasa a `PENDING_REVIEW` y **el domiciliario queda libre**; ya no se queda atascado en el mapa.
6. **Después de la foto.** El cliente ve la foto y responde **Sí, lo recibí** (`DELIVERED`) o **No lo recibí** (`DISPUTED`, lo revisa el operador). Si no responde en `delivery.review_auto_close_seconds` (2 horas), el sistema lo da por entregado.

## Flujo del domiciliario

Activa "Disponible" → recibe notificación → **Tomar pedido** → va al local (la app detecta la llegada) → compra o reporta un problema → paga en el local y registra el total → espera la preparación (responde los avisos) → **Ya está listo** → va al cliente → **Llegué** (o la geocerca) → cobra (QR o efectivo) → escribe el **código de entrega** que le dicta el cliente → queda libre. Sin código, espera unos minutos y entrega con foto.

El domiciliario puede cambiar a **modo cliente** desde su menú para hacer pedidos propios. Esa opción solo existe para usuarios con rol domiciliario; los clientes nunca ven la opción de ser domiciliario.

## Panel del operador

- Lista de pedidos activos con su estado y alertas: sin asignar, nadie aceptó, preparación retrasada, decisión del cliente vencida, entrega con foto por revisar, incidencias.
- Mapa con los domiciliarios disponibles y su cercanía al establecimiento.
- Detalle de cada pedido con su línea de tiempo completa (quién hizo qué y cuándo).
- Acciones: enviar a un domiciliario o a todos, cancelar, revisar fotos de entrega, resolver incidencias.
- **Actualizar menús:** productos, precios, disponibilidad y tiempos de preparación.

## Horario de operación

El administrador define el horario por día. Fuera de horario la app muestra el mapa y los menús, pero el botón de pedir se reemplaza por "Abrimos a las 8:00 a. m." (o la hora que corresponda).

## Idiomas y moneda

- Español e inglés. Los textos no están en el código: viven en archivos JSON por idioma (`web/messages/es.json`, `app/lib/l10n/app_es.arb`). Agregar un idioma es agregar un archivo.
- La app usa el idioma del teléfono o navegador y el usuario puede cambiarlo desde el menú.
- Los precios se cobran en pesos colombianos. Para extranjeros se muestra al lado un valor aproximado en dólares o euros según la tasa de cambio del día (por ejemplo `$ 25.000 · ≈ US$ 6,10`), marcado claramente como aproximado.

## Sistema visual

La marca sale del chontaduro (*Bactris gasipaes*), el fruto de palma del Putumayo que le da nombre a RapiChonta: su piel va de rojo a naranja y amarillo al madurar.

| Token | Valor | Uso |
| --- | --- | --- |
| `brand` | `#FFC531` | Acción principal, elementos activos, placa del logo |
| `chonta` | `#E4572E` | Chontaduro: logo, marcadores del mapa, "Chonta" del nombre, vías troncales |
| `chonta-strong` | `#B83A1B` | Textos e íconos de acento sobre fondo claro (`brand-strong` apunta a este color) |
| `chonta-soft` | `#FDE4D8` | Fondos suaves de acento |
| `leaf` | `#1F7A4D` | Verde de la palma: estados abiertos, áreas de entrega, cáliz del logo |
| `ink` | `#14121F` | Menú lateral, textos, contornos |
| `surface` | `#F4F2EE` | Fondo general |

**Logo:** la chonta domiciliaria (mascota) en moto con su gorra del Putumayo, dentro de una insignia con hojas y chontaduros y el nombre "RapiChonta · Domicilios Putumayo". Original: `Docs/marca/logo-original.jpeg`; todos los recursos se generan con `Docs/marca/generar_marca.py` (recorte sin fondo con rembg):

| Recurso | Uso | Web | App |
|---|---|---|---|
| Emblema completo, sin fondo | Menú lateral, ingreso al panel (se lee desde ~64 px) | `web/src/assets/brand/emblem.webp` (`LogoEmblem`) | `app/assets/brand/emblem.webp` (`BrandEmblem`) |
| Marca pequeña: cara de la mascota en medallón crema | Favicon, encabezados, barra superior | `web/src/assets/brand/mark.webp` (`LogoMark`), `web/src/app/icon.png`, `apple-icon.png` | `app/assets/brand/mark.webp` (`BrandLogo`), ícono del lanzador en `app/branding/android/res` |
| Paisaje de Villagarzón (atardecer, montañas, selva y mercado), desenfocado | Fondo del menú lateral bajo vidrio oscuro | `web/src/assets/brand/sidebar-scene.webp` (`SidebarBackdrop`, `.sidebar-glass`) | `app/assets/brand/sidebar_scene.jpg` (`_GlassBackdrop`) |

**Vidrio del menú lateral:** tinta `#14121F` al 35 % arriba (solo está el emblema, con un resplandor amarillo del atardecer), 64 % desde 170 px y 72 % abajo. Medido sobre el punto más claro del paisaje, el texto blanco al 70 % y el amarillo de marca quedan por encima de 4.5:1 (WCAG AA); por eso en el menú ningún texto baja de blanco al 70 %. El cartel "Cerrado" usa `chonta-strong` (el blanco sobre `chonta` da 3.6:1).

**Mapa:** mismos datos de OpenStreetMap (calles, ríos y lugares sin cambios), pintados con la paleta de la marca. En la web, el estilo gratuito "liberty" de OpenFreeMap (sin clave) se repinta al cargarlo (`web/src/presentation/components/map/mapStyle.ts`): tierra crema, selva y parques en verdes vivos, ríos en azul intenso, troncales en chontaduro, vías principales en amarillo y edificios en terracota. En la app, las teselas raster de OSM pasan por un filtro más saturado y cálido (los mapas vectoriales en Flutter dependen de una librería que todavía está en beta para la versión de `flutter_map` que usamos).

Tipografía: Plus Jakarta Sans (web) y Bricolage Grotesque para letreros y el nombre. Bordes redondeados generosos (16–24 px), sombras suaves, marcadores con forma de gota color chontaduro con el ícono de la categoría. Los mismos tokens están en `web/src/app/globals.css` y `app/lib/app/theme.dart`.

**Ideas para diferenciar la experiencia** (a validar en diseño):
- Línea de tiempo del pedido animada, con la cuenta regresiva de preparación y la foto de la factura visible para el cliente (transparencia total del dinero).
- Modo oscuro del mapa por la noche, automático.
- "Repetir pedido" en un toque desde "Mis pedidos".
- Marcadores que muestran el tiempo de preparación típico del local en lugar de solo la distancia.
