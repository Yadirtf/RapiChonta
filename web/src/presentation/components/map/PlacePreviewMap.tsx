"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { Home } from "lucide-react";
import { useEffect, useRef } from "react";
import type { GeoPoint } from "@/core/domain/entities/establishment";
import { createBrandMap } from "./mapStyle";

/**
 * Vista quieta del punto de entrega (detalle del pedido): el mismo mapa de la marca, sin gestos, con el
 * pin de la casa en el centro. Es el punto del cliente; el del domiciliario nunca se muestra.
 */
export function PlacePreviewMap({ point, className = "" }: { point: GeoPoint; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = createBrandMap({ container: containerRef.current, center: [point.lng, point.lat], zoom: 16, interactive: false, attributionControl: { compact: true } });
    return () => map.remove();
  }, [point.lat, point.lng]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={containerRef} className="blueprint absolute inset-0" aria-hidden />
      <span className="drop-pin-shadow pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden />
      <span className="pointer-events-none absolute bottom-1/2 left-1/2 mb-3 -translate-x-1/2" aria-hidden>
        <span className="drop-pin">
          <Home className="size-5" strokeWidth={2.6} />
        </span>
      </span>
    </div>
  );
}
