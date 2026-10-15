# 10 · Decisiones del negocio y preguntas abiertas

## Decisiones tomadas (15 de octubre de 2026)

| Tema | Decisión | Dónde se documenta |
| --- | --- | --- |
| Ciudad de lanzamiento | Villagarzón, Putumayo. La app abre centrada allí. | [01](01-vision-y-alcance.md) |
| Equipo inicial | 2 operadores y 2 domiciliarios, ampliable. | [01](01-vision-y-alcance.md) |
| Asignación | El domiciliario recibe una notificación y decide si toma el pedido. Todo queda registrado. | [05](05-flujos-y-ux.md#asignación-el-domiciliario-acepta-el-pedido) |
| Seguimiento | El cliente ve estados, nunca la ubicación del domiciliario. La llegada al local se detecta con el área del local dibujada en el mapa. | [05](05-flujos-y-ux.md#detección-automática-por-ubicación-geocercas) |
| Menús | RapiChonta los administra con precios, detalles y tiempo de preparación por producto. | [04](04-modelo-de-datos.md) |
| Retrasos | Al cumplirse el tiempo de preparación, el domiciliario marca "listo" o "sigue en preparación" y el cliente lo ve. | [05](05-flujos-y-ux.md#tiempo-de-preparación) |
| Dirección | Ubicación actual o punto elegido en el mapa, también para otra persona. | [05](05-flujos-y-ux.md#flujo-del-cliente) |
| Roles | Domiciliarios registrados y verificados por RapiChonta; pueden pasar a modo cliente. Los clientes no ven la opción de domiciliario. | [06](06-seguridad.md) |
| Dinero de la compra | Caja diaria por domiciliario (efectivo o transferencia) con trazabilidad, o compra con dinero propio rindiendo solo el valor del domicilio. | [04](04-modelo-de-datos.md#decisiones) |
| Pago | Contra entrega: efectivo, Nequi, Daviplata o transferencia con QR del domiciliario. | [05](05-flujos-y-ux.md#entrega-y-confirmación) |
| Entrega | La confirma el cliente con una pantalla que no se cierra hasta responder. "No lo recibí" abre una incidencia que decide RapiChonta. | [05](05-flujos-y-ux.md#entrega-y-confirmación) |
| Producto faltante | Chat con opciones cerradas y tiempo límite. | [05](05-flujos-y-ux.md#producto-no-disponible-o-con-otro-precio-chat-estratégico) |
| Tarifas | Fijas, configuradas en el panel de administración. No por kilometraje. | [04](04-modelo-de-datos.md#decisiones) |
| Catálogo | Solo establecimientos registrados; no se puede pedir en otros lugares. | [01](01-vision-y-alcance.md) |
| Dominios | Aún no hay dominio; se usan las URLs de Render. | [08](08-despliegue-render.md) |

## Preguntas abiertas

Ninguna bloquea la fase 1. Las marcadas con ⚠️ se necesitan antes de la fase 2. Mientras no haya respuesta, se implementa la propuesta.

1. ⚠️ **¿A quién llega primero la notificación del pedido?** Propuesta: al domiciliario disponible más cercano al establecimiento; si no responde en 60 s, al siguiente; si nadie acepta, el operador lo gestiona. Alternativa: a todos a la vez y lo toma el primero que acepte (con 2 domiciliarios puede ser más simple).
2. ⚠️ **¿Cómo se reparte el valor del domicilio** entre el domiciliario y RapiChonta (porcentaje o valor fijo por domicilio)? Se necesita para el cierre de caja.
3. ⚠️ **¿De quién es la cuenta del QR de pago?** Si es la cuenta personal del domiciliario, el dinero de la compra entra a su cuenta y la caja debe registrarlo; si es una cuenta de RapiChonta, el domiciliario no recibe ese dinero. Propuesta: cuentas registradas en el sistema por el administrador y el domiciliario marca en la app por cuál medio cobró.
4. ⚠️ **¿Qué pasa si el cliente no confirma la entrega** (se le acabó la batería, no abre la app)? Propuesta: después de 10 minutos en "llegando", el domiciliario puede marcar "entregado" con una foto, y el operador lo revisa.
5. **¿La tarifa fija es una sola para todo Villagarzón** o cambia por establecimiento o por sector/barrio? El modelo ya permite una general y una por establecimiento; si se necesita por barrio, se agregan zonas.
6. **¿La tarifa la paga siempre el cliente o habrá promociones de lanzamiento?** (no quedó respondida).
7. **¿El valor mínimo y máximo de un pedido?** Propuesta: tope de 100.000 COP para clientes nuevos.
8. **¿Horario de operación** de RapiChonta? Fuera de horario la app mostraría el mapa pero no dejaría pedir.
9. **¿Qué hacen los operadores en el día a día** además de supervisar e incidencias? Por ejemplo, si también cargan los menús o si abren las cajas (hoy lo hace el rol administrador).
10. **¿Cuánto tiempo tiene el cliente para decidir** cuando falta un producto, y qué se hace si no responde? Propuesta: 3 minutos y quitar el producto.

## Temas que siguen vigentes

- **Legales:** términos y condiciones que expliquen la intermediación, política de datos (Ley 1581), relación con los domiciliarios (independientes o vinculados) y seguro de accidentes, facturación electrónica de la tarifa si aplica.
- **Permisos de ubicación:** Android e iOS exigen explicar por qué la app del domiciliario usa la ubicación en segundo plano; Google Play revisa este permiso. Hay que preparar el texto y un video corto para la revisión.
- **Conectividad:** en zonas con mala señal la app del domiciliario debe guardar los cambios de estado y enviarlos al recuperar conexión.
- **Usuarios extranjeros:** inglés completo, teléfonos internacionales (formato E.164), precios en COP con conversión aproximada opcional.
- **Observabilidad:** Sentry en los tres proyectos y logs estructurados en la API.
- **Costos:** el primer costo real será el SMS del inicio de sesión; los push son gratuitos.
