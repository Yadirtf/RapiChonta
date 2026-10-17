import { Translations } from '../value-objects/localized-text';

export interface AdminCategory {
  id: number;
  code: string;
  icon: string;
  names: Translations<string>;
  sortOrder: number;
  active: boolean;
  establishmentCount: number;
}

export abstract class CategoryRepository {
  abstract list(): Promise<AdminCategory[]>;
  abstract find(id: number): Promise<AdminCategory | null>;
  abstract codeExists(code: string): Promise<boolean>;
  abstract create(input: { code: string; icon: string; names: Translations<string>; actorUserId: string }): Promise<number>;
  abstract update(input: { id: number; icon: string; names: Translations<string>; actorUserId: string }): Promise<void>;
  abstract setActive(input: { id: number; active: boolean; actorUserId: string }): Promise<void>;
  /** Principal de algún local visible en el mapa: darla de baja dejaría el marcador sin ícono. */
  abstract isPrimaryOfVisibleEstablishment(id: number): Promise<boolean>;
  abstract reorder(ids: number[]): Promise<void>;
}
