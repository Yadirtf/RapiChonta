-- E03 · Zonas, horario y configuración (Docs/14-base-de-datos/E03-zonas-horario-configuracion.md).
-- Las tablas ya existen desde la migración inicial; aquí solo se ajusta la regla de superposición.

-- delivery_zones: dos zonas activas del mismo municipio no se superponen. Se toleran intersecciones de menos
-- de 1 m²: los polígonos se guardan con 6 decimales (≈ 11 cm) y dos barrios vecinos que comparten el borde
-- pueden "pisarse" unos centímetros por redondeo. La API usa la misma tolerancia al avisar del choque.
CREATE OR REPLACE FUNCTION fn_delivery_zones_no_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deactivated_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM municipalities WHERE id = NEW.municipality_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM delivery_zones z
             WHERE z.municipality_id = NEW.municipality_id AND z.deactivated_at IS NULL AND z.id <> NEW.id
               AND ST_Intersects(z.area, NEW.area)
               AND ST_Area(ST_Intersection(z.area::geometry, NEW.area::geometry)::geography) >= 1) THEN
    RAISE EXCEPTION 'La zona se superpone con otra zona activa' USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END;
$$;
