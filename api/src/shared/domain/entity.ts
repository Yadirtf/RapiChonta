/** Clase base para entidades de dominio: se identifican por su id, no por sus atributos. */
export abstract class Entity<TProps> {
  protected constructor(
    public readonly id: string,
    protected readonly props: TProps,
  ) {}

  equals(other?: Entity<TProps>): boolean {
    return !!other && other.id === this.id;
  }
}
