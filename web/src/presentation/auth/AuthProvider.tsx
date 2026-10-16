"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Account } from "@/core/domain/entities/account";
import { setLocale } from "@/i18n/actions";
import { isLocale } from "@/i18n/config";
import { webSession } from "@/infrastructure/auth/web-session";
import { container } from "@/infrastructure/di/container";
import { ConsentGate } from "../components/auth/ConsentGate";
import { SignInDialog } from "../components/auth/SignInDialog";

type Status = "loading" | "anonymous" | "authenticated";

interface AuthContextValue {
  status: Status;
  account: Account | null;
  /** Reemplaza la cuenta después de una operación que la devuelve (perfil, consentimientos...). */
  setAccount: (account: Account) => void;
  /** Sesión iniciada desde otra pantalla (panel). */
  signedIn: (account: Account) => void;
  /**
   * Abre el ingreso del cliente y espera a que termine. Devuelve la cuenta, o null si lo cerró.
   * Es lo que usará el checkout: el ingreso se pide solo al confirmar el pedido.
   */
  requestSignIn: () => Promise<Account | null>;
  signOut: () => Promise<void>;
  /** Cambia el idioma de la web y, con sesión, lo guarda en la cuenta (se recuerda en otros dispositivos). */
  changeLanguage: (language: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const locale = useLocale();
  const [status, setStatus] = useState<Status>("loading");
  const [account, setAccountState] = useState<Account | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const pendingSignIn = useRef<((account: Account | null) => void) | null>(null);

  const setAccount = useCallback((next: Account) => {
    setAccountState(next);
    setStatus("authenticated");
  }, []);

  /** El idioma guardado en la cuenta manda sobre el del navegador. */
  const adoptLanguage = useCallback(
    async (next: Account) => {
      if (next.language !== locale && isLocale(next.language)) {
        await setLocale(next.language);
        router.refresh();
      }
    },
    [locale, router],
  );

  const signedIn = useCallback(
    (next: Account) => {
      setAccount(next);
      void adoptLanguage(next);
    },
    [setAccount, adoptLanguage],
  );

  // Al cargar: si hay una sesión previa, se renueva con la cookie y se trae la cuenta.
  useEffect(() => {
    let cancelled = false;
    const end = webSession.onEnd(() => {
      setAccountState(null);
      setStatus("anonymous");
    });
    if (!webSession.hasHint) setStatus("anonymous");
    else
      container.account
        .me()
        .then((me) => !cancelled && signedIn(me))
        // Sin red o sesión vencida: se muestra como invitado; la pista se conserva si el refresco no fue rechazado.
        .catch(() => !cancelled && setStatus("anonymous"));
    return () => {
      cancelled = true;
      end();
    };
    // Solo al montar: signedIn cambia con el idioma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestSignIn = useCallback(() => {
    if (account) return Promise.resolve(account);
    pendingSignIn.current?.(null);
    setSignInOpen(true);
    return new Promise<Account | null>((resolve) => (pendingSignIn.current = resolve));
  }, [account]);

  const finishSignIn = (result: Account | null) => {
    pendingSignIn.current?.(result);
    pendingSignIn.current = null;
  };

  const signOut = useCallback(async () => {
    try {
      await container.auth.signOut();
    } finally {
      setAccountState(null);
      setStatus("anonymous");
    }
  }, []);

  const changeLanguage = useCallback(
    async (language: string) => {
      if (account && account.language !== language) {
        setAccountState(await container.account.setLanguage(language));
      }
      await setLocale(language);
      router.refresh();
    },
    [account, router],
  );

  const value = useMemo(
    () => ({ status, account, setAccount, signedIn, requestSignIn, signOut, changeLanguage }),
    [status, account, setAccount, signedIn, requestSignIn, signOut, changeLanguage],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SignInDialog
        open={signInOpen}
        onClose={() => {
          setSignInOpen(false);
          finishSignIn(null);
        }}
        onSignedIn={(next) => {
          signedIn(next);
          finishSignIn(next);
        }}
      />
      {account && account.pendingConsents.length > 0 && <ConsentGate account={account} onAccepted={setAccount} onSignOut={signOut} />}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return context;
}
