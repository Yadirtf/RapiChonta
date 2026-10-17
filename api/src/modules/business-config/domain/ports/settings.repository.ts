import { SettingDataTypeCode } from '../business-config.codes';

export interface SettingVersion {
  value: string;
  createdAt: Date;
  /** Nombre de quien lo cambió; null = valor de la semilla. */
  createdBy: string | null;
}

export interface SettingRecord {
  key: string;
  type: SettingDataTypeCode;
  min: string | null;
  max: string | null;
  scoped: boolean;
  /** El valor con que nació el parámetro (la semilla): el "valor por defecto" que muestra el panel. */
  defaultValue: string | null;
  global: SettingVersion | null;
  /** Valor propio del municipio consultado (solo parámetros por municipio). */
  municipal: SettingVersion | null;
}

export interface SettingChange extends SettingVersion {
  municipalityId: number | null;
}

export interface CommissionVersion {
  rate: string;
  createdAt: Date;
  createdBy: string | null;
}

/** Parámetros versionados (setting_values) y comisión versionada (commission_rates). Solo inserción. */
export abstract class SettingsRepository {
  abstract list(municipalityId: number | null): Promise<SettingRecord[]>;
  abstract find(key: string, municipalityId: number | null): Promise<SettingRecord | null>;
  abstract insert(input: { key: string; municipalityId: number | null; value: string; previous: string | null; actorUserId: string }): Promise<void>;
  abstract history(key: string, municipalityId: number | null, limit: number): Promise<SettingChange[]>;

  abstract commissionHistory(municipalityId: number, limit: number): Promise<CommissionVersion[]>;
  abstract insertCommission(input: { municipalityId: number; rate: string; previous: string | null; actorUserId: string }): Promise<void>;
}
