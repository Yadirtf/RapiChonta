-- E15 · Comercios aliados (Docs/14-base-de-datos/E13-E15-fases-futuras.md#e15--comercios-aliados).
-- Migración aditiva: convenios, personal del comercio, aceptación y "listo" del pedido directo, y la máquina de
-- estados del pedido por modo de cumplimiento. El rol MERCHANT, sus permisos y los estados nuevos son datos (semilla).

-- AlterTable
ALTER TABLE "cancellation_reasons" ADD COLUMN     "is_merchant_reason" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "fulfillment_modes" ADD COLUMN     "initial_status_id" SMALLINT,
ADD COLUMN     "requires_partnership" BOOLEAN NOT NULL DEFAULT false;
-- Los modos que ya existen nacían en PENDING_ASSIGNMENT; la semilla pone el de MERCHANT_DIRECT (AWAITING_MERCHANT).
UPDATE "fulfillment_modes" SET "initial_status_id" = (SELECT id FROM order_statuses WHERE code = 'PENDING_ASSIGNMENT');
ALTER TABLE "fulfillment_modes" ALTER COLUMN "initial_status_id" SET NOT NULL;

-- CreateTable
CREATE TABLE "order_status_transition_modes" (
    "from_status_id" SMALLINT NOT NULL,
    "to_status_id" SMALLINT NOT NULL,
    "fulfillment_mode_id" SMALLINT NOT NULL,

    CONSTRAINT "order_status_transition_modes_pkey" PRIMARY KEY ("from_status_id","to_status_id","fulfillment_mode_id")
);

-- CreateTable
CREATE TABLE "establishment_partnerships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "establishment_id" UUID NOT NULL,
    "started_on" DATE NOT NULL,
    "ended_on" DATE,
    "agreement_file_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_by_user_id" UUID,

    CONSTRAINT "establishment_partnerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "establishment_staff" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "granted_by_user_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "establishment_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_order_acceptances" (
    "order_id" UUID NOT NULL,
    "accepted_by_user_id" UUID NOT NULL,
    "preparation_minutes" SMALLINT NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "merchant_order_acceptances_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "merchant_order_readiness" (
    "order_id" UUID NOT NULL,
    "marked_by_user_id" UUID NOT NULL,
    "ready_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "merchant_order_readiness_pkey" PRIMARY KEY ("order_id")
);

-- CreateIndex
CREATE INDEX "order_status_transition_modes_fulfillment_mode_id_idx" ON "order_status_transition_modes"("fulfillment_mode_id");

-- CreateIndex
CREATE INDEX "establishment_partnerships_establishment_id_started_on_idx" ON "establishment_partnerships"("establishment_id", "started_on");

-- CreateIndex
CREATE INDEX "establishment_staff_user_id_idx" ON "establishment_staff"("user_id");

-- CreateIndex
CREATE INDEX "establishment_staff_establishment_id_idx" ON "establishment_staff"("establishment_id");

-- CreateIndex
CREATE INDEX "merchant_order_acceptances_accepted_by_user_id_idx" ON "merchant_order_acceptances"("accepted_by_user_id");

-- CreateIndex
CREATE INDEX "merchant_order_readiness_marked_by_user_id_idx" ON "merchant_order_readiness"("marked_by_user_id");

-- AddForeignKey
ALTER TABLE "fulfillment_modes" ADD CONSTRAINT "fulfillment_modes_initial_status_id_fkey" FOREIGN KEY ("initial_status_id") REFERENCES "order_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_transition_modes" ADD CONSTRAINT "order_status_transition_modes_from_status_id_to_status_id_fkey" FOREIGN KEY ("from_status_id", "to_status_id") REFERENCES "order_status_transitions"("from_status_id", "to_status_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_transition_modes" ADD CONSTRAINT "order_status_transition_modes_fulfillment_mode_id_fkey" FOREIGN KEY ("fulfillment_mode_id") REFERENCES "fulfillment_modes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishment_partnerships" ADD CONSTRAINT "establishment_partnerships_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishment_partnerships" ADD CONSTRAINT "establishment_partnerships_agreement_file_id_fkey" FOREIGN KEY ("agreement_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishment_partnerships" ADD CONSTRAINT "establishment_partnerships_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishment_partnerships" ADD CONSTRAINT "establishment_partnerships_ended_by_user_id_fkey" FOREIGN KEY ("ended_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishment_staff" ADD CONSTRAINT "establishment_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishment_staff" ADD CONSTRAINT "establishment_staff_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishment_staff" ADD CONSTRAINT "establishment_staff_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishment_staff" ADD CONSTRAINT "establishment_staff_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_order_acceptances" ADD CONSTRAINT "merchant_order_acceptances_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_order_acceptances" ADD CONSTRAINT "merchant_order_acceptances_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_order_readiness" ADD CONSTRAINT "merchant_order_readiness_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "merchant_order_acceptances"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_order_readiness" ADD CONSTRAINT "merchant_order_readiness_marked_by_user_id_fkey" FOREIGN KEY ("marked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════════════════════
-- Integridad que Prisma no genera. Revise toda migración nueva y quite
-- cualquier DROP INDEX / DROP TRIGGER / DROP VIEW que no sea intencional.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────── Reglas por columna ───────────────
ALTER TABLE "establishment_partnerships" ADD CONSTRAINT "establishment_partnerships_dates_check"
  CHECK ("ended_on" IS NULL OR "ended_on" >= "started_on");
-- Un local no tiene dos convenios a la vez (el rango es [inicio, fin), abierto si no ha terminado).
ALTER TABLE "establishment_partnerships" ADD CONSTRAINT "establishment_partnerships_no_overlap"
  EXCLUDE USING gist ("establishment_id" WITH =, daterange("started_on", "ended_on", '[)') WITH &&);
-- Una persona atiende un local una sola vez a la vez; puede volver después de que le quiten el acceso.
CREATE UNIQUE INDEX "establishment_staff_active_key" ON "establishment_staff"("user_id", "establishment_id") WHERE "revoked_at" IS NULL;
ALTER TABLE "merchant_order_acceptances" ADD CONSTRAINT "merchant_order_acceptances_minutes_check"
  CHECK ("preparation_minutes" BETWEEN 1 AND 240);

-- Las transiciones que ya existían son las del MVP: la semilla agrega las del pedido directo.
INSERT INTO "order_status_transition_modes" (from_status_id, to_status_id, fulfillment_mode_id)
SELECT t.from_status_id, t.to_status_id, m.id FROM order_status_transitions t, fulfillment_modes m WHERE m.code = 'COURIER_PURCHASE'
ON CONFLICT DO NOTHING;

-- ─────────────── fulfillment_modes ───────────────
-- El estado con que nace el pedido de cada modo es un estado inicial del catálogo.
CREATE FUNCTION fn_fulfillment_modes_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (SELECT is_initial FROM order_statuses WHERE id = NEW.initial_status_id) THEN
    RAISE EXCEPTION 'El modo % debe empezar en un estado inicial', NEW.code USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "fulfillment_modes_rules" BEFORE INSERT OR UPDATE OF "initial_status_id" ON "fulfillment_modes"
  FOR EACH ROW EXECUTE FUNCTION fn_fulfillment_modes_rules();

-- ─────────────── establishment_partnerships ───────────────
-- El convenio no se borra ni se reescribe: solo se termina una vez (fecha de fin y quién). El contrato es un
-- archivo PARTNERSHIP_AGREEMENT.
CREATE FUNCTION fn_establishment_partnerships_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los convenios no se borran: se terminan' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' AND (
       (to_jsonb(NEW) - 'ended_on' - 'ended_by_user_id') <> (to_jsonb(OLD) - 'ended_on' - 'ended_by_user_id')
       OR OLD.ended_on IS NOT NULL OR NEW.ended_on IS NULL OR NEW.ended_by_user_id IS NULL) THEN
    RAISE EXCEPTION 'Un convenio solo se termina, una vez y con quién lo terminó' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.agreement_file_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM files f JOIN file_purposes p ON p.id = f.purpose_id AND p.code = 'PARTNERSHIP_AGREEMENT' WHERE f.id = NEW.agreement_file_id) THEN
    RAISE EXCEPTION 'El contrato debe ser un archivo PARTNERSHIP_AGREEMENT' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "establishment_partnerships_rules" BEFORE INSERT OR UPDATE OR DELETE ON "establishment_partnerships"
  FOR EACH ROW EXECUTE FUNCTION fn_establishment_partnerships_rules();

-- ─────────────── establishment_staff ───────────────
-- Solo quien tiene el rol MERCHANT vigente atiende un local. El acceso no se borra ni se edita: se revoca una vez.
CREATE FUNCTION fn_establishment_staff_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'El personal del comercio no se borra: se revoca' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'revoked_at' - 'revoked_by_user_id') <> (to_jsonb(OLD) - 'revoked_at' - 'revoked_by_user_id')
       OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR NEW.revoked_by_user_id IS NULL THEN
      RAISE EXCEPTION 'El acceso al local solo se revoca, una vez y con quién lo revocó' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.code = 'MERCHANT'
                 WHERE ur.user_id = NEW.user_id AND ur.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'Solo un usuario con el rol MERCHANT atiende un local' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "establishment_staff_rules" BEFORE INSERT OR UPDATE OR DELETE ON "establishment_staff"
  FOR EACH ROW EXECUTE FUNCTION fn_establishment_staff_rules();

-- ─────────────── Vistas ───────────────

-- Aliado hoy: el convenio cubre la fecha de hoy en la zona horaria del municipio del local.
CREATE VIEW "v_establishment_partners" AS
SELECT p.establishment_id, p.id AS partnership_id, p.started_on, p.ended_on
FROM establishment_partnerships p
JOIN establishments e ON e.id = p.establishment_id
JOIN municipalities m ON m.id = e.municipality_id
WHERE p.started_on <= (now() AT TIME ZONE m.time_zone)::date
  AND (p.ended_on IS NULL OR p.ended_on > (now() AT TIME ZONE m.time_zone)::date);

-- Qué locales atiende cada usuario del comercio: acceso vigente y convenio vigente. Si el convenio termina, el portal
-- se cierra solo, sin tocar el acceso.
CREATE VIEW "v_merchant_establishments" AS
SELECT s.user_id, s.establishment_id, s.id AS staff_id
FROM establishment_staff s
JOIN v_establishment_partners p ON p.establishment_id = s.establishment_id
WHERE s.revoked_at IS NULL;

-- Preparación en el comercio: la hora estimada sale del tiempo que dijo al aceptar; no se guarda.
CREATE VIEW "v_merchant_order_preparation" AS
SELECT a.order_id, a.accepted_at, a.preparation_minutes,
       a.accepted_at + make_interval(mins => a.preparation_minutes) AS estimated_ready_at,
       r.ready_at
FROM merchant_order_acceptances a
LEFT JOIN merchant_order_readiness r ON r.order_id = a.order_id;

-- ─────────────── merchant_order_acceptances / merchant_order_readiness ───────────────
-- Acepta quien atiende el local del pedido, mientras el pedido espera al comercio (la fila va antes del cambio de
-- estado, en la misma transacción). "Listo" lo marca el mismo comercio, con el pedido aceptado y aún en curso.
CREATE FUNCTION fn_merchant_order_acceptances_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orders o JOIN v_merchant_establishments me ON me.establishment_id = o.establishment_id
                 WHERE o.id = NEW.order_id AND me.user_id = NEW.accepted_by_user_id) THEN
    RAISE EXCEPTION 'Solo el comercio del pedido lo acepta' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM orders o JOIN order_statuses s ON s.id = o.status_id AND s.code = 'AWAITING_MERCHANT' WHERE o.id = NEW.order_id) THEN
    RAISE EXCEPTION 'El pedido no está esperando al comercio' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "merchant_order_acceptances_rules" BEFORE INSERT ON "merchant_order_acceptances"
  FOR EACH ROW EXECUTE FUNCTION fn_merchant_order_acceptances_rules();
CREATE TRIGGER "merchant_order_acceptances_immutable" BEFORE UPDATE OR DELETE ON "merchant_order_acceptances"
  FOR EACH ROW EXECUTE FUNCTION fn_immutable();

CREATE FUNCTION fn_merchant_order_readiness_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orders o JOIN v_merchant_establishments me ON me.establishment_id = o.establishment_id
                 WHERE o.id = NEW.order_id AND me.user_id = NEW.marked_by_user_id) THEN
    RAISE EXCEPTION 'Solo el comercio del pedido lo marca listo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM orders o JOIN order_statuses s ON s.id = o.status_id AND NOT s.is_terminal WHERE o.id = NEW.order_id) THEN
    RAISE EXCEPTION 'El pedido ya terminó' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "merchant_order_readiness_rules" BEFORE INSERT ON "merchant_order_readiness"
  FOR EACH ROW EXECUTE FUNCTION fn_merchant_order_readiness_rules();
CREATE TRIGGER "merchant_order_readiness_immutable" BEFORE UPDATE OR DELETE ON "merchant_order_readiness"
  FOR EACH ROW EXECUTE FUNCTION fn_immutable();

-- ─────────────── orders ───────────────
-- Igual que en E04, más: el modo está activo y, si exige convenio (MERCHANT_DIRECT), el local es aliado hoy.
CREATE OR REPLACE FUNCTION fn_orders_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_municipality integer := (SELECT municipality_id FROM establishments WHERE id = NEW.establishment_id);
  v_mode fulfillment_modes%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM delivery_zone_fees f JOIN delivery_zones z ON z.id = f.delivery_zone_id
                 WHERE f.id = NEW.delivery_zone_fee_id AND z.municipality_id = v_municipality) THEN
    RAISE EXCEPTION 'La tarifa del pedido no es del municipio del establecimiento' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM commission_rates c WHERE c.id = NEW.commission_rate_id AND c.municipality_id = v_municipality) THEN
    RAISE EXCEPTION 'La comisión del pedido no es del municipio del establecimiento' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_mode FROM fulfillment_modes WHERE id = NEW.fulfillment_mode_id;
  IF v_mode.deactivated_at IS NOT NULL THEN
    RAISE EXCEPTION 'El modo % no está activo', v_mode.code USING ERRCODE = 'check_violation';
  END IF;
  IF v_mode.requires_partnership AND NOT EXISTS (SELECT 1 FROM v_establishment_partners p WHERE p.establishment_id = NEW.establishment_id) THEN
    RAISE EXCEPTION 'El modo % exige un comercio aliado', v_mode.code USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status_id <> v_mode.initial_status_id THEN
    RAISE EXCEPTION 'Un pedido % nace en el estado inicial de su modo', v_mode.code USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────── order_status_history ───────────────
-- Igual que en E04, más: el cambio existe en el modo del pedido (order_status_transition_modes), y el comercio
-- solo deja pasar el pedido al despacho si lo aceptó (con su tiempo de preparación).
CREATE OR REPLACE FUNCTION fn_order_status_history_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_automatic boolean := (SELECT is_automatic FROM status_change_sources WHERE id = NEW.source_id);
BEGIN
  IF v_automatic <> (NEW.changed_by_user_id IS NULL) OR v_automatic <> (NEW.acting_role_id IS NULL) THEN
    RAISE EXCEPTION 'Un cambio automático no lleva usuario ni rol, y uno de una persona los lleva' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.from_status_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF v_automatic THEN
    IF NOT EXISTS (SELECT 1 FROM order_status_transitions t
                   WHERE t.from_status_id = NEW.from_status_id AND t.to_status_id = NEW.to_status_id AND t.allows_system) THEN
      RAISE EXCEPTION 'El sistema no puede hacer este cambio de estado' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM order_status_transition_roles r
                    WHERE r.from_status_id = NEW.from_status_id AND r.to_status_id = NEW.to_status_id AND r.role_id = NEW.acting_role_id) THEN
    RAISE EXCEPTION 'El rol activo no puede hacer este cambio de estado' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM order_status_transition_modes tm JOIN orders o ON o.fulfillment_mode_id = tm.fulfillment_mode_id
                 WHERE o.id = NEW.order_id AND tm.from_status_id = NEW.from_status_id AND tm.to_status_id = NEW.to_status_id) THEN
    RAISE EXCEPTION 'Este cambio de estado no existe en el modo del pedido' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.from_status_id = (SELECT id FROM order_statuses WHERE code = 'AWAITING_MERCHANT')
     AND NEW.to_status_id = (SELECT id FROM order_statuses WHERE code = 'PENDING_ASSIGNMENT')
     AND NOT EXISTS (SELECT 1 FROM merchant_order_acceptances a WHERE a.order_id = NEW.order_id) THEN
    RAISE EXCEPTION 'El comercio no ha aceptado el pedido' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────── Alertas del panel de pedidos (H10.5) ───────────────
-- Igual que en E10 con dos cambios: "sin asignar" es PENDING_ASSIGNMENT (ya no el único estado inicial), y un pedido
-- directo que el comercio no responde en merchant.response_alert_seconds es una alerta para el operador.
CREATE OR REPLACE VIEW "v_active_order_alerts" AS
WITH last_change AS (
  SELECT DISTINCT ON (h.order_id) h.order_id, h.occurred_at, h.from_status_id, src.code AS source
  FROM order_status_history h JOIN status_change_sources src ON src.id = h.source_id
  ORDER BY h.order_id, h.recorded_at DESC)
SELECT o.id AS order_id, 'UNASSIGNED'::text AS alert, lc.occurred_at AS since
FROM orders o JOIN order_statuses s ON s.id = o.status_id AND s.code = 'PENDING_ASSIGNMENT'
JOIN last_change lc ON lc.order_id = o.id
WHERE lc.source NOT IN ('TIMER', 'OFFERS_DECLINED')
UNION ALL
SELECT o.id, 'NO_TAKERS', lc.occurred_at
FROM orders o JOIN order_statuses s ON s.id = o.status_id AND s.code = 'PENDING_ASSIGNMENT'
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
WHERE c.order_id IS NULL OR c.collected_total <> a.customer_total
UNION ALL
SELECT o.id, 'MERCHANT_SILENT', o.created_at
FROM orders o JOIN order_statuses s ON s.id = o.status_id AND s.code = 'AWAITING_MERCHANT'
JOIN establishments e ON e.id = o.establishment_id
WHERE o.created_at < now() - make_interval(secs => coalesce(
  (SELECT value::float8 FROM v_current_settings WHERE key = 'merchant.response_alert_seconds' AND municipality_id = e.municipality_id), 180));
