-- E06 · Notificaciones push (Docs/14-base-de-datos/E06-notificaciones.md).
-- Migración aditiva: proveedores y tokens push por dispositivo, avisos (bandeja de salida) y sus intentos de envío.

-- AlterTable
ALTER TABLE "order_statuses" ADD COLUMN     "notifies_customer" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "push_providers" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "push_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_token_invalidation_reasons" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "push_token_invalidation_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_push_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" UUID NOT NULL,
    "push_provider_id" SMALLINT NOT NULL,
    "token" VARCHAR(512) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invalidated_at" TIMESTAMPTZ(6),
    "invalidation_reason_id" SMALLINT,

    CONSTRAINT "device_push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_types" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "is_high_priority" BOOLEAN NOT NULL,

    CONSTRAINT "notification_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_user_id" UUID NOT NULL,
    "notification_type_id" SMALLINT NOT NULL,
    "order_id" UUID,
    "order_status_history_id" UUID,
    "params" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "dispatched_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_delivery_statuses" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "is_initial" BOOLEAN NOT NULL,
    "is_terminal" BOOLEAN NOT NULL,

    CONSTRAINT "notification_delivery_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_id" UUID NOT NULL,
    "device_push_token_id" UUID NOT NULL,
    "status_id" SMALLINT NOT NULL,
    "provider_message_id" VARCHAR(200),
    "error_code" VARCHAR(80),
    "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_providers_code_key" ON "push_providers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "push_token_invalidation_reasons_code_key" ON "push_token_invalidation_reasons"("code");

-- CreateIndex
CREATE INDEX "device_push_tokens_device_id_idx" ON "device_push_tokens"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_types_code_key" ON "notification_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_order_status_history_id_key" ON "notifications"("order_status_history_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_created_at_idx" ON "notifications"("recipient_user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_delivery_statuses_code_key" ON "notification_delivery_statuses"("code");

-- CreateIndex
CREATE INDEX "notification_deliveries_notification_id_idx" ON "notification_deliveries"("notification_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_device_push_token_id_idx" ON "notification_deliveries"("device_push_token_id");

-- AddForeignKey
ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_push_provider_id_fkey" FOREIGN KEY ("push_provider_id") REFERENCES "push_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_invalidation_reason_id_fkey" FOREIGN KEY ("invalidation_reason_id") REFERENCES "push_token_invalidation_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_notification_type_id_fkey" FOREIGN KEY ("notification_type_id") REFERENCES "notification_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_status_history_id_fkey" FOREIGN KEY ("order_status_history_id") REFERENCES "order_status_history"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_device_push_token_id_fkey" FOREIGN KEY ("device_push_token_id") REFERENCES "device_push_tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "notification_delivery_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;




-- ════════════════════════════════════════════════════════════════════════════
-- Integridad que Prisma no genera. Revise toda migración nueva y quite
-- cualquier DROP INDEX / DROP TRIGGER / DROP VIEW que no sea intencional.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────── device_push_tokens ───────────────
ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_token_check" CHECK (length(btrim("token")) >= 16);
-- El motivo acompaña a la baja: los dos o ninguno.
ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_invalidation_check"
  CHECK (("invalidated_at" IS NULL) = ("invalidation_reason_id" IS NULL));
-- Un token vigente por dispositivo y proveedor, y un mismo token no queda vigente en dos dispositivos.
CREATE UNIQUE INDEX "device_push_tokens_one_active_idx" ON "device_push_tokens" ("device_id", "push_provider_id") WHERE "invalidated_at" IS NULL;
CREATE UNIQUE INDEX "device_push_tokens_active_token_idx" ON "device_push_tokens" ("token") WHERE "invalidated_at" IS NULL;

-- Solo se da de baja (una vez); el resto de la fila no cambia y nada se borra (los envíos lo referencian).
CREATE FUNCTION fn_device_push_tokens_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.invalidated_at IS NOT NULL
     OR (to_jsonb(NEW) - 'invalidated_at' - 'invalidation_reason_id') <> (to_jsonb(OLD) - 'invalidated_at' - 'invalidation_reason_id') THEN
    RAISE EXCEPTION 'Un token push solo se da de baja una vez; no se edita ni se borra' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "device_push_tokens_immutable" BEFORE UPDATE OR DELETE ON "device_push_tokens"
  FOR EACH ROW EXECUTE FUNCTION fn_device_push_tokens_immutable();

-- ─────────────── notifications ───────────────
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_params_check" CHECK ("params" IS NULL OR jsonb_typeof("params") = 'object');
-- El cambio de estado que se avisa es del mismo pedido.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_history_needs_order_check"
  CHECK ("order_status_history_id" IS NULL OR "order_id" IS NOT NULL);

CREATE FUNCTION fn_notifications_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_status_history_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM order_status_history h WHERE h.id = NEW.order_status_history_id AND h.order_id = NEW.order_id) THEN
    RAISE EXCEPTION 'El cambio de estado avisado no es del pedido del aviso' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "notifications_rules" BEFORE INSERT ON "notifications" FOR EACH ROW EXECUTE FUNCTION fn_notifications_rules();

-- El aviso no se edita: solo se marca repartido y leído, una vez cada uno.
CREATE FUNCTION fn_notifications_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (to_jsonb(NEW) - 'dispatched_at' - 'read_at') <> (to_jsonb(OLD) - 'dispatched_at' - 'read_at')
     OR (OLD.dispatched_at IS NOT NULL AND NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at)
     OR (OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at) THEN
    RAISE EXCEPTION 'Un aviso solo se marca repartido y leído una vez' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "notifications_immutable" BEFORE UPDATE OR DELETE ON "notifications"
  FOR EACH ROW EXECUTE FUNCTION fn_notifications_immutable();

-- Bandeja de salida: el repartidor solo recorre lo pendiente; la bandeja del usuario cuenta lo no leído.
CREATE INDEX "notifications_pending_idx" ON "notifications" ("created_at") WHERE "dispatched_at" IS NULL;
CREATE INDEX "notifications_unread_idx" ON "notifications" ("recipient_user_id") WHERE "read_at" IS NULL;

-- ─────────────── notification_deliveries ───────────────
-- Un intento nace en el estado inicial y da un solo paso a uno final, con su resultado. Nada más cambia.
CREATE FUNCTION fn_notification_deliveries_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT (SELECT is_initial FROM notification_delivery_statuses WHERE id = NEW.status_id) THEN
      RAISE EXCEPTION 'Un intento de envío nace en cola' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE'
     OR NOT (SELECT is_initial FROM notification_delivery_statuses WHERE id = OLD.status_id)
     OR NOT (SELECT is_terminal FROM notification_delivery_statuses WHERE id = NEW.status_id)
     OR (to_jsonb(NEW) - 'status_id' - 'provider_message_id' - 'error_code')
        <> (to_jsonb(OLD) - 'status_id' - 'provider_message_id' - 'error_code') THEN
    RAISE EXCEPTION 'Un intento de envío pasa una sola vez de en cola a su resultado' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "notification_deliveries_rules" BEFORE INSERT OR UPDATE OR DELETE ON "notification_deliveries"
  FOR EACH ROW EXECUTE FUNCTION fn_notification_deliveries_rules();

-- ─────────────── Avisos al cliente por cambio de estado (H06.2) ───────────────
-- En la misma transacción del cambio: si el estado nuevo avisa al cliente (order_statuses.notifies_customer) y
-- no fue el propio cliente quien lo hizo (confirmar la entrega no le avisa a él mismo), queda un aviso pendiente.
-- La API lo reparte después; si la transacción se revierte, el aviso tampoco existe.
CREATE FUNCTION fn_order_status_history_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notifications (recipient_user_id, notification_type_id, order_id, order_status_history_id)
  SELECT o.customer_user_id, t.id, o.id, NEW.id
  FROM orders o
  JOIN order_statuses s ON s.id = NEW.to_status_id AND s.notifies_customer
  JOIN notification_types t ON t.code = 'ORDER_STATUS_CHANGED' AND t.deactivated_at IS NULL
  WHERE o.id = NEW.order_id AND NEW.changed_by_user_id IS DISTINCT FROM o.customer_user_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "order_status_history_notify" AFTER INSERT ON "order_status_history"
  FOR EACH ROW EXECUTE FUNCTION fn_order_status_history_notify();
