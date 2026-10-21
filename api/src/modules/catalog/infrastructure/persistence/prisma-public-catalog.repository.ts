import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { ContentLanguage } from '../../domain/catalog.codes';
import {
  CategoryView,
  MapEstablishment,
  MenuSectionView,
  NearbyQuery,
  PublicCatalogRepository,
  PublicEstablishment,
} from '../../domain/ports/public-catalog.repository';
import { Translations } from '../../domain/value-objects/localized-text';
import { GeoPoint } from '../../domain/value-objects/geo-point';
import { pointSql } from './sql';

interface MapRow {
  id: string;
  name: string;
  primary_category_code: string | null;
  icon: string | null;
  address_line: string;
  accepts_orders: boolean;
  logo_file_id: string | null;
  latitude: number;
  longitude: number;
  distance_meters: number;
}

interface MenuRow {
  menu_section_id: string;
  section_name: string;
  product_id: string;
  product_version_id: string;
  price: string;
  prep_minutes: number;
  status_code: string;
  is_orderable: boolean;
  primary_image_file_id: string | null;
  name: string;
  description: string | null;
}

/**
 * Lecturas del cliente con PostGIS. ST_DWithin usa el índice GIST de location; las reglas de visibilidad
 * (estado del local, municipio lanzado, producto visible, sección activa) viven en las vistas.
 */
@Injectable()
export class PrismaPublicCatalogRepository extends PublicCatalogRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async categories(): Promise<CategoryView[]> {
    const rows = await this.prisma.establishmentCategory.findMany({
      where: { deactivatedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { translations: { include: { language: { select: { code: true } } } } },
    });
    return rows.map((c) => ({
      code: c.code,
      icon: c.icon,
      names: Object.fromEntries(c.translations.map((t) => [t.language.code, t.name])) as Translations<string>,
    }));
  }

  async nearby(query: NearbyQuery): Promise<MapEstablishment[]> {
    const origin = pointSql(query.origin);
    const categoryFilter = query.categories?.length
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM establishment_category_links l
          JOIN establishment_categories c ON c.id = l.category_id AND c.deactivated_at IS NULL
          WHERE l.establishment_id = e.id AND c.code IN (${Prisma.join(query.categories)}))`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<MapRow[]>`
      SELECT e.id, e.name, e.primary_category_code, pc.icon, e.address_line, e.accepts_orders, e.logo_file_id,
             ST_Y(e.location::geometry) AS latitude,
             ST_X(e.location::geometry) AS longitude,
             ST_Distance(e.location, ${origin}) AS distance_meters
      FROM v_map_establishments e
      LEFT JOIN establishment_categories pc ON pc.code = e.primary_category_code
      WHERE ST_DWithin(e.location, ${origin}, ${query.radiusMeters})
        ${categoryFilter}
      ORDER BY distance_meters ASC
      LIMIT ${query.limit}
    `;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.primary_category_code,
      categoryIcon: row.icon,
      address: row.address_line,
      acceptsOrders: row.accepts_orders,
      logoFileId: row.logo_file_id,
      location: GeoPoint.create(row.latitude, row.longitude),
      distanceMeters: Math.round(row.distance_meters),
    }));
  }

  async establishment(id: string, language: ContentLanguage, origin?: GeoPoint): Promise<PublicEstablishment | null> {
    const distance = origin ? Prisma.sql`ST_Distance(e.location, ${pointSql(origin)})` : Prisma.sql`NULL::float8`;
    const [row] = await this.prisma.$queryRaw<
      { id: string; name: string; address_line: string; status_code: string; accepts_orders: boolean; logo_file_id: string | null; latitude: number; longitude: number; distance_meters: number | null }[]
    >`
      SELECT e.id, e.name, e.address_line, e.status_code, e.accepts_orders, e.logo_file_id,
             ST_Y(e.location::geometry) AS latitude, ST_X(e.location::geometry) AS longitude,
             ${distance} AS distance_meters
      FROM v_map_establishments e
      WHERE e.id = ${id}::uuid`;
    if (!row) return null;

    const [categories, menu] = await Promise.all([
      this.prisma.$queryRaw<{ code: string; icon: string; is_primary: boolean }[]>`
        SELECT c.code, c.icon, l.is_primary
        FROM establishment_category_links l
        JOIN establishment_categories c ON c.id = l.category_id AND c.deactivated_at IS NULL
        WHERE l.establishment_id = ${id}::uuid
        ORDER BY l.is_primary DESC, c.sort_order`,
      this.prisma.$queryRaw<MenuRow[]>`
        SELECT m.menu_section_id, COALESCE(sl.name, se.name) AS section_name,
               m.product_id, m.product_version_id, m.price::text AS price, m.prep_minutes,
               m.status_code, m.is_orderable, m.primary_image_file_id,
               COALESCE(pl.name, pe.name) AS name,
               CASE WHEN pl.name IS NOT NULL THEN pl.description ELSE pe.description END AS description
        FROM v_menu m
        JOIN languages les ON les.code = 'es'
        LEFT JOIN languages ll ON ll.code = ${language}
        JOIN menu_section_translations se ON se.menu_section_id = m.menu_section_id AND se.language_id = les.id
        LEFT JOIN menu_section_translations sl ON sl.menu_section_id = m.menu_section_id AND sl.language_id = ll.id
        JOIN product_version_texts pe ON pe.product_version_id = m.product_version_id AND pe.language_id = les.id
        LEFT JOIN product_version_texts pl ON pl.product_version_id = m.product_version_id AND pl.language_id = ll.id
        WHERE m.establishment_id = ${id}::uuid
        ORDER BY m.section_sort_order, m.menu_section_id, m.product_sort_order, m.product_id`,
    ]);

    const sections: MenuSectionView[] = [];
    for (const item of menu) {
      let section = sections[sections.length - 1];
      if (section?.id !== item.menu_section_id) sections.push((section = { id: item.menu_section_id, name: item.section_name, products: [] }));
      section.products.push({
        id: item.product_id,
        versionId: item.product_version_id,
        name: item.name,
        description: item.description,
        price: item.price,
        prepMinutes: item.prep_minutes,
        status: item.status_code,
        // Solo se pide si el producto se puede pedir y el local recibe pedidos (no cerrado temporalmente).
        orderable: item.is_orderable && row.accepts_orders,
        imageFileId: item.primary_image_file_id,
      });
    }

    return {
      id: row.id,
      name: row.name,
      address: row.address_line,
      status: row.status_code,
      acceptsOrders: row.accepts_orders,
      location: GeoPoint.create(row.latitude, row.longitude),
      distanceMeters: row.distance_meters === null ? null : Math.round(row.distance_meters),
      logoFileId: row.logo_file_id,
      categories: categories.map((c) => ({ code: c.code, icon: c.icon, primary: c.is_primary })),
      sections,
    };
  }
}
