-- E09 · Producto faltante o con otro precio (Docs/14-base-de-datos/E09-producto-faltante.md).
-- El domiciliario consulta al cliente por una o varias líneas a la vez; el cliente decide cada una con opciones
-- cerradas (cambiar, quitar, aceptar el precio nuevo o cancelar) y, si no responde a tiempo, el sistema quita la
-- línea. Trae también el motivo de cancelación (E10), porque una consulta puede terminar el pedido.
-- Migración aditiva.

-- CreateTable
CREATE TABLE "adjustment_reasons" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "requires_price" BOOLEAN NOT NULL,

    CONSTRAINT "adjustment_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adjustment_decisions" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "removes_item" BOOLEAN NOT NULL,
    "uses_reported_price" BOOLEAN NOT NULL,
    "creates_substitute" BOOLEAN NOT NULL,
    "cancels_order" BOOLEAN NOT NULL,
    "is_automatic" BOOLEAN NOT NULL,

    CONSTRAINT "adjustment_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellation_reasons" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "is_automatic" BOOLEAN NOT NULL,

    CONSTRAINT "cancellation_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_cancellations" (
    "order_id" UUID NOT NULL,
    "cancellation_reason_id" SMALLINT NOT NULL,
    "notes" VARCHAR(500),

    CONSTRAINT "order_cancellations_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "order_adjustment_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "reported_by_user_id" UUID NOT NULL,
    "reported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_adjustment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "reason_id" SMALLINT NOT NULL,
    "reported_unit_price" DECIMAL(12,2),
    "decision_id" SMALLINT,
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMPTZ(6),

    CONSTRAINT "order_item_adjustments_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "origin_adjustment_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "adjustment_reasons_code_key" ON "adjustment_reasons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "adjustment_decisions_code_key" ON "adjustment_decisions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "cancellation_reasons_code_key" ON "cancellation_reasons"("code");

-- CreateIndex
CREATE INDEX "order_adjustment_requests_order_id_reported_at_idx" ON "order_adjustment_requests"("order_id", "reported_at");

-- CreateIndex
CREATE UNIQUE INDEX "order_adjustment_requests_id_order_id_key" ON "order_adjustment_requests"("id", "order_id");

-- CreateIndex
CREATE INDEX "order_item_adjustments_request_id_idx" ON "order_item_adjustments"("request_id");

-- CreateIndex
CREATE INDEX "order_item_adjustments_order_item_id_idx" ON "order_item_adjustments"("order_item_id");

-- CreateIndex
CREATE INDEX "order_item_adjustments_order_id_idx" ON "order_item_adjustments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_origin_adjustment_id_key" ON "order_items"("origin_adjustment_id");

-- AddForeignKey
ALTER TABLE "order_cancellations" ADD CONSTRAINT "order_cancellations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_cancellations" ADD CONSTRAINT "order_cancellations_cancellation_reason_id_fkey" FOREIGN KEY ("cancellation_reason_id") REFERENCES "cancellation_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_adjustment_requests" ADD CONSTRAINT "order_adjustment_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_adjustment_requests" ADD CONSTRAINT "order_adjustment_requests_reported_by_user_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_adjustments" ADD CONSTRAINT "order_item_adjustments_request_id_order_id_fkey" FOREIGN KEY ("request_id", "order_id") REFERENCES "order_adjustment_requests"("id", "order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_adjustments" ADD CONSTRAINT "order_item_adjustments_order_item_id_order_id_fkey" FOREIGN KEY ("order_item_id", "order_id") REFERENCES "order_items"("id", "order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_adjustments" ADD CONSTRAINT "order_item_adjustments_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "adjustment_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_adjustments" ADD CONSTRAINT "order_item_adjustments_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "adjustment_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_adjustments" ADD CONSTRAINT "order_item_adjustments_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_origin_adjustment_id_fkey" FOREIGN KEY ("origin_adjustment_id") REFERENCES "order_item_adjustments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────── Reglas ───────────────
ALTER TABLE "order_adjustment_requests" ADD CONSTRAINT "order_adjustment_requests_window_check" CHECK ("expires_at" > "reported_at");
ALTER TABLE "order_item_adjustments" ADD CONSTRAINT "order_item_adjustments_price_check" CHECK ("reported_unit_price" > 0);
ALTER TABLE "order_item_adjustments" ADD CONSTRAINT "order_item_adjustments_decision_check"
  CHECK (("decision_id" IS NULL) = ("decided_at" IS NULL) AND ("decision_id" IS NOT NULL OR "decided_by_user_id" IS NULL));

-- Una sola consulta pendiente por línea, garantizada por un índice nativo.
CREATE UNIQUE INDEX "order_item_adjustments_one_pending_per_item_idx" ON "order_item_adjustments" ("order_item_id") WHERE "decided_at" IS NULL;
-- Las consultas que vencen: el reloj busca solo las pendientes.
CREATE INDEX "order_item_adjustments_pending_idx" ON "order_item_adjustments" ("request_id") WHERE "decided_at" IS NULL;

CREATE TRIGGER "order_adjustment_requests_immutable" BEFORE UPDATE OR DELETE ON "order_adjustment_requests"
  FOR EACH ROW EXECUTE FUNCTION fn_immutable();
CREATE TRIGGER "order_cancellations_immutable" BEFORE UPDATE OR DELETE ON "order_cancellations"
  FOR EACH ROW EXECUTE FUNCTION fn_immutable();

-- La consulta la abre el domiciliario que lleva el pedido, con el pedido ya esperando al cliente, y no hay otra
-- con líneas pendientes (no existe AWAITING_CUSTOMER → AWAITING_CUSTOMER).
CREATE FUNCTION fn_order_adjustment_requests_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM order_assignments a
                 WHERE a.order_id = NEW.order_id AND a.courier_user_id = NEW.reported_by_user_id AND a.released_at IS NULL) THEN
    RAISE EXCEPTION 'La consulta la abre el domiciliario del pedido' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM orders o JOIN order_statuses s ON s.id = o.status_id AND s.code = 'AWAITING_CUSTOMER'
                 WHERE o.id = NEW.order_id) THEN
    RAISE EXCEPTION 'La consulta va con el paso a AWAITING_CUSTOMER' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM order_item_adjustments x WHERE x.order_id = NEW.order_id AND x.decided_at IS NULL) THEN
    RAISE EXCEPTION 'El pedido ya tiene una consulta abierta' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "order_adjustment_requests_rules" BEFORE INSERT ON "order_adjustment_requests"
  FOR EACH ROW EXECUTE FUNCTION fn_order_adjustment_requests_rules();

-- Una línea consultada nace sin decisión, sigue en el pedido (no se consulta lo ya quitado) y lleva precio si el
-- motivo lo pide (y solo entonces).
CREATE FUNCTION fn_order_item_adjustments_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.decision_id IS NOT NULL OR NEW.decided_at IS NOT NULL OR NEW.decided_by_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'La línea consultada nace sin decisión' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT requires_price FROM adjustment_reasons WHERE id = NEW.reason_id) <> (NEW.reported_unit_price IS NOT NULL) THEN
    RAISE EXCEPTION 'El precio nuevo va solo con el motivo que lo pide' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM v_order_lines l WHERE l.order_item_id = NEW.order_item_id AND l.is_removed) THEN
    RAISE EXCEPTION 'Esa línea ya no está en el pedido' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "order_item_adjustments_insert" BEFORE INSERT ON "order_item_adjustments"
  FOR EACH ROW EXECUTE FUNCTION fn_order_item_adjustments_insert();

-- La decisión se escribe una sola vez (UPDATE ... WHERE decided_at IS NULL resuelve la carrera con el vencimiento)
-- y después no cambia. La toma el cliente del pedido o, si es automática, el sistema (sin usuario). Aceptar el
-- precio nuevo solo cabe si el motivo fue un cambio de precio.
CREATE FUNCTION fn_order_item_adjustments_decide() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_decision adjustment_decisions%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' OR OLD.decided_at IS NOT NULL
     OR (to_jsonb(NEW) - 'decision_id' - 'decided_by_user_id' - 'decided_at')
        <> (to_jsonb(OLD) - 'decision_id' - 'decided_by_user_id' - 'decided_at') THEN
    RAISE EXCEPTION 'La decisión sobre una línea se toma una vez y no se cambia' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_decision FROM adjustment_decisions WHERE id = NEW.decision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Falta la decisión' USING ERRCODE = 'check_violation';
  END IF;
  IF v_decision.is_automatic <> (NEW.decided_by_user_id IS NULL) THEN
    RAISE EXCEPTION 'Una decisión automática no lleva usuario, y una del cliente lo lleva' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.decided_by_user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = NEW.order_id AND o.customer_user_id = NEW.decided_by_user_id) THEN
    RAISE EXCEPTION 'Decide el cliente del pedido' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.uses_reported_price AND NOT (SELECT requires_price FROM adjustment_reasons WHERE id = NEW.reason_id) THEN
    RAISE EXCEPTION 'Solo se acepta un precio nuevo si cambió el precio' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "order_item_adjustments_decide" BEFORE UPDATE OR DELETE ON "order_item_adjustments"
  FOR EACH ROW EXECUTE FUNCTION fn_order_item_adjustments_decide();

-- Al confirmar: una decisión "cambiar por" deja exactamente su línea sustituta.
CREATE FUNCTION fn_order_item_adjustments_substitute_required() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT creates_substitute FROM adjustment_decisions WHERE id = NEW.decision_id)
     AND NOT EXISTS (SELECT 1 FROM order_items i WHERE i.origin_adjustment_id = NEW.id) THEN
    RAISE EXCEPTION 'Cambiar por un producto exige la línea nueva' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "order_item_adjustments_substitute_required" AFTER UPDATE OF "decision_id" ON "order_item_adjustments"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_order_item_adjustments_substitute_required();

-- La línea sustituta: del mismo local (regla de E04), del mismo pedido que la consulta y solo de una decisión que
-- crea sustituta.
CREATE OR REPLACE FUNCTION fn_order_items_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM product_versions v JOIN products p ON p.id = v.product_id JOIN orders o ON o.establishment_id = p.establishment_id
                 WHERE v.id = NEW.product_version_id AND o.id = NEW.order_id) THEN
    RAISE EXCEPTION 'El producto no es del establecimiento del pedido' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.origin_adjustment_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM order_item_adjustments x JOIN adjustment_decisions d ON d.id = x.decision_id AND d.creates_substitute
       WHERE x.id = NEW.origin_adjustment_id AND x.order_id = NEW.order_id) THEN
    RAISE EXCEPTION 'La línea sustituta sale de una decisión "cambiar por" del mismo pedido' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Al confirmar: el pedido sale de AWAITING_CUSTOMER solo con todas las líneas decididas, y todo pedido cancelado
-- tiene su motivo.
CREATE FUNCTION fn_order_status_history_e09() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.from_status_id = (SELECT id FROM order_statuses WHERE code = 'AWAITING_CUSTOMER')
     AND EXISTS (SELECT 1 FROM order_item_adjustments x WHERE x.order_id = NEW.order_id AND x.decided_at IS NULL) THEN
    RAISE EXCEPTION 'Faltan decisiones del cliente para seguir con el pedido' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.to_status_id = (SELECT id FROM order_statuses WHERE code = 'CANCELLED')
     AND NOT EXISTS (SELECT 1 FROM order_cancellations c WHERE c.order_id = NEW.order_id) THEN
    RAISE EXCEPTION 'Un pedido cancelado lleva su motivo' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "order_status_history_e09" AFTER INSERT ON "order_status_history"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_order_status_history_e09();

-- ─────────────── Líneas efectivas ───────────────
-- La última decisión de cada línea manda: quitarla (o cambiarla por otra) la saca del total y de la preparación,
-- y aceptar el precio nuevo cambia su precio. Mismas columnas que en E04.
CREATE OR REPLACE VIEW "v_order_lines" AS
SELECT i.id AS order_item_id, i.order_id, v.product_id, i.product_version_id,
       (CASE WHEN d.uses_reported_price THEN a.reported_unit_price ELSE v.price END)::numeric(12,2) AS unit_price,
       i.quantity, v.prep_minutes, i.notes, coalesce(d.removes_item, false) AS is_removed
FROM order_items i
JOIN product_versions v ON v.id = i.product_version_id
LEFT JOIN LATERAL (
  SELECT x.reported_unit_price, x.decision_id
  FROM order_item_adjustments x
  WHERE x.order_item_id = i.id AND x.decided_at IS NOT NULL
  ORDER BY x.decided_at DESC
  LIMIT 1
) a ON true
LEFT JOIN adjustment_decisions d ON d.id = a.decision_id;
