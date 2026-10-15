# 06 · Seguridad

RapiChonta maneja tres cosas sensibles: **datos personales** (teléfono, direcciones, ubicación), **dinero** (el domiciliario compra con dinero que luego cobra) y **personas en la calle** (domiciliarios y clientes que se encuentran). La seguridad se diseña para las tres.

## Autenticación

- **Clientes:** número de celular + código de un solo uso (OTP) por SMS o WhatsApp. Sin contraseñas que olvidar ni filtrar. Código de 6 dígitos, vence en 5 minutos, máximo 5 intentos, máximo 3 envíos por hora por número.
- **Domiciliarios, operadores y administradores:** OTP + contraseña (o segundo factor) porque tienen más permisos. Las cuentas de domiciliario las crea un administrador con sus datos personales y tras verificar documentos; no hay registro abierto ni forma de que un cliente se convierta en domiciliario.
- **Sesiones:** token de acceso JWT de corta vida (15 min) + token de refresco rotativo (30 días) guardado en base de datos, revocable. En la web, el refresh va en cookie `HttpOnly`, `Secure`, `SameSite=Strict`; en la app, en el almacenamiento seguro del sistema (Keychain / Keystore).

## Autorización

Control por rol (RBAC) en cada endpoint con guards de NestJS, más validación de propiedad: un cliente solo ve sus pedidos; un domiciliario solo ve los pedidos que se le ofrecieron o que aceptó, y solo mientras están activos; la dirección exacta del cliente y el teléfono de quien recibe se muestran al domiciliario solo desde `ON_THE_WAY`.

Un domiciliario en **modo cliente** usa los mismos permisos de cliente para sus propios pedidos; el cambio de modo no le da acceso a pedidos de otros clientes.

## API (ya aplicado en la base)

- `helmet` (cabeceras seguras), CORS con lista blanca por variable de entorno.
- Validación estricta de entrada (`whitelist` + `forbidNonWhitelisted`): campos desconocidos se rechazan.
- Límite de peticiones global (100/min por IP), más estricto en endpoints de OTP.
- Consultas SQL parametrizadas (Prisma y `Prisma.sql`), nunca concatenación de texto.
- Errores sin detalles internos hacia el cliente.

## Pendiente por fase

- Registro de auditoría de acciones del operador y del administrador (quién asignó, quién canceló).
- Subida de fotos de factura con URL firmada y vencimiento; validación de tipo y tamaño.
- Ubicación del domiciliario: solo se guarda mientras está "disponible" o con un pedido activo, se usa en el servidor para las geocercas y **nunca se envía al cliente**. Se informa al domiciliario y se pide su autorización expresa.
- Los cambios de estado automáticos (llegada al local, llegada al cliente) se validan en el servidor con varias lecturas para evitar ubicaciones falsas (apps de GPS simulado).
- Revisión OWASP ASVS nivel 1 antes de salir a producción.

## Dinero y fraude

- El total cobrado sale de los precios del menú más los cambios que el cliente aceptó; la factura fotografiada queda visible para el cliente y el operador.
- **Caja diaria:** el administrador abre la caja de cada domiciliario registrando monto y medio de entrega (efectivo o transferencia). Cada compra y cobro es un movimiento inmutable; al cierre del día el sistema calcula lo que el domiciliario debe devolver y entregar. Nadie puede editar ni borrar un movimiento: los errores se corrigen con un movimiento de ajuste firmado por un administrador.
- La entrega solo la confirma el cliente. Un "no lo recibí" bloquea el pedido como incidencia hasta que RapiChonta decide.
- Tope de compra por pedido para clientes nuevos (propuesta: 100.000 COP) hasta que tengan historial de pedidos entregados.
- En el MVP el QR de pago es de la cuenta personal del domiciliario: el administrador registra esas cuentas en su perfil y el cierre de caja usa los medios de cobro que el domiciliario marcó en cada pedido.
- La foto de entrega solo se puede tomar con la cámara dentro de la app (no desde la galería) y se guarda con fecha, hora y ubicación.

## Ubicación: dentro de la ley y como lo hacen las apps de domicilios

La referencia es cómo trabajan apps como Rappi: la ubicación se pide para un fin claro, con permiso del usuario, y solo mientras hace falta.

- **Cliente:** la ubicación se usa para centrar el mapa y, si él quiere, como dirección de entrega. Puede negarla y elegir el punto a mano. No se rastrea al cliente.
- **Domiciliario:** acepta en su registro una autorización expresa explicando que su ubicación se usa para detectar la llegada al local y al cliente, y para que el operador vea quién está cerca. Solo se toma mientras está "disponible" o con un pedido activo; al desactivarse, se deja de enviar.
- **Nadie fuera de RapiChonta ve la ubicación del domiciliario.** El cliente solo ve estados.
- Se guarda el historial de ubicaciones el tiempo mínimo necesario para resolver reclamos (propuesta: 30 días) y luego se borra.
- Android e iOS muestran al usuario cuándo una app usa su ubicación en segundo plano; el texto del permiso debe decir exactamente para qué se usa.

## Datos personales

El lanzamiento es en Colombia, así que aplica la **Ley 1581 de 2012** (habeas data): autorización expresa del titular al registrarse, política de tratamiento publicada, derecho a consultar, corregir y eliminar sus datos, y registro de bases de datos ante la SIC cuando corresponda. Validar con un abogado antes de producción.

## Secretos e infraestructura

- Ningún secreto en el repositorio: solo `.env.example`. En Render, variables de entorno (`JWT_SECRET` se genera automáticamente).
- HTTPS en todos los servicios (Render lo da por defecto).
- Copias de seguridad diarias de la base de datos en producción (plan pago de Render).
- Dependencias revisadas con Dependabot y `npm audit` en CI.
