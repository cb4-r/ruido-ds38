import {
  TIPOS_ACTIVIDAD, type Coordenadas, type DatosMedicion, type Instrumento, type Periodo, type TipoMedicion, type Ventana, type Zona,
} from "@ruido-ds38/calc";

/** Estado del formulario: los números se guardan como texto mientras se escriben. */
export interface Formulario {
  clientId: string;
  fuente: { nombre: string; rut: string; direccion: string; comuna: string; zonaIpt: string; tipoActividad: string; coordenadas: Coordenadas | null };
  receptor: {
    numero: string; calle: string; numeroCalle: string; comuna: string; zonaIpt: string;
    certificadoInformacionesPrevias: string; coordenadas: Coordenadas | null;
  };
  condiciones: {
    fecha: string; horaInicio: string; horaTermino: string; descripcionLugar: string; identificacionRuidoFondo: string;
    temperatura: string; humedad: string; viento: string; observaciones: string;
  };
  instrumental: { sonometro: Instrumento; calibrador: Instrumento; verificacionTerreno: boolean };
  zona: Zona | "";
  periodo: Periodo | "";
  tipo: TipoMedicion;
  ventana: Ventana | "";
  /** Tres puntos de tres mediciones; en medición externa solo se usa el primero. */
  puntos: { eq: string; min: string; max: string }[][];
  fondoAfecta: boolean;
  fondo: string[];
  fotos: { descripcion: string; dataUrl: string }[];
}

const instrumentoVacio = (): Instrumento => ({ marca: "", modelo: "", serie: "", certificado: "", fechaCertificado: "" });
const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export const nuevoFormulario = (previo?: Formulario): Formulario => ({
  clientId: crypto.randomUUID(),
  fuente: { nombre: "", rut: "", direccion: "", comuna: "", zonaIpt: "", tipoActividad: TIPOS_ACTIVIDAD[0], coordenadas: null },
  receptor: { numero: "1", calle: "", numeroCalle: "", comuna: "", zonaIpt: "", certificadoInformacionesPrevias: "", coordenadas: null },
  condiciones: {
    fecha: hoy(), horaInicio: "", horaTermino: "", descripcionLugar: "", identificacionRuidoFondo: "",
    temperatura: "", humedad: "", viento: "", observaciones: "",
  },
  // El instrumental se repite entre mediciones: se conserva el último usado.
  instrumental: previo?.instrumental ?? { sonometro: instrumentoVacio(), calibrador: instrumentoVacio(), verificacionTerreno: false },
  zona: "",
  periodo: "",
  tipo: "externa",
  ventana: "",
  puntos: [0, 1, 2].map(() => [0, 1, 2].map(() => ({ eq: "", min: "", max: "" }))),
  fondoAfecta: false,
  fondo: ["", ""],
  fotos: [],
});

/** Acepta coma o punto decimal. */
export const numero = (s: string): number => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
const numeroONulo = (s: string) => (Number.isFinite(numero(s)) ? numero(s) : null);

export function aDatos(f: Formulario): { datos: DatosMedicion | null; faltantes: string[] } {
  const faltantes: string[] = [];
  if (!f.fuente.nombre.trim()) faltantes.push("Nombre de la fuente emisora.");
  if (!f.zona) faltantes.push("Zona DS 38 del receptor.");
  if (!f.periodo) faltantes.push("Periodo de medición.");
  if (f.tipo === "interna" && !f.ventana) faltantes.push("Condición de ventana.");
  if (!f.condiciones.fecha) faltantes.push("Fecha de medición.");

  const puntos = f.tipo === "interna" ? f.puntos : f.puntos.slice(0, 1);
  const mediciones = puntos.flatMap((p, i) => p.map((m) => ({ punto: i + 1, eq: numero(m.eq), min: numero(m.min), max: numero(m.max) })));
  if (mediciones.some((m) => ![m.eq, m.min, m.max].every(Number.isFinite))) {
    faltantes.push(`Completar las ${mediciones.length} mediciones (NPSeq, NPSmín y NPSmáx).`);
  }
  const exigeFondo = f.fondoAfecta || f.zona === "RURAL";
  const fondo = f.fondo.filter((x) => x.trim() !== "").map(numero);
  if (exigeFondo && (fondo.length < 2 || fondo.some((x) => !Number.isFinite(x)))) {
    faltantes.push("Al menos dos registros de ruido de fondo (cada 5 minutos).");
  }
  if (faltantes.length || !f.zona || !f.periodo) return { datos: null, faltantes };

  return {
    faltantes,
    datos: {
      clientId: f.clientId,
      fuente: f.fuente,
      receptor: { ...f.receptor, numero: Number(f.receptor.numero) || 1 },
      condiciones: {
        ...f.condiciones,
        temperatura: numeroONulo(f.condiciones.temperatura),
        humedad: numeroONulo(f.condiciones.humedad),
        viento: numeroONulo(f.condiciones.viento),
      },
      instrumental: f.instrumental,
      evaluacion: {
        zona: f.zona,
        periodo: f.periodo,
        tipo: f.tipo,
        ventana: f.tipo === "interna" ? (f.ventana as Ventana) : undefined,
        mediciones,
        ruidoFondo: exigeFondo ? fondo : undefined,
      },
      fotos: f.fotos,
    },
  };
}

/** Reduce una foto del teléfono a un JPEG de tamaño razonable para el informe. */
export async function reducirFoto(archivo: File, maximo = 1600): Promise<string> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, maximo / Math.max(bitmap.width, bitmap.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bitmap.width * escala);
  lienzo.height = Math.round(bitmap.height * escala);
  lienzo.getContext("2d")!.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  return lienzo.toDataURL("image/jpeg", 0.8);
}

export function obtenerGps(): Promise<Coordenadas> {
  return new Promise((ok, falla) => {
    if (!navigator.geolocation) return falla(new Error("Este dispositivo no entrega ubicación."));
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy ?? null }),
      (e) => falla(new Error(e.code === e.PERMISSION_DENIED ? "Permiso de ubicación denegado." : "No se pudo obtener la ubicación.")),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}
