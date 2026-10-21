-- E07 · Asignación de pedidos por el operador (Docs/14-base-de-datos/E07-asignacion.md).
-- Incluye de E08 la disponibilidad y la ubicación del domiciliario, que el despacho necesita para elegir a quién ofrecer.
-- Migración aditiva.
-- AlterTable
ALTER TABLE "order_statuses" ADD COLUMN     "requires_courier" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "offer_modes" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "max_recipients" SMALLINT,

    CONSTRAINT "offer_modes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_recipient_statuses" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "is_initial" BOOLEAN NOT NULL,
    "is_terminal" BOOLEAN NOT NULL,

    CONSTRAINT "offer_recipient_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_release_reasons" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "assignment_release_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_offers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "offer_mode_id" SMALLINT NOT NULL,
    "sent_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_offer_recipients" (
    "order_offer_id" UUID NOT NULL,
    "courier_user_id" UUID NOT NULL,
    "status_id" SMALLINT NOT NULL,
    "responded_at" TIMESTAMPTZ(6),

    CONSTRAINT "order_offer_recipients_pkey" PRIMARY KEY ("order_offer_id","courier_user_id")
);

-- CreateTable
CREATE TABLE "order_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "order_offer_id" UUID NOT NULL,
    "courier_user_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "released_at" TIMESTAMPTZ(6),
    "release_reason_id" SMALLINT,
    "released_by_user_id" UUID,

    CONSTRAINT "order_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_end_reasons" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "availability_end_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_availability_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "courier_user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "ended_at" TIMESTAMPTZ(6),
    "end_reason_id" SMALLINT,

    CONSTRAINT "courier_availability_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_location_pings" (
    "id" BIGSERIAL NOT NULL,
    "courier_user_id" UUID NOT NULL,
    "location" geography(Point, 4326) NOT NULL,
    "accuracy_m" DECIMAL(6,1),
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_location_pings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offer_modes_code_key" ON "offer_modes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "offer_recipient_statuses_code_key" ON "offer_recipient_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_release_reasons_code_key" ON "assignment_release_reasons"("code");

-- CreateIndex
CREATE INDEX "order_offers_order_id_created_at_idx" ON "order_offers"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "order_offers_id_order_id_key" ON "order_offers"("id", "order_id");

-- CreateIndex
CREATE INDEX "order_offer_recipients_courier_user_id_idx" ON "order_offer_recipients"("courier_user_id");

-- CreateIndex
CREATE INDEX "order_assignments_order_id_idx" ON "order_assignments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_assignments_order_offer_id_courier_user_id_key" ON "order_assignments"("order_offer_id", "courier_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "availability_end_reasons_code_key" ON "availability_end_reasons"("code");

-- CreateIndex
CREATE INDEX "courier_availability_periods_courier_user_id_started_at_idx" ON "courier_availability_periods"("courier_user_id", "started_at");

-- CreateIndex
CREATE INDEX "courier_location_pings_courier_user_id_recorded_at_idx" ON "courier_location_pings"("courier_user_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "courier_location_pings_received_at_idx" ON "courier_location_pings"("received_at");

-- AddForeignKey
ALTER TABLE "order_offers" ADD CONSTRAINT "order_offers_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_offers" ADD CONSTRAINT "order_offers_offer_mode_id_fkey" FOREIGN KEY ("offer_mode_id") REFERENCES "offer_modes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_offers" ADD CONSTRAINT "order_offers_sent_by_user_id_fkey" FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_offer_recipients" ADD CONSTRAINT "order_offer_recipients_order_offer_id_fkey" FOREIGN KEY ("order_offer_id") REFERENCES "order_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_offer_recipients" ADD CONSTRAINT "order_offer_recipients_courier_user_id_fkey" FOREIGN KEY ("courier_user_id") REFERENCES "courier_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_offer_recipients" ADD CONSTRAINT "order_offer_recipients_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "offer_recipient_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_order_offer_id_order_id_fkey" FOREIGN KEY ("order_offer_id", "order_id") REFERENCES "order_offers"("id", "order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_order_offer_id_courier_user_id_fkey" FOREIGN KEY ("order_offer_id", "courier_user_id") REFERENCES "order_offer_recipients"("order_offer_id", "courier_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_release_reason_id_fkey" FOREIGN KEY ("release_reason_id") REFERENCES "assignment_release_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_released_by_user_id_fkey" FOREIGN KEY ("released_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_availability_periods" ADD CONSTRAINT "courier_availability_periods_courier_user_id_fkey" FOREIGN KEY ("courier_user_id") REFERENCES "courier_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_availability_periods" ADD CONSTRAINT "courier_availability_periods_end_reason_id_fkey" FOREIGN KEY ("end_reason_id") REFERENCES "availability_end_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_location_pings" ADD CONSTRAINT "courier_location_pings_courier_user_id_fkey" FOREIGN KEY ("courier_user_id") REFERENCES "courier_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;




-- ════════════════════════════════════════════════════════════════════════════
-- Integridad que Prisma no genera. Revise toda migración nueva y quite
-- cualquier DROP INDEX / DROP TRIGGER / DROP VIEW que no sea intencional.
-- ════════════════════════════════════════════════════════════════════════════

-- Estados con domiciliario (la semilla lo vuelve a fijar): desde que alguien acepta hasta antes de terminar.
UPDATE "order_statuses" SET "requires_courier" = true
WHERE "code" IN ('ACCEPTED', 'AT_ESTABLISHMENT', 'AWAITING_CUSTOMER', 'PREPARING', 'ON_THE_WAY', 'ARRIVING', 'PENDING_REVIEW', 'DISPUTED');

-- ─────────────── Reglas por columna ───────────────
ALTER TABLE "offer_modes" ADD CONSTRAINT "offer_modes_max_recipients_check" CHECK ("max_recipients" IS NULL OR "max_recipients" >= 1);
ALTER TABLE "order_offers" ADD CONSTRAINT "order_offers_expires_check" CHECK ("expires_at" > "created_at");
-- Respondida = con hora; pendiente = sin hora (el disparador exige que el estado coincida).
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_release_check"
  CHECK (("released_at" IS NULL) = ("release_reason_id" IS NULL) AND ("released_at" IS NULL OR "released_at" >= "assigned_at"));
ALTER TABLE "courier_availability_periods" ADD CONSTRAINT "courier_availability_periods_end_check"
  CHECK (("ended_at" IS NULL) = ("end_reason_id" IS NULL) AND ("ended_at" IS NULL OR "ended_at" > "started_at"));
ALTER TABLE "courier_location_pings" ADD CONSTRAINT "courier_location_pings_accuracy_check" CHECK ("accuracy_m" IS NULL OR "accuracy_m" >= 0);

-- Una asignación vigente por pedido (el primero que acepta gana) y por domiciliario (lleva un pedido a la vez).
CREATE UNIQUE INDEX "order_assignments_one_active_per_order_idx" ON "order_assignments" ("order_id") WHERE "released_at" IS NULL;
CREATE UNIQUE INDEX "order_assignments_one_active_per_courier_idx" ON "order_assignments" ("courier_user_id") WHERE "released_at" IS NULL;
-- Un solo turno abierto por domiciliario.
CREATE UNIQUE INDEX "courier_availability_periods_one_open_idx" ON "courier_availability_periods" ("courier_user_id") WHERE "ended_at" IS NULL;
-- El reloj del despacho busca la próxima oferta por vencer.
CREATE INDEX "order_offers_expires_at_idx" ON "order_offers" ("expires_at");

-- ─────────────── order_offers ───────────────
-- La oferta no se edita ni se borra: el vencimiento se registra en cada destinatario.
CREATE TRIGGER "order_offers_immutable" BEFORE UPDATE OR DELETE ON "order_offers" FOR EACH ROW EXECUTE FUNCTION fn_immutable();

-- ─────────────── order_offer_recipients ───────────────
-- Al insertar: solo a domiciliarios despachables del municipio del local, sin pasar el tope del modo y nunca a
-- un pedido que ya tiene domiciliario. Se bloquea la fila del pedido para que dos envíos a la vez no pasen el tope.
CREATE FUNCTION fn_order_offer_recipients_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_order uuid;
  v_municipality integer;
  v_max smallint;
BEGIN
  SELECT o.order_id, m.max_recipients INTO v_order, v_max
  FROM order_offers o JOIN offer_modes m ON m.id = o.offer_mode_id WHERE o.id = NEW.order_offer_id;
  SELECT e.municipality_id INTO v_municipality
  FROM orders x JOIN establishments e ON e.id = x.establishment_id WHERE x.id = v_order FOR UPDATE OF x;

  IF NOT (SELECT is_initial FROM offer_recipient_statuses WHERE id = NEW.status_id) OR NEW.responded_at IS NOT NULL THEN
    RAISE EXCEPTION 'Un destinatario nace pendiente y sin respuesta' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM v_dispatchable_couriers c WHERE c.user_id = NEW.courier_user_id AND c.municipality_id = v_municipality) THEN
    RAISE EXCEPTION 'Solo se ofrece a domiciliarios verificados y activos del municipio del local' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM order_assignments a WHERE a.order_id = v_order AND a.released_at IS NULL) THEN
    RAISE EXCEPTION 'El pedido ya tiene domiciliario' USING ERRCODE = 'check_violation';
  END IF;
  IF v_max IS NOT NULL AND (SELECT count(*) FROM order_offer_recipients WHERE order_offer_id = NEW.order_offer_id) >= v_max THEN
    RAISE EXCEPTION 'Esta oferta admite % destinatario(s)', v_max USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "order_offer_recipients_insert" BEFORE INSERT ON "order_offer_recipients"
  FOR EACH ROW EXECUTE FUNCTION fn_order_offer_recipients_insert();

-- La respuesta es un solo paso: de pendiente a una final, con su hora. Nada más cambia y nada se borra.
CREATE FUNCTION fn_order_offer_recipients_respond() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR NOT (SELECT is_initial FROM offer_recipient_statuses WHERE id = OLD.status_id)
     OR NOT (SELECT is_terminal FROM offer_recipient_statuses WHERE id = NEW.status_id)
     OR NEW.responded_at IS NULL
     OR NEW.order_offer_id <> OLD.order_offer_id OR NEW.courier_user_id <> OLD.courier_user_id THEN
    RAISE EXCEPTION 'La respuesta a una oferta pasa una sola vez de pendiente a final' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "order_offer_recipients_respond" BEFORE UPDATE OR DELETE ON "order_offer_recipients"
  FOR EACH ROW EXECUTE FUNCTION fn_order_offer_recipients_respond();

-- Avisos al domiciliario en la misma transacción (bandeja de salida de E06): la oferta nueva y su retiro
-- cuando otro la tomó o el operador la canceló. Rechazar o dejar vencer no le avisa a él mismo.
CREATE FUNCTION fn_order_offer_recipients_notify() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_type := 'ORDER_OFFERED';
  ELSIF (SELECT code FROM offer_recipient_statuses WHERE id = NEW.status_id) = 'WITHDRAWN' THEN
    v_type := 'OFFER_WITHDRAWN';
  ELSE
    RETURN NULL;
  END IF;
  INSERT INTO notifications (recipient_user_id, notification_type_id, order_id)
  SELECT NEW.courier_user_id, t.id, o.order_id
  FROM order_offers o JOIN notification_types t ON t.code = v_type AND t.deactivated_at IS NULL
  WHERE o.id = NEW.order_offer_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "order_offer_recipients_notify" AFTER INSERT OR UPDATE OF "status_id" ON "order_offer_recipients"
  FOR EACH ROW EXECUTE FUNCTION fn_order_offer_recipients_notify();

-- ─────────────── order_assignments ───────────────
-- Se asigna a quien aceptó; después solo se libera, una vez, con su motivo.
CREATE FUNCTION fn_order_assignments_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las asignaciones no se borran: se liberan' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.released_at IS NOT NULL OR NOT EXISTS (
         SELECT 1 FROM order_offer_recipients r JOIN offer_recipient_statuses s ON s.id = r.status_id AND s.code = 'ACCEPTED'
         WHERE r.order_offer_id = NEW.order_offer_id AND r.courier_user_id = NEW.courier_user_id) THEN
      RAISE EXCEPTION 'Solo se asigna a quien aceptó la oferta' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.released_at IS NOT NULL
     OR (to_jsonb(NEW) - 'released_at' - 'release_reason_id' - 'released_by_user_id')
        <> (to_jsonb(OLD) - 'released_at' - 'release_reason_id' - 'released_by_user_id') THEN
    RAISE EXCEPTION 'Una asignación solo se libera, una vez' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "order_assignments_rules" BEFORE INSERT OR UPDATE OR DELETE ON "order_assignments"
  FOR EACH ROW EXECUTE FUNCTION fn_order_assignments_rules();

-- Al confirmar: el pedido tiene una asignación vigente si y solo si su estado lo exige (order_statuses.requires_courier).
-- Así un pedido en ACCEPTED siempre tiene domiciliario y uno que vuelve a buscar o termina ya no lo retiene.
CREATE FUNCTION fn_order_courier_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_order uuid := NEW.order_id;
  v_requires boolean;
  v_has boolean;
BEGIN
  SELECT s.requires_courier INTO v_requires FROM orders o JOIN order_statuses s ON s.id = o.status_id WHERE o.id = v_order;
  v_has := EXISTS (SELECT 1 FROM order_assignments a WHERE a.order_id = v_order AND a.released_at IS NULL);
  IF v_requires AND NOT v_has THEN
    RAISE EXCEPTION 'El pedido quedó en un estado con domiciliario sin asignación vigente' USING ERRCODE = 'check_violation';
  END IF;
  IF v_has AND NOT v_requires THEN
    RAISE EXCEPTION 'El pedido quedó con una asignación vigente en un estado sin domiciliario' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "order_status_history_courier_consistency" AFTER INSERT ON "order_status_history"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_order_courier_consistency();
CREATE CONSTRAINT TRIGGER "order_assignments_courier_consistency" AFTER INSERT OR UPDATE ON "order_assignments"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_order_courier_consistency();

-- ─────────────── courier_availability_periods ───────────────
-- Un turno solo se cierra, una vez; no se reabre ni se borra (las horas trabajadas salen de aquí).
CREATE FUNCTION fn_courier_availability_periods_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.ended_at IS NOT NULL
     OR (to_jsonb(NEW) - 'ended_at' - 'end_reason_id') <> (to_jsonb(OLD) - 'ended_at' - 'end_reason_id') THEN
    RAISE EXCEPTION 'Un turno de disponibilidad solo se cierra, una vez' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "courier_availability_periods_rules" BEFORE UPDATE OR DELETE ON "courier_availability_periods"
  FOR EACH ROW EXECUTE FUNCTION fn_courier_availability_periods_rules();

-- ─────────────── courier_location_pings ───────────────
-- Las lecturas no se editan; solo se borran por retención (location.retention_days).
CREATE FUNCTION fn_courier_location_pings_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Las lecturas de ubicación no se editan' USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER "courier_location_pings_immutable" BEFORE UPDATE ON "courier_location_pings"
  FOR EACH ROW EXECUTE FUNCTION fn_courier_location_pings_immutable();

-- ─────────────── Vistas ───────────────

-- Disponible = turno abierto (E08). No se guarda como booleano.
CREATE VIEW "v_open_availability" AS
SELECT courier_user_id, started_at FROM courier_availability_periods WHERE ended_at IS NULL;

-- Última lectura de cada domiciliario: una búsqueda por índice por domiciliario (la tabla crece con cada lectura,
-- un DISTINCT ON la recorrería entera). Nunca se une a una vista del cliente.
CREATE VIEW "v_courier_last_location" AS
SELECT cp.user_id AS courier_user_id, l.location, l.accuracy_m, l.recorded_at
FROM courier_profiles cp
CROSS JOIN LATERAL (SELECT p.location, p.accuracy_m, p.recorded_at FROM courier_location_pings p
                    WHERE p.courier_user_id = cp.user_id ORDER BY p.recorded_at DESC LIMIT 1) l;

-- Domiciliario del pedido: la asignación vigente o, si ya terminó, la última.
CREATE VIEW "v_order_courier" AS
SELECT DISTINCT ON (order_id) order_id, id AS assignment_id, courier_user_id, assigned_at, released_at
FROM order_assignments
ORDER BY order_id, (released_at IS NULL) DESC, assigned_at DESC;

-- Ofertas vivas: no vencidas y con al menos un destinatario pendiente.
CREATE VIEW "v_live_offers" AS
SELECT o.id AS order_offer_id, o.order_id, o.offer_mode_id, o.sent_by_user_id, o.created_at, o.expires_at,
       count(*) FILTER (WHERE s.is_initial) AS pending_count, count(*) AS recipient_count
FROM order_offers o
JOIN order_offer_recipients r ON r.order_offer_id = o.id
JOIN offer_recipient_statuses s ON s.id = r.status_id
WHERE o.expires_at > now()
GROUP BY o.id
HAVING count(*) FILTER (WHERE s.is_initial) > 0;

-- Registro del personal (H07.5, RNF-07): una sola pantalla que une audit_logs con lo que ya tiene tabla propia
-- (envíos de ofertas, cambios de estado hechos por personal y asignaciones liberadas por otro). No se copia nada.
-- municipality_id: el del local del pedido; nulo en lo que no es de un pedido (lo ve solo el administrador global).
CREATE VIEW "v_staff_activity" AS
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
-- El paso a OFFERED ya está como envío de oferta (con modo y destinatarios): no se repite.
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
WHERE a.released_by_user_id IS NOT NULL AND a.released_by_user_id <> a.courier_user_id;
