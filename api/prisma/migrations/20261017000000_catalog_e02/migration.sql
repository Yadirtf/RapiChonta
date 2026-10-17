-- E02 · Establecimientos y menús (Docs/14-base-de-datos/E02-establecimientos-y-menus.md).
-- Migración aditiva: solo agrega columnas, tablas, índices, reglas y vistas. No toca datos existentes.

-- ─────────────── Orden de los productos dentro de su sección (H02.2) ───────────────
ALTER TABLE "products" ADD COLUMN "sort_order" SMALLINT NOT NULL DEFAULT 0;
CREATE INDEX "products_menu_section_id_sort_order_idx" ON "products"("menu_section_id", "sort_order");

-- ─────────────── Máquinas de estado en datos (nivel simple: sin historial) ───────────────
CREATE TABLE "establishment_status_transitions" (
    "from_status_id" SMALLINT NOT NULL,
    "to_status_id" SMALLINT NOT NULL,

    CONSTRAINT "establishment_status_transitions_pkey" PRIMARY KEY ("from_status_id","to_status_id")
);
ALTER TABLE "establishment_status_transitions" ADD CONSTRAINT "establishment_status_transitions_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "establishment_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "establishment_status_transitions" ADD CONSTRAINT "establishment_status_transitions_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "establishment_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "product_status_transitions" (
    "from_status_id" SMALLINT NOT NULL,
    "to_status_id" SMALLINT NOT NULL,

    CONSTRAINT "product_status_transitions_pkey" PRIMARY KEY ("from_status_id","to_status_id")
);
ALTER TABLE "product_status_transitions" ADD CONSTRAINT "product_status_transitions_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "product_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_status_transitions" ADD CONSTRAINT "product_status_transitions_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "product_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────── Contenido de archivos (almacenamiento "database", H02.3) ───────────────
-- Solo se usa cuando no hay almacenamiento S3/R2 configurado (FILE_STORAGE=database). 1:1 con files.
CREATE TABLE "file_contents" (
    "file_id" UUID NOT NULL,
    "content" BYTEA NOT NULL,

    CONSTRAINT "file_contents_pkey" PRIMARY KEY ("file_id")
);
ALTER TABLE "file_contents" ADD CONSTRAINT "file_contents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- El mismo archivo (sha256) para el mismo propósito no se vuelve a subir.
CREATE INDEX "files_purpose_id_sha256_idx" ON "files"("purpose_id", "sha256");


-- ════════════════════════════════════════════════════════════════════════════
-- Integridad que Prisma no genera. Revise toda migración nueva y quite
-- cualquier DROP INDEX / DROP TRIGGER / DROP VIEW que no sea intencional.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE "file_contents" ADD CONSTRAINT "file_contents_size_check" CHECK (octet_length("content") > 0);

-- Área dibujada válida (sin cruces) y nombres no vacíos.
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_area_valid_check" CHECK (ST_IsValid("area"::geometry));
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_name_check" CHECK (length(btrim("name")) > 0);
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_address_check" CHECK (length(btrim("address_line")) > 0);
ALTER TABLE "product_version_texts" ADD CONSTRAINT "product_version_texts_name_check" CHECK (length(btrim("name")) > 0);
ALTER TABLE "menu_section_translations" ADD CONSTRAINT "menu_section_translations_name_check" CHECK (length(btrim("name")) > 0);
ALTER TABLE "establishment_category_translations" ADD CONSTRAINT "establishment_category_translations_name_check" CHECK (length(btrim("name")) > 0);
ALTER TABLE "establishment_categories" ADD CONSTRAINT "establishment_categories_code_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,39}$');

-- Un nombre comercial por municipio (sin distinguir mayúsculas): la carga del catálogo se puede repetir sin duplicar.
CREATE UNIQUE INDEX "establishments_municipality_name_idx" ON "establishments" ("municipality_id", lower("name"));

-- Los textos de la versión de un producto tampoco se editan: cambiar es crear otra versión.
CREATE TRIGGER "product_version_texts_immutable" BEFORE UPDATE OR DELETE ON "product_version_texts" FOR EACH ROW EXECUTE FUNCTION fn_immutable();

-- ─────────────── Vistas ───────────────

-- Menú visible: secciones activas y productos cuyo estado is_visible, con su versión vigente y foto principal.
-- Los textos (por idioma) se unen aparte desde product_version_texts y menu_section_translations.
CREATE VIEW "v_menu" AS
SELECT p.establishment_id, p.menu_section_id, ms.sort_order AS section_sort_order,
       p.id AS product_id, p.sort_order AS product_sort_order,
       v.id AS product_version_id, v.price, v.prep_minutes,
       ps.code AS status_code, ps.is_orderable,
       (SELECT i.file_id FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.file_id LIMIT 1) AS primary_image_file_id
FROM products p
JOIN product_statuses ps ON ps.id = p.status_id AND ps.is_visible
JOIN menu_sections ms ON ms.id = p.menu_section_id AND ms.deactivated_at IS NULL
JOIN v_current_product_versions v ON v.product_id = p.id;
