import Image from "next/image";
import emblem from "@/assets/brand/emblem.webp";
import mark from "@/assets/brand/mark.webp";

/*
 * Marca de RapiChonta: la chonta domiciliaria en moto, con su gorra del Putumayo. Los archivos salen de
 * Docs/marca/logo-original.jpeg con Docs/marca/generar_marca.py (los mismos que usa la app en app/assets/brand).
 * Ya vienen comprimidos y a su tamaño, así que no pasan por el optimizador de imágenes del servidor.
 */

/** Emblema completo (insignia con el nombre). Se lee bien desde ~64 px de ancho; por debajo, usar LogoMark. */
export function LogoEmblem({ className = "w-32", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src={emblem}
      alt="RapiChonta"
      priority={priority}
      unoptimized
      className={`h-auto drop-shadow-[0_10px_22px_rgb(0_0_0/0.45)] ${className}`}
    />
  );
}

/** Marca pequeña: la cara de la mascota en su medallón crema (favicon, encabezados, barras). */
export function LogoMark({ className = "size-10" }: { className?: string }) {
  return <Image src={mark} alt="" aria-hidden unoptimized className={`shrink-0 rounded-full ${className}`} />;
}

export function Logo({ compact = false, tone = "light" }: { compact?: boolean; tone?: "light" | "dark" }) {
  return (
    <span className="inline-flex items-center gap-2" role={compact ? "img" : undefined} aria-label={compact ? "RapiChonta" : undefined}>
      <LogoMark className={`size-10 ${tone === "light" ? "ring-1 ring-white/15" : "shadow-sm ring-1 ring-ink/10"}`} />
      {!compact && (
        <span className={`font-display text-xl font-extrabold tracking-tight ${tone === "light" ? "text-white" : "text-ink"}`}>
          Rapi<span className={tone === "light" ? "text-chonta" : "text-chonta-strong"}>Chonta</span>
        </span>
      )}
    </span>
  );
}
