-- E11 · Cajas diarias y comisiones (Docs/14-base-de-datos/E11-cajas-y-comisiones.md).
-- Sobre el libro que ya existe (E08 compra, E10 cobro): la base, el cierre, los ajustes firmados y los saldos.
-- Nada de lo que se calcula se guarda: el saldo, las tarifas y las comisiones de cada caja salen de vistas.

-- AlterTable
ALTER TABLE "cash_movement_types" ADD COLUMN     "is_correction" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "opens_box" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "settles_order" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "funding_modes" ADD COLUMN     "requires_box_opening" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "cash_box_closures" (
    "cash_box_id" UUID NOT NULL,
    "closed_by_user_id" UUID NOT NULL,
    "closed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "notes" TEXT,

    CONSTRAINT "cash_box_closures_pkey" PRIMARY KEY ("cash_box_id")
);

-- CreateIndex
CREATE INDEX "cash_box_closures_closed_by_user_id_idx" ON "cash_box_closures"("closed_by_user_id");

-- AddForeignKey
ALTER TABLE "cash_box_closures" ADD CONSTRAINT "cash_box_closures_cash_box_id_fkey" FOREIGN KEY ("cash_box_id") REFERENCES "cash_boxes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_box_closures" ADD CONSTRAINT "cash_box_closures_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════════════════════
-- Integridad que Prisma no genera. Revise toda migración nueva y quite
-- cualquier DROP INDEX / DROP TRIGGER / DROP VIEW que no sea intencional.
-- ════════════════════════════════════════════════════════════════════════════

-- Los catálogos ya sembrados reciben sus banderas aquí; la semilla las mantiene (idempotente).
UPDATE "funding_modes" SET "requires_box_opening" = ("code" = 'CASH_BOX');
UPDATE "cash_movement_types" SET "opens_box" = ("code" = 'OPENING'), "settles_order" = ("code" = 'COLLECTION'),
                                 "is_correction" = ("code" IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT'));
ALTER TABLE "cash_box_closures" ADD CONSTRAINT "cash_box_closures_notes_check" CHECK ("notes" IS NULL OR length(btrim("notes")) > 0);

-- ─────────────── Vistas ───────────────

-- El día de trabajo de cada domiciliario: hoy en la zona horaria del municipio de su rol COURIER.
CREATE VIEW "v_courier_business_day" AS
SELECT ar.user_id AS courier_user_id, ar.municipality_id, (now() AT TIME ZONE m.time_zone)::date AS business_date
FROM v_active_user_roles ar
JOIN courier_profiles cp ON cp.user_id = ar.user_id
JOIN municipalities m ON m.id = ar.municipality_id
WHERE ar.role_code = 'COURIER';

-- El modo de financiación de una caja es el vigente al empezar su día (courier_funding_modes es versionado por fecha).
CREATE VIEW "v_cash_box_funding" AS
SELECT b.id AS cash_box_id, b.courier_user_id, b.business_date, fm.id AS funding_mode_id, fm.code AS funding_mode_code,
       coalesce(fm.requires_box_opening, false) AS requires_box_opening,
       EXISTS (SELECT 1 FROM cash_box_closures c WHERE c.cash_box_id = b.id) AS is_closed,
       EXISTS (SELECT 1 FROM cash_movements x JOIN cash_movement_types t ON t.id = x.movement_type_id AND t.opens_box
               WHERE x.cash_box_id = b.id) AS has_opening
FROM cash_boxes b
LEFT JOIN LATERAL (SELECT c.funding_mode_id FROM courier_funding_modes c
                   WHERE c.courier_user_id = b.courier_user_id AND c.effective_on <= b.business_date
                   ORDER BY c.effective_on DESC LIMIT 1) f ON true
LEFT JOIN funding_modes fm ON fm.id = f.funding_mode_id;

-- H11.1: ¿puede recibir ofertas hoy? Con un modo que exige base, solo con la caja de hoy abierta y con su base; en
-- cualquier modo, una caja de hoy ya cerrada termina la jornada.
CREATE VIEW "v_courier_cash_readiness" AS
SELECT d.courier_user_id, d.municipality_id, d.business_date, fm.code AS funding_mode_code,
       coalesce(fm.requires_box_opening, false) AS requires_box_opening,
       b.cash_box_id, coalesce(b.is_closed, false) AS is_closed, coalesce(b.has_opening, false) AS has_opening,
       NOT coalesce(b.is_closed, false) AND (NOT coalesce(fm.requires_box_opening, false) OR coalesce(b.has_opening, false)) AS can_receive_offers
FROM v_courier_business_day d
LEFT JOIN LATERAL (SELECT c.funding_mode_id FROM courier_funding_modes c
                   WHERE c.courier_user_id = d.courier_user_id AND c.effective_on <= d.business_date
                   ORDER BY c.effective_on DESC LIMIT 1) f ON true
LEFT JOIN funding_modes fm ON fm.id = f.funding_mode_id
LEFT JOIN v_cash_box_funding b ON b.courier_user_id = d.courier_user_id AND b.business_date = d.business_date;

-- H11.3, RF-72: lo que el domiciliario debe entregar. movements_net suma el libro con el signo de cada tipo; los pedidos
-- de la caja son los que tienen su cobro aquí (settles_order). Un pedido cancelado después del cobro no deja tarifa ni
-- comisión (lo cobrado se devuelve con un ajuste); uno que aún espera la revisión de la foto ya cuenta.
-- amount_due = movimientos − tarifas del domiciliario + comisiones; tras el RETURN del cierre, lo que queda es la diferencia.
CREATE VIEW "v_cash_box_balances" AS
SELECT b.id AS cash_box_id,
       coalesce(m.net, 0)::numeric(12,2) AS movements_net,
       coalesce(o.fees, 0)::numeric(12,2) AS courier_fees,
       coalesce(o.commissions, 0)::numeric(12,2) AS commissions,
       coalesce(o.orders, 0)::int AS settled_orders,
       (coalesce(m.net, 0) - coalesce(o.fees, 0) + coalesce(o.commissions, 0))::numeric(12,2) AS amount_due
FROM cash_boxes b
LEFT JOIN LATERAL (SELECT sum(t.direction * x.amount) AS net FROM cash_movements x
                   JOIN cash_movement_types t ON t.id = x.movement_type_id WHERE x.cash_box_id = b.id) m ON true
LEFT JOIN LATERAL (
  SELECT sum(a.delivery_fee) AS fees, sum(a.commission_amount) AS commissions, count(*) AS orders
  FROM (SELECT DISTINCT x.order_id FROM cash_movements x
        JOIN cash_movement_types t ON t.id = x.movement_type_id AND t.settles_order
        WHERE x.cash_box_id = b.id) c
  JOIN orders ord ON ord.id = c.order_id
  JOIN order_statuses s ON s.id = ord.status_id AND (s.counts_as_delivered OR NOT s.is_terminal)
  JOIN v_order_amounts a ON a.order_id = ord.id) o ON true;

-- ─────────────── La caja abierta del día ───────────────
-- La compra y el cobro caen en la caja del día; si ese día ya se cerró (un cobro tardío), en la del día siguiente que
-- siga abierta, creándola si hace falta. Así una caja cerrada nunca recibe dinero nuevo y nada se pierde.
CREATE FUNCTION fn_courier_open_cash_box(p_courier uuid, p_day date) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_day date := p_day;
  v_id uuid;
BEGIN
  LOOP
    INSERT INTO cash_boxes (courier_user_id, business_date) VALUES (p_courier, v_day)
    ON CONFLICT (courier_user_id, business_date) DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      SELECT b.id INTO v_id FROM cash_boxes b
      WHERE b.courier_user_id = p_courier AND b.business_date = v_day
        AND NOT EXISTS (SELECT 1 FROM cash_box_closures c WHERE c.cash_box_id = b.id);
    END IF;
    EXIT WHEN v_id IS NOT NULL;
    v_day := v_day + 1;
  END LOOP;
  RETURN v_id;
END;
$$;

-- ─────────────── cash_movements ───────────────
-- Lo de E10, más las reglas de E11: una caja cerrada solo acepta correcciones; la base va una vez y solo en el modo
-- que la usa; una corrección lleva nota y, si anula otro movimiento, va en sentido contrario y por el mismo monto.
CREATE OR REPLACE FUNCTION fn_cash_movements_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  t cash_movement_types%ROWTYPE;
  v_owner uuid;
  v_account_based boolean;
  v_box v_cash_box_funding%ROWTYPE;
  v_original record;
BEGIN
  SELECT * INTO t FROM cash_movement_types WHERE id = NEW.movement_type_id;
  SELECT courier_user_id INTO v_owner FROM cash_boxes WHERE id = NEW.cash_box_id FOR SHARE;
  SELECT * INTO v_box FROM v_cash_box_funding WHERE cash_box_id = NEW.cash_box_id;
  SELECT is_account_based INTO v_account_based FROM payment_methods WHERE id = NEW.payment_method_id;
  IF v_box.is_closed AND NOT t.is_correction THEN
    RAISE EXCEPTION 'CASH_BOX_CLOSED: La caja está cerrada: solo admite ajustes' USING ERRCODE = 'check_violation';
  END IF;
  IF t.only_for_funding_mode_id IS NOT NULL AND v_box.funding_mode_id IS DISTINCT FROM t.only_for_funding_mode_id THEN
    RAISE EXCEPTION 'CASH_BOX_FUNDING_MODE: El movimiento % no aplica al modo de esta caja', t.code USING ERRCODE = 'check_violation';
  END IF;
  IF t.opens_box AND v_box.has_opening THEN
    RAISE EXCEPTION 'CASH_BOX_ALREADY_OPENED: La caja ya tiene su base' USING ERRCODE = 'check_violation';
  END IF;
  IF t.requires_order AND NEW.order_id IS NULL THEN
    RAISE EXCEPTION 'El movimiento % exige un pedido', t.code USING ERRCODE = 'check_violation';
  END IF;
  IF t.requires_payment_method AND NEW.payment_method_id IS NULL THEN
    RAISE EXCEPTION 'El movimiento % exige el medio de pago', t.code USING ERRCODE = 'check_violation';
  END IF;
  IF t.is_manual AND NEW.created_by_user_id IS NULL THEN
    RAISE EXCEPTION 'Un movimiento manual lleva quién lo hizo' USING ERRCODE = 'check_violation';
  END IF;
  IF t.is_correction AND length(btrim(coalesce(NEW.note, ''))) = 0 THEN
    RAISE EXCEPTION 'CASH_NOTE_REQUIRED: Un ajuste lleva la nota de por qué' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reverses_movement_id IS NOT NULL THEN
    SELECT x.amount, xt.direction, b.courier_user_id INTO v_original
    FROM cash_movements x JOIN cash_movement_types xt ON xt.id = x.movement_type_id JOIN cash_boxes b ON b.id = x.cash_box_id
    WHERE x.id = NEW.reverses_movement_id;
    IF NOT t.is_correction OR v_original.courier_user_id IS DISTINCT FROM v_owner
       OR v_original.direction <> -t.direction OR v_original.amount <> NEW.amount THEN
      RAISE EXCEPTION 'CASH_REVERSAL_INVALID: Solo un ajuste del mismo domiciliario, en sentido contrario y por el mismo monto, anula un movimiento'
        USING ERRCODE = 'check_violation';
    END IF;
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

-- ─────────────── cash_box_closures ───────────────
-- Cerrar toma la caja FOR UPDATE (los movimientos la toman FOR SHARE): nada entra a medio cierre. No se cierra el día
-- de hoy (o uno posterior) con un pedido en curso, y si lo entregado no cuadra con lo debido, la nota es obligatoria.
CREATE FUNCTION fn_cash_box_closures_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_box record;
BEGIN
  SELECT b.courier_user_id, b.business_date, coalesce(d.business_date, b.business_date) AS today
  INTO v_box
  FROM cash_boxes b LEFT JOIN v_courier_business_day d ON d.courier_user_id = b.courier_user_id
  WHERE b.id = NEW.cash_box_id FOR UPDATE OF b;
  IF v_box.business_date >= v_box.today
     AND EXISTS (SELECT 1 FROM order_assignments a WHERE a.courier_user_id = v_box.courier_user_id AND a.released_at IS NULL) THEN
    RAISE EXCEPTION 'CASH_BOX_COURIER_BUSY: El domiciliario tiene un pedido en curso' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.notes IS NULL AND (SELECT amount_due FROM v_cash_box_balances WHERE cash_box_id = NEW.cash_box_id) <> 0 THEN
    RAISE EXCEPTION 'CASH_NOTE_REQUIRED: La caja no cuadra: escriba la nota de la diferencia' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "cash_box_closures_insert" BEFORE INSERT ON "cash_box_closures" FOR EACH ROW EXECUTE FUNCTION fn_cash_box_closures_insert();
CREATE TRIGGER "cash_box_closures_immutable" BEFORE UPDATE OR DELETE ON "cash_box_closures" FOR EACH ROW EXECUTE FUNCTION fn_immutable();

-- ─────────────── order_offer_recipients: caja lista (H11.1) ───────────────
-- Un domiciliario con modo de base no recibe ofertas sin la caja de hoy abierta con su base, y nadie las recibe con la
-- caja de hoy ya cerrada. Disparador aparte del de E07 para no reescribirlo.
CREATE FUNCTION fn_order_offer_recipients_cash_ready() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM v_courier_cash_readiness r WHERE r.courier_user_id = NEW.courier_user_id AND NOT r.can_receive_offers) THEN
    RAISE EXCEPTION 'CASH_BOX_NOT_READY: El domiciliario no tiene la caja de hoy lista' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "order_offer_recipients_cash_ready" BEFORE INSERT ON "order_offer_recipients"
  FOR EACH ROW EXECUTE FUNCTION fn_order_offer_recipients_cash_ready();
