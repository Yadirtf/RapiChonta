import { Injectable } from '@nestjs/common';
import { CatalogIds } from '../../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { AUTH_FACTORS, OtpChannelCode, OtpPurposeCode } from '../../domain/identity.codes';
import {
  NewAuthAttempt,
  NewOtpChallenge,
  OtpChallenge,
  OtpChallengeRepository,
} from '../../domain/ports/otp-challenge.repository';
import { PhoneNumber } from '../../domain/value-objects/phone-number';

@Injectable()
export class PrismaOtpChallengeRepository extends OtpChallengeRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  async create(challenge: NewOtpChallenge): Promise<void> {
    await this.prisma.otpChallenge.create({
      data: {
        id: challenge.id,
        phoneE164: challenge.phone.e164,
        purposeId: await this.ids.of('otp_purposes', challenge.purpose),
        channelId: await this.ids.of('otp_channels', challenge.channel),
        codeHash: challenge.codeHash ?? null,
        providerMessageId: challenge.providerMessageId ?? null,
        expiresAt: challenge.expiresAt,
        ipAddress: challenge.ipAddress ?? null,
      },
    });
  }

  async findById(id: string): Promise<OtpChallenge | null> {
    const row = await this.prisma.otpChallenge.findUnique({
      where: { id },
      include: { purpose: { select: { code: true } }, channel: { select: { code: true } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      phone: PhoneNumber.fromTrusted(row.phoneE164),
      purpose: row.purpose.code as OtpPurposeCode,
      channel: row.channel.code as OtpChannelCode,
      codeHash: row.codeHash,
      providerMessageId: row.providerMessageId,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
      createdAt: row.createdAt,
    };
  }

  async sentSince(phone: PhoneNumber, since: Date): Promise<Date[]> {
    const rows = await this.prisma.otpChallenge.findMany({
      where: { phoneE164: phone.e164, createdAt: { gte: since } },
      select: { createdAt: true },
    });
    return rows.map((row) => row.createdAt);
  }

  countFailedAttempts(challengeId: string): Promise<number> {
    return this.prisma.authAttempt.count({ where: { otpChallengeId: challengeId, succeeded: false } });
  }

  /** Fallos desde el último acierto dentro de la ventana: un ingreso correcto reinicia la cuenta. */
  async failedPasswordAttemptsSince(userId: string, since: Date): Promise<Date[]> {
    const rows = await this.prisma.authAttempt.findMany({
      where: { userId, attemptedAt: { gte: since }, authFactor: { code: AUTH_FACTORS.PASSWORD } },
      select: { succeeded: true, attemptedAt: true },
      orderBy: { attemptedAt: 'desc' },
    });
    const failures: Date[] = [];
    for (const row of rows) {
      if (row.succeeded) break;
      failures.push(row.attemptedAt);
    }
    return failures;
  }

  async recordAttempt(attempt: NewAuthAttempt): Promise<void> {
    await this.prisma.authAttempt.create({
      data: {
        authFactorId: await this.ids.of('auth_factors', attempt.factor),
        otpChallengeId: attempt.otpChallengeId ?? null,
        userId: attempt.userId ?? null,
        succeeded: attempt.succeeded,
        ipAddress: attempt.ipAddress ?? null,
      },
    });
  }

  async consume(challengeId: string): Promise<boolean> {
    const { count } = await this.prisma.otpChallenge.updateMany({
      where: { id: challengeId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return count === 1;
  }
}
