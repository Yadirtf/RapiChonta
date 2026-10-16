import type { Account, LegalDocumentVersion } from "./account";

/** Código enviado por SMS o WhatsApp. */
export interface SentCode {
  challengeId: string;
  expiresAt: string;
  maskedPhone: string;
  /** Solo en entornos de prueba sin proveedor de SMS (OTP_EXPOSE_CODE=true). */
  devCode?: string;
}

export interface AccessToken {
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface SignedIn extends AccessToken {
  status: "SIGNED_IN";
  account: Account;
}

/** Número nuevo: falta el nombre y aceptar los documentos legales. */
export interface RegistrationRequired {
  status: "REGISTRATION_REQUIRED";
  registrationToken: string;
  registrationExpiresAt: string;
  requiredConsents: LegalDocumentVersion[];
}

export type CodeVerification = SignedIn | RegistrationRequired;
