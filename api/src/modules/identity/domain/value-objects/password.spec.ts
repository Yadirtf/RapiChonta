import { Password } from './password';

describe('Password', () => {
  it('acepta una frase de 10 o más caracteres', () => {
    expect(Password.create('Domicilio2026!').value).toBe('Domicilio2026!');
  });

  it.each(['corta', '1234567890', 'aaaaaaaaaaaa', 'contraseña', '98765432109876'])('rechaza %s', (raw) => {
    expect(() => Password.create(raw)).toThrow(expect.objectContaining({ code: 'WEAK_PASSWORD' }));
  });
});
