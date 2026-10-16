import { DomainError } from '../../../../shared/domain/domain.error';
import { PhoneNumber } from './phone-number';

describe('PhoneNumber', () => {
  it.each([
    ['300 123 4567', '+573001234567'],
    ['+57 300-123-4567', '+573001234567'],
    ['+34 612 34 56 78', '+34612345678'],
    ['+1 415 555 2671', '+14155552671'],
  ])('normaliza %s a E.164', (raw, e164) => {
    expect(PhoneNumber.parse(raw).e164).toBe(e164);
  });

  it.each(['12345', 'abc', '601 555 1234', ''])('rechaza %s (inválido o fijo)', (raw) => {
    expect(() => PhoneNumber.parse(raw)).toThrow(DomainError);
  });

  it('enmascara el número sin exponerlo completo', () => {
    expect(PhoneNumber.parse('3001234567').masked).toBe('+57 ••• ••• 4567');
  });
});
