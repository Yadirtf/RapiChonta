import { NotFoundError } from '../domain/domain.error';
import { ensureOwnedBy } from './ownership';

describe('ensureOwnedBy (H01.2)', () => {
  it('permite al dueño', () => {
    expect(() => ensureOwnedBy('user-1', 'user-1')).not.toThrow();
  });

  it('responde 404 al pedir un recurso ajeno o inexistente', () => {
    expect(() => ensureOwnedBy('user-2', 'user-1', 'ORDER_NOT_FOUND')).toThrow(NotFoundError);
    expect(() => ensureOwnedBy(undefined, 'user-1')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });
});
