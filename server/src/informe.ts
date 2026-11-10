import { latLonAUtm, type Coordenadas, type DatosMedicion, type Instrumento, type Resultado } from "@ruido-ds38/calc";
import { createReport } from "docx-templates";

export interface Branding {
  nombre: string;
  header: string;
  footer: string;
  logo: Buffer | null;
}

export interface DatosInforme {
  numero: string;
  fechaEmision: string;
  firmadoPor: string;
  plantillaVersion: string;
}

const coma = (x: number, decimales = 1) => x.toFixed(decimales).replace(".", ",");
const oGuion = (s: string | number | null | undefined) => (s === null || s === undefined || s === "" ? "—" : String(s));
const fecha = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}-${m}-${a}` : iso;
};

function utm(c: Coordenadas | null): string {
  if (!c) return "—";
  const u = latLonAUtm(c.lat, c.lon);
  return `Norte ${u.norte.toLocaleString("es-CL")} · Este ${u.este.toLocaleString("es-CL")} · Huso ${u.huso} ${u.banda}`;
}

function coordenadas(c: Coordenadas | null): string {
  if (!c) return "—";
  const precision = c.precision === null ? "" : ` (precisión GPS ±${Math.round(c.precision)} m)`;
  return `${utm(c)} · Lat ${c.lat.toFixed(6)}, Lon ${c.lon.toFixed(6)}${precision}`;
}

const instrumento = (i: Instrumento) => `${oGuion(i.marca)} ${i.modelo}, N° serie ${oGuion(i.serie)}`;
const certificado = (i: Instrumento) => `N° ${oGuion(i.certificado)}, emitido el ${i.fechaCertificado ? fecha(i.fechaCertificado) : "—"}`;

const ESTADO = { NO_SUPERA: "No supera", SUPERA: "Supera", NULA_NO_CONCLUYENTE: "No concluyente" } as const;

function conclusion(r: Resultado): string {
  switch (r.estado) {
    case "NO_SUPERA":
      return r.medicionNula
        ? `Medición nula por ruido de fondo. El nivel sin corregir (${r.nivelSinFondo} dBA) no excede el límite de ${r.limite} dBA, por lo que la fuente cumple (art. 19 f).`
        : `El NPC obtenido (${r.npc} dBA) no supera el límite de ${r.limite} dBA aplicable al receptor.`;
    case "SUPERA":
      return `El NPC obtenido (${r.npc} dBA) supera en ${r.npc! - r.limite} dBA el límite de ${r.limite} dBA aplicable al receptor.`;
    case "NULA_NO_CONCLUYENTE":
      return `Medición nula por ruido de fondo y el nivel sin corregir (${r.nivelSinFondo} dBA) excede el límite de ${r.limite} dBA: no es posible concluir. Corresponde medir con menor ruido de fondo (art. 19 f).`;
  }
}

function dimensionesJpeg(buf: Buffer): { ancho: number; alto: number } | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marcador = buf[i + 1]!;
    const largo = buf.readUInt16BE(i + 2);
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { alto: buf.readUInt16BE(i + 5), ancho: buf.readUInt16BE(i + 7) };
    }
    i += 2 + largo;
  }
  return null;
}

function dimensionesPng(buf: Buffer): { ancho: number; alto: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452) return null;
  return { ancho: buf.readUInt32BE(16), alto: buf.readUInt32BE(20) };
}

/** Ajusta una imagen a una caja en centímetros conservando su proporción. */
function ajustar(buf: Buffer, extension: ".png" | ".jpg", maxAncho: number, maxAlto: number) {
  const dim = (extension === ".png" ? dimensionesPng(buf) : dimensionesJpeg(buf)) ?? { ancho: 4, alto: 3 };
  const escala = Math.min(maxAncho / dim.ancho, maxAlto / dim.alto);
  return { width: dim.ancho * escala, height: dim.alto * escala, data: buf, extension };
}

export interface Foto {
  descripcion: string;
  jpeg: Buffer;
}

export async function generarInforme(
  plantilla: Buffer,
  datos: DatosMedicion,
  resultado: Resultado,
  fotos: Foto[],
  branding: Branding,
  informe: DatosInforme,
): Promise<Buffer> {
  const ev = datos.evaluacion;
  const c = datos.condiciones;
  const interna = ev.tipo === "interna";
  const numeroEnPunto = new Map<number, number>();

  const data = {
    empresa: { nombre: branding.nombre, header: branding.header, footer: branding.footer },
    informe: { numero: informe.numero, fechaEmision: fecha(informe.fechaEmision) },
    fuente: {
      nombre: oGuion(datos.fuente.nombre),
      rut: oGuion(datos.fuente.rut),
      direccion: oGuion(datos.fuente.direccion),
      comuna: oGuion(datos.fuente.comuna),
      zonaIpt: oGuion(datos.fuente.zonaIpt),
      tipoActividad: oGuion(datos.fuente.tipoActividad),
      utm: utm(datos.fuente.coordenadas),
      coordenadas: coordenadas(datos.fuente.coordenadas),
    },
    receptor: {
      numero: String(datos.receptor.numero),
      direccion: `${datos.receptor.calle} ${datos.receptor.numeroCalle}`.trim() || "—",
      comuna: oGuion(datos.receptor.comuna),
      zonaIpt: oGuion(datos.receptor.zonaIpt),
      cip: oGuion(datos.receptor.certificadoInformacionesPrevias),
      utm: utm(datos.receptor.coordenadas),
      coordenadas: coordenadas(datos.receptor.coordenadas),
    },
    instrumental: {
      sonometro: instrumento(datos.instrumental.sonometro),
      sonometroCertificado: certificado(datos.instrumental.sonometro),
      calibrador: instrumento(datos.instrumental.calibrador),
      calibradorCertificado: certificado(datos.instrumental.calibrador),
      verificacionTerreno: datos.instrumental.verificacionTerreno ? "Sí" : "No",
    },
    condiciones: {
      fecha: fecha(c.fecha),
      horas: `${oGuion(c.horaInicio)} / ${oGuion(c.horaTermino)}`,
      periodo: ev.periodo === "diurno" ? "Diurno (7:00 a 21:00 h)" : "Nocturno (21:00 a 7:00 h)",
      lugar: interna ? "Medición interna (tres puntos)" : "Medición externa (un punto)",
      descripcionLugar: oGuion(c.descripcionLugar),
      ventana: interna ? (ev.ventana === "abierta" ? "Ventana abierta" : "Ventana cerrada") : "No aplica (medición externa)",
      identificacionRuidoFondo: oGuion(c.identificacionRuidoFondo),
      meteorologia: interna
        ? "No aplica (medición interna)"
        : `${c.temperatura === null ? "—" : coma(c.temperatura)} °C / ${c.humedad === null ? "—" : coma(c.humedad, 0)} % / ${c.viento === null ? "—" : coma(c.viento)} m/s`,
      profesional: informe.firmadoPor,
      observaciones: oGuion(c.observaciones),
    },
    mediciones: resultado.valores.map((v) => {
      const n = (numeroEnPunto.get(v.punto) ?? 0) + 1;
      numeroEnPunto.set(v.punto, n);
      return { punto: String(v.punto), n: String(n), eq: coma(v.eq), min: coma(v.min), max: coma(v.max), maxMenos5: coma(v.maxMenosResta) };
    }),
    fondo: {
      afecta: ev.ruidoFondo?.length ? "Sí" : "No",
      registros: ev.ruidoFondo?.length ? ev.ruidoFondo.map((x) => coma(x)).join(" · ") : "—",
    },
    pasos: resultado.pasos,
    resultado: {
      npc: resultado.npc === null ? `Nulo (${resultado.nivelSinFondo})` : String(resultado.npc),
      fondo: resultado.ruidoFondo ? String(resultado.ruidoFondo.corregido) : "No afecta",
      zona: ev.zona === "RURAL" ? "Rural" : ev.zona,
      periodo: ev.periodo === "diurno" ? "Diurno" : "Nocturno",
      limite: String(resultado.limite),
      estado: ESTADO[resultado.estado],
      conclusion: conclusion(resultado),
      advertencias: resultado.advertencias.length ? `Advertencias: ${resultado.advertencias.join(" ")}` : "",
    },
    fotos: fotos.map((f, indice) => ({ indice, descripcion: f.descripcion || `Fotografía ${indice + 1}` })),
    fotosNota: fotos.length ? "" : "Sin fotografías adjuntas.",
    firma: {
      nombre: informe.firmadoPor,
      fecha: fecha(informe.fechaEmision),
      reglas: `${resultado.reglas.id}, versión ${resultado.reglas.version}`,
      plantilla: informe.plantillaVersion,
    },
  };

  // PNG transparente de 1 px, para cuando la empresa no tiene logo.
  const sinLogo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

  const salida = await createReport({
    template: plantilla,
    data,
    cmdDelimiter: "+++",
    // Los datos ya llegan como texto plano; la plantilla solo inserta y repite.
    failFast: true,
    additionalJsContext: {
      logo: () => (branding.logo ? ajustar(branding.logo, ".png", 5, 1.5) : { width: 0.1, height: 0.1, data: sinLogo, extension: ".png" }),
      foto: (i: number) => ajustar(fotos[i]!.jpeg, ".jpg", 15, 10),
    },
  });
  return Buffer.from(salida);
}
