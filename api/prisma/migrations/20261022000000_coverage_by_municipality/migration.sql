-- H03.5 · Cobertura por municipio (Docs/14-base-de-datos/E03-zonas-horario-configuracion.md).
-- La cobertura es una zona de tipo COVERAGE con tarifa base: hasta dónde llegan los domiciliarios del
-- municipio. Puede contener barrios y veredas (su tarifa gana) y se traza como radio o como área dibujada.

-- Catálogo: cómo se trazó el área. Los valores los mantiene la semilla; aquí solo los que necesita la migración.
CREATE TABLE "zone_shapes" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    CONSTRAINT "zone_shapes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "zone_shapes_code_key" ON "zone_shapes"("code");
INSERT INTO "zone_shapes" ("code", "sort_order") VALUES ('POLYGON', 1), ('CIRCLE', 2);

-- Las zonas existentes se dibujaron a mano.
ALTER TABLE "delivery_zones" ADD COLUMN "zone_shape_id" SMALLINT;
UPDATE "delivery_zones" SET "zone_shape_id" = (SELECT "id" FROM "zone_shapes" WHERE "code" = 'POLYGON');
ALTER TABLE "delivery_zones" ALTER COLUMN "zone_shape_id" SET NOT NULL;
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_zone_shape_id_fkey" FOREIGN KEY ("zone_shape_id") REFERENCES "zone_shapes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "zone_kinds" ("code", "sort_order") VALUES ('COVERAGE', 0) ON CONFLICT ("code") DO NOTHING;

-- delivery_zones: barrios y veredas activos del mismo municipio no se superponen (tolerancia de 1 m², ver
-- 20261018000000). La cobertura sí los contiene, y hay como máximo una activa por municipio.
CREATE OR REPLACE FUNCTION fn_delivery_zones_no_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_coverage SMALLINT := (SELECT id FROM zone_kinds WHERE code = 'COVERAGE');
BEGIN
  IF NEW.deactivated_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM municipalities WHERE id = NEW.municipality_id FOR UPDATE;
  IF NEW.zone_kind_id = v_coverage THEN
    IF EXISTS (SELECT 1 FROM delivery_zones z
               WHERE z.municipality_id = NEW.municipality_id AND z.deactivated_at IS NULL AND z.id <> NEW.id
                 AND z.zone_kind_id = v_coverage) THEN
      RAISE EXCEPTION 'El municipio ya tiene una cobertura activa' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM delivery_zones z
             WHERE z.municipality_id = NEW.municipality_id AND z.deactivated_at IS NULL AND z.id <> NEW.id
               AND z.zone_kind_id <> v_coverage
               AND ST_Intersects(z.area, NEW.area)
               AND ST_Area(ST_Intersection(z.area::geometry, NEW.area::geometry)::geography) >= 1) THEN
    RAISE EXCEPTION 'La zona se superpone con otra zona activa' USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END;
$$;
