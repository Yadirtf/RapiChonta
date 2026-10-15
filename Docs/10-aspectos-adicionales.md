# 10 · Aspectos adicionales

Temas que la idea inicial no menciona y que el negocio va a necesitar. Están ordenados por qué tan pronto bloquean.

## Bloquean el piloto (fase 2)

1. **Panel del operador.** La asignación manual necesita una herramienta: sin ella el operador asigna por WhatsApp y se pierde trazabilidad. Está en la fase 2 dentro de la web.
2. **App o modo del domiciliario.** El domiciliario necesita recibir pedidos, cambiar estados y reportar el total. Se resuelve como un modo de la misma app según el rol, para no mantener dos apps.
3. **Quién pone el dinero de la compra.** En el modelo intermediario el domiciliario paga en el local y cobra al entregar. Hay que definir: ¿el domiciliario adelanta de su bolsillo? ¿RapiChonta le da una base diaria? ¿tope por pedido? ¿qué pasa si el cliente no recibe? Propuesta: base diaria + tope por pedido para clientes nuevos + pago anticipado por encima del tope.
4. **Productos sin disponibilidad o con otro precio.** El domiciliario necesita un canal rápido con el cliente para sustituir o cancelar, y una regla clara: si el total real supera el estimado en más de un porcentaje (por ejemplo 20 %), se pide confirmación al cliente antes de pagar.
5. **Tarifa del domicilio.** Base + valor por kilómetro desde el establecimiento hasta el cliente, con mínimo. Se muestra antes de confirmar. Opcional: cargo de servicio por la gestión de compra.
6. **Zona de cobertura.** Un polígono en el mapa; fuera de él la app lo dice antes de que el usuario escriba su pedido.
7. **Catálogo de establecimientos.** Como los comercios no están integrados, alguien debe cargar nombre, ubicación, categoría y horario. Propuesta: importar desde OpenStreetMap y depurar a mano; permitir que el cliente pida en un lugar que no está en el mapa ("pedir en otro lugar" con dirección libre).

## Legales y operativos

- **Términos y condiciones** que expliquen el modelo de intermediación (RapiChonta compra por encargo del cliente).
- **Política de tratamiento de datos** (ver [06 · Seguridad](06-seguridad.md)).
- **Relación con los domiciliarios** (independientes o vinculados), seguridad social y seguro de accidentes.
- **Facturación electrónica** de la tarifa de domicilio ante la DIAN, si aplica.
- **Soporte:** canal de ayuda dentro de la app y procedimiento para reclamos (producto equivocado, demora, cobro incorrecto).

## Usuarios extranjeros

- Idioma inglés completo, incluidos SMS y notificaciones.
- Números de teléfono internacionales en el registro (formato E.164).
- Mostrar precios en pesos colombianos, con conversión aproximada opcional a USD.
- Indicaciones de entrega por punto en el mapa, no solo dirección escrita (las direcciones locales son difíciles para un visitante).

## Técnicos

- **Observabilidad:** Sentry en los tres proyectos y logs estructurados en la API desde la fase 1.
- **CI/CD:** GitHub Actions con lint, pruebas y build por carpeta en cada PR.
- **Modo sin conexión parcial en la app:** guardar el último pedido y su estado para mostrarlo sin red.
- **Analítica de producto:** eventos clave (abrió mapa, tocó lugar, creó pedido, canceló) para medir el embudo.
- **Costos:** el stack elegido funciona en planes gratuitos en pruebas; el primer costo real será SMS/OTP, por eso el límite de envíos.

## Preguntas abiertas para el equipo

- ¿Ciudad de lanzamiento y horario de operación?
- ¿Métodos de pago aceptados en el piloto (efectivo, Nequi, Daviplata, transferencia)?
- ¿Cuántos domiciliarios y operadores habrá al inicio?
- ¿La tarifa la paga siempre el cliente o hay promociones de lanzamiento?
- ¿Nombre de dominio y cuentas de desarrollador en Google Play, Apple y Huawei?
