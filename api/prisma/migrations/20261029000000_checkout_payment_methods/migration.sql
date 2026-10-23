-- Medios de pago configurables desde el panel (Docs/14-base-de-datos/00-transversal.md#medios-de-pago).
-- payment_methods sigue siendo del sistema (qué es cada medio y cómo se cobra); checkout_payment_methods guarda lo
-- que decide el administrador: en qué orden lo ve el cliente, si lo ve y con qué imagen. Migración aditiva.
-- CreateTable
CREATE TABLE "checkout_payment_methods" (
    "payment_method_id" SMALLINT NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "hidden_at" TIMESTAMPTZ(6),
    "image_file_id" UUID,

    CONSTRAINT "checkout_payment_methods_pkey" PRIMARY KEY ("payment_method_id"),
    CONSTRAINT "checkout_payment_methods_sort_order_check" CHECK ("sort_order" > 0)
);

-- AddForeignKey
ALTER TABLE "checkout_payment_methods" ADD CONSTRAINT "checkout_payment_methods_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_payment_methods" ADD CONSTRAINT "checkout_payment_methods_image_file_id_fkey" FOREIGN KEY ("image_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Solo medios contra entrega: los de pago en línea (E14) se ofrecen por su pasarela, no aquí.
CREATE FUNCTION fn_checkout_payment_methods_cash_on_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE id = NEW.payment_method_id AND is_cash_on_delivery) THEN
    RAISE EXCEPTION 'checkout_payment_methods: % no es un medio contra entrega', NEW.payment_method_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_checkout_payment_methods_cash_on_delivery BEFORE INSERT OR UPDATE OF payment_method_id ON "checkout_payment_methods"
  FOR EACH ROW EXECUTE FUNCTION fn_checkout_payment_methods_cash_on_delivery();

-- Los medios que ya existen se ofrecen como hasta hoy: todos visibles, en el orden del catálogo.
INSERT INTO "checkout_payment_methods" ("payment_method_id", "sort_order")
SELECT id, row_number() OVER (ORDER BY sort_order, id) FROM "payment_methods" WHERE is_cash_on_delivery;
