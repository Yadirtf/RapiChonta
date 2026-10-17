import { Injectable } from '@nestjs/common';
import { Principal } from '../../../identity/domain/principal';
import { CatalogErrors } from '../../domain/catalog.errors';
import { ESTABLISHMENT_STATUSES, EstablishmentStatusCode } from '../../domain/catalog.codes';
import { EstablishmentAdminRepository, EstablishmentData, EstablishmentDetail } from '../../domain/ports/establishment-admin.repository';
import { cleanText, establishmentPhone, normalizeCategories } from '../../domain/value-objects/establishment-fields';
import { GeoPoint } from '../../domain/value-objects/geo-point';
import { GeoPolygon } from '../../domain/value-objects/geo-polygon';
import { ensureInScope } from './scope';

export interface EstablishmentInput {
  municipalityId?: number;
  name: string;
  addressLine: string;
  location: { lat: number; lng: number };
  /** Vértices [lng, lat] del área dibujada. */
  area: [number, number][];
  categories: string[];
  phones?: { phone: string; label?: string | null }[];
  logoFileId?: string | null;
}

/**
 * Reglas comunes al crear y editar (H02.1): polígono válido que cubre el punto, punto dentro del municipio,
 * categorías existentes, teléfonos válidos, nombre único en el municipio y logo subido para ese uso.
 */
@Injectable()
export class EstablishmentValidator {
  constructor(private readonly repository: EstablishmentAdminRepository) {}

  async validate(principal: Principal, input: EstablishmentInput, exceptId?: string): Promise<EstablishmentData> {
    const municipalityId = principal.municipalityId ?? input.municipalityId ?? (await this.soleLaunchedMunicipality());
    if (!municipalityId) throw CatalogErrors.municipalityRequired();

    const name = cleanText(input.name, 120, 'name');
    const addressLine = cleanText(input.addressLine, 200, 'addressLine');
    if (name.length < 2) throw CatalogErrors.textRequired('name');
    if (addressLine.length < 3) throw CatalogErrors.textRequired('addressLine');
    const location = GeoPoint.create(input.location?.lat, input.location?.lng);
    const area = GeoPolygon.fromRing(input.area);
    if (!area.covers(location)) throw CatalogErrors.areaMustCoverLocation();

    const municipality = await this.repository.municipality(municipalityId, location);
    if (!municipality) throw CatalogErrors.municipalityRequired();
    if (!municipality.covers) throw CatalogErrors.locationOutsideMunicipality();

    const categories = normalizeCategories(input.categories);
    const known = await this.repository.activeCategoryCodes(categories);
    if (known.length !== categories.length) throw CatalogErrors.unknownCategory();

    const seen = new Set<string>();
    const phones = (input.phones ?? []).slice(0, 3).flatMap(({ phone, label }) => {
      const e164 = establishmentPhone(phone);
      if (seen.has(e164)) return [];
      seen.add(e164);
      return [{ phone: e164, label: label?.trim().slice(0, 40) || null }];
    });

    const logoFileId = input.logoFileId ?? null;
    if (logoFileId && !(await this.repository.fileIsUsableAs(logoFileId, 'ESTABLISHMENT_LOGO'))) throw CatalogErrors.fileNotUsable();
    if (await this.repository.nameTaken(municipalityId, name, exceptId)) throw CatalogErrors.establishmentNameTaken();

    return { municipalityId, name, addressLine, location, area, categories, phones, logoFileId };
  }

  /** Mientras solo opere un municipio (Villagarzón), el administrador global no tiene que elegirlo. */
  private async soleLaunchedMunicipality(): Promise<number | undefined> {
    const launched = (await this.repository.municipalities(null)).filter((m) => m.launched);
    return launched.length === 1 ? launched[0].id : undefined;
  }
}

@Injectable()
export class CreateEstablishmentUseCase {
  constructor(
    private readonly repository: EstablishmentAdminRepository,
    private readonly validator: EstablishmentValidator,
  ) {}

  /** Se crea en borrador (DRAFT): no aparece en el mapa hasta tener menú y activarse. */
  async execute(principal: Principal, input: EstablishmentInput): Promise<string> {
    const data = await this.validator.validate(principal, input);
    return this.repository.create(data, principal.userId);
  }
}

@Injectable()
export class UpdateEstablishmentUseCase {
  constructor(
    private readonly repository: EstablishmentAdminRepository,
    private readonly validator: EstablishmentValidator,
  ) {}

  async execute(principal: Principal, id: string, input: EstablishmentInput): Promise<void> {
    const current = await this.repository.scopeOf(id);
    ensureInScope(principal, current?.municipalityId);
    // El municipio de un local existente no cambia: sus pedidos, zonas y comisión dependen de él.
    const data = await this.validator.validate(principal, { ...input, municipalityId: current!.municipalityId }, id);
    await this.repository.update(id, data, principal.userId);
  }
}

@Injectable()
export class GetEstablishmentAdminUseCase {
  constructor(private readonly repository: EstablishmentAdminRepository) {}

  async execute(principal: Principal, id: string): Promise<EstablishmentDetail> {
    const establishment = await this.repository.findById(id);
    ensureInScope(principal, establishment?.municipality.id);
    return establishment!;
  }
}

@Injectable()
export class ListEstablishmentsUseCase {
  constructor(private readonly repository: EstablishmentAdminRepository) {}

  execute(principal: Principal, filter: { status?: EstablishmentStatusCode; search?: string }) {
    return this.repository.list({ municipalityId: principal.municipalityId, status: filter.status, search: filter.search?.trim() || undefined });
  }
}

/**
 * Activar, cerrar temporalmente o desactivar (H02.1). Las transiciones permitidas viven en
 * establishment_status_transitions; activar exige al menos un producto disponible.
 */
@Injectable()
export class ChangeEstablishmentStatusUseCase {
  constructor(private readonly repository: EstablishmentAdminRepository) {}

  async execute(principal: Principal, input: { id: string; to: EstablishmentStatusCode }): Promise<void> {
    const current = await this.repository.scopeOf(input.id);
    ensureInScope(principal, current?.municipalityId);
    const from = current!.status;
    if (from === input.to || !(await this.repository.isTransitionAllowed(from, input.to))) throw CatalogErrors.invalidTransition();
    if (input.to === ESTABLISHMENT_STATUSES.ACTIVE && (await this.repository.countOrderableProducts(input.id)) === 0) throw CatalogErrors.menuEmpty();
    await this.repository.changeStatus({ id: input.id, from, to: input.to, actorUserId: principal.userId });
  }
}
