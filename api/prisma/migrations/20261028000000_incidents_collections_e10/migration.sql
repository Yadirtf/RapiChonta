-- E10 · Incidencias, cobro contra entrega y alertas del panel (Docs/14-base-de-datos/E10-entrega-e-incidencias.md).
-- "No lo recibí" abre una incidencia y pone el pedido en DISPUTED; el operador la toma y la resuelve como entregado
-- o cancelado. El cobro al cliente (H10.2) es un movimiento COLLECTION del libro de caja de E08/E11. Las alertas del
-- panel de pedidos (H10.5) son una vista: no se guarda ninguna. Migración aditiva.
-- CreateTable
CREATE TABLE "incident_types" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "opens_dispute" BOOLEAN NOT NULL,

    CONSTRAINT "incident_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_statuses" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "is_initial" BOOLEAN NOT NULL,
    "is_terminal" BOOLEAN NOT NULL,

    CONSTRAINT "incident_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_status_transitions" (
    "from_status_id" SMALLINT NOT NULL,
    "to_status_id" SMALLINT NOT NULL,

    CONSTRAINT "incident_status_transitions_pkey" PRIMARY KEY ("from_status_id","to_status_id")
);

-- CreateTable
CREATE TABLE "incident_resolution_types" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "resulting_order_status_id" SMALLINT,

    CONSTRAINT "incident_resolution_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "incident_type_id" SMALLINT NOT NULL,
    "reported_by_user_id" UUID NOT NULL,
    "description" VARCHAR(500),
    "status_id" SMALLINT NOT NULL,
    "resolution_type_id" SMALLINT,
    "resolution_notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "incident_id" UUID NOT NULL,
    "from_status_id" SMALLINT,
    "to_status_id" SMALLINT NOT NULL,
    "changed_by_user_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "incident_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "incident_types_code_key" ON "incident_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "incident_statuses_code_key" ON "incident_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "incident_resolution_types_code_key" ON "incident_resolution_types"("code");

-- CreateIndex
CREATE INDEX "incidents_order_id_idx" ON "incidents"("order_id");

-- CreateIndex
CREATE INDEX "incidents_status_id_idx" ON "incidents"("status_id");

-- CreateIndex
CREATE INDEX "incident_status_history_incident_id_occurred_at_idx" ON "incident_status_history"("incident_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "incident_status_transitions" ADD CONSTRAINT "incident_status_transitions_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "incident_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_status_transitions" ADD CONSTRAINT "incident_status_transitions_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "incident_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_resolution_types" ADD CONSTRAINT "incident_resolution_types_resulting_order_status_id_fkey" FOREIGN KEY ("resulting_order_status_id") REFERENCES "order_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_incident_type_id_fkey" FOREIGN KEY ("incident_type_id") REFERENCES "incident_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_user_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "incident_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resolution_type_id_fkey" FOREIGN KEY ("resolution_type_id") REFERENCES "incident_resolution_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_status_history" ADD CONSTRAINT "incident_status_history_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_status_history" ADD CONSTRAINT "incident_status_history_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "incident_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_status_history" ADD CONSTRAINT "incident_status_history_from_status_id_to_status_id_fkey" FOREIGN KEY ("from_status_id", "to_status_id") REFERENCES "incident_status_transitions"("from_status_id", "to_status_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_status_history" ADD CONSTRAINT "incident_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════════════════════
-- Integridad que Prisma no genera.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────── incidents ← incident_status_history (patrón estándar de historial) ───────────────
CREATE TRIGGER "incident_status_history_apply" AFTER INSERT ON "incident_status_history"
  FOR EACH ROW EXECUTE FUNCTION fn_status_history_apply('incidents', 'id', 'incident_id', 'status_id', 'incident_statuses');
CREATE TRIGGER "incidents_status_guard" BEFORE UPDATE OF "status_id" ON "incidents"
  FOR EACH ROW EXECUTE FUNCTION fn_status_column_guard('status_id');
CREATE CONSTRAINT TRIGGER "incidents_status_history_required" AFTER INSERT ON "incidents"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_status_history_required('incident_status_history', 'incident_id', 'id');
CREATE TRIGGER "incident_status_history_immutable" BEFORE UPDATE OR DELETE ON "incident_status_history"
  FOR EACH ROW EXECUTE FUNCTION fn_immutable();

-- Al abrirla: una sola sin resolver por pedido (se bloquea la fila del pedido para que dos reportes a la vez no
-- pasen) y la reporta el cliente del pedido o alguien del personal.
CREATE FUNCTION fn_incidents_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_customer uuid;
BEGIN
  SELECT customer_user_id INTO v_customer FROM orders WHERE id = NEW.order_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM incidents i JOIN incident_statuses s ON s.id = i.status_id AND NOT s.is_terminal
             WHERE i.order_id = NEW.order_id) THEN
    RAISE EXCEPTION 'El pedido ya tiene una novedad sin resolver' USING ERRCODE = 'unique_violation';
  END IF;
  IF NEW.reported_by_user_id IS DISTINCT FROM v_customer
     AND NOT EXISTS (SELECT 1 FROM v_active_user_roles ar JOIN roles r ON r.id = ar.role_id AND r.is_staff
                     WHERE ar.user_id = NEW.reported_by_user_id) THEN
    RAISE EXCEPTION 'La novedad la reporta el cliente del pedido o el personal' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.resolution_type_id IS NOT NULL OR NEW.resolution_notes IS NOT NULL THEN
    RAISE EXCEPTION 'Una novedad nace sin resolución' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "incidents_insert" BEFORE INSERT ON "incidents" FOR EACH ROW EXECUTE FUNCTION fn_incidents_insert();

-- Lo reportado no se edita; la resolución se escribe una sola vez (antes de pasarla a RESOLVED en el historial).
CREATE FUNCTION fn_incidents_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las novedades no se borran' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.order_id, NEW.incident_type_id, NEW.reported_by_user_id, NEW.description, NEW.created_at)
     IS DISTINCT FROM (OLD.order_id, OLD.incident_type_id, OLD.reported_by_user_id, OLD.description, OLD.created_at) THEN
    RAISE EXCEPTION 'Lo reportado en una novedad no se edita' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.resolution_type_id IS NOT NULL
     AND (NEW.resolution_type_id, NEW.resolution_notes) IS DISTINCT FROM (OLD.resolution_type_id, OLD.resolution_notes) THEN
    RAISE EXCEPTION 'La resolución de una novedad no se cambia' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "incidents_update" BEFORE UPDATE OR DELETE ON "incidents" FOR EACH ROW EXECUTE FUNCTION fn_incidents_update();

-- Al confirmar: resuelta si y solo si tiene su tipo de resolución.
CREATE FUNCTION fn_incidents_resolution_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM incidents i JOIN incident_statuses s ON s.id = i.status_id
             WHERE i.id = NEW.id AND s.is_terminal <> (i.resolution_type_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Una novedad resuelta lleva su resolución, y una abierta no' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "incidents_resolution_check" AFTER INSERT OR UPDATE ON "incidents"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_incidents_resolution_check();

-- Tomarla o resolverla es del personal; la fila inicial la escribe quien la reporta.
CREATE FUNCTION fn_incident_status_history_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.from_status_id IS NULL THEN
    IF NEW.changed_by_user_id IS DISTINCT FROM (SELECT reported_by_user_id FROM incidents WHERE id = NEW.incident_id) THEN
      RAISE EXCEPTION 'La primera fila de la novedad es de quien la reporta' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM v_active_user_roles ar JOIN roles r ON r.id = ar.role_id AND r.is_staff
                    WHERE ar.user_id = NEW.changed_by_user_id) THEN
    RAISE EXCEPTION 'Solo el personal toma o resuelve una novedad' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "incident_status_history_rules" BEFORE INSERT ON "incident_status_history"
  FOR EACH ROW EXECUTE FUNCTION fn_incident_status_history_rules();

-- ─────────────── Pedido en disputa ⇔ novedad abierta ───────────────
-- Al confirmar: un pedido está en DISPUTED si y solo si tiene una novedad sin resolver de un tipo que abre disputa.
-- Así no se entra a DISPUTED sin caso, ni se sale sin resolverlo (ni queda un caso que abre disputa sin ella).
CREATE FUNCTION fn_order_dispute_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_order uuid;
BEGIN
  -- Cada rama se planea solo al ejecutarse: NEW tiene order_id en un historial e incident_id en el otro.
  IF TG_TABLE_NAME = 'order_status_history' THEN
    v_order := NEW.order_id;
  ELSE
    SELECT order_id INTO v_order FROM incidents WHERE id = NEW.incident_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM orders o JOIN order_statuses s ON s.id = o.status_id
    WHERE o.id = v_order
      AND (s.code = 'DISPUTED') <> EXISTS (
        SELECT 1 FROM incidents i
        JOIN incident_statuses st ON st.id = i.status_id AND NOT st.is_terminal
        JOIN incident_types t ON t.id = i.incident_type_id AND t.opens_dispute
        WHERE i.order_id = o.id)) THEN
    RAISE EXCEPTION 'Un pedido en disputa tiene su novedad abierta, y resolverla lo saca de la disputa' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "order_status_history_dispute" AFTER INSERT ON "order_status_history"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_order_dispute_consistency();
CREATE CONSTRAINT TRIGGER "incident_status_history_dispute" AFTER INSERT ON "incident_status_history"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_order_dispute_consistency();

-- ─────────────── Avisos ───────────────
-- Salir de DISPUTED es resolver la novedad: el cliente y el domiciliario reciben INCIDENT_RESOLVED (lo encola el caso
-- de uso con la resolución), no además el aviso genérico del estado.
CREATE OR REPLACE FUNCTION fn_order_status_history_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notifications (recipient_user_id, notification_type_id, order_id, order_status_history_id)
  SELECT o.customer_user_id, t.id, o.id, NEW.id
  FROM orders o
  JOIN order_statuses s ON s.id = NEW.to_status_id AND s.notifies_customer
  JOIN notification_types t ON t.code = 'ORDER_STATUS_CHANGED' AND t.deactivated_at IS NULL
  WHERE o.id = NEW.order_id AND NEW.changed_by_user_id IS DISTINCT FROM o.customer_user_id
    AND NEW.from_status_id IS DISTINCT FROM (SELECT id FROM order_statuses WHERE code = 'DISPUTED');
  RETURN NULL;
END;
$$;

-- ─────────────── cash_movements: la cuenta de cobro (H10.2) ───────────────
-- Igual que en E08, más: un cobro (o una base) por un medio basado en cuenta lleva la cuenta del domiciliario que
-- recibió el dinero, vigente y de ese mismo medio. Un cobro en efectivo no lleva cuenta.
CREATE OR REPLACE FUNCTION fn_cash_movements_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  t cash_movement_types%ROWTYPE;
  v_owner uuid;
  v_account_based boolean;
BEGIN
  SELECT * INTO t FROM cash_movement_types WHERE id = NEW.movement_type_id;
  SELECT courier_user_id INTO v_owner FROM cash_boxes WHERE id = NEW.cash_box_id FOR SHARE;
  SELECT is_account_based INTO v_account_based FROM payment_methods WHERE id = NEW.payment_method_id;
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
  IF t.uses_courier_collection_account AND coalesce(v_account_based, false) <> (NEW.collection_account_id IS NOT NULL) THEN
    RAISE EXCEPTION 'El movimiento % lleva la cuenta de cobro solo si el medio es de cuenta', t.code USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.collection_account_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM courier_collection_accounts a
                     WHERE a.id = NEW.collection_account_id AND a.courier_user_id = v_owner
                       AND a.payment_method_id = NEW.payment_method_id AND a.archived_at IS NULL) THEN
    RAISE EXCEPTION 'La cuenta de cobro no es del dueño de la caja o no es de ese medio' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────── Vistas ───────────────

-- Lo cobrado al cliente por pedido (H10.2): la suma de sus COLLECTION (uno por medio si pagó con dos).
CREATE VIEW "v_order_collections" AS
SELECT m.order_id, sum(m.amount)::numeric(12,2) AS collected_total, count(*)::int AS payment_count,
       min(m.created_at) AS collected_at
FROM cash_movements m
JOIN cash_movement_types t ON t.id = m.movement_type_id AND t.code = 'COLLECTION'
GROUP BY m.order_id;

-- H10.5, RF-64: las alertas del panel de pedidos, calculadas en cada lectura. Una fila por pedido y alerta, con desde
-- cuándo aplica. Los pedidos terminados solo aparecen por el cobro (entregados en las últimas 24 horas sin cobro, o
-- cobrados con otro valor), para que la caja del día no quede con huecos.
CREATE VIEW "v_active_order_alerts" AS
WITH last_change AS (
  SELECT DISTINCT ON (h.order_id) h.order_id, h.occurred_at, h.from_status_id, src.code AS source
  FROM order_status_history h JOIN status_change_sources src ON src.id = h.source_id
  ORDER BY h.order_id, h.recorded_at DESC)
SELECT o.id AS order_id, 'UNASSIGNED'::text AS alert, lc.occurred_at AS since
FROM orders o JOIN order_statuses s ON s.id = o.status_id AND s.is_initial
JOIN last_change lc ON lc.order_id = o.id
WHERE lc.source NOT IN ('TIMER', 'OFFERS_DECLINED')
UNION ALL
SELECT o.id, 'NO_TAKERS', lc.occurred_at
FROM orders o JOIN order_statuses s ON s.id = o.status_id AND s.is_initial
JOIN last_change lc ON lc.order_id = o.id
WHERE lc.source IN ('TIMER', 'OFFERS_DECLINED')
UNION ALL
SELECT o.id, 'PREPARATION_DELAYED', p.started_at
FROM orders o JOIN order_statuses s ON s.id = o.status_id AND s.code = 'PREPARING'
JOIN v_order_preparation p ON p.order_id = o.id
WHERE p.is_delayed OR p.estimated_ready_at < now()
UNION ALL
SELECT o.id, 'DECISION_EXPIRED', max(x.decided_at)
FROM orders o JOIN order_statuses s ON s.id = o.status_id AND NOT s.is_terminal
JOIN order_item_adjustments x ON x.order_id = o.id
JOIN adjustment_decisions d ON d.id = x.decision_id AND d.is_automatic
WHERE x.decided_at > now() - interval '30 minutes'
GROUP BY o.id
UNION ALL
SELECT o.id, 'PROOF_REVIEW', lc.occurred_at
FROM orders o JOIN order_statuses s ON s.id = o.status_id AND s.code = 'PENDING_REVIEW'
JOIN last_change lc ON lc.order_id = o.id
UNION ALL
SELECT i.order_id, 'INCIDENT', i.created_at
FROM incidents i JOIN incident_statuses st ON st.id = i.status_id AND NOT st.is_terminal
UNION ALL
SELECT o.id, CASE WHEN c.order_id IS NULL THEN 'COLLECTION_MISSING' ELSE 'COLLECTION_MISMATCH' END, lc.occurred_at
FROM orders o JOIN order_statuses s ON s.id = o.status_id AND s.counts_as_delivered
JOIN last_change lc ON lc.order_id = o.id AND lc.occurred_at > now() - interval '24 hours'
JOIN v_order_amounts a ON a.order_id = o.id
LEFT JOIN v_order_collections c ON c.order_id = o.id
WHERE c.order_id IS NULL OR c.collected_total <> a.customer_total;

-- RNF-07: el registro del personal suma tomar y resolver novedades (con la resolución y el comentario).
CREATE OR REPLACE VIEW "v_staff_activity" AS
SELECT 'audit:' || l.id AS id, l.occurred_at, l.actor_user_id, a.code AS action, l.entity_table, l.entity_id,
       NULL::uuid AS order_id, NULL::integer AS municipality_id, l.changes AS details
FROM audit_logs l JOIN audit_actions a ON a.id = l.action_id
UNION ALL
SELECT 'offer:' || o.id, o.created_at, o.sent_by_user_id, 'ORDER_OFFERED', 'order_offers', o.id::text,
       o.order_id, e.municipality_id,
       jsonb_build_object('mode', m.code, 'recipients', (SELECT count(*) FROM order_offer_recipients r WHERE r.order_offer_id = o.id))
FROM order_offers o
JOIN offer_modes m ON m.id = o.offer_mode_id
JOIN orders x ON x.id = o.order_id
JOIN establishments e ON e.id = x.establishment_id
WHERE o.sent_by_user_id IS NOT NULL
UNION ALL
SELECT 'status:' || h.id, h.occurred_at, h.changed_by_user_id,
       CASE WHEN ts.is_terminal AND NOT ts.counts_as_delivered THEN 'ORDER_CANCELLED' ELSE 'ORDER_STATUS_CHANGED' END,
       'order_status_history', h.id::text, h.order_id, e.municipality_id,
       jsonb_build_object('from', fs.code, 'to', ts.code) || CASE WHEN h.note IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('note', h.note) END
FROM order_status_history h
JOIN roles r ON r.id = h.acting_role_id AND r.is_staff
JOIN order_statuses ts ON ts.id = h.to_status_id AND ts.code <> 'OFFERED'
LEFT JOIN order_statuses fs ON fs.id = h.from_status_id
JOIN orders x ON x.id = h.order_id
JOIN establishments e ON e.id = x.establishment_id
UNION ALL
SELECT 'release:' || a.id, a.released_at, a.released_by_user_id, 'ORDER_REASSIGNED', 'order_assignments', a.id::text,
       a.order_id, e.municipality_id, jsonb_build_object('reason', rr.code, 'courierUserId', a.courier_user_id)
FROM order_assignments a
JOIN assignment_release_reasons rr ON rr.id = a.release_reason_id
JOIN orders x ON x.id = a.order_id
JOIN establishments e ON e.id = x.establishment_id
WHERE a.released_by_user_id IS NOT NULL AND a.released_by_user_id <> a.courier_user_id
UNION ALL
SELECT 'incident:' || h.id, h.occurred_at, h.changed_by_user_id,
       CASE WHEN ts.is_terminal THEN 'INCIDENT_RESOLVED' ELSE 'INCIDENT_TAKEN' END,
       'incident_status_history', h.id::text, i.order_id, e.municipality_id,
       jsonb_build_object('type', it.code)
         || CASE WHEN ts.is_terminal THEN jsonb_build_object('resolution', rt.code, 'note', i.resolution_notes) ELSE '{}'::jsonb END
FROM incident_status_history h
JOIN incident_statuses ts ON ts.id = h.to_status_id
JOIN incidents i ON i.id = h.incident_id
JOIN incident_types it ON it.id = i.incident_type_id
LEFT JOIN incident_resolution_types rt ON rt.id = i.resolution_type_id
JOIN orders x ON x.id = i.order_id
JOIN establishments e ON e.id = x.establishment_id
WHERE h.from_status_id IS NOT NULL;
