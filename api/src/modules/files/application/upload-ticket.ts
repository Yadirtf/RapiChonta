/** Lo que un permiso de subida autoriza: un archivo exacto (tamaño, tipo y huella) de un usuario, hasta `exp`. */
export interface UploadTicket {
  fid: string;
  uid: string;
  purpose: string;
  mime: string;
  size: number;
  sha: string;
  exp: number;
}

export const UPLOAD_TICKET_SECONDS = 10 * 60;
