# 13 · Requerimientos y backlog

<!-- Archivo generado desde backlog/*.yml con `node .github/scripts/cli.js docs`. No editar a mano. -->

Este documento se genera desde [`backlog/requerimientos.yml`](../backlog/requerimientos.yml) y [`backlog/epicas.yml`](../backlog/epicas.yml). Cada historia es un issue en GitHub; el flujo que los crea y los mueve está en [12 · Flujo de trabajo](12-flujo-de-trabajo.md).

## Épicas e historias

### Fase 1 · Catálogo y pedido del cliente

**E01 · Identidad y acceso** (prioridad alta). Que clientes, domiciliarios, operadores y administradores entren con su cuenta y solo vean lo que su rol permite (módulo identity).

| Historia | Como… quiero… | Áreas | Prioridad | Requerimientos |
| --- | --- | --- | --- | --- |
| H01.1 · Iniciar sesión con celular y código | Como cliente, quiero registrarme e iniciar sesión con mi número de celular y un código que me llega por SMS o WhatsApp | api, web, app | alta | RF-01, RF-02, RF-07, RNF-02 |
| H01.2 · Roles y permisos en cada endpoint | Como equipo de RapiChonta, quiero que cada endpoint valide el rol y la propiedad de los datos | api | alta | RF-03, RF-06, RNF-01 |
| H01.3 · Crear y verificar domiciliarios | Como administrador, quiero crear la cuenta de cada domiciliario con sus datos, documentos y cuentas de cobro | api, web | alta | RF-04, RF-05 |
| H01.4 · Acceso al panel para operadores y administradores | Como operador, quiero entrar al panel web con mi celular, código y contraseña | api, web | alta | RF-05, RF-02, RF-03 |
| H01.5 · Mi cuenta con mis datos e idioma | Como cliente, quiero ver y corregir mis datos, cambiar el idioma y pedir que se eliminen mis datos | api, web, app | media | RF-07, RNF-03 |

**E02 · Establecimientos y menús** (prioridad alta). Que RapiChonta registre los locales de Villagarzón con su área en el mapa y su menú, y que el cliente los encuentre en el mapa.

| Historia | Como… quiero… | Áreas | Prioridad | Requerimientos |
| --- | --- | --- | --- | --- |
| H02.1 · Registrar establecimientos con área en el mapa | Como administrador, quiero registrar un establecimiento con su punto y dibujar su área en el mapa | api, web | alta | RF-10, RNF-11 |
| H02.2 · Administrar el menú de un establecimiento | Como operador, quiero crear y editar productos con precio, detalle, foto, tiempo de preparación y disponibilidad | api, web | alta | RF-11, RNF-05 |
| H02.3 · Subir fotos de productos | Como operador, quiero subir la foto de cada producto | api, web | media | RNF-08 |
| H02.4 · Filtrar el mapa por categoría | Como cliente, quiero filtrar los establecimientos del mapa por categoría y abrir la tarjeta de un local | api, web, app | alta | RF-12, RNF-04, RNF-11 |
| H02.5 · Ver la ficha y el menú de un establecimiento | Como cliente, quiero ver el menú de un establecimiento con precio, foto y tiempo de preparación | api, web, app | alta | RF-13, RF-17, RNF-03 |
| H02.6 · Cargar el catálogo inicial de Villagarzón | Como administrador, quiero cargar los establecimientos y menús reales del piloto | api, docs | media | RF-10, RF-11 |

**E03 · Zonas, horario y configuración del negocio** (prioridad alta). Que el administrador configure tarifas por zona, horario de operación, comisión y demás parámetros sin desplegar.

| Historia | Como… quiero… | Áreas | Prioridad | Requerimientos |
| --- | --- | --- | --- | --- |
| H03.1 · Zonas de entrega con tarifa fija | Como administrador, quiero dibujar zonas en el mapa y asignarles una tarifa | api, web | alta | RF-14, RNF-05 |
| H03.2 · Horario de operación | Como administrador, quiero definir el horario por día de la semana | api, web, app | alta | RF-15 |
| H03.3 · Parámetros del negocio en el panel | Como administrador, quiero cambiar la comisión, el tope para clientes nuevos y los tiempos de espera desde el panel | api, web | media | RF-16, RF-73, RNF-07 |
| H03.4 · Precio aproximado en dólares o euros | Como cliente extranjero, quiero ver al lado de cada precio su valor aproximado en mi moneda | api, web, app | baja | RF-17 |
| H03.5 · Cobertura por municipio | Como administrador, quiero definir desde el panel hasta dónde llegan los domiciliarios en cada municipio, con un radio o un área dibujada | api, web, app | alta | RF-18, RF-14, RF-21 |

**E04 · Pedido del cliente** (prioridad alta). Que el cliente arme un pedido con el menú real, elija dirección y medio de pago, lo confirme y lo siga en Mis pedidos.

| Historia | Como… quiero… | Áreas | Prioridad | Requerimientos |
| --- | --- | --- | --- | --- |
| H04.1 · Carrito con total y tarifa | Como cliente, quiero agregar productos al carrito y ver el total con la tarifa del domicilio | web, app | alta | RF-20, RNF-05 |
| H04.2 · Elegir la dirección de entrega | Como cliente, quiero usar mi ubicación actual o marcar un punto en el mapa, con una referencia | api, web, app | alta | RF-21, RF-14 |
| H04.3 · Confirmar el pedido | Como cliente, quiero elegir cómo pagaré y confirmar el pedido | api, web, app | alta | RF-22, RF-15, RF-16, RNF-01, RNF-05 |
| H04.4 · Mis pedidos | Como cliente, quiero ver mis pedidos activos con su estado y el historial | api, web, app | alta | RF-23, RF-50 |

**E05 · Calidad y entrega continua** (prioridad alta). Que cada cambio llegue a develop probado y que los errores en pruebas se vean sin buscarlos.

| Historia | Como… quiero… | Áreas | Prioridad | Requerimientos |
| --- | --- | --- | --- | --- |
| H05.1 · CI con lint, pruebas y build en cada PR | Como equipo de RapiChonta, quiero que cada PR verifique api, web y app con GitHub Actions | infra | alta | RNF-09, RNF-01 |
| H05.2 · Revisión de dependencias | Como equipo de RapiChonta, quiero recibir PR automáticos de actualización y alertas de vulnerabilidades | infra | media | RNF-12 |
| H05.3 · Proteger main y develop | Como equipo de RapiChonta, quiero que main y develop solo reciban cambios por PR con CI en verde | infra, docs | media | RNF-09 |
| H05.4 · Errores en Sentry y logs estructurados (fase 2) | Como equipo de RapiChonta, quiero ver los errores de api, web y app en Sentry | api, web, app, infra | media | RNF-10 |

### Fase 2 · Operación del domiciliario y piloto

**E06 · Notificaciones push** (prioridad alta). Que domiciliarios y clientes reciban avisos en el teléfono, también en Huawei.

| Historia | Como… quiero… | Áreas | Prioridad | Requerimientos |
| --- | --- | --- | --- | --- |
| H06.1 · Registrar dispositivos y enviar push | Como equipo de RapiChonta, quiero registrar el token de cada dispositivo y enviar notificaciones por FCM y Huawei Push Kit | api, app | alta | RF-34 |
| H06.2 · Avisos al cliente por cambio de estado | Como cliente, quiero recibir una notificación cuando mi pedido cambie de estado | api, app | media | RF-34, RF-50, RNF-03 |

**E07 · Asignación de pedidos por el operador** (prioridad alta). Que el operador vea los pedidos nuevos y los domiciliarios cercanos y envíe cada pedido a uno o a todos.

| Historia | Como… quiero… | Áreas | Prioridad | Requerimientos |
| --- | --- | --- | --- | --- |
| H07.1 · Alerta de pedido nuevo en el panel | Como operador, quiero escuchar una alerta y ver resaltado cada pedido nuevo | web, api | alta | RF-30 |
| H07.2 · Ver domiciliarios cercanos en el mapa | Como operador, quiero ver en un mapa el local, el punto de entrega y los domiciliarios disponibles por cercanía | api, web | alta | RF-31, RNF-06 |
| H07.3 · Enviar el pedido a uno o a todos | Como operador, quiero enviar el pedido a un domiciliario específico o a todos los disponibles | api, web | alta | RF-32, RF-34, RNF-01 |
| H07.4 · Oferta vencida vuelve al panel | Como operador, quiero que el pedido vuelva resaltado si nadie acepta a tiempo | api, web | media | RF-33, RF-16 |
| H07.5 · Registro de auditoría del personal | Como administrador, quiero ver quién asignó, canceló, resolvió o ajustó cada cosa y cuándo | api, web | media | RNF-07 |

**E08 · Modo domiciliario y geocercas** (prioridad alta). Que el domiciliario reciba ofertas, compre y avance el pedido desde la app, con llegada al local y al cliente detectadas por ubicación.

| Historia | Como… quiero… | Áreas | Prioridad | Requerimientos |
| --- | --- | --- | --- | --- |
| H08.1 · Activar disponibilidad y compartir ubicación | Como domiciliario, quiero marcarme Disponible y compartir mi ubicación solo mientras trabajo | api, app | alta | RF-40, RNF-06 |
| H08.2 · Tomar o rechazar una oferta | Como domiciliario, quiero ver el pedido ofrecido y elegir Tomar pedido o No puedo | app, api | alta | RF-41, RF-32 |
| H08.3 · Detectar la llegada al establecimiento | Como cliente, quiero saber cuándo el domiciliario está en el establecimiento | api | alta | RF-42, RNF-06 |
| H08.4 · Registrar la compra con la factura | Como domiciliario, quiero registrar lo que pagué en el local con la foto de la factura | api, app | alta | RF-44, RNF-08, RNF-05 |
| H08.5 · Avisos de preparación | Como domiciliario, quiero recibir un aviso cuando se cumpla el tiempo de preparación | api, app | media | RF-45 |
| H08.6 · Detectar la llegada donde el cliente | Como cliente, quiero que me avisen cuando mi pedido está llegando | api | alta | RF-43, RNF-06 |
| H08.7 · Cambiar a modo cliente | Como domiciliario, quiero cambiar a modo cliente desde mi menú | app | baja | RF-06 |
| H08.8 · Trabajar sin señal | Como domiciliario, quiero que mis cambios de estado se guarden si no tengo señal | app, api | media | RF-46 |

**E09 · Seguimiento del pedido y producto faltante** (prioridad alta). Que el cliente siga su pedido en una línea de tiempo y decida rápido cuando falta un producto.

| Historia | Como… quiero… | Áreas | Prioridad | Requerimientos |
| --- | --- | --- | --- | --- |
| H09.1 · Línea de tiempo con cuenta regresiva | Como cliente, quiero ver una línea de tiempo animada con el estado y la cuenta regresiva de preparación | web, app | alta | RF-50, RNF-04 |
| H09.2 · Reportar producto faltante o cambio de precio | Como domiciliario, quiero reportar qué producto falta o cambió de precio | app, api | alta | RF-51 |
| H09.3 · Decidir sobre un producto faltante | Como cliente, quiero elegir entre cambiar el producto, quitarlo, aceptar el nuevo precio o cancelar | web, app, api | alta | RF-51, RNF-01 |

**E10 · Entrega, confirmación e incidencias** (prioridad alta). Que la entrega la confirme el cliente, que exista una salida con foto si no confirma y que el operador resuelva incidencias.

| Historia | Como… quiero… | Áreas | Prioridad | Requerimientos |
| --- | --- | --- | --- | --- |
| H10.1 · Pantalla de entrega del cliente | Como cliente, quiero confirmar con Recibí mi pedido cuando me entregan | web, app, api | alta | RF-60, RNF-04 |
| H10.2 · Cobro contra entrega | Como domiciliario, quiero mostrar mi QR de cobro y registrar con qué medio me pagaron | app, api | alta | RF-61, RF-71 |
| H10.3 · Reportar que no recibí el pedido | Como cliente, quiero reportar No lo recibí | web, app, api | alta | RF-62 |
| H10.4 · Entregar con foto | Como domiciliario, quiero entregar con una foto cuando el cliente no confirma | app, api | alta | RF-63, RNF-08 |
| H10.5 · Gestionar pedidos activos e incidencias | Como operador, quiero ver los pedidos activos con alertas, revisar fotos de entrega y resolver incidencias | web, api | alta | RF-64, RF-62, RF-63, RNF-07 |

**E11 · Cajas diarias y comisiones** (prioridad alta). Que el dinero de cada domiciliario sea trazable y la caja de cada día cierre sin diferencias.

| Historia | Como… quiero… | Áreas | Prioridad | Requerimientos |
| --- | --- | --- | --- | --- |
| H11.1 · Abrir la caja diaria | Como administrador, quiero abrir la caja del día de cada domiciliario con el monto base y cómo lo entregué | api, web | alta | RF-70, RNF-05, RNF-07 |
| H11.2 · Movimientos automáticos por pedido | Como administrador, quiero que cada compra, cobro y comisión de un pedido quede como movimiento inmutable | api | alta | RF-71, RF-73, RNF-01 |
| H11.3 · Cerrar la caja y ver diferencias | Como administrador, quiero cerrar la caja del día y ver cuánto debe entregar cada domiciliario | api, web | alta | RF-72 |
| H11.4 · Ver mi caja del día | Como domiciliario, quiero ver en la app mis movimientos y cuánto debo entregar hoy | app, api | media | RF-72 |

**E12 · Piloto en Villagarzón** (prioridad alta). Lanzar el piloto con 2 operadores y 2 domiciliarios y pedidos reales de punta a punta.

| Historia | Como… quiero… | Áreas | Prioridad | Requerimientos |
| --- | --- | --- | --- | --- |
| H12.1 · Definir y cargar los valores iniciales | Como administrador, quiero cargar comisión, tarifas por zona, horario y tope del piloto | docs, web | alta | RF-14, RF-15, RF-16 |
| H12.2 · Distribuir la app a los domiciliarios | Como domiciliario, quiero instalar la app desde una prueba cerrada | app, infra | alta | RF-80, RF-34 |
| H12.3 · Términos, política de datos y textos de permisos | Como equipo de RapiChonta, quiero publicar términos de intermediación, política de datos y los textos de permisos | docs, web, app | media | RF-07, RF-80 |
| H12.4 · Prueba de punta a punta del piloto | Como equipo de RapiChonta, quiero ensayar pedidos completos antes de abrir a clientes | docs | alta | RF-22, RF-32, RF-60, RF-72 |

### Fase 3 · Publicación y tiempo real

**E13 · Publicación y tiempo real** (prioridad baja). Publicar la app en las tiendas y que las pantallas se actualicen al instante.

| Historia | Como… quiero… | Áreas | Prioridad | Requerimientos |
| --- | --- | --- | --- | --- |
| H13.1 · Publicar en Google Play, App Store y AppGallery | Como cliente, quiero instalar RapiChonta desde la tienda de mi teléfono | app, infra | baja | RF-80 |
| H13.2 · Actualizaciones en tiempo real | Como operador, quiero ver los cambios de pedidos al instante sin recargar | api, web, app, infra | baja | RF-81 |
| H13.3 · Repetir pedido y favoritos | Como cliente, quiero repetir un pedido anterior en un toque y guardar mis locales favoritos | api, web, app | baja | RF-82 |
| H13.4 · Panel de métricas | Como administrador, quiero ver las métricas de éxito del MVP | api, web | baja | RF-83 |

### Fase 4 · Pagos y crecimiento

**E14 · Pagos en línea y crecimiento** (prioridad baja). Cobrar en línea y sumar calificaciones, cupones y tarifas por distancia.

| Historia | Como… quiero… | Áreas | Prioridad | Requerimientos |
| --- | --- | --- | --- | --- |
| H14.1 · Pago en línea | Como cliente, quiero pagar dentro de la app con PSE, Nequi o Daviplata | api, web, app | baja | RF-90, RNF-05 |
| H14.2 · Calificaciones | Como cliente, quiero calificar al domiciliario y al establecimiento | api, web, app | baja | RF-91 |
| H14.3 · Cupones y promociones | Como administrador, quiero crear cupones con reglas de uso | api, web, app | baja | RF-92 |
| H14.4 · Tarifa por distancia | Como administrador, quiero calcular la tarifa por distancia en lugar de zona fija cuando convenga | api, web | baja | RF-93 |

### Fase 5 · Comercios aliados

**E15 · Comercios aliados** (prioridad baja). Integrar a los comercios para que reciban pedidos directos y RapiChonta ponga el domiciliario.

| Historia | Como… quiero… | Áreas | Prioridad | Requerimientos |
| --- | --- | --- | --- | --- |
| H15.1 · Portal del comercio | Como comercio aliado, quiero administrar mi menú y recibir pedidos en un portal | api, web | baja | RF-95 |
| H15.2 · Elegir pedido directo o compra por RapiChonta | Como cliente, quiero elegir si el comercio prepara mi pedido directo o si el domiciliario lo compra | api, web, app | baja | RF-96 |
| H15.3 · Asignación automática de domiciliarios | Como operador, quiero que el sistema proponga o asigne el domiciliario según cercanía, carga y calificación | api, web | baja | RF-97 |
| H15.4 · Expansión a otros municipios | Como administrador, quiero operar en otros municipios del Putumayo | api, web, app | baja | RF-98 |

## Requerimientos funcionales

| Id | Requerimiento | Fuente | Historias |
| --- | --- | --- | --- |
| RF-01 | El cliente se registra e inicia sesión con su número de celular (formato E.164, también internacional) y un código de un solo uso de 6 dígitos que vence en 5 minutos, con máximo 5 intentos y 3 envíos por hora por número. | [06-seguridad](06-seguridad.md) | H01.1 |
| RF-02 | Las sesiones usan un token de acceso JWT de 15 minutos y un token de refresco rotativo de 30 días guardado en base de datos y revocable; en la web el refresco va en cookie HttpOnly, Secure, SameSite=Strict y en la app en el almacenamiento seguro del sistema. | [06-seguridad](06-seguridad.md) | H01.1, H01.4 |
| RF-03 | Cada endpoint aplica control por rol (CUSTOMER, COURIER, OPERATOR, ADMIN) y validación de propiedad: un cliente solo ve sus pedidos y un domiciliario solo los que se le ofrecieron o aceptó, mientras están activos. | [06-seguridad](06-seguridad.md) | H01.2, H01.4 |
| RF-04 | Solo el administrador crea cuentas de domiciliario, con datos personales, verificación de documentos, modo de financiación (caja diaria o dinero propio) y cuentas de cobro para el QR. No existe registro abierto de domiciliarios. | [04-modelo-de-datos](04-modelo-de-datos.md) | H01.3 |
| RF-05 | Domiciliarios, operadores y administradores inician sesión con código de un solo uso más contraseña (o segundo factor). | [06-seguridad](06-seguridad.md) | H01.3, H01.4 |
| RF-06 | Un usuario con rol domiciliario puede cambiar a modo cliente para hacer pedidos propios sin ganar acceso a pedidos de otros clientes; los clientes nunca ven la opción de ser domiciliario. | [05-flujos-y-ux](05-flujos-y-ux.md) | H01.2, H08.7 |
| RF-07 | Al registrarse, el usuario acepta de forma expresa la política de tratamiento de datos (Ley 1581 de 2012) y puede consultar, corregir y eliminar sus datos desde Mi cuenta. | [06-seguridad](06-seguridad.md) | H01.1, H01.5, H12.3 |
| RF-10 | El administrador registra establecimientos con nombre, categoría, punto en el mapa y un área (polígono) dibujada a mano que cubre el local y su entrada. | [04-modelo-de-datos](04-modelo-de-datos.md) | H02.1, H02.6 |
| RF-11 | Administradores y operadores mantienen el menú de cada establecimiento: productos con nombre, detalle, foto, precio en COP, tiempo estimado de preparación y disponibilidad. | [04-modelo-de-datos](04-modelo-de-datos.md) | H02.2, H02.6 |
| RF-12 | La pantalla principal muestra el mapa centrado en el usuario (o en Villagarzón si no comparte ubicación) con los establecimientos registrados, filtrables por categoría, y una tarjeta con distancia y botón Pedir aquí al tocar un marcador. | [05-flujos-y-ux](05-flujos-y-ux.md) | H02.4 |
| RF-13 | La ficha del establecimiento muestra su menú con precio, detalle, foto y tiempo de preparación de cada producto disponible. | [05-flujos-y-ux](05-flujos-y-ux.md) | H02.5 |
| RF-14 | El administrador dibuja zonas de entrega con tarifa fija: barrios del casco urbano (URBAN) y rangos de veredas y lugares aledaños (RURAL). La tarifa del pedido es la de la zona donde cae la dirección; fuera de toda zona no se puede pedir. | [04-modelo-de-datos](04-modelo-de-datos.md) | H03.1, H03.5, H04.2, H12.1 |
| RF-15 | El administrador define el horario de operación por día (hora de Colombia). Fuera de horario se ven el mapa y los menús, pero el botón de pedir muestra la próxima hora de apertura. | [05-flujos-y-ux](05-flujos-y-ux.md) | H03.2, H04.3, H12.1 |
| RF-16 | Los parámetros del negocio se cambian desde el panel sin desplegar (setting_values, versionados): tope para clientes nuevos (100.000 COP), vencimiento de ofertas (60 s), tiempo de decisión del cliente (180 s), umbral de llegada (80 m) y espera para entrega con foto (10 min); la comisión tiene su propia tabla versionada (commission_rates). | [E03-zonas-horario-configuracion](E03-zonas-horario-configuracion.md) | H03.3, H04.3, H07.4, H12.1 |
| RF-17 | Los precios se cobran en COP y, para extranjeros, se muestra al lado un valor aproximado en USD o EUR con la tasa de cambio del día, marcado como aproximado. | [05-flujos-y-ux](05-flujos-y-ux.md) | H02.5, H03.4 |
| RF-18 | Cada municipio tiene una cobertura definida desde el panel: un radio alrededor de su centro o un área dibujada, con tarifa base. Las zonas URBAN y RURAL quedan dentro y su tarifa manda. Solo se pide dentro de la cobertura de un municipio abierto; el cliente ve el área en el mapa, si su ubicación (o el pin que puso) queda dentro y, si no, a qué distancia empieza. | [E03-zonas-horario-configuracion](E03-zonas-horario-configuracion.md) | H03.5 |
| RF-20 | El cliente arma un carrito con productos de un solo establecimiento y ve el total: suma de productos más la tarifa de la zona de entrega. | [05-flujos-y-ux](05-flujos-y-ux.md) | H04.1 |
| RF-21 | La dirección de entrega es la ubicación actual o un punto elegido en el mapa, con una referencia en texto; si el pedido es para otra persona se registran su nombre y teléfono. | [05-flujos-y-ux](05-flujos-y-ux.md) | H03.5, H04.2 |
| RF-22 | Al confirmar, se crea el pedido con código RC-XXXX; cada línea apunta a la versión vigente del producto (nombre, precio y tiempo quedan fijados sin copiarlos), se registra el medio de pago contra entrega elegido (efectivo, Nequi, Daviplata o transferencia) y se aplica el tope de 100.000 COP a clientes sin pedidos entregados. | [E04-pedido-del-cliente](E04-pedido-del-cliente.md) | H04.3, H12.4 |
| RF-23 | Mis pedidos muestra los pedidos activos con su estado y el historial de pedidos anteriores con su detalle. | [05-flujos-y-ux](05-flujos-y-ux.md) | H04.4 |
| RF-30 | Cada pedido nuevo entra al panel del operador con alerta sonora y queda resaltado mientras no tenga domiciliario. | [05-flujos-y-ux](05-flujos-y-ux.md) | H07.1 |
| RF-31 | El panel muestra en un mapa el establecimiento, el punto de entrega y los domiciliarios disponibles y verificados ordenados por cercanía al establecimiento; solo el personal de RapiChonta ve esta información. | [05-flujos-y-ux](05-flujos-y-ux.md) | H07.2 |
| RF-32 | El operador envía el pedido a un domiciliario específico o a todos los disponibles; el primero que acepta lo toma (índice único de una asignación vigente por pedido) y a los demás se les retira la oferta. Cada oferta, cada destinatario con su respuesta y cada asignación quedan en order_offers, order_offer_recipients y order_assignments. | [E07-asignacion](E07-asignacion.md) | H07.3, H08.2, H12.4 |
| RF-33 | Si nadie acepta antes del vencimiento de la oferta (60 s por defecto), el pedido vuelve al panel resaltado para reenviarlo. | [05-flujos-y-ux](05-flujos-y-ux.md) | H07.4 |
| RF-34 | La plataforma envía notificaciones push por FCM (Android/iOS) y Huawei Push Kit, con tokens por dispositivo y proveedor (devices y device_push_tokens) y registro de cada envío. | [E06-notificaciones](E06-notificaciones.md) | H06.1, H06.2, H07.3, H12.2 |
| RF-40 | El domiciliario activa o desactiva Disponible; su ubicación se envía solo mientras está disponible o con un pedido activo y tras aceptar una autorización expresa. | [06-seguridad](06-seguridad.md) | H08.1 |
| RF-41 | La oferta abre una pantalla con establecimiento, productos, total a comprar y tarifa, con los botones Tomar pedido y No puedo. | [05-flujos-y-ux](05-flujos-y-ux.md) | H08.2 |
| RF-42 | Con el pedido en ACCEPTED, tras dos lecturas seguidas de ubicación dentro del área del local (ST_Covers), el pedido pasa a AT_ESTABLISHMENT automáticamente. | [05-flujos-y-ux](05-flujos-y-ux.md) | H08.3 |
| RF-43 | Con el pedido en ON_THE_WAY, cuando la distancia al punto de entrega baja del umbral (80 m por defecto), el pedido pasa a ARRIVING y el cliente recibe una notificación. | [05-flujos-y-ux](05-flujos-y-ux.md) | H08.6 |
| RF-44 | El domiciliario registra lo pagado en el local (movimiento PURCHASE de su caja) con foto de la factura (order_purchases); el pedido pasa a PREPARING y se calcula la hora estimada de listo con el producto que más tarda. | [E08-modo-domiciliario](E08-modo-domiciliario.md) | H08.4 |
| RF-45 | Al cumplirse el tiempo de preparación, el domiciliario recibe un aviso con Ya está listo (pasa a ON_THE_WAY) o Sigue en preparación (marca retraso visible para el cliente y repite el aviso). | [05-flujos-y-ux](05-flujos-y-ux.md) | H08.5 |
| RF-46 | Sin señal, la app del domiciliario guarda los cambios de estado y los envía en orden al recuperar la conexión. | [10-aspectos-adicionales](10-aspectos-adicionales.md) | H08.8 |
| RF-50 | El cliente ve una línea de tiempo con el estado del pedido y la cuenta regresiva de preparación, nunca la ubicación del domiciliario. | [05-flujos-y-ux](05-flujos-y-ux.md) | H04.4, H06.2, H09.1 |
| RF-51 | Si falta un producto o cambió el precio, el domiciliario lo reporta (una consulta puede incluir varias líneas) y el cliente decide por línea con opciones cerradas (cambiar por otro, quitar, aceptar nuevo precio, cancelar) en 3 minutos; si vence se quita el producto y, si era el único, se cancela. Cada consulta y decisión queda en order_adjustment_requests y order_item_adjustments. | [E09-producto-faltante](E09-producto-faltante.md) | H09.2, H09.3 |
| RF-60 | En ARRIVING el cliente ve una pantalla de entrega con el total a pagar que no se cierra hasta que marca Recibí mi pedido o No lo recibí. | [05-flujos-y-ux](05-flujos-y-ux.md) | H10.1, H12.4 |
| RF-61 | El cliente paga contra entrega en efectivo o con el QR de la cuenta del domiciliario (Nequi, Daviplata, transferencia) y el domiciliario marca con qué medio cobró. | [05-flujos-y-ux](05-flujos-y-ux.md) | H10.2 |
| RF-62 | No lo recibí crea una incidencia, pasa el pedido a DISPUTED, alerta al operador con prioridad y notifica al domiciliario; el operador resuelve como entregado o cancelado y ambos reciben la resolución. | [05-flujos-y-ux](05-flujos-y-ux.md) | H10.3, H10.5 |
| RF-63 | Si el cliente no confirma tras la espera configurada (10 min), el domiciliario entrega con una foto tomada con la cámara de la app (no galería) con fecha, hora y ubicación; el pedido queda en PENDING_REVIEW hasta que el operador decide. | [05-flujos-y-ux](05-flujos-y-ux.md) | H10.4, H10.5 |
| RF-64 | El panel del operador lista los pedidos activos con alertas (sin asignar, nadie aceptó, preparación retrasada, decisión vencida, foto por revisar, incidencias), su línea de tiempo completa y la acción de cancelar. | [05-flujos-y-ux](05-flujos-y-ux.md) | H10.5 |
| RF-70 | El administrador abre la caja diaria de cada domiciliario con modo CASH_BOX registrando el monto base y si lo entregó en efectivo o por transferencia. | [04-modelo-de-datos](04-modelo-de-datos.md) | H11.1 |
| RF-71 | Cada compra y cobro de un pedido genera un movimiento de caja inmutable y la comisión se calcula del pedido; los errores se corrigen con un movimiento de ajuste firmado por un administrador. | [E11-cajas-y-comisiones](E11-cajas-y-comisiones.md) | H10.2, H11.2 |
| RF-72 | Al cierre del día el sistema calcula lo que el domiciliario devuelve: base entregada más comisiones de los domicilios completados (CASH_BOX) o solo comisiones (OWN_FUNDS), y muestra las diferencias. | [04-modelo-de-datos](04-modelo-de-datos.md) | H11.3, H11.4, H12.4 |
| RF-73 | La comisión es un porcentaje fijo de cada domicilio completado; el pedido apunta a la versión vigente del porcentaje (commission_rates) y su valor se calcula, para que un cambio futuro no altere pedidos pasados. | [E03-zonas-horario-configuracion](E03-zonas-horario-configuracion.md) | H03.3, H11.2 |
| RF-80 | La app se publica en Google Play, App Store y Huawei AppGallery, con el texto y video de justificación del permiso de ubicación en segundo plano. | [07-roadmap](07-roadmap.md) | H12.2, H12.3, H13.1 |
| RF-81 | Las pantallas de cliente, domiciliario y operador se actualizan al instante con WebSockets (Socket.IO) y Redis. | [07-roadmap](07-roadmap.md) | H13.2 |
| RF-82 | El cliente repite un pedido anterior en un toque y guarda establecimientos favoritos. | [07-roadmap](07-roadmap.md) | H13.3 |
| RF-83 | El panel de métricas muestra tiempo hasta aceptación, tiempo de entrega y desvío frente a la preparación estimada, retrasos por local, producto faltante, incidencias y pedidos recurrentes. | [01-vision-y-alcance](01-vision-y-alcance.md) | H13.4 |
| RF-90 | El cliente paga en línea dentro de la app (PSE, Nequi, Daviplata) mediante una pasarela como Wompi o Mercado Pago. | [07-roadmap](07-roadmap.md) | H14.1 |
| RF-91 | El cliente califica al domiciliario y al establecimiento después de cada pedido entregado. | [07-roadmap](07-roadmap.md) | H14.2 |
| RF-92 | El administrador crea cupones y promociones con reglas de uso. | [07-roadmap](07-roadmap.md) | H14.3 |
| RF-93 | La tarifa puede calcularse por distancia además de por zona fija, según configuración. | [07-roadmap](07-roadmap.md) | H14.4 |
| RF-95 | El comercio aliado tiene un portal para administrar su menú, recibir pedidos y reportar tiempos reales de preparación. | [07-roadmap](07-roadmap.md) | H15.1 |
| RF-96 | El cliente elige entre pedido directo al comercio (MERCHANT_DIRECT) y compra por RapiChonta (COURIER_PURCHASE). | [01-vision-y-alcance](01-vision-y-alcance.md) | H15.2 |
| RF-97 | Los domiciliarios se asignan automáticamente por proximidad, carga y calificación, con el operador como supervisión. | [07-roadmap](07-roadmap.md) | H15.3 |
| RF-98 | La plataforma opera en varios municipios del Putumayo, cada uno con sus zonas, tarifas, horario y equipo. | [07-roadmap](07-roadmap.md) | H15.4 |

## Requerimientos no funcionales

| Id | Requerimiento | Fuente | Historias |
| --- | --- | --- | --- |
| RNF-01 | Arquitectura limpia en los tres proyectos: la lógica de negocio vive en dominio y casos de uso, cada caso de uso nuevo tiene prueba unitaria y el dominio se prueba sin base de datos. | [09-convenciones](09-convenciones.md) | H01.2, H04.3, H05.1, H07.3, H09.3, H11.2 |
| RNF-02 | La API mantiene cabeceras seguras (helmet), CORS por lista blanca, validación estricta de entrada, límite de peticiones (más estricto en OTP), SQL parametrizado y errores sin detalles internos. | [06-seguridad](06-seguridad.md) | H01.1 |
| RNF-03 | Todos los textos visibles están en archivos JSON/ARB por idioma (español e inglés); agregar un idioma es agregar un archivo. | [03-arquitectura](03-arquitectura.md) | H01.5, H02.5, H06.2 |
| RNF-04 | Accesibilidad: contraste AA, botones de mínimo 48 px y textos que escalan con la configuración del sistema. | [05-flujos-y-ux](05-flujos-y-ux.md) | H02.4, H09.1, H10.1 |
| RNF-05 | El dinero se guarda en Decimal(12,2) en pesos colombianos, nunca en float. | [04-modelo-de-datos](04-modelo-de-datos.md) | H02.2, H03.1, H04.1, H04.3, H08.4, H11.1, H14.1 |
| RNF-06 | La ubicación del domiciliario nunca se envía al cliente, se valida en el servidor con varias lecturas y su historial se borra a los 30 días. | [06-seguridad](06-seguridad.md) | H07.2, H08.1, H08.3, H08.6 |
| RNF-07 | Las acciones de operadores y administradores (asignar, cancelar, resolver, ajustar caja) quedan en un registro de auditoría con quién y cuándo. | [06-seguridad](06-seguridad.md) | H03.3, H07.5, H10.5, H11.1 |
| RNF-08 | Las fotos (productos, facturas, entregas) se suben con URL firmada y vencimiento, validando tipo y tamaño. | [06-seguridad](06-seguridad.md) | H02.3, H08.4, H10.4 |
| RNF-09 | Cada PR ejecuta en GitHub Actions lint, pruebas y build de los proyectos que toca; main y develop están protegidas y solo reciben cambios por PR con CI en verde. | [09-convenciones](09-convenciones.md) | H05.1, H05.3 |
| RNF-10 | Los errores de los tres proyectos se reportan a Sentry y la API escribe logs estructurados. | [10-aspectos-adicionales](10-aspectos-adicionales.md) | H05.4 |
| RNF-11 | Los mapas usan OpenStreetMap/MapLibre, sin depender de servicios de Google, para funcionar en teléfonos Huawei. | [02-stack-tecnologico](02-stack-tecnologico.md) | H02.1, H02.4 |
| RNF-12 | Las dependencias se revisan con Dependabot y npm audit en CI; ningún secreto vive en el repositorio. | [06-seguridad](06-seguridad.md) | H05.2 |
