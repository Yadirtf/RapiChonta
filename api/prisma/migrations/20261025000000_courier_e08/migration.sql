-- E08 · Modo domiciliario y geocercas (Docs/14-base-de-datos/E08-modo-domiciliario.md).
-- Trae la base del libro de caja de E11 (tipos, cajas y movimientos), porque la compra en el local ES un
-- movimiento PURCHASE. Migración aditiva.
-- DropIndex

-- CreateTable
CREATE TABLE "cash_movement_types" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "direction" SMALLINT NOT NULL,
    "requires_order" BOOLEAN NOT NULL,
    "requires_payment_method" BOOLEAN NOT NULL,
    "is_manual" BOOLEAN NOT NULL,
    "uses_courier_collection_account" BOOLEAN NOT NULL,
    "only_for_funding_mode_id" SMALLINT,

    CONSTRAINT "cash_movement_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_boxes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "courier_user_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_boxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cash_box_id" UUID NOT NULL,
    "movement_type_id" SMALLINT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "order_id" UUID,
    "payment_method_id" SMALLINT,
    "collection_account_id" UUID,
    "reverses_movement_id" UUID,
    "created_by_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_purchases" (
    "order_id" UUID NOT NULL,
    "cash_movement_id" UUID NOT NULL,
    "receipt_file_id" UUID NOT NULL,

    CONSTRAINT "order_purchases_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "order_preparation_delays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "reported_by_user_id" UUID NOT NULL,
    "reported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "client_event_id" UUID,

    CONSTRAINT "order_preparation_delays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_movement_types_code_key" ON "cash_movement_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "cash_boxes_courier_user_id_business_date_key" ON "cash_boxes"("courier_user_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_reverses_movement_id_key" ON "cash_movements"("reverses_movement_id");

-- CreateIndex
CREATE INDEX "cash_movements_cash_box_id_idx" ON "cash_movements"("cash_box_id");

-- CreateIndex
CREATE INDEX "cash_movements_order_id_idx" ON "cash_movements"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_id_order_id_key" ON "cash_movements"("id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_purchases_cash_movement_id_key" ON "order_purchases"("cash_movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_purchases_receipt_file_id_key" ON "order_purchases"("receipt_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_preparation_delays_client_event_id_key" ON "order_preparation_delays"("client_event_id");

-- CreateIndex
CREATE INDEX "order_preparation_delays_order_id_reported_at_idx" ON "order_preparation_delays"("order_id", "reported_at");

-- AddForeignKey
ALTER TABLE "cash_movement_types" ADD CONSTRAINT "cash_movement_types_only_for_funding_mode_id_fkey" FOREIGN KEY ("only_for_funding_mode_id") REFERENCES "funding_modes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_boxes" ADD CONSTRAINT "cash_boxes_courier_user_id_fkey" FOREIGN KEY ("courier_user_id") REFERENCES "courier_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_box_id_fkey" FOREIGN KEY ("cash_box_id") REFERENCES "cash_boxes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_movement_type_id_fkey" FOREIGN KEY ("movement_type_id") REFERENCES "cash_movement_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_collection_account_id_fkey" FOREIGN KEY ("collection_account_id") REFERENCES "courier_collection_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_reverses_movement_id_fkey" FOREIGN KEY ("reverses_movement_id") REFERENCES "cash_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_purchases" ADD CONSTRAINT "order_purchases_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_purchases" ADD CONSTRAINT "order_purchases_cash_movement_id_order_id_fkey" FOREIGN KEY ("cash_movement_id", "order_id") REFERENCES "cash_movements"("id", "order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_purchases" ADD CONSTRAINT "order_purchases_receipt_file_id_fkey" FOREIGN KEY ("receipt_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_preparation_delays" ADD CONSTRAINT "order_preparation_delays_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_preparation_delays" ADD CONSTRAINT "order_preparation_delays_reported_by_user_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;





-- ════════════════════════════════════════════════════════════════════════════
-- Integridad que Prisma no genera. Revise toda migración nueva y quite
-- cualquier DROP INDEX / DROP TRIGGER / DROP VIEW que no sea intencional.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────── Reglas por columna ───────────────
ALTER TABLE "cash_movement_types" ADD CONSTRAINT "cash_movement_types_direction_check" CHECK ("direction" IN (-1, 1));
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_amount_check" CHECK ("amount" > 0);
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_not_self_reverse_check" CHECK ("reverses_movement_id" IS NULL OR "reverses_movement_id" <> "id");

-- ─────────────── cash_movements ───────────────
-- Lo que exige cada tipo (catálogo), y que el pedido y la cuenta sean del dueño de la caja. E11 agrega el cierre
-- y las reglas de los ajustes; aquí basta para la compra (H08.4).
CREATE FUNCTION fn_cash_movements_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  t cash_movement_types%ROWTYPE;
  v_owner uuid;
BEGIN
  SELECT * INTO t FROM cash_movement_types WHERE id = NEW.movement_type_id;
  SELECT courier_user_id INTO v_owner FROM cash_boxes WHERE id = NEW.cash_box_id FOR SHARE;
  IF t.requires_order AND NEW.order_id IS NULL THEN
    RAISE EXCEPTION 'El movimiento % exige un pedido', t.code USING ERRCODE = 'check_violation';
  END IF;
  IF t.requires_payment_method AND NEW.payment_method_id IS NULL THEN
    RAISE EXCEPTION 'El movimiento % exige el medio de pago', t.code USING ERRCODE = 'check_violation';
  END IF;
  IF t.is_manual AND NEW.created_by_user_id IS NULL THEN
    RAISE EXCEPTION 'Un movimiento manual lleva quién lo hizo' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.order_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM v_order_courier c WHERE c.order_id = NEW.order_id AND c.courier_user_id = v_owner) THEN
    RAISE EXCEPTION 'El pedido no es del dueño de la caja' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.collection_account_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM courier_collection_accounts a WHERE a.id = NEW.collection_account_id AND a.courier_user_id = v_owner) THEN
    RAISE EXCEPTION 'La cuenta de cobro no es del dueño de la caja' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "cash_movements_insert" BEFORE INSERT ON "cash_movements" FOR EACH ROW EXECUTE FUNCTION fn_cash_movements_insert();
-- RF-71: el libro no se edita ni se borra; un error se corrige con un ajuste.
CREATE TRIGGER "cash_movements_immutable" BEFORE UPDATE OR DELETE ON "cash_movements" FOR EACH ROW EXECUTE FUNCTION fn_immutable();
CREATE TRIGGER "cash_boxes_immutable" BEFORE UPDATE OR DELETE ON "cash_boxes" FOR EACH ROW EXECUTE FUNCTION fn_immutable();

-- ─────────────── order_purchases ───────────────
-- La compra es un PURCHASE del mismo pedido (la FK compuesta ya lo ata al pedido) y la factura es una foto
-- PURCHASE_RECEIPT que subió quien registró la compra.
CREATE FUNCTION fn_order_purchases_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_type text;
  v_by uuid;
BEGIN
  SELECT t.code, m.created_by_user_id INTO v_type, v_by
  FROM cash_movements m JOIN cash_movement_types t ON t.id = m.movement_type_id WHERE m.id = NEW.cash_movement_id;
  IF v_type IS DISTINCT FROM 'PURCHASE' THEN
    RAISE EXCEPTION 'La compra se registra con un movimiento PURCHASE' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM files f JOIN file_purposes p ON p.id = f.purpose_id AND p.code = 'PURCHASE_RECEIPT'
                 WHERE f.id = NEW.receipt_file_id AND f.uploaded_by_user_id = v_by) THEN
    RAISE EXCEPTION 'La factura debe ser una foto PURCHASE_RECEIPT de quien registró la compra' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "order_purchases_insert" BEFORE INSERT ON "order_purchases" FOR EACH ROW EXECUTE FUNCTION fn_order_purchases_insert();
CREATE TRIGGER "order_purchases_immutable" BEFORE UPDATE OR DELETE ON "order_purchases" FOR EACH ROW EXECUTE FUNCTION fn_immutable();

-- ─────────────── order_preparation_delays ───────────────
-- "Sigue en preparación" solo lo marca el domiciliario del pedido mientras está en preparación, y nunca con una
-- hora anterior al inicio de la preparación ni del futuro (la cola sin señal manda la hora del teléfono).
CREATE FUNCTION fn_order_preparation_delays_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_started timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orders o JOIN order_statuses s ON s.id = o.status_id AND s.code = 'PREPARING' WHERE o.id = NEW.order_id) THEN
    RAISE EXCEPTION 'El pedido no está en preparación' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM order_assignments a WHERE a.order_id = NEW.order_id AND a.courier_user_id = NEW.reported_by_user_id AND a.released_at IS NULL) THEN
    RAISE EXCEPTION 'Solo el domiciliario del pedido reporta la preparación' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT started_at INTO v_started FROM v_order_preparation WHERE order_id = NEW.order_id;
  IF NEW.reported_at < v_started OR NEW.reported_at > clock_timestamp() + interval '2 minutes' THEN
    RAISE EXCEPTION 'La hora del reporte no es coherente con la preparación' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────── Vistas ───────────────

-- H08.5: la preparación se calcula, no se guarda. Empieza con la última fila → PREPARING; tarda lo del producto
-- que más tarda; el siguiente aviso es a la hora estimada o, si ya dijo "Sigue en preparación", recheck después.
CREATE VIEW "v_order_preparation" AS
SELECT o.id AS order_id, p.started_at,
       p.started_at + make_interval(mins => l.prep_minutes) AS estimated_ready_at,
       d.delay_count,
       d.delay_count > 0 AS is_delayed,
       CASE WHEN d.delay_count > 0
            THEN d.last_reported_at + make_interval(secs => coalesce(
                   (SELECT value::int FROM v_current_settings WHERE key = 'preparation.recheck_seconds' AND municipality_id IS NULL), 300))
            ELSE p.started_at + make_interval(mins => l.prep_minutes)
       END AS next_check_at
FROM orders o
-- Una búsqueda por índice (order_id, recorded_at) por pedido: filtrar por estado del pedido no recorre el historial.
CROSS JOIN LATERAL (SELECT h.occurred_at AS started_at FROM order_status_history h
                    JOIN order_statuses s ON s.id = h.to_status_id AND s.code = 'PREPARING'
                    WHERE h.order_id = o.id ORDER BY h.recorded_at DESC LIMIT 1) p
CROSS JOIN LATERAL (SELECT coalesce(max(prep_minutes), 0)::int AS prep_minutes FROM v_order_lines
                    WHERE order_id = o.id AND NOT is_removed) l
CROSS JOIN LATERAL (SELECT count(*)::int AS delay_count, max(reported_at) AS last_reported_at FROM order_preparation_delays
                    WHERE order_id = o.id) d;

CREATE TRIGGER "order_preparation_delays_insert" BEFORE INSERT ON "order_preparation_delays"
  FOR EACH ROW EXECUTE FUNCTION fn_order_preparation_delays_insert();
CREATE TRIGGER "order_preparation_delays_immutable" BEFORE UPDATE OR DELETE ON "order_preparation_delays"
  FOR EACH ROW EXECUTE FUNCTION fn_immutable();

-- ─────────────── sessions: modo cliente (H08.7) ───────────────
-- Dejar el modo domiciliario (cambiar a cliente o cerrar la sesión) cierra el turno Disponible: en modo cliente no
-- recibe ofertas ni comparte ubicación. Con un pedido en curso no puede dejarlo (lo terminaría sin ubicación).
-- Si otra sesión suya sigue en modo domiciliario (otro teléfono), el turno sigue abierto.
CREATE FUNCTION fn_sessions_leave_courier_mode() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_courier smallint := (SELECT id FROM roles WHERE code = 'COURIER');
BEGIN
  IF OLD.active_role_id <> v_courier OR OLD.ended_at IS NOT NULL
     OR (NEW.active_role_id = v_courier AND NEW.ended_at IS NULL) THEN
    RETURN NULL;
  END IF;
  IF NEW.ended_at IS NULL AND EXISTS (SELECT 1 FROM order_assignments WHERE courier_user_id = NEW.user_id AND released_at IS NULL) THEN
    RAISE EXCEPTION 'COURIER_HAS_ACTIVE_ORDER' USING ERRCODE = 'check_violation', HINT = 'courier_has_active_order';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = NEW.user_id AND s.id <> NEW.id AND s.ended_at IS NULL AND s.active_role_id = v_courier) THEN
    UPDATE courier_availability_periods
    SET ended_at = greatest(clock_timestamp(), started_at + interval '1 millisecond'),
        end_reason_id = (SELECT id FROM availability_end_reasons WHERE code = 'TOGGLED_OFF')
    WHERE courier_user_id = NEW.user_id AND ended_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "sessions_leave_courier_mode" AFTER UPDATE OF "active_role_id", "ended_at" ON "sessions"
  FOR EACH ROW EXECUTE FUNCTION fn_sessions_leave_courier_mode();
