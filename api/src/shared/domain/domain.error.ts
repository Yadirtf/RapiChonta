/** Error de regla de negocio. La capa de presentación lo traduce a un 4xx. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
