import { Entity } from '../../../../shared/domain/entity';
import { GeoPoint } from '../value-objects/geo-point';

export enum EstablishmentCategory {
  FAST_FOOD = 'FAST_FOOD',
  RESTAURANT = 'RESTAURANT',
  SUPERMARKET = 'SUPERMARKET',
  STORE = 'STORE',
  PHARMACY = 'PHARMACY',
}

export interface EstablishmentProps {
  name: string;
  category: EstablishmentCategory;
  location: GeoPoint;
  address: string;
  isActive: boolean;
  /** En el MVP los comercios no están integrados: RapiChonta compra por el cliente. */
  isPartner: boolean;
  logoUrl?: string;
}

export class Establishment extends Entity<EstablishmentProps> {
  static create(id: string, props: EstablishmentProps): Establishment {
    return new Establishment(id, props);
  }

  get name() { return this.props.name; }
  get category() { return this.props.category; }
  get location() { return this.props.location; }
  get address() { return this.props.address; }
  get isActive() { return this.props.isActive; }
  get isPartner() { return this.props.isPartner; }
  get logoUrl() { return this.props.logoUrl; }
}
