# 06 · Seguridad

RapiChonta maneja tres cosas sensibles: **datos personales** (teléfono, direcciones, ubicación), **dinero** (el domiciliario compra con dinero que luego cobra) y **personas en la calle** (domiciliarios y clientes que se encuentran). La seguridad se diseña para las tres.

## Autenticación

- **Clientes:** número de celular + código de un solo uso (OTP) por SMS o WhatsApp. Sin contraseñas que olvidar ni filtrar. Código de 6 dígitos, vence en 5 minutos, máximo 5 intentos, máximo 3 envíos por hora por número.
- **Domiciliarios, operadores y administradores:** OTP + contraseña (o segundo factor) porque tienen más permisos. Las cuentas de domiciliario las crea un administrador tras verificar documentos; no hay registro abierto.
- **Sesiones:** token de acceso JWT de corta vida (15 min) + token de refresco rotativo (30 días) guardado en base de datos, revocable. En la web, el refresh va en cookie `HttpOnly`, `Secure`, `SameSite=Strict`; en la app, en el almacenamiento seguro del sistema (Keychain / Keystore).

## Autorización

Control por rol (RBAC) en cada endpoint con guards de NestJS, más validación de propiedad: un cliente solo ve sus pedidos; un domiciliario solo ve los pedidos asignados a él y solo mientras están activos; la dirección exacta del cliente se muestra al domiciliario solo desde `PURCHASED`.

## API (ya aplicado en la base)

- `helmet` (cabeceras seguras), CORS con lista blanca por variable de entorno.
- Validación estricta de entrada (`whitelist` + `forbidNonWhitelisted`): campos desconocidos se rechazan.
- Límite de peticiones global (100/min por IP), más estricto en endpoints de OTP.
- Consultas SQL parametrizadas (Prisma y `Prisma.sql`), nunca concatenación de texto.
- Errores sin detalles internos hacia el cliente.

## Pendiente por fase

- Registro de auditoría de acciones del operador y del administrador (quién asignó, quién canceló).
- Subida de fotos de factura con URL firmada y vencimiento; validación de tipo y tamaño.
- Ubicación del domiciliario: solo se guarda y comparte mientras está "disponible" o con un pedido activo.
- Revisión OWASP ASVS nivel 1 antes de salir a producción.

## Dinero y fraude

- El total cobrado sale de la factura fotografiada, visible para el cliente y el operador.
- Tope de compra por pedido para clientes nuevos (propuesta: equivalente a 100.000 COP) hasta que tengan historial; por encima, pago anticipado.
- Liquidación diaria con cada domiciliario a partir de los registros del sistema.

## Datos personales

Si el lanzamiento es en Colombia aplica la **Ley 1581 de 2012** (habeas data): autorización expresa del titular al registrarse, política de tratamiento publicada, derecho a consultar, corregir y eliminar sus datos, y registro de bases de datos ante la SIC cuando corresponda. Validar con un abogado antes de producción.

## Secretos e infraestructura

- Ningún secreto en el repositorio: solo `.env.example`. En Render, variables de entorno (`JWT_SECRET` se genera automáticamente).
- HTTPS en todos los servicios (Render lo da por defecto).
- Copias de seguridad diarias de la base de datos en producción (plan pago de Render).
- Dependencias revisadas con Dependabot y `npm audit` en CI.
