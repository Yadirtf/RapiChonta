import { CookieOptions, Request, Response } from 'express';
import { PLATFORMS } from '../../domain/identity.codes';
import { IssuedSession } from '../../application/services/session-issuer';
import { DeviceDto } from './dto/device.dto';

/**
 * Web: el token de refresco va en una cookie HttpOnly, Secure, SameSite=Strict, limitada a /api/v1/auth
 * (JavaScript no puede leerla). App: va en el cuerpo y la app lo guarda en Keychain/Keystore.
 */
export const REFRESH_COOKIE = 'rc_refresh';
const COOKIE_PATH = '/api/v1/auth';

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: COOKIE_PATH,
});

export const isWebClient = (device?: DeviceDto) => !device || device.platform === PLATFORMS.WEB;

export function readRefreshToken(request: Request, bodyToken?: string): string | undefined {
  return bodyToken ?? (request.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
}

/** Respuesta común de los ingresos: token de acceso siempre en el cuerpo; refresco según el cliente. */
export function sessionResponse(response: Response, session: IssuedSession, web: boolean) {
  if (web) {
    response.cookie(REFRESH_COOKIE, session.refreshToken, { ...cookieOptions(), expires: session.refreshTokenExpiresAt });
  }
  return {
    accessToken: session.accessToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    ...(web ? {} : { refreshToken: session.refreshToken, refreshTokenExpiresAt: session.refreshTokenExpiresAt }),
  };
}

export function clearRefreshCookie(response: Response): void {
  response.clearCookie(REFRESH_COOKIE, cookieOptions());
}
