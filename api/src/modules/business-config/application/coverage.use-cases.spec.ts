import { admin, MemoryMunicipalities, MemoryZones, scopedAdmin } from '../../../../test/business/fakes';
import { CoverageInput, ManageCoverageUseCase, PublicCoverageUseCase } from './coverage.use-cases';
import { MunicipalityScope } from './municipality-scope';
import { ManageZonesUseCase, QuoteDeliveryUseCase } from './zones.use-cases';

const PLAZA = { lat: 1.0294, lng: -76.6165 };
const radius = (overrides: Partial<CoverageInput> = {}) => ({ shape: 'CIRCLE', center: PLAZA, radiusMeters: 3_000, fee: '4000', ...overrides }) as CoverageInput;
/** Barrio de ~200 m × 200 m alrededor de la plaza. */
const CENTRO: [number, number][] = [
  [-76.6175, 1.0285],
  [-76.6155, 1.0285],
  [-76.6155, 1.0305],
  [-76.6175, 1.0305],
];

function setup() {
  const municipalities = new MemoryMunicipalities();
  municipalities.rows.push({ id: 2, name: 'Mocoa', department: 'Putumayo', timeZone: 'America/Bogota', center: { lat: 1.15, lng: -76.65 }, launched: false });
  const scope = new MunicipalityScope(municipalities);
  const zones = new MemoryZones();
  zones.establishments.set('tienda-1', 1);
  return {
    municipalities,
    zones,
    coverage: new ManageCoverageUseCase(zones, scope, municipalities),
    publicCoverage: new PublicCoverageUseCase(zones),
    manageZones: new ManageZonesUseCase(zones, scope),
    quote: new QuoteDeliveryUseCase(zones),
  };
}

describe('Cobertura por municipio (H03.5)', () => {
  it('guarda un radio como zona COVERAGE; cambiar solo la tarifa conserva la zona, cambiar el radio la reemplaza', async () => {
    const { coverage, zones } = setup();
    const saved = await coverage.save(admin, { ...radius(), municipalityId: 1 });
    expect(saved).toMatchObject({ kind: 'COVERAGE', shape: 'CIRCLE', name: 'Cobertura Villagarzón', fee: '4000.00' });

    // El doble no recupera el círculo del polígono (PostgreSQL sí): se simula lo que devolvería.
    zones.rows.get(saved.id)!.circle = { center: PLAZA, radiusMeters: 3_000 };
    const cheaper = await coverage.save(admin, { ...radius({ fee: '3500' }), municipalityId: 1 });
    expect(cheaper.id).toBe(saved.id);
    expect(zones.fees.filter((f) => f.zoneId === saved.id).map((f) => f.fee)).toEqual(['4000.00', '3500.00']);

    const wider = await coverage.save(admin, { ...radius({ radiusMeters: 5_000, fee: '3500' }), municipalityId: 1 });
    expect(wider.id).not.toBe(saved.id);
    expect(await zones.find(saved.id)).toBeNull();
  });

  it('también acepta un área dibujada, y valida radio y forma', async () => {
    const { coverage } = setup();
    const ring: [number, number][] = [
      [-76.64, 1.01],
      [-76.6, 1.01],
      [-76.6, 1.05],
      [-76.64, 1.05],
    ];
    await expect(coverage.save(admin, { shape: 'POLYGON', area: ring, fee: '4000', municipalityId: 1 })).resolves.toMatchObject({ shape: 'POLYGON' });
    await expect(coverage.save(admin, { ...radius({ radiusMeters: 50 }), municipalityId: 1 })).rejects.toMatchObject({ code: 'INVALID_RADIUS' });
    await expect(coverage.save(admin, { shape: 'POLYGON', area: CENTRO, fee: '4000', municipalityId: 1 })).rejects.toMatchObject({ code: 'INVALID_AREA' });
  });

  it('el barrio cobra su tarifa; el resto de la cobertura, la tarifa base; fuera, NO_COVERAGE con la distancia', async () => {
    const { coverage, manageZones, quote } = setup();
    await coverage.save(admin, { ...radius(), municipalityId: 1 });
    await manageZones.create(admin, { name: 'Centro', kind: 'URBAN', area: CENTRO, fee: '3000', municipalityId: 1 });

    const at = (lat: number, lng: number) => quote.execute({ establishmentId: 'tienda-1', latitude: lat, longitude: lng });
    await expect(at(PLAZA.lat, PLAZA.lng)).resolves.toMatchObject({ fee: '3000.00', zone: { name: 'Centro', kind: 'URBAN' } });
    await expect(at(PLAZA.lat + 0.015, PLAZA.lng)).resolves.toMatchObject({ fee: '4000.00', zone: { kind: 'COVERAGE' } });
    const outside = at(PLAZA.lat + 0.05, PLAZA.lng);
    await expect(outside).rejects.toMatchObject({ code: 'NO_COVERAGE' });
    const error = await outside.catch((e) => e);
    expect(error.details.distanceMeters).toBeGreaterThan(2_000);
  });

  it('la página Zonas no lista ni deja tocar la cobertura', async () => {
    const { coverage, manageZones } = setup();
    const saved = await coverage.save(admin, { ...radius(), municipalityId: 1 });
    const { zones, coverage: shown } = await manageZones.list(admin, 1);
    expect(zones).toEqual([]);
    expect(shown?.id).toBe(saved.id);
    await expect(manageZones.deactivate(admin, saved.id)).rejects.toMatchObject({ code: 'ZONE_NOT_FOUND' });
    await expect(manageZones.create(admin, { name: 'Plaza', kind: 'COVERAGE' as never, area: CENTRO, fee: '1', municipalityId: 1 })).resolves.toMatchObject({ kind: 'URBAN' });
  });

  it('el cliente verifica su punto (GPS o pin) contra todos los municipios abiertos', async () => {
    const { coverage, publicCoverage } = setup();
    await coverage.save(admin, { ...radius(), municipalityId: 1 });
    await expect(publicCoverage.check({ latitude: PLAZA.lat, longitude: PLAZA.lng })).resolves.toEqual({
      covered: true,
      municipality: { id: 1, name: 'Villagarzón' },
      zone: { name: 'Cobertura Villagarzón', kind: 'COVERAGE' },
      fee: '4000.00',
    });
    const far = await publicCoverage.check({ latitude: PLAZA.lat + 0.1, longitude: PLAZA.lng });
    expect(far).toMatchObject({ covered: false, nearest: { municipalityName: 'Villagarzón' } });
  });

  it('abrir un municipio exige cobertura, horario y comisión, y solo lo hace el administrador general', async () => {
    const { coverage, municipalities } = setup();
    await expect(coverage.update(admin, 2, { launched: true })).rejects.toMatchObject({ code: 'MUNICIPALITY_NOT_READY', details: { missing: ['COVERAGE', 'HOURS', 'COMMISSION'] } });
    municipalities.ready.set(2, { coverage: true, hours: true, commission: false });
    await expect(coverage.update(admin, 2, { launched: true })).rejects.toMatchObject({ details: { missing: ['COMMISSION'] } });
    municipalities.ready.set(2, { coverage: true, hours: true, commission: true });
    await expect(coverage.update(admin, 2, { launched: true, center: { lat: 1.1514, lng: -76.6464 } })).resolves.toMatchObject({ launched: true, center: { lat: 1.1514 } });
    // Pausar no exige nada.
    await expect(coverage.update(admin, 2, { launched: false })).resolves.toMatchObject({ launched: false });
    await expect(coverage.update(scopedAdmin(2), 2, { launched: true })).rejects.toMatchObject({ code: 'GLOBAL_ADMIN_ONLY' });
  });

  it('el resumen lista los municipios del alcance con su cobertura y lo que les falta', async () => {
    const { coverage } = setup();
    await coverage.save(admin, { ...radius(), municipalityId: 1 });
    const overview = await coverage.overview(admin);
    expect(overview.map((o) => [o.municipality.name, o.coverage?.shape ?? null])).toEqual([
      ['Villagarzón', 'CIRCLE'],
      ['Mocoa', null],
    ]);
    expect((await coverage.overview(scopedAdmin(2))).map((o) => o.municipality.name)).toEqual(['Mocoa']);
  });
});
