"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Carga datos de un caso de uso y expone `reload`. Ignora respuestas viejas si los parámetros
 * cambiaron mientras tanto (búsqueda mientras se escribe).
 */
export function useResource<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps);

  const reload = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
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
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}

/** Valor que se actualiza solo cuando deja de cambiar durante `ms`. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
