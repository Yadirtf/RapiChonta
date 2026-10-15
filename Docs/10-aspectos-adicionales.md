# 10 · Decisiones del negocio y preguntas abiertas

## Decisiones tomadas (15 de octubre de 2026)

| Tema | Decisión | Dónde se documenta |
| --- | --- | --- |
| Ciudad de lanzamiento | Villagarzón, Putumayo. La app abre centrada allí. | [01](01-vision-y-alcance.md) |
| Equipo inicial | 2 operadores y 2 domiciliarios, ampliable. | [01](01-vision-y-alcance.md) |
| Seguimiento | El cliente ve estados, nunca la ubicación del domiciliario. La llegada al local se detecta con el área del local dibujada en el mapa. | [05](05-flujos-y-ux.md#detección-automática-por-ubicación-geocercas) |
| Menús | RapiChonta los administra con precios, detalles y tiempo de preparación por producto. | [04](04-modelo-de-datos.md) |
| Retrasos | Al cumplirse el tiempo de preparación, el domiciliario marca "listo" o "sigue en preparación" y el cliente lo ve. | [05](05-flujos-y-ux.md#tiempo-de-preparación) |
| Dirección | Ubicación actual o punto elegido en el mapa, también para otra persona. | [05](05-flujos-y-ux.md#flujo-del-cliente) |
| Roles | Domiciliarios registrados y verificados por RapiChonta; pueden pasar a modo cliente. Los clientes no ven la opción de domiciliario. | [06](06-seguridad.md) |
| Dinero de la compra | Caja diaria por domiciliario (efectivo o transferencia) con trazabilidad, o compra con dinero propio pagando solo la comisión de los domicilios. | [04](04-modelo-de-datos.md#decisiones) |
| Pago | Contra entrega: efectivo, Nequi, Daviplata o transferencia con QR del domiciliario. | [05](05-flujos-y-ux.md#entrega-y-confirmación) |
| Entrega | La confirma el cliente con una pantalla que no se cierra hasta responder. "No lo recibí" abre una incidencia que decide RapiChonta. | [05](05-flujos-y-ux.md#entrega-y-confirmación) |
| Producto faltante | Chat con opciones cerradas y tiempo límite. | [05](05-flujos-y-ux.md#producto-no-disponible-o-con-otro-precio-chat-estratégico) |
| Catálogo | Solo establecimientos registrados; no se puede pedir en otros lugares. | [01](01-vision-y-alcance.md) |
| Dominios | Aún no hay dominio; se usan las URLs de Render. | [08](08-despliegue-render.md) |
| Envío del pedido | El operador ve quién está cerca y decide: a un domiciliario específico o a todos (el primero que acepte lo toma). | [05](05-flujos-y-ux.md#asignación-el-operador-decide-el-domiciliario-acepta) |
| Comisión | El domiciliario paga a RapiChonta un porcentaje de cada domicilio completado. | [04](04-modelo-de-datos.md#decisiones) |
| Cuenta del QR | La cuenta personal del domiciliario (MVP). | [06](06-seguridad.md) |
| Cliente no confirma | El domiciliario toma una foto desde la app y el operador la revisa. | [05](05-flujos-y-ux.md#entrega-y-confirmación) |
| Tarifas por zona | Una tarifa para los barrios del casco urbano y rangos con tarifa para veredas y lugares aledaños. | [04](04-modelo-de-datos.md#decisiones) |
| Promociones | Ninguna en el MVP; el cliente paga la tarifa. | [01](01-vision-y-alcance.md) |
| Tope por pedido | 100.000 COP para clientes nuevos. | [04](04-modelo-de-datos.md#decisiones) |
| Horario | Fuera de horario se ve el mapa pero no se puede pedir. | [05](05-flujos-y-ux.md#horario-de-operación) |
| Operadores | Además de supervisar e incidencias, actualizan menús. | [01](01-vision-y-alcance.md) |
| Producto faltante sin respuesta | 3 minutos; si no responde, se quita el producto. | [05](05-flujos-y-ux.md#producto-no-disponible-o-con-otro-precio-chat-estratégico) |
| Idiomas | Español e inglés desde archivos JSON, no en el código. | [03](03-arquitectura.md#idiomas) |
| Moneda | Precios en COP con aproximado en USD/EUR según la tasa del día. | [05](05-flujos-y-ux.md#idiomas-y-moneda) |
| Ubicación | Con permiso expreso, solo durante el servicio y nunca visible para el cliente, como las apps de domicilios conocidas. | [06](06-seguridad.md#ubicación-dentro-de-la-ley-y-como-lo-hacen-las-apps-de-domicilios) |

## Preguntas abiertas

Ninguna bloquea el trabajo. Mientras no haya respuesta, se implementa la propuesta.

1. **¿El porcentaje de comisión es fijo o cambia según cuántos servicios haga el domiciliario?** Por ejemplo 20 % siempre, o 20 % hasta 30 domicilios al mes y 15 % desde ahí. Propuesta: un porcentaje fijo configurable en el panel; si se quieren escalas, se agregan sin cambiar el resto.
2. **Valores iniciales** que el administrador cargará en el panel: porcentaje de comisión, tarifa de los barrios, rangos y tarifas de las veredas, y horario de operación. No hacen falta para programar, pero sí antes del piloto.

## Temas que siguen vigentes

- **Legales (revisar más adelante con un abogado):** términos y condiciones que expliquen la intermediación, política de datos (Ley 1581), relación con los domiciliarios (independientes o vinculados) y seguro de accidentes, facturación electrónica de la tarifa si aplica.
- **Permisos de ubicación:** Android e iOS exigen explicar por qué la app del domiciliario usa la ubicación en segundo plano; Google Play revisa este permiso. Hay que preparar el texto y un video corto para la revisión.
- **Conectividad:** en zonas con mala señal la app del domiciliario debe guardar los cambios de estado y enviarlos al recuperar conexión.
- **Usuarios extranjeros:** inglés completo, teléfonos internacionales (formato E.164), precios en COP con conversión aproximada opcional.
- **Observabilidad:** Sentry en los tres proyectos y logs estructurados en la API.
- **Costos:** el primer costo real será el SMS del inicio de sesión; los push son gratuitos.
