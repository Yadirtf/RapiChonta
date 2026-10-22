-- E10 · Cierre de la entrega con código (Docs/14-base-de-datos/E10-entrega-e-incidencias.md).
-- El domiciliario cierra el pedido con el código de 4 dígitos que le dice el cliente; si no lo obtiene, entrega
-- con foto y el pedido queda en revisión (sin retenerlo). El cliente puede confirmar o decir que no lo recibió.
-- Migración aditiva.

-- CreateTable
CREATE TABLE "order_delivery_codes" (
    "order_id" UUID NOT NULL,
    "code" CHAR(4) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "order_delivery_codes_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "delivery_code_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "courier_user_id" UUID NOT NULL,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "delivery_code_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_delivery_proofs" (
    "order_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,

    CONSTRAINT "order_delivery_proofs_pkey" PRIMARY KEY ("order_id")
);

-- CreateIndex
CREATE INDEX "delivery_code_attempts_order_id_idx" ON "delivery_code_attempts"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_delivery_proofs_file_id_key" ON "order_delivery_proofs"("file_id");

-- AddForeignKey
ALTER TABLE "order_delivery_codes" ADD CONSTRAINT "order_delivery_codes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_code_attempts" ADD CONSTRAINT "delivery_code_attempts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_code_attempts" ADD CONSTRAINT "delivery_code_attempts_courier_user_id_fkey" FOREIGN KEY ("courier_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_delivery_proofs" ADD CONSTRAINT "order_delivery_proofs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_delivery_proofs" ADD CONSTRAINT "order_delivery_proofs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────── Reglas ───────────────
ALTER TABLE "order_delivery_codes" ADD CONSTRAINT "order_delivery_codes_code_check" CHECK ("code" ~ '^[0-9]{4}$');

CREATE TRIGGER "order_delivery_codes_immutable" BEFORE UPDATE OR DELETE ON "order_delivery_codes"
  FOR EACH ROW EXECUTE FUNCTION fn_immutable();
CREATE TRIGGER "delivery_code_attempts_immutable" BEFORE UPDATE OR DELETE ON "delivery_code_attempts"
  FOR EACH ROW EXECUTE FUNCTION fn_immutable();
CREATE TRIGGER "order_delivery_proofs_immutable" BEFORE UPDATE OR DELETE ON "order_delivery_proofs"
  FOR EACH ROW EXECUTE FUNCTION fn_immutable();

-- La foto de entrega es del propósito DELIVERY_PROOF y la subió el domiciliario asignado al pedido.
CREATE FUNCTION fn_order_delivery_proofs_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM files f
    JOIN file_purposes p ON p.id = f.purpose_id AND p.code = 'DELIVERY_PROOF'
    JOIN order_assignments a ON a.order_id = NEW.order_id AND a.courier_user_id = f.uploaded_by_user_id AND a.released_at IS NULL
    WHERE f.id = NEW.file_id) THEN
    RAISE EXCEPTION 'La foto de entrega la sube el domiciliario del pedido' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "order_delivery_proofs_rules" BEFORE INSERT ON "order_delivery_proofs"
  FOR EACH ROW EXECUTE FUNCTION fn_order_delivery_proofs_rules();

-- Un código equivocado solo lo escribe el domiciliario asignado, mientras lleva el pedido.
CREATE FUNCTION fn_delivery_code_attempts_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM order_assignments a
                 WHERE a.order_id = NEW.order_id AND a.courier_user_id = NEW.courier_user_id AND a.released_at IS NULL) THEN
    RAISE EXCEPTION 'Solo el domiciliario del pedido escribe el código de entrega' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "delivery_code_attempts_rules" BEFORE INSERT ON "delivery_code_attempts"
  FOR EACH ROW EXECUTE FUNCTION fn_delivery_code_attempts_rules();

-- ─────────────── Estados ───────────────
-- Entregar con foto libera al domiciliario: la revisión y una posible novedad ya no lo retienen (la semilla lo
-- vuelve a fijar). El cliente recibe aviso al pasar a revisión, para que diga si no lo recibió.
UPDATE "order_statuses" SET "requires_courier" = false WHERE "code" IN ('PENDING_REVIEW', 'DISPUTED');
UPDATE "order_statuses" SET "notifies_customer" = true WHERE "code" = 'PENDING_REVIEW';

-- Pedidos que ya van donde el cliente (salieron antes de esta versión): también tienen su código.
INSERT INTO "order_delivery_codes" ("order_id", "code")
SELECT o.id, lpad(floor(random() * 10000)::int::text, 4, '0')
FROM orders o JOIN order_statuses s ON s.id = o.status_id
WHERE s.code IN ('ON_THE_WAY', 'ARRIVING');

-- La foto se habilita a los 5 minutos en el punto (antes 10), solo si nadie cambió el valor inicial.
INSERT INTO "setting_values" ("setting_definition_id", "value")
SELECT d.id, 300 FROM setting_definitions d
WHERE d.key = 'delivery.proof_after_seconds'
  AND (SELECT v.value FROM setting_values v WHERE v.setting_definition_id = d.id AND v.municipality_id IS NULL
       ORDER BY v.created_at DESC LIMIT 1) = 600
  AND NOT EXISTS (SELECT 1 FROM setting_values v WHERE v.setting_definition_id = d.id AND v.created_by_user_id IS NOT NULL);
