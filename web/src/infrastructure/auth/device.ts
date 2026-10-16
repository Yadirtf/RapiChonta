/** Instalación del navegador (tabla devices): un UUID que vive en este navegador. */
const KEY = "rc.installationId";

export interface WebDevice {
  installationId: string;
  platform: "WEB";
}

export function currentDevice(): WebDevice {
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
  } catch {
    id = crypto.randomUUID();
  }
  return { installationId: id, platform: "WEB" };
}
