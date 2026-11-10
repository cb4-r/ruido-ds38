// Cola local: las mediciones se guardan en el teléfono y se envían cuando hay señal.
import type { DatosMedicion } from "@ruido-ds38/calc";
import { del, get, keys, set } from "idb-keyval";
import { ErrorApi, api } from "./api";

const PREFIJO = "cola:";

export interface EnCola {
  datos: DatosMedicion;
  /** Rechazo definitivo del servidor; requiere corregir los datos. */
  error?: string;
}

export const encolar = (datos: DatosMedicion) => set(PREFIJO + datos.clientId, { datos } satisfies EnCola);
export const quitar = (clientId: string) => del(PREFIJO + clientId);

export async function pendientes(): Promise<EnCola[]> {
  const claves = (await keys()).filter((k) => typeof k === "string" && k.startsWith(PREFIJO));
  const items = await Promise.all(claves.map((k) => get<EnCola>(k)));
  return items.filter((x): x is EnCola => !!x);
}

let sincronizando: Promise<number[]> | null = null;

/** Envía lo pendiente. Devuelve los ids creados. Los fallos de red dejan el elemento en cola. */
export function sincronizar(): Promise<number[]> {
  sincronizando ??= (async () => {
    const enviados: number[] = [];
    for (const item of await pendientes()) {
      if (item.error) continue;
      try {
        const { id } = await api.enviar(item.datos);
        await quitar(item.datos.clientId);
        enviados.push(id);
      } catch (e) {
        if (e instanceof ErrorApi && e.status === 401) break;
        if (e instanceof ErrorApi && e.status >= 400 && e.status < 500) {
          await set(PREFIJO + item.datos.clientId, { ...item, error: [e.message, ...e.errores].join(" ") });
        } else break; // sin señal o servidor caído: se reintenta después
      }
    }
    return enviados;
  })().finally(() => (sincronizando = null));
  return sincronizando;
}

const BORRADOR = "borrador";
export const guardarBorrador = (b: unknown) => set(BORRADOR, b);
export const leerBorrador = <T,>() => get<T>(BORRADOR);
export const borrarBorrador = () => del(BORRADOR);
