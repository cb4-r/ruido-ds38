import type { DatosMedicion } from "@ruido-ds38/calc";

/** Mediciones de un reporte real de 2025, con datos de identificación ficticios. */
export const ejemplo: DatosMedicion = {
  clientId: "ejemplo-1",
  fuente: {
    nombre: "Local de ejemplo", rut: "", direccion: "Calle Uno 2179", comuna: "Ñuñoa", zonaIpt: "Z-5A",
    tipoActividad: "Actividad de esparcimiento", coordenadas: { lat: -33.4562, lon: -70.6083, precision: 6 },
  },
  receptor: {
    numero: 1, calle: "Calle Dos", numeroCalle: "2172", comuna: "Ñuñoa", zonaIpt: "Z-5A",
    certificadoInformacionesPrevias: "", coordenadas: { lat: -33.4566, lon: -70.6083, precision: 8 },
  },
  condiciones: {
    fecha: "2025-09-05", horaInicio: "23:23", horaTermino: "23:32", descripcionLugar: "Dormitorio.",
    identificacionRuidoFondo: "No se percibe.", temperatura: null, humedad: null, viento: null,
    observaciones: "Durante la medición es perceptible la música envasada de la fuente.",
  },
  instrumental: {
    sonometro: { marca: "Norsonic", modelo: "NOR131", serie: "1312930", certificado: "SON20250066", fechaCertificado: "2025-07-01" },
    calibrador: { marca: "Norsonic", modelo: "1251", serie: "25803", certificado: "CAL20250048", fechaCertificado: "2025-07-01" },
    verificacionTerreno: true,
  },
  evaluacion: {
    zona: "II", periodo: "nocturno", tipo: "interna", ventana: "abierta",
    mediciones: [
      { punto: 1, eq: 46.2, min: 43.0, max: 50.2 }, { punto: 1, eq: 46.3, min: 43.5, max: 49.9 }, { punto: 1, eq: 45.1, min: 39.0, max: 51.5 },
      { punto: 2, eq: 46.6, min: 44.1, max: 49.2 }, { punto: 2, eq: 47.2, min: 44.4, max: 49.7 }, { punto: 2, eq: 46.6, min: 44.6, max: 50.9 },
      { punto: 3, eq: 49.4, min: 45.3, max: 51.6 }, { punto: 3, eq: 47.4, min: 38.8, max: 51.3 }, { punto: 3, eq: 46.7, min: 41.9, max: 51.6 },
    ],
  },
  fotos: [],
};
