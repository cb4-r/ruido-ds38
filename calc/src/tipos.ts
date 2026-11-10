export type Zona = "I" | "II" | "III" | "IV" | "RURAL";
export type ZonaUrbana = Exclude<Zona, "RURAL">;
export type Periodo = "diurno" | "nocturno";
export type TipoMedicion = "externa" | "interna";
export type Ventana = "abierta" | "cerrada";

/** Una medición de 1 minuto. Niveles en dB(A) lento, con un decimal. */
export interface Medicion {
  punto: number;
  eq: number;
  min: number;
  max: number;
}

export interface EntradaReceptor {
  zona: Zona;
  periodo: Periodo;
  tipo: TipoMedicion;
  /** Obligatoria en mediciones internas. */
  ventana?: Ventana;
  mediciones: Medicion[];
  /** NPSeq registrados cada 5 minutos, en orden. Omitir si el ruido de fondo no afecta. */
  ruidoFondo?: number[];
}

export interface Reglas {
  id: string;
  version: string;
  norma: string;
  procedimiento: {
    tipo: string;
    medicionesPorPunto: number;
    puntos: Record<TipoMedicion, number>;
    restaNpsMax: number;
    articulos: Record<"tecnica" | "valor" | "redondeo" | "ventana" | "fondo", string>;
  };
  limites: { articulo: string } & Record<ZonaUrbana, Record<Periodo, number>>;
  rural: { articulo: string; sumaAlFondo: number; zonaTope: ZonaUrbana };
  correccionVentana: { articulo: string } & Record<Ventana, number>;
  correccionFondo: {
    articulo: string;
    tramos: { diferenciaMin: number; correccion: number }[];
    nulaBajo: number;
  };
  ruidoFondo: { articulo: string; minRegistros: number; maxRegistros: number; estabilizacionMaxDif: number };
}

export interface Paso {
  titulo: string;
  articulo: string;
  detalle: string;
}

export type Estado =
  /** NPC menor o igual al límite. */
  | "NO_SUPERA"
  | "SUPERA"
  /** Medición nula y el nivel sin corregir por fondo excede el límite: hay que volver a medir (art. 19 f). */
  | "NULA_NO_CONCLUYENTE";

export interface ValorMedicion extends Medicion {
  maxMenosResta: number;
  elegido: number;
}

export interface Resultado {
  reglas: { id: string; version: string };
  valores: ValorMedicion[];
  promedio: number;
  promedioRedondeado: number;
  correccionVentana: number;
  /** Promedio redondeado más corrección de ventana; es el nivel antes de corregir por fondo. */
  nivelSinFondo: number;
  ruidoFondo: null | {
    ultimoRegistro: number;
    redondeado: number;
    /** Con corrección de ventana si la medición es interna (art. 19 d). */
    corregido: number;
    estabilizado: boolean;
    diferencia: number;
    correccion: number | null;
  };
  medicionNula: boolean;
  /** null cuando la medición es nula. */
  npc: number | null;
  limite: number;
  estado: Estado;
  pasos: Paso[];
  advertencias: string[];
}
