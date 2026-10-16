import { randomUUID } from 'node:crypto';
import { RoleCode, SessionEndReasonCode, UserStatusCode } from '../../src/modules/identity/domain/identity.codes';
import { Account, AccountRepository, NewCustomer } from '../../src/modules/identity/domain/ports/account.repository';
import { IdentitySettings, OtpSettings } from '../../src/modules/identity/domain/ports/identity-settings.port';
import { LegalDocumentVersion, LegalRepository } from '../../src/modules/identity/domain/ports/legal.repository';
import {
  NewAuthAttempt,
  NewOtpChallenge,
  OtpChallenge,
  OtpChallengeRepository,
} from '../../src/modules/identity/domain/ports/otp-challenge.repository';
import { IssuedOtp, IssueOtpRequest, OtpProvider, StoredOtp } from '../../src/modules/identity/domain/ports/otp-provider.port';
import { PasswordHasher } from '../../src/modules/identity/domain/ports/password-hasher.port';
import { RolePermissions } from '../../src/modules/identity/domain/ports/role-permissions.port';
import {
  ActiveSession,
  NewSession,
  SessionRepository,
  StoredRefreshToken,
} from '../../src/modules/identity/domain/ports/session.repository';
import {
  AccessTokenClaims,
  RefreshTokenGenerator,
  RegistrationTicketClaims,
  SignedToken,
  TokenService,
} from '../../src/modules/identity/domain/ports/token.port';
import { PhoneNumber } from '../../src/modules/identity/domain/value-objects/phone-number';

/** Dobles en memoria de los puertos de identity: los casos de uso se prueban sin base de datos. */

export class FakeOtpProvider extends OtpProvider {
  lastCode = '';
  async issue(request: IssueOtpRequest): Promise<IssuedOtp> {
    this.lastCode = '123456';
    return { codeHash: `hash:${request.challengeId}:${this.lastCode}` };
  }
  async verify(otp: StoredOtp, code: string): Promise<boolean> {
    return otp.codeHash === `hash:${otp.challengeId}:${code}`;
  }
}

export class FakeSettings extends IdentitySettings {
  values: OtpSettings = { ttlSeconds: 300, maxAttempts: 5, maxSendsPerHour: 3 };
  async otp(): Promise<OtpSettings> {
    return this.values;
  }
}

export class InMemoryOtpChallenges extends OtpChallengeRepository {
  readonly challenges = new Map<string, OtpChallenge>();
  readonly attempts: (NewAuthAttempt & { at: Date })[] = [];

  async create(c: NewOtpChallenge): Promise<void> {
    this.challenges.set(c.id, {
      id: c.id,
      phone: c.phone,
      purpose: c.purpose,
      channel: c.channel,
      codeHash: c.codeHash ?? null,
      providerMessageId: c.providerMessageId ?? null,
      expiresAt: c.expiresAt,
      consumedAt: null,
      createdAt: new Date(),
    });
  }
  async findById(id: string) {
    return this.challenges.get(id) ?? null;
  }
  async sentSince(phone: PhoneNumber, since: Date) {
    return [...this.challenges.values()].filter((c) => c.phone.equals(phone) && c.createdAt >= since).map((c) => c.createdAt);
  }
  async countFailedAttempts(challengeId: string) {
    return this.attempts.filter((a) => a.otpChallengeId === challengeId && !a.succeeded).length;
  }
  async failedPasswordAttemptsSince(userId: string, since: Date) {
    const failures: Date[] = [];
    for (const a of [...this.attempts].reverse()) {
      if (a.userId !== userId || a.factor !== 'PASSWORD' || a.at < since) continue;
      if (a.succeeded) break;
      failures.push(a.at);
    }
    return failures;
  }
  async recordAttempt(attempt: NewAuthAttempt) {
    this.attempts.push({ ...attempt, at: new Date() });
  }
  async consume(challengeId: string) {
    const c = this.challenges.get(challengeId);
    if (!c || c.consumedAt) return false;
    c.consumedAt = new Date();
    return true;
  }
}

export class InMemoryAccounts extends AccountRepository {
  readonly accounts = new Map<string, Account>();
  readonly statusChanges: { userId: string; to: UserStatusCode }[] = [];

  add(partial: Partial<Account> & { phone?: PhoneNumber | null }): Account {
    const account: Account = {
      userId: randomUUID(),
      personId: randomUUID(),
      givenNames: 'Persona',
      familyNames: null,
      phone: null,
      status: 'ACTIVE',
      canSignIn: true,
      passwordHash: null,
      roles: [{ code: 'CUSTOMER', municipalityId: null, requiresPassword: false }],
      language: 'es',
      ...partial,
    };
    this.accounts.set(account.userId, account);
    return account;
  }
  async findByPhone(phone: PhoneNumber) {
    const account = [...this.accounts.values()].find((a) => a.phone?.equals(phone));
    return account ? { ...account, roles: [...account.roles] } : null;
  }
  async findById(userId: string) {
    const account = this.accounts.get(userId);
    return account ? { ...account, roles: [...account.roles] } : null;
  }
  async registerCustomer(c: NewCustomer) {
    return this.add({ phone: c.phone, givenNames: c.givenNames, familyNames: c.familyNames, language: c.language }).userId;
  }
  async grantSelfAssignableRole(userId: string, role: RoleCode) {
    this.accounts.get(userId)?.roles.push({ code: role, municipalityId: null, requiresPassword: false });
  }
  async markPhoneVerified() {}
  async updateNames(userId: string, givenNames: string, familyNames: string | null) {
    Object.assign(this.accounts.get(userId)!, { givenNames, familyNames });
  }
  async setLanguage(userId: string, language: string) {
    this.accounts.get(userId)!.language = language;
  }
  async replacePrimaryPhone(userId: string, phone: PhoneNumber) {
    this.accounts.get(userId)!.phone = phone;
  }
  async setPasswordHash(userId: string, passwordHash: string) {
    this.accounts.get(userId)!.passwordHash = passwordHash;
  }
  async changeStatus(input: { userId: string; to: UserStatusCode }) {
    this.statusChanges.push(input);
    const account = this.accounts.get(input.userId)!;
    account.status = input.to;
    account.canSignIn = input.to === 'ACTIVE';
  }
  async documentInUse() {
    return false;
  }
  async deletePersonalData(userId: string) {
    this.accounts.get(userId)!.status = 'CLOSED';
  }
}

export class InMemoryLegal extends LegalRepository {
  readonly versions: LegalDocumentVersion[] = [
    { id: randomUUID(), documentType: 'TERMS_OF_SERVICE', versionLabel: 'v1', publishedAt: new Date() },
    { id: randomUUID(), documentType: 'DATA_PROCESSING_POLICY', versionLabel: 'v1', publishedAt: new Date() },
  ];
  readonly accepted = new Map<string, Set<string>>();

  async currentRequiredFor() {
    return this.versions;
  }
  async pendingFor(userId: string) {
    return this.versions.filter((v) => !this.accepted.get(userId)?.has(v.id));
  }
  async accept(userId: string, ids: string[]) {
    const set = this.accepted.get(userId) ?? new Set<string>();
    ids.forEach((id) => set.add(id));
    this.accepted.set(userId, set);
  }
}

export class InMemorySessions extends SessionRepository {
  readonly sessions = new Map<string, { userId: string; role: RoleCode; endedAt: Date | null; endReason?: SessionEndReasonCode }>();
  readonly tokens = new Map<string, { id: string; sessionId: string; expiresAt: Date; consumedAt: Date | null }>();
  canSignIn = true;
  roleStillGranted = true;

  async create(s: NewSession) {
    const id = randomUUID();
    this.sessions.set(id, { userId: s.userId, role: s.role, endedAt: null });
    this.tokens.set(s.refreshTokenHash, { id: randomUUID(), sessionId: id, expiresAt: s.refreshExpiresAt, consumedAt: null });
    return id;
  }
  async findRefreshToken(hash: string): Promise<StoredRefreshToken | null> {
    const t = this.tokens.get(hash);
    if (!t) return null;
    const s = this.sessions.get(t.sessionId)!;
    return { ...t, userId: s.userId, role: s.role, sessionEndedAt: s.endedAt };
  }
  async rotate(input: { tokenId: string; sessionId: string; newHash: string; expiresAt: Date }) {
    const current = [...this.tokens.values()].find((t) => t.id === input.tokenId);
    if (!current || current.consumedAt) return false;
    current.consumedAt = new Date();
    this.tokens.set(input.newHash, { id: randomUUID(), sessionId: input.sessionId, expiresAt: input.expiresAt, consumedAt: null });
    return true;
  }
  async findActive(sessionId: string): Promise<ActiveSession | null> {
    const s = this.sessions.get(sessionId);
    if (!s || s.endedAt) return null;
    return { sessionId, userId: s.userId, role: s.role, canSignIn: this.canSignIn, roleStillGranted: this.roleStillGranted, municipalityId: null };
  }
  async setActiveRole(sessionId: string, role: RoleCode) {
    this.sessions.get(sessionId)!.role = role;
  }
  async end(sessionId: string, reason: SessionEndReasonCode) {
    const s = this.sessions.get(sessionId);
    if (s && !s.endedAt) Object.assign(s, { endedAt: new Date(), endReason: reason });
  }
  async endAllForUser(userId: string, reason: SessionEndReasonCode) {
    for (const [id, s] of this.sessions) if (s.userId === userId) await this.end(id, reason);
  }
}

export class FakeTokens extends TokenService {
  async signAccessToken(claims: AccessTokenClaims): Promise<SignedToken> {
    return { token: `access.${JSON.stringify(claims)}`, expiresAt: new Date(Date.now() + 900_000) };
  }
  async verifyAccessToken(token: string) {
    return token.startsWith('access.') ? (JSON.parse(token.slice(7)) as AccessTokenClaims) : null;
  }
  async signRegistrationTicket(claims: RegistrationTicketClaims): Promise<SignedToken> {
    return { token: `reg.${JSON.stringify(claims)}`, expiresAt: new Date(Date.now() + 900_000) };
  }
  async verifyRegistrationTicket(token: string) {
    return token.startsWith('reg.') ? (JSON.parse(token.slice(4)) as RegistrationTicketClaims) : null;
  }
}

export class FakeRefreshTokens extends RefreshTokenGenerator {
  private n = 0;
  generate() {
    const token = `refresh-${++this.n}`;
    return { token, hash: this.hash(token) };
  }
  hash(token: string) {
    return `h(${token})`;
  }
}

/** Hash de mentira: "hashed:<clave>". */
export class FakeHasher extends PasswordHasher {
  dummyCalls = 0;
  async hash(plain: string) {
    return `hashed:${plain}`;
  }
  async verify(hash: string, plain: string) {
    return hash === `hashed:${plain}`;
  }
  async verifyDummy() {
    this.dummyCalls++;
  }
}

export class FakePermissions extends RolePermissions {
  permissionsOf(role: RoleCode): ReadonlySet<string> {
    const map: Record<RoleCode, string[]> = {
      CUSTOMER: ['account.manage_own', 'orders.create'],
      COURIER: ['account.manage_own', 'offers.respond'],
      OPERATOR: ['account.manage_own', 'orders.assign'],
      ADMIN: ['account.manage_own', 'orders.assign', 'users.manage_staff', 'couriers.manage', 'couriers.verify'],
    };
    return new Set(map[role]);
  }
}
