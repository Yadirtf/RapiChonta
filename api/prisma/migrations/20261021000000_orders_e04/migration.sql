-- E04 · Pedido del cliente (Docs/14-base-de-datos/E04-pedido-del-cliente.md).
-- Migración aditiva: direcciones, destinatarios, pedidos, líneas y máquina de estados del pedido.

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_user_id" UUID NOT NULL,
    "label" VARCHAR(40),
    "line" VARCHAR(200),
    "reference" VARCHAR(200),
    "location" geography(Point, 4326) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_recipients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_user_id" UUID NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "phone_e164" VARCHAR(16),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "customer_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillment_modes" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "fulfillment_modes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_statuses" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "is_initial" BOOLEAN NOT NULL,
    "is_terminal" BOOLEAN NOT NULL,
    "is_visible_to_customer" BOOLEAN NOT NULL,
    "is_milestone" BOOLEAN NOT NULL,
    "reveals_delivery_details" BOOLEAN NOT NULL,
    "counts_as_delivered" BOOLEAN NOT NULL,

    CONSTRAINT "order_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_transitions" (
    "from_status_id" SMALLINT NOT NULL,
    "to_status_id" SMALLINT NOT NULL,
    "allows_system" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "order_status_transitions_pkey" PRIMARY KEY ("from_status_id","to_status_id")
);

-- CreateTable
CREATE TABLE "order_status_transition_roles" (
    "from_status_id" SMALLINT NOT NULL,
    "to_status_id" SMALLINT NOT NULL,
    "role_id" SMALLINT NOT NULL,

    CONSTRAINT "order_status_transition_roles_pkey" PRIMARY KEY ("from_status_id","to_status_id","role_id")
);

-- CreateTable
CREATE TABLE "status_change_sources" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "is_automatic" BOOLEAN NOT NULL,

    CONSTRAINT "status_change_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(12) NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "delivery_address_id" UUID NOT NULL,
    "recipient_id" UUID,
    "delivery_zone_fee_id" UUID NOT NULL,
    "commission_rate_id" UUID NOT NULL,
    "payment_method_id" SMALLINT NOT NULL,
    "fulfillment_mode_id" SMALLINT NOT NULL,
    "status_id" SMALLINT NOT NULL,
    "customer_notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "product_version_id" UUID NOT NULL,
    "quantity" SMALLINT NOT NULL,
    "notes" VARCHAR(200),

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "from_status_id" SMALLINT,
    "to_status_id" SMALLINT NOT NULL,
    "changed_by_user_id" UUID,
    "acting_role_id" SMALLINT,
    "source_id" SMALLINT NOT NULL,
    "client_event_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "note" VARCHAR(300),

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "addresses_owner_user_id_created_at_idx" ON "addresses"("owner_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "addresses_location_idx" ON "addresses" USING GIST ("location");

-- CreateIndex
CREATE UNIQUE INDEX "addresses_id_owner_user_id_key" ON "addresses"("id", "owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_recipients_id_owner_user_id_key" ON "customer_recipients"("id", "owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillment_modes_code_key" ON "fulfillment_modes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "order_statuses_code_key" ON "order_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "status_change_sources_code_key" ON "status_change_sources"("code");

-- CreateIndex
CREATE UNIQUE INDEX "orders_code_key" ON "orders"("code");

-- CreateIndex
CREATE INDEX "orders_customer_user_id_created_at_idx" ON "orders"("customer_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_customer_user_id_status_id_idx" ON "orders"("customer_user_id", "status_id");

-- CreateIndex
CREATE INDEX "orders_status_id_idx" ON "orders"("status_id");

-- CreateIndex
CREATE INDEX "orders_establishment_id_created_at_idx" ON "orders"("establishment_id", "created_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_id_order_id_key" ON "order_items"("id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_status_history_client_event_id_key" ON "order_status_history"("client_event_id");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_recorded_at_idx" ON "order_status_history"("order_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_recipients" ADD CONSTRAINT "customer_recipients_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_transitions" ADD CONSTRAINT "order_status_transitions_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "order_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_transitions" ADD CONSTRAINT "order_status_transitions_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "order_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_transition_roles" ADD CONSTRAINT "order_status_transition_roles_from_status_id_to_status_id_fkey" FOREIGN KEY ("from_status_id", "to_status_id") REFERENCES "order_status_transitions"("from_status_id", "to_status_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_transition_roles" ADD CONSTRAINT "order_status_transition_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_address_id_customer_user_id_fkey" FOREIGN KEY ("delivery_address_id", "customer_user_id") REFERENCES "addresses"("id", "owner_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_recipient_id_customer_user_id_fkey" FOREIGN KEY ("recipient_id", "customer_user_id") REFERENCES "customer_recipients"("id", "owner_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_zone_fee_id_fkey" FOREIGN KEY ("delivery_zone_fee_id") REFERENCES "delivery_zone_fees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_commission_rate_id_fkey" FOREIGN KEY ("commission_rate_id") REFERENCES "commission_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfillment_mode_id_fkey" FOREIGN KEY ("fulfillment_mode_id") REFERENCES "fulfillment_modes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "order_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_version_id_fkey" FOREIGN KEY ("product_version_id") REFERENCES "product_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "order_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_from_status_id_to_status_id_fkey" FOREIGN KEY ("from_status_id", "to_status_id") REFERENCES "order_status_transitions"("from_status_id", "to_status_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_acting_role_id_fkey" FOREIGN KEY ("acting_role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "status_change_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ════════════════════════════════════════════════════════════════════════════
-- Integridad que Prisma no genera. Revise toda migración nueva y quite
-- cualquier DROP INDEX / DROP TRIGGER / DROP VIEW que no sea intencional.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────── Reglas por columna ───────────────
ALTER TABLE "orders" ADD CONSTRAINT "orders_code_check" CHECK ("code" ~ '^RC-[0-9A-HJKMNP-TV-Z]{4,8}$');
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_check" CHECK ("quantity" BETWEEN 1 AND 99);
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_note_check" CHECK ("note" IS NULL OR length(btrim("note")) > 0);
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_label_check" CHECK ("label" IS NULL OR length(btrim("label")) > 0);
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_reference_check" CHECK ("reference" IS NULL OR length(btrim("reference")) > 0);
-- Una dirección de un solo uso (sin nombre) no aparece en la lista: no puede ser la predeterminada.
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_default_check" CHECK (NOT "is_default" OR "label" IS NOT NULL);
ALTER TABLE "customer_recipients" ADD CONSTRAINT "customer_recipients_name_check" CHECK (length(btrim("full_name")) > 0);
ALTER TABLE "customer_recipients" ADD CONSTRAINT "customer_recipients_phone_check" CHECK ("phone_e164" ~ '^\+[1-9][0-9]{6,14}$');
-- El teléfono solo queda nulo tras la anonimización (que también archiva).
ALTER TABLE "customer_recipients" ADD CONSTRAINT "customer_recipients_phone_required_check" CHECK ("phone_e164" IS NOT NULL OR "archived_at" IS NOT NULL);

-- Solo una dirección predeterminada vigente por cliente, y un destinatario vigente por teléfono.
CREATE UNIQUE INDEX "addresses_one_default_idx" ON "addresses" ("owner_user_id") WHERE "is_default" AND "archived_at" IS NULL;
CREATE UNIQUE INDEX "customer_recipients_owner_phone_idx" ON "customer_recipients" ("owner_user_id", "phone_e164") WHERE "archived_at" IS NULL;

-- ─────────────── Anonimización ───────────────
-- Las columnas inmutables solo cambian dentro de anonymize_person, que activa esta marca en su transacción.
CREATE FUNCTION fn_is_anonymizing() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('rapichonta.anonymizing', true), '') = 'on'
$$;

-- addresses: line, reference y location no se editan (el pedido viejo sigue mostrando a dónde se entregó).
CREATE FUNCTION fn_addresses_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las direcciones no se borran: se archivan' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.owner_user_id <> OLD.owner_user_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'La dirección no cambia de dueño' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.line IS DISTINCT FROM OLD.line OR NEW.reference IS DISTINCT FROM OLD.reference
      OR NOT ST_Equals(NEW.location::geometry, OLD.location::geometry)) AND NOT fn_is_anonymizing() THEN
    RAISE EXCEPTION 'Editar una dirección es archivarla y crear otra' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN
    RAISE EXCEPTION 'Una dirección archivada no vuelve' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "addresses_immutable" BEFORE UPDATE OR DELETE ON "addresses" FOR EACH ROW EXECUTE FUNCTION fn_addresses_immutable();

CREATE FUNCTION fn_customer_recipients_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los destinatarios no se borran: se archivan' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.owner_user_id <> OLD.owner_user_id
     OR ((NEW.full_name <> OLD.full_name OR NEW.phone_e164 IS DISTINCT FROM OLD.phone_e164) AND NOT fn_is_anonymizing()) THEN
    RAISE EXCEPTION 'Editar un destinatario es archivarlo y crear otro' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN
    RAISE EXCEPTION 'Un destinatario archivado no vuelve' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "customer_recipients_immutable" BEFORE UPDATE OR DELETE ON "customer_recipients" FOR EACH ROW EXECUTE FUNCTION fn_customer_recipients_immutable();

-- ─────────────── orders ───────────────

-- Tarifa y comisión deben ser del municipio del establecimiento (no se cobra la zona de otro pueblo).
CREATE FUNCTION fn_orders_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_municipality integer := (SELECT municipality_id FROM establishments WHERE id = NEW.establishment_id);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM delivery_zone_fees f JOIN delivery_zones z ON z.id = f.delivery_zone_id
                 WHERE f.id = NEW.delivery_zone_fee_id AND z.municipality_id = v_municipality) THEN
    RAISE EXCEPTION 'La tarifa del pedido no es del municipio del establecimiento' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM commission_rates c WHERE c.id = NEW.commission_rate_id AND c.municipality_id = v_municipality) THEN
    RAISE EXCEPTION 'La comisión del pedido no es del municipio del establecimiento' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "orders_rules" BEFORE INSERT ON "orders" FOR EACH ROW EXECUTE FUNCTION fn_orders_rules();

-- El pedido no se edita: cada cambio es una fila en otra tabla. Solo el disparador del historial mueve status_id
-- y solo la anonimización borra las notas del cliente.
CREATE FUNCTION fn_orders_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los pedidos no se borran' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (to_jsonb(NEW) - 'status_id' - 'customer_notes') <> (to_jsonb(OLD) - 'status_id' - 'customer_notes')
     OR (NEW.customer_notes IS DISTINCT FROM OLD.customer_notes AND NOT fn_is_anonymizing()) THEN
    RAISE EXCEPTION 'Los pedidos no se editan' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "orders_immutable" BEFORE UPDATE OR DELETE ON "orders" FOR EACH ROW EXECUTE FUNCTION fn_orders_immutable();
CREATE TRIGGER "orders_status_guard" BEFORE UPDATE OF "status_id" ON "orders"
  FOR EACH ROW EXECUTE FUNCTION fn_status_column_guard('status_id');

-- Al confirmar la transacción que crea el pedido: al menos una línea y la primera fila de su historial.
CREATE FUNCTION fn_orders_require_items() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = NEW.id) THEN
    RAISE EXCEPTION 'El pedido % se creó sin productos', NEW.code USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "orders_require_items" AFTER INSERT ON "orders"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_orders_require_items();
CREATE CONSTRAINT TRIGGER "orders_status_history_required" AFTER INSERT ON "orders"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_status_history_required('order_status_history', 'order_id', 'id');

-- ─────────────── order_items ───────────────

-- La versión pedida es de un producto del mismo establecimiento del pedido.
CREATE FUNCTION fn_order_items_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM product_versions v JOIN products p ON p.id = v.product_id JOIN orders o ON o.establishment_id = p.establishment_id
                 WHERE v.id = NEW.product_version_id AND o.id = NEW.order_id) THEN
    RAISE EXCEPTION 'El producto no es del establecimiento del pedido' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "order_items_rules" BEFORE INSERT ON "order_items" FOR EACH ROW EXECUTE FUNCTION fn_order_items_rules();

CREATE FUNCTION fn_order_items_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'notes') <> (to_jsonb(OLD) - 'notes')
     OR (NEW.notes IS DISTINCT FROM OLD.notes AND NOT fn_is_anonymizing()) THEN
    RAISE EXCEPTION 'Las líneas del pedido no se editan ni se borran' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "order_items_immutable" BEFORE UPDATE OR DELETE ON "order_items" FOR EACH ROW EXECUTE FUNCTION fn_order_items_immutable();

-- ─────────────── order_status_history ───────────────

-- Quién puede hacer cada cambio: una persona con un rol de order_status_transition_roles, o el sistema
-- (geocerca, temporizador) si la transición lo admite. La fuente automática no lleva usuario ni rol.
CREATE FUNCTION fn_order_status_history_rules() RETURNS trigger LANGUAGE plpgsql AS $$
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
  RETURN NEW;
END;
$$;
CREATE TRIGGER "order_status_history_rules" BEFORE INSERT ON "order_status_history" FOR EACH ROW EXECUTE FUNCTION fn_order_status_history_rules();
CREATE TRIGGER "order_status_history_apply" AFTER INSERT ON "order_status_history"
  FOR EACH ROW EXECUTE FUNCTION fn_status_history_apply('orders', 'id', 'order_id', 'status_id', 'order_statuses');
CREATE TRIGGER "order_status_history_immutable" BEFORE UPDATE OR DELETE ON "order_status_history"
  FOR EACH ROW EXECUTE FUNCTION fn_immutable();

-- ─────────────── Vistas de cálculo ───────────────

-- Línea efectiva del pedido. E09 la amplía con las decisiones de producto faltante (quitar o sustituir).
CREATE VIEW "v_order_lines" AS
SELECT i.id AS order_item_id, i.order_id, v.product_id, i.product_version_id,
       v.price AS unit_price, i.quantity, v.prep_minutes, i.notes, false AS is_removed
FROM order_items i
JOIN product_versions v ON v.id = i.product_version_id;

CREATE VIEW "v_order_amounts" AS
SELECT o.id AS order_id,
       coalesce(l.items_total, 0)::numeric(12,2) AS items_total,
       f.amount AS delivery_fee,
       (coalesce(l.items_total, 0) + f.amount)::numeric(12,2) AS customer_total,
       round(f.amount * c.rate, 2)::numeric(12,2) AS commission_amount
FROM orders o
JOIN delivery_zone_fees f ON f.id = o.delivery_zone_fee_id
JOIN commission_rates c ON c.id = o.commission_rate_id
LEFT JOIN (SELECT order_id, sum(unit_price * quantity) AS items_total FROM v_order_lines WHERE NOT is_removed GROUP BY order_id) l
  ON l.order_id = o.id;

CREATE VIEW "v_customer_delivered_counts" AS
SELECT o.customer_user_id, count(*) AS delivered
FROM orders o
JOIN order_statuses s ON s.id = o.status_id AND s.counts_as_delivered
GROUP BY o.customer_user_id;

-- Lo que ve el cliente (RF-50): el último estado visible. OFFERED no se muestra, así que sigue "Buscando domiciliario".
CREATE VIEW "v_order_customer_status" AS
SELECT DISTINCT ON (h.order_id) h.order_id, s.id AS status_id, s.code AS status_code, h.occurred_at
FROM order_status_history h
JOIN order_statuses s ON s.id = h.to_status_id AND s.is_visible_to_customer
ORDER BY h.order_id, h.recorded_at DESC;

-- ─────────────── Anonimización del titular (H01.5): direcciones, destinatarios y notas ───────────────
CREATE OR REPLACE FUNCTION anonymize_person(p_person_id uuid, p_actor_user_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_user users%ROWTYPE;
  v_closed smallint := (SELECT id FROM user_statuses WHERE code = 'CLOSED');
  v_reason smallint := (SELECT id FROM session_end_reasons WHERE code = 'ACCOUNT_DISABLED');
BEGIN
  UPDATE people
     SET given_names = 'Anónimo', family_names = NULL, document_type_id = NULL, document_number = NULL,
         birth_date = NULL, anonymized_at = now(), updated_at = now()
   WHERE id = p_person_id AND anonymized_at IS NULL;
  DELETE FROM person_phones WHERE person_id = p_person_id;
  DELETE FROM person_emails WHERE person_id = p_person_id;

  SELECT * INTO v_user FROM users WHERE person_id = p_person_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE refresh_tokens rt SET consumed_at = now()
    FROM sessions s WHERE rt.session_id = s.id AND s.user_id = v_user.id AND rt.consumed_at IS NULL;
  UPDATE sessions SET ended_at = now(), end_reason_id = v_reason WHERE user_id = v_user.id AND ended_at IS NULL;

  UPDATE courier_collection_accounts SET holder_name = '', account_number = '', archived_at = coalesce(archived_at, now())
   WHERE courier_user_id = v_user.id;

  -- E04: la ubicación pasa al centro del municipio más cercano (los pedidos siguen contando por municipio).
  PERFORM set_config('rapichonta.anonymizing', 'on', true);
  UPDATE addresses a
     SET line = NULL, reference = NULL, label = NULL, is_default = false, archived_at = coalesce(a.archived_at, now()),
         location = (SELECT m.center FROM municipalities m ORDER BY m.center <-> a.location LIMIT 1)
   WHERE a.owner_user_id = v_user.id AND (a.line IS NOT NULL OR a.reference IS NOT NULL OR a.archived_at IS NULL);
  UPDATE customer_recipients SET full_name = 'Anónimo', phone_e164 = NULL, archived_at = coalesce(archived_at, now())
   WHERE owner_user_id = v_user.id AND phone_e164 IS NOT NULL;
  UPDATE orders SET customer_notes = NULL WHERE customer_user_id = v_user.id AND customer_notes IS NOT NULL;
  UPDATE order_items i SET notes = NULL FROM orders o
   WHERE o.id = i.order_id AND o.customer_user_id = v_user.id AND i.notes IS NOT NULL;
  PERFORM set_config('rapichonta.anonymizing', 'off', true);

  UPDATE users SET password_hash = NULL, password_changed_at = NULL WHERE id = v_user.id;
  IF v_user.status_id <> v_closed THEN
    INSERT INTO user_status_history (user_id, from_status_id, to_status_id, changed_by_user_id, reason)
    VALUES (v_user.id, v_user.status_id, v_closed, p_actor_user_id, 'DATA_DELETION_REQUEST');
  END IF;
END;
$$;
