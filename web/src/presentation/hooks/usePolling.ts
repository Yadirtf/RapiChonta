"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Consulta cada `ms` mientras la pestaña está visible (en segundo plano no despierta la base) y vuelve a
 * consultar al regresar. Ignora respuestas viejas y conserva el último dato bueno si una consulta falla.
 */
export function usePolling<T>(loader: () => Promise<T>, deps: unknown[], ms: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  const load = useCallback(loader, deps);

  const refresh = useCallback(async () => {
    const id = ++request.current;
    try {
      const result = await load();
      if (id === request.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (id === request.current) setError(e);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    setLoading(true);
    setData(null);
    void refresh();
    let timer = window.setInterval(() => document.visibilityState === "visible" && void refresh(), ms);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      window.clearInterval(timer);
      void refresh();
      timer = window.setInterval(() => document.visibilityState === "visible" && void refresh(), ms);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, ms]);

  return { data, error, loading, refresh };
}

/** Hora del servidor menos la del navegador: los cronómetros no dependen de un reloj mal puesto. */
export function useServerClock(serverTime: string | null | undefined) {
  const offset = useRef(0);
  useEffect(() => {
    if (serverTime) offset.current = new Date(serverTime).getTime() - Date.now();
  }, [serverTime]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
