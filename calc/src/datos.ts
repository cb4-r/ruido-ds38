import type { EntradaReceptor } from "./tipos.js";

/** Datos crudos de terreno para un receptor. Es lo que envía la app y lo que el informe guarda tal cual. */
export interface DatosMedicion {
  /** Identificador generado en el teléfono; evita duplicados al reintentar el envío. */
  clientId: string;
  fuente: {
    nombre: string;
    rut: string;
    direccion: string;
    comuna: string;
    zonaIpt: string;
    tipoActividad: string;
    coordenadas: Coordenadas | null;
  };
  receptor: {
    numero: number;
    calle: string;
    numeroCalle: string;
    comuna: string;
    zonaIpt: string;
    certificadoInformacionesPrevias: string;
    coordenadas: Coordenadas | null;
  };
  condiciones: {
    fecha: string;
    horaInicio: string;
    horaTermino: string;
    descripcionLugar: string;
    identificacionRuidoFondo: string;
    temperatura: number | null;
    humedad: number | null;
    viento: number | null;
    observaciones: string;
  };
  instrumental: {
    sonometro: Instrumento;
    calibrador: Instrumento;
    verificacionTerreno: boolean;
  };
  /** Zona, periodo, tipo, ventana, mediciones y ruido de fondo. */
  evaluacion: EntradaReceptor;
  /** Imágenes como data URL (JPEG), ya reducidas en el teléfono. */
  fotos: { descripcion: string; dataUrl: string }[];
}

export interface Coordenadas {
  lat: number;
  lon: number;
  /** Precisión informada por el GPS, en metros. */
  precision: number | null;
}

export interface Instrumento {
  marca: string;
  modelo: string;
  serie: string;
  certificado: string;
  fechaCertificado: string;
}

export const TIPOS_ACTIVIDAD = [
  "Actividad productiva",
  "Actividad comercial",
  "Actividad de esparcimiento",
  "Actividad de servicio",
  "Infraestructura de transporte",
  "Infraestructura sanitaria",
  "Infraestructura energética",
  "Faena constructiva",
  "Otro",
] as const;

/** Años de vigencia del certificado de calibración (Norma Técnica N° 165/2014 Minsal, citada en Res. Ex. SMA 867/2016). */
export const VIGENCIA_CERTIFICADO_ANIOS = 2;

export function certificadoVigente(fechaCertificado: string, fechaMedicion: string): boolean {
  const emision = new Date(fechaCertificado);
  const medicion = new Date(fechaMedicion);
  if (Number.isNaN(emision.getTime()) || Number.isNaN(medicion.getTime())) return false;
  const vence = new Date(emision);
  vence.setFullYear(vence.getFullYear() + VIGENCIA_CERTIFICADO_ANIOS);
  return medicion >= emision && medicion <= vence;
}
