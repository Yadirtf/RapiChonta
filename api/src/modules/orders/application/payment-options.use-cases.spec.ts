import { Principal } from '../../identity/domain/principal';
import { MemoryPaymentOptions } from '../../../../test/orders/fakes';
import { ListPaymentMethodsUseCase, ManagePaymentOptionsUseCase } from './payment-options.use-cases';

const admin: Principal = { userId: 'admin-1', sessionId: 's-1', role: 'ADMIN', permissions: new Set(['settings.manage']), municipalityId: null };
const localAdmin: Principal = { ...admin, municipalityId: 7 };

describe('Medios de pago del panel', () => {
  let options: MemoryPaymentOptions;
  let manage: ManagePaymentOptionsUseCase;
  let offered: ListPaymentMethodsUseCase;
  beforeEach(() => {
    options = new MemoryPaymentOptions();
    manage = new ManagePaymentOptionsUseCase(options);
    offered = new ListPaymentMethodsUseCase(options);
  });

  const codes = async () => (await offered.execute()).map((o) => o.code);

  it('el cliente solo ve los medios visibles, en el orden del panel', async () => {
    await manage.update(admin, 'DAVIPLATA', { offered: false });
    await manage.reorder(admin, ['BANK_TRANSFER', 'NEQUI', 'DAVIPLATA', 'CASH']);
    expect(await codes()).toEqual(['BANK_TRANSFER', 'NEQUI', 'CASH']);
  });

  it('no deja ocultar el último medio visible', async () => {
    for (const code of ['CASH', 'NEQUI', 'DAVIPLATA']) await manage.update(admin, code, { offered: false });
    await expect(manage.update(admin, 'BANK_TRANSFER', { offered: false })).rejects.toMatchObject({ code: 'LAST_PAYMENT_METHOD' });
    expect(await codes()).toEqual(['BANK_TRANSFER']);
  });

  it('el nuevo orden debe traer cada medio una sola vez', async () => {
    await expect(manage.reorder(admin, ['CASH', 'NEQUI', 'DAVIPLATA'])).rejects.toMatchObject({ code: 'PAYMENT_ORDER_MISMATCH' });
    await expect(manage.reorder(admin, ['CASH', 'CASH', 'NEQUI', 'DAVIPLATA'])).rejects.toMatchObject({ code: 'PAYMENT_ORDER_MISMATCH' });
    await expect(manage.reorder(admin, ['CASH', 'NEQUI', 'DAVIPLATA', 'PSE'])).rejects.toMatchObject({ code: 'PAYMENT_ORDER_MISMATCH' });
  });

  it('pone y quita la imagen; solo acepta imágenes subidas para medios de pago', async () => {
    const [, nequi] = await manage.update(admin, 'NEQUI', { imageFileId: 'imagen-nequi' });
    expect(nequi.imageFileId).toBe('imagen-nequi');
    await expect(manage.update(admin, 'CASH', { imageFileId: 'logo-de-un-local' })).rejects.toMatchObject({ code: 'FILE_NOT_USABLE' });
    const [, cleared] = await manage.update(admin, 'NEQUI', { imageFileId: null });
    expect(cleared.imageFileId).toBeNull();
  });

  it('un medio que no existe es 404', async () => {
    await expect(manage.update(admin, 'PSE', { offered: true })).rejects.toMatchObject({ code: 'PAYMENT_METHOD_NOT_FOUND' });
  });

  it('el administrador de un municipio no cambia los medios de todos', async () => {
    await expect(manage.update(localAdmin, 'CASH', { offered: false })).rejects.toMatchObject({ code: 'PAYMENT_METHODS_GLOBAL_ONLY' });
    await expect(manage.reorder(localAdmin, ['CASH', 'NEQUI', 'DAVIPLATA', 'BANK_TRANSFER'])).rejects.toMatchObject({ code: 'PAYMENT_METHODS_GLOBAL_ONLY' });
  });
});
