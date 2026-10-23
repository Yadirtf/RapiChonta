-- =====================================================================================================
-- Limpieza de pedidos de prueba (solo ambiente de pruebas)
--
-- Borra todo lo transaccional de los domicilios: pedidos y sus ítems, historial de estados, ofertas y
-- asignaciones (E07), turnos y ubicaciones de los domiciliarios (E08), compras, demoras de preparación,
-- códigos e intentos de entrega, fotos de entrega y facturas (E08/E10), producto faltante y cambios de
-- precio (E09), cancelaciones, novedades y su historial, cajas y movimientos de efectivo (E10) y las
-- notificaciones (hoy todas son de pedidos: ofertas, cambios de estado, novedades, etc.).
--
-- NO toca: usuarios, personas, roles, sesiones, perfiles y documentos de domiciliarios, cuentas de cobro
-- (con su QR), locales, menús, productos, zonas, tarifas, horarios, parámetros, comisiones, direcciones y
-- destinatarios guardados de los clientes, auditoría, ni ninguna tabla de catálogo o de estados.
--
-- Cómo usarlo en Neon (SQL Editor, rama de pruebas):
--   1. Pida a los domiciliarios que terminen el turno y cierre la app (el script cierra los turnos).
--   2. Ejecute el PASO 1 para ver cuánto hay. Luego el PASO 2 (todo junto, es una sola instrucción, así que
--      se aplica completo o no se aplica nada). Al final el PASO 3 debe mostrar todo en 0.
--
-- Las tablas de pedidos son inmutables por diseño (triggers que impiden UPDATE/DELETE). Por eso se usa
-- TRUNCATE, que no dispara esos triggers de fila y no deja las tablas sin protección: siguen activos.
-- Requiere el rol dueño de las tablas (neondb_owner, el que corre las migraciones).
-- =====================================================================================================


-- PASO 1 · Cuánto hay antes de borrar ----------------------------------------------------------------
SELECT 'orders' AS tabla, count(*) FROM orders
UNION ALL SELECT 'order_status_history', count(*) FROM order_status_history
UNION ALL SELECT 'order_offers', count(*) FROM order_offers
UNION ALL SELECT 'order_assignments', count(*) FROM order_assignments
UNION ALL SELECT 'incidents', count(*) FROM incidents
UNION ALL SELECT 'cash_boxes', count(*) FROM cash_boxes
UNION ALL SELECT 'cash_movements', count(*) FROM cash_movements
UNION ALL SELECT 'courier_availability_periods', count(*) FROM courier_availability_periods
UNION ALL SELECT 'notifications', count(*) FROM notifications
UNION ALL SELECT 'files (facturas y fotos de entrega)', count(*) FROM files f JOIN file_purposes p ON p.id = f.purpose_id
                                                       WHERE p.code IN ('PURCHASE_RECEIPT', 'DELIVERY_PROOF');


-- PASO 2 · Borrar -------------------------------------------------------------------------------------
DO $$
BEGIN
  -- Si la app tiene bloqueada alguna tabla, se rinde en vez de quedarse esperando.
  SET LOCAL lock_timeout = '15s';

  -- 1) Todo lo que cuelga de un pedido, sus notificaciones (todos los tipos de notificación son de
  --    pedidos), cajas, turnos y ubicaciones de los domiciliarios. TRUNCATE exige nombrar juntas las
  --    tablas que se referencian entre sí; si faltara una, falla y no borra nada.
  TRUNCATE TABLE
    notification_deliveries,
    notifications,
    order_item_adjustments,
    order_adjustment_requests,
    order_purchases,
    cash_movements,
    cash_boxes,
    order_delivery_proofs,
    delivery_code_attempts,
    order_delivery_codes,
    order_preparation_delays,
    order_cancellations,
    incident_status_history,
    incidents,
    order_assignments,
    order_offer_recipients,
    order_offers,
    order_status_history,
    order_items,
    orders,
    courier_location_pings,
    courier_availability_periods;

  -- 2) Archivos que solo servían a esos pedidos (facturas de compra y fotos de entrega). Con
  --    FILE_STORAGE=database los bytes se van con ellos (file_contents, en cascada). El QR de las
  --    cuentas de cobro, logos, imágenes de productos y documentos no se tocan.
  DELETE FROM files f
  USING file_purposes p
  WHERE p.id = f.purpose_id AND p.code IN ('PURCHASE_RECEIPT', 'DELIVERY_PROOF');
END $$;


-- PASO 3 · Verificar (todo debe quedar en 0) ----------------------------------------------------------
SELECT 'orders' AS tabla, count(*) FROM orders
UNION ALL SELECT 'order_status_history', count(*) FROM order_status_history
UNION ALL SELECT 'order_offers', count(*) FROM order_offers
UNION ALL SELECT 'order_assignments', count(*) FROM order_assignments
UNION ALL SELECT 'incidents', count(*) FROM incidents
UNION ALL SELECT 'cash_boxes', count(*) FROM cash_boxes
UNION ALL SELECT 'cash_movements', count(*) FROM cash_movements
UNION ALL SELECT 'courier_availability_periods', count(*) FROM courier_availability_periods
UNION ALL SELECT 'notifications', count(*) FROM notifications
UNION ALL SELECT 'files (facturas y fotos de entrega)', count(*) FROM files f JOIN file_purposes p ON p.id = f.purpose_id
                                                       WHERE p.code IN ('PURCHASE_RECEIPT', 'DELIVERY_PROOF');
