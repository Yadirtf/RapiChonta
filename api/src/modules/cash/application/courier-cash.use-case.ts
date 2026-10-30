import { Injectable } from '@nestjs/common';
import { Principal } from '../../identity/domain/principal';
import { CashErrors } from '../domain/cash.errors';
import { CashBoxReader } from '../domain/ports/cash-boxes';
import { parseBusinessDate } from '../domain/settlement';

/**
 * H11.4: el domiciliario ve su caja (la de hoy, o la de un día anterior). Solo la suya: la caja se busca por quien
 * pregunta, nunca por un id que llegue de la app.
 */
@Injectable()
export class CourierCashUseCase {
  constructor(private readonly reader: CashBoxReader) {}

  async mine(principal: Principal, rawDate?: string) {
    const day = await this.reader.courierDay(principal.userId);
    if (!day) throw CashErrors.courierNotFound();
    const date = rawDate === undefined ? day.today : parseBusinessDate(rawDate);
    if (!date || date > day.today) throw CashErrors.dateInvalid();
    const boxId = await this.reader.boxOn(principal.userId, date);
    return { day, date, box: boxId ? await this.reader.detail(boxId) : null };
  }
}
