import { admin, InMemoryMerchantDesk, InMemoryPartnerships, merchant } from '../../../../test/merchants/fakes';
import { CreateStaffMemberUseCase } from '../../identity/application/use-cases/admin/create-staff-member.use-case';
import { Notifier } from '../../notifications/application/notifier';
import { MerchantPortalUseCase } from './merchant-portal.use-cases';
import { ManagePartnershipsUseCase } from './partnerships.use-cases';

const code = (error: unknown) => (error as { code: string }).code;

describe('Convenios desde el panel (H15.1)', () => {
  const setup = () => {
    const partnerships = new InMemoryPartnerships();
    const created: { role: string; phone: string }[] = [];
    const createStaff = {
      execute: async (_: unknown, input: { role: string; phone: string }) => {
        created.push(input);
        return 'nuevo-1';
      },
    } as unknown as CreateStaffMemberUseCase;
    return { partnerships, created, useCase: new ManagePartnershipsUseCase(partnerships, createStaff) };
  };

  it('firma desde hoy; no con fecha pasada ni con fin antes del inicio, ni dos a la vez', async () => {
    const { useCase } = setup();
    await expect(useCase.start(admin, 'tienda-1', { startedOn: '2026-10-29' })).rejects.toMatchObject({ code: 'PARTNERSHIP_DATES_INVALID' });
    await expect(useCase.start(admin, 'tienda-1', { startedOn: '2026-11-02', endedOn: '2026-11-01' })).rejects.toMatchObject({ code: 'PARTNERSHIP_DATES_INVALID' });
    const view = await useCase.start(admin, 'tienda-1', {});
    expect(view.current).toMatchObject({ startedOn: '2026-10-30', endedOn: null });
    await expect(useCase.start(admin, 'tienda-1', {})).rejects.toMatchObject({ code: 'PARTNERSHIP_ACTIVE' });
    await expect(useCase.start(admin, 'otra', {})).rejects.toMatchObject({ code: 'ESTABLISHMENT_NOT_FOUND' });
  });

  it('terminar un convenio que aún no empieza lo cancela; terminar sin convenio abierto es 404', async () => {
    const { useCase } = setup();
    await useCase.start(admin, 'tienda-1', { startedOn: '2026-11-15' });
    const view = await useCase.end(admin, 'tienda-1', {});
    expect(view.upcoming).toBeNull();
    await expect(useCase.end(admin, 'tienda-1', {})).rejects.toMatchObject({ code: 'PARTNERSHIP_NOT_FOUND' });
  });

  it('el acceso al portal exige convenio; reutiliza la cuenta de comercio o crea una MERCHANT con sus datos', async () => {
    const { useCase, partnerships, created } = setup();
    await expect(useCase.addMember(admin, 'tienda-1', { phone: '3001234567' })).rejects.toMatchObject({ code: 'PARTNERSHIP_REQUIRED' });
    await useCase.start(admin, 'tienda-1', {});
    await expect(useCase.addMember(admin, 'tienda-1', { phone: '3001234567' })).rejects.toMatchObject({ code: 'MERCHANT_PERSON_REQUIRED' });

    const person = { givenNames: 'Rosa', familyNames: 'Muñoz', documentType: 'CC', documentNumber: '1122334455', password: 'Tienda2026!' };
    let view = await useCase.addMember(admin, 'tienda-1', { phone: '3001234567', ...person });
    expect(created).toEqual([expect.objectContaining({ role: 'MERCHANT', phone: '3001234567' })]);
    expect(view.members.map((m) => m.userId)).toEqual(['nuevo-1']);

    // Quien ya atiende otro local entra con solo su número.
    partnerships.merchantsByPhone.set('+573109876543', 'tendero-2');
    view = await useCase.addMember(admin, 'tienda-1', { phone: '310 987 6543' });
    expect(view.members.map((m) => m.userId)).toEqual(['nuevo-1', 'tendero-2']);
    await expect(useCase.addMember(admin, 'tienda-1', { phone: '3109876543' })).rejects.toMatchObject({ code: 'STORE_STAFF_EXISTS' });

    view = await useCase.revokeMember(admin, 'tienda-1', view.members[0].staffId);
    expect(view.members.map((m) => m.userId)).toEqual(['tendero-2']);
  });
});

describe('Portal del comercio (H15.1)', () => {
  const setup = () => {
    const desk = new InMemoryMerchantDesk();
    let kicks = 0;
    const notifier = { kick: () => kicks++ } as unknown as Notifier;
    desk.orders.set('RC-AAAAAA', { establishmentId: 'tienda-1', status: 'AWAITING_MERCHANT' });
    desk.orders.set('RC-BBBBBB', { establishmentId: 'tienda-2', status: 'AWAITING_MERCHANT' });
    return { desk, kicks: () => kicks, useCase: new MerchantPortalUseCase(desk, notifier) };
  };

  it('acepta con su tiempo (en el rango) y avisa enseguida; lo ajeno es 404', async () => {
    const { useCase, kicks } = setup();
    await expect(useCase.accept(merchant, 'rc-aaaaaa', 0)).rejects.toMatchObject({ code: 'PREPARATION_MINUTES_INVALID' });
    expect(await useCase.accept(merchant, 'rc-aaaaaa', 20)).toEqual({ orderCode: 'RC-AAAAAA', status: 'PENDING_ASSIGNMENT' });
    expect(kicks()).toBe(1);
    await expect(useCase.accept(merchant, 'RC-AAAAAA', 20)).rejects.toMatchObject({ code: 'STORE_ORDER_STEP_NOT_ALLOWED', details: { status: 'PENDING_ASSIGNMENT' } });
    await expect(useCase.accept(merchant, 'RC-BBBBBB', 20)).rejects.toMatchObject({ code: 'STORE_ORDER_NOT_FOUND' });
    await expect(useCase.accept(merchant, 'no-es-codigo', 20)).rejects.toMatchObject({ code: 'STORE_ORDER_NOT_FOUND' });
  });

  it('rechaza solo con un motivo del comercio, y "listo" exige haberlo aceptado', async () => {
    const { useCase } = setup();
    await expect(useCase.markReady(merchant, 'RC-AAAAAA')).rejects.toMatchObject({ code: 'STORE_ORDER_STEP_NOT_ALLOWED' });
    await expect(useCase.decline(merchant, 'RC-AAAAAA', { reason: 'OTHER' })).rejects.toMatchObject({ code: 'DECLINE_REASON_INVALID' });
    expect(await useCase.decline(merchant, 'RC-AAAAAA', { reason: 'MERCHANT_TOO_BUSY', notes: '  hoy   no  ' })).toMatchObject({ status: 'CANCELLED' });
  });

  it('el mostrador trae la columna y el tiempo sugerido; un local ajeno es 404; abrir sin menú no se puede', async () => {
    const { useCase } = setup();
    const [first] = await useCase.counter(merchant, 'tienda-1');
    expect(first).toMatchObject({ code: 'RC-AAAAAA', lane: 'INCOMING', suggestedMinutes: 12 });
    await expect(useCase.counter(merchant, 'tienda-2')).rejects.toMatchObject({ code: 'STORE_NOT_FOUND' });
    expect(await useCase.setOpen(merchant, 'tienda-1', false)).toEqual({ establishmentId: 'tienda-1', status: 'TEMPORARILY_CLOSED' });
    await expect(useCase.setOpen(merchant, 'tienda-1', true)).rejects.toMatchObject({ code: 'MENU_EMPTY' });
    expect(code(await useCase.setOpen(merchant, 'tienda-2', true).catch((e) => e))).toBe('STORE_NOT_FOUND');
  });
});
