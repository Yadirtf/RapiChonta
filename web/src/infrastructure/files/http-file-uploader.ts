import type { UploadPurpose } from "@/core/domain/entities/catalog-admin";
import type { FileUploader } from "@/core/domain/repositories/catalog-admin-repository";
import { ApiError, apiRequest, resolveApiAsset } from "../http/api-client";

/** Lado mayor en píxeles: una foto de producto se ve en tarjetas de hasta ~600 px (x2 en pantallas densas). */
const MAX_SIDE: Record<UploadPurpose, number> = { PRODUCT_IMAGE: 1400, ESTABLISHMENT_LOGO: 512, PAYMENT_METHOD_IMAGE: 320, PARTNERSHIP_AGREEMENT: 2000 };
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

type UploadTicket =
  | { fileId: string; alreadyUploaded: true }
  | { fileId: string; alreadyUploaded: false; ticket: string; upload: { url: string; method: string; headers: Record<string, string> } };

/**
 * Subida en tres pasos (H02.3): pedir permiso → enviar los bytes a la URL firmada → confirmar.
 * Antes, la imagen se redibuja en el navegador: queda liviana (WebP), sin metadatos EXIF (ubicación GPS
 * de la cámara) y con un tipo que la API acepta.
 */
export class HttpFileUploader implements FileUploader {
  async uploadImage(file: Blob, purpose: UploadPurpose): Promise<string> {
    if (!file.type.startsWith("image/")) throw new ApiError(400, "FILE_TYPE_NOT_ALLOWED");
    const image = await reencode(file, MAX_SIDE[purpose]);
    const sha256 = await digest(image);
    const ticket = await apiRequest<UploadTicket>("POST", "/files/uploads", {
      body: { purpose, mimeType: image.type, sizeBytes: image.size, sha256 },
    });
    if (ticket.alreadyUploaded) return ticket.fileId;

    let response: Response;
    try {
      response = await fetch(resolveApiAsset(ticket.upload.url)!, { method: ticket.upload.method, headers: ticket.upload.headers, body: image });
    } catch {
      throw new ApiError(0, "NETWORK_ERROR");
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: string } | null;
      throw new ApiError(response.status, body?.code ?? "UPLOAD_INVALID");
    }
    return (await apiRequest<{ fileId: string }>("POST", `/files/uploads/${encodeURIComponent(ticket.ticket)}/complete`)).fileId;
  }
}

async function reencode(file: Blob, maxSide: number): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ApiError(400, "FILE_TYPE_NOT_ALLOWED");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new ApiError(400, "FILE_TYPE_NOT_ALLOWED");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // Safari antiguo no codifica WebP (devuelve PNG): en ese caso, JPEG.
  const webp = await toBlob(canvas, "image/webp", 0.82);
  if (webp?.type === "image/webp") return webp;
  const jpeg = await toBlob(canvas, "image/jpeg", 0.85);
  if (jpeg && ACCEPTED.includes(jpeg.type)) return jpeg;
  throw new ApiError(400, "FILE_TYPE_NOT_ALLOWED");
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

async function digest(blob: Blob): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
