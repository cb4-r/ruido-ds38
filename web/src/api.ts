import type { DatosMedicion, Resultado } from "@ruido-ds38/calc";

export class ErrorApi extends Error {
  constructor(public status: number, mensaje: string, public errores: string[] = []) {
    super(mensaje);
  }
}

export const sesion = {
  get token() {
    return localStorage.getItem("token");
  },
  set token(t: string | null) {
    if (t) localStorage.setItem("token", t);
    else localStorage.removeItem("token");
  },
};

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const r = await fetch(`/api${ruta}`, {
    ...opciones,
    headers: {
      ...(opciones.body ? { "Content-Type": "application/json" } : {}),
      ...(sesion.token ? { Authorization: `Bearer ${sesion.token}` } : {}),
    },
  });
  if (!r.ok) {
    const cuerpo = await r.json().catch(() => ({}));
    throw new ErrorApi(r.status, cuerpo.error ?? `Error ${r.status}`, cuerpo.errores);
  }
  return r.json();
}

export interface Yo {
  usuario: { nombre: string; email: string };
  empresa: { nombre: string };
}
export interface MedicionResumen {
  id: number;
  creada: string;
  fuente: string;
  receptor: number;
  fecha: string;
  informeId: number | null;
}
export interface MedicionDetalle {
  id: number;
  datos: DatosMedicion;
  nFotos: number;
  resultado: Resultado;
  bloqueos: string[];
  informe: { id: number; firmadoPor: string; firmadoEn: string } | null;
}

export const api = {
  login: (email: string, clave: string) => pedir<{ token: string }>("/login", { method: "POST", body: JSON.stringify({ email, clave }) }),
  yo: () => pedir<Yo>("/yo"),
  mediciones: () => pedir<MedicionResumen[]>("/mediciones"),
  medicion: (id: number) => pedir<MedicionDetalle>(`/mediciones/${id}`),
  enviar: (datos: DatosMedicion) => pedir<{ id: number }>("/mediciones", { method: "POST", body: JSON.stringify(datos) }),
  emitir: (id: number) =>
    pedir<{ informeId: number; numero: string }>(`/mediciones/${id}/informe`, { method: "POST", body: JSON.stringify({ confirmoRevision: true }) }),
  async descargar(informeId: number) {
    const r = await fetch(`/api/informes/${informeId}/docx`, { headers: { Authorization: `Bearer ${sesion.token}` } });
    if (!r.ok) throw new ErrorApi(r.status, "No se pudo descargar el informe.");
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `INF-${String(informeId).padStart(4, "0")}.docx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};
