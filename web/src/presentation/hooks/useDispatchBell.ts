"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "rc_dispatch_bell";
const HEARD_KEY = "rc_dispatch_heard";

type Chime = "new" | "returned";

/**
 * La campana de la tienda del barrio (H07.1). Se sintetiza con Web Audio (sin archivos): dos notas
 * brillantes para un pedido nuevo y tres más graves y seguidas para uno que volvió sin domiciliario.
 * El navegador solo deja sonar después de un clic, así que el operador la activa una vez (se recuerda).
 * Lo que ya sonó se guarda en la sesión del navegador: recargar la página no repite la alerta.
 */
export function useDispatchBell() {
  const [enabled, setEnabled] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const heard = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      setEnabled(window.localStorage.getItem(STORAGE_KEY) === "on");
      heard.current = new Set(JSON.parse(window.sessionStorage.getItem(HEARD_KEY) ?? "[]") as string[]);
    } catch {
      // Sin almacenamiento: empieza apagada y sin memoria.
    }
  }, []);

  const audio = useCallback(() => {
    if (!context.current) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context.current = new Ctor();
    }
    if (context.current.state === "suspended") void context.current.resume();
    return context.current;
  }, []);

  const ring = useCallback(
    (chime: Chime) => {
      const ctx = audio();
      if (!ctx) return;
      const notes = chime === "new" ? [1318.5, 1046.5] : [784, 659.3, 523.3];
      const gap = chime === "new" ? 0.16 : 0.13;
      notes.forEach((frequency, index) => {
        const start = ctx.currentTime + index * gap;
        // Campana: fundamental + un parcial inarmónico que se apaga rápido.
        for (const [ratio, level] of [
          [1, 0.32],
          [2.76, 0.08],
        ] as const) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = frequency * ratio;
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(level, start + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + (ratio === 1 ? 0.9 : 0.35));
          osc.connect(gain).connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 1);
        }
      });
    },
    [audio],
  );

  const toggle = useCallback(() => {
    setEnabled((on) => {
      const next = !on;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
      } catch {
        // Se recuerda solo mientras la página esté abierta.
      }
      if (next) ring("new");
      return next;
    });
  }, [ring]);

  /** Suena una vez por cada clave nueva (pedido nuevo o regreso al panel). Devuelve las claves que sonaron. */
  const announce = useCallback(
    (alerts: { key: string; chime: Chime }[]) => {
      const fresh = alerts.filter((a) => !heard.current.has(a.key));
      if (!fresh.length) return [];
      fresh.forEach((a) => heard.current.add(a.key));
      try {
        window.sessionStorage.setItem(HEARD_KEY, JSON.stringify([...heard.current].slice(-300)));
      } catch {
        // Sin almacenamiento: al recargar puede volver a sonar.
      }
      if (enabled) ring(fresh.some((a) => a.chime === "returned") ? "returned" : "new");
      return fresh.map((a) => a.key);
    },
    [enabled, ring],
  );

  return { enabled, toggle, announce };
}
