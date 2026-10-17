import { admin, InMemoryEstablishments, InMemoryMenu, operatorOf } from '../../../../../test/catalog/fakes';
import { EstablishmentValidator, CreateEstablishmentUseCase } from './establishments.use-cases';
import { ManageProductImagesUseCase, ManageProductsUseCase, ManageSectionsUseCase, MenuAccess } from './menu.use-cases';

async function setup() {
  const establishments = new InMemoryEstablishments();
  const menu = new InMemoryMenu();
  const access = new MenuAccess(establishments, menu);
  const establishmentId = await new CreateEstablishmentUseCase(establishments, new EstablishmentValidator(establishments)).execute(operatorOf(1), {
    name: 'Burger',
    addressLine: 'Calle 1',
    location: { lat: 1.03, lng: -76.615 },
    area: [
      [-76.61515, 1.0299],
      [-76.61485, 1.0299],
      [-76.61485, 1.0301],
      [-76.61515, 1.0301],
    ],
    categories: ['FAST_FOOD'],
  });
  const sections = new ManageSectionsUseCase(access, menu);
  const products = new ManageProductsUseCase(access, menu);
  const images = new ManageProductImagesUseCase(access, menu, establishments);
  const sectionId = await sections.create(admin, establishmentId, { es: 'Hamburguesas', en: 'Burgers' });
  const product = { sectionId, texts: { es: { name: 'Sencilla', description: 'Carne y queso' } }, price: '14000', prepMinutes: 15 };
  return { establishments, menu, sections, products, images, establishmentId, sectionId, product };
}

describe('Menú del establecimiento (H02.2, H02.3)', () => {
  it('editar precio, tiempo o textos crea una versión nueva; mover de sección o guardar igual no', async () => {
    const { menu, products, sections, establishmentId, product } = await setup();
    const id = await products.create(admin, establishmentId, product);
    expect(await products.update(admin, id, product)).toEqual({ newVersion: false });
    expect(await products.update(admin, id, { ...product, price: '14000.00' })).toEqual({ newVersion: false });
    expect(await products.update(admin, id, { ...product, price: '15000' })).toEqual({ newVersion: true });
    const drinks = await sections.create(admin, establishmentId, { es: 'Bebidas' });
    expect(await products.update(admin, id, { ...product, price: '15000', sectionId: drinks })).toEqual({ newVersion: false });
    expect(menu.products.get(id)).toMatchObject({ sectionId: drinks, versions: 2 });
  });

  it('valida precio, tiempo, español y que la sección sea del mismo local', async () => {
    const { products, sections, establishmentId, product } = await setup();
    await expect(products.create(admin, establishmentId, { ...product, price: '0' })).rejects.toMatchObject({ code: 'INVALID_PRICE' });
    await expect(products.create(admin, establishmentId, { ...product, prepMinutes: 500 })).rejects.toMatchObject({ code: 'INVALID_PREP_MINUTES' });
    await expect(products.create(admin, establishmentId, { ...product, texts: { en: { name: 'Burger' } } })).rejects.toMatchObject({ code: 'SPANISH_TEXT_REQUIRED' });
    const other = await sections.create(admin, establishmentId, { es: 'Otra' });
    await sections.remove(admin, other);
    await expect(products.create(admin, establishmentId, { ...product, sectionId: other })).rejects.toMatchObject({ code: 'SECTION_NOT_FOUND' });
  });

  it('disponible ↔ agotado; descontinuado es final y ya no se edita', async () => {
    const { products, establishmentId, product } = await setup();
    const id = await products.create(admin, establishmentId, product);
    await products.changeStatus(admin, id, 'SOLD_OUT');
    await products.changeStatus(admin, id, 'AVAILABLE');
    await products.changeStatus(admin, id, 'DISCONTINUED');
    await expect(products.changeStatus(admin, id, 'AVAILABLE')).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
    await expect(products.update(admin, id, { ...product, price: '1' })).rejects.toMatchObject({ code: 'PRODUCT_DISCONTINUED' });
  });

  it('una sección con productos a la venta no se borra; el orden exige la lista exacta', async () => {
    const { products, sections, establishmentId, sectionId, product } = await setup();
    const a = await products.create(admin, establishmentId, product);
    const b = await products.create(admin, establishmentId, { ...product, texts: { es: { name: 'Doble' } } });
    await expect(sections.remove(admin, sectionId)).rejects.toMatchObject({ code: 'SECTION_NOT_EMPTY' });
    await expect(products.reorder(admin, sectionId, [a])).rejects.toMatchObject({ code: 'INVALID_ORDER' });
    await expect(products.reorder(admin, sectionId, [a, a])).rejects.toMatchObject({ code: 'INVALID_ORDER' });
    await expect(products.reorder(admin, sectionId, [b, a])).resolves.toBeUndefined();
  });

  it('el operador de otro municipio no toca el menú', async () => {
    const { products, sections, establishmentId, sectionId, product } = await setup();
    await expect(sections.create(operatorOf(2), establishmentId, { es: 'X' })).rejects.toMatchObject({ code: 'ESTABLISHMENT_NOT_FOUND' });
    const id = await products.create(admin, establishmentId, product);
    await expect(products.changeStatus(operatorOf(2), id, 'SOLD_OUT')).rejects.toMatchObject({ code: 'ESTABLISHMENT_NOT_FOUND' });
    await expect(sections.rename(operatorOf(2), sectionId, { es: 'Y' })).rejects.toMatchObject({ code: 'ESTABLISHMENT_NOT_FOUND' });
  });

  it('fotos: solo archivos subidos como foto de producto, máximo 5, y la principal se puede cambiar', async () => {
    const { establishments, menu, products, images, establishmentId, product } = await setup();
    const id = await products.create(admin, establishmentId, product);
    establishments.files.set('logo', 'ESTABLISHMENT_LOGO');
    await expect(images.add(admin, id, 'logo')).rejects.toMatchObject({ code: 'FILE_NOT_USABLE' });
    for (const n of [1, 2, 3, 4, 5, 6]) establishments.files.set(`f${n}`, 'PRODUCT_IMAGE');
    for (const n of [1, 2, 3, 4, 5]) await images.add(admin, id, `f${n}`);
    await images.add(admin, id, 'f1');
    await expect(images.add(admin, id, 'f6')).rejects.toMatchObject({ code: 'TOO_MANY_IMAGES' });
    await images.makePrimary(admin, id, 'f3');
    expect(menu.products.get(id)!.imageFileIds[0]).toBe('f3');
    await expect(images.remove(admin, id, 'nope')).rejects.toMatchObject({ code: 'IMAGE_NOT_FOUND' });
  });
});
