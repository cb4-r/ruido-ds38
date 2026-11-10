import { describe, expect, it } from "vitest";
import acustec2021 from "./casos/casos_acustec_abr2021.json";
import subidos from "./casos/casos_subidos_2025_y_protocolo.json";
import { EntradaInvalida, REGLAS, REGLAS_VIGENTES, evaluar, type EntradaReceptor, type Zona } from "../src/index.js";

const reglas = REGLAS[REGLAS_VIGENTES]!;

const externa = (eq: number, extra: Partial<EntradaReceptor> = {}): EntradaReceptor => ({
  zona: "II",
  periodo: "diurno",
  tipo: "externa",
  mediciones: [1, 2, 3].map(() => ({ punto: 1, eq, min: eq - 2, max: eq + 2 })),
  ...extra,
});

describe("casos reales: informe ETFA Acustec, 22-04-2021", () => {
  for (const c of acustec2021.casos) {
    it(`receptor ${c.receptor}`, () => {
      const r = evaluar(
        {
          zona: c.zona as Zona,
          periodo: "diurno",
          tipo: "externa",
          mediciones: c.mediciones.map((m) => ({ punto: 1, ...m })),
          // El informe da el fondo ya redondeado; se ingresa como dos registros iguales.
          ruidoFondo: c.ruido_fondo === null ? undefined : [c.ruido_fondo, c.ruido_fondo],
        },
        reglas,
      );
      expect(r.promedioRedondeado).toBe(c.esperado.promedio);
      expect(r.limite).toBe(c.esperado.limite);
      expect(r.npc).toBe(c.esperado.npc === "nulo" ? null : c.esperado.npc);
      expect(r.estado).toBe("NO_SUPERA");
    });
  }
});

describe("casos reales: reportes 2025 y ejemplo del protocolo SMA", () => {
  const [interna2025, externa2025, protocolo] = subidos.casos;

  it("Reporte 2025-09: interna, ventana abierta, nocturno, supera", () => {
    const r = evaluar(
      { zona: "II", periodo: "nocturno", tipo: "interna", ventana: "abierta", mediciones: interna2025!.mediciones as never },
      reglas,
    );
    expect(r.promedioRedondeado).toBe(47);
    expect(r.correccionVentana).toBe(5);
    expect(r.npc).toBe(52);
    expect(r.limite).toBe(45);
    expect(r.estado).toBe("SUPERA");
  });

  it("Reporte 2025-11: externa, nocturno, supera", () => {
    const r = evaluar(
      { zona: "III", periodo: "nocturno", tipo: "externa", mediciones: externa2025!.mediciones.map((m) => ({ punto: 1, ...m })) },
      reglas,
    );
    expect(r.npc).toBe(57);
    expect(r.limite).toBe(50);
    expect(r.estado).toBe("SUPERA");
  });

  it("Res. Ex. 867/2016, Tabla 7: fondo 51, NPC 72", () => {
    const r = evaluar(
      {
        zona: "III",
        periodo: "diurno",
        tipo: "externa",
        mediciones: protocolo!.mediciones.map((m) => ({ punto: 1, ...m })),
        ruidoFondo: protocolo!.ruido_fondo_registros,
      },
      reglas,
    );
    expect(r.ruidoFondo?.redondeado).toBe(51);
    expect(r.ruidoFondo?.correccion).toBe(0);
    expect(r.npc).toBe(72);
  });
});

// Sin caso real todavía: se prueban contra el texto del decreto.
describe("casos sintéticos", () => {
  it.each([
    [50, 0],
    [54, -1],
    [51, -1],
    [56, -2],
    [55, -2],
    [57, -3],
  ])("fondo %i con fuente 60 → corrección %i (Tabla N° 3)", (fondo, correccion) => {
    const r = evaluar(externa(60, { ruidoFondo: [fondo, fondo] }), reglas);
    expect(r.ruidoFondo?.correccion).toBe(correccion);
    expect(r.npc).toBe(60 + correccion);
  });

  it("medición nula sobre el límite no concluye (art. 19 f)", () => {
    const r = evaluar(externa(63, { ruidoFondo: [62, 62] }), reglas);
    expect(r.medicionNula).toBe(true);
    expect(r.npc).toBeNull();
    expect(r.estado).toBe("NULA_NO_CONCLUYENTE");
  });

  it("fondo mayor que la fuente es medición nula", () => {
    expect(evaluar(externa(50, { ruidoFondo: [58, 58] }), reglas).medicionNula).toBe(true);
  });

  it("redondeo: ,5 sube y ,4 baja (art. 18 b)", () => {
    const con = (eqs: number[]) =>
      evaluar({ ...externa(0), mediciones: eqs.map((eq) => ({ punto: 1, eq, min: eq, max: eq })) }, reglas).promedioRedondeado;
    expect(con([59.5, 59.5, 59.5])).toBe(60);
    expect(con([59.4, 59.4, 59.4])).toBe(59);
    expect(con([59.4, 59.5, 59.6])).toBe(60);
  });

  it("NPSmáx − 5 gana cuando supera al NPSeq", () => {
    const r = evaluar({ ...externa(0), mediciones: [1, 2, 3].map(() => ({ punto: 1, eq: 50, min: 45, max: 60 })) }, reglas);
    expect(r.promedioRedondeado).toBe(55);
  });

  it("interna con ventana cerrada suma 10 a la fuente y al fondo (arts. 18 c y 19 d)", () => {
    const mediciones = [1, 2, 3].flatMap((punto) => [1, 2, 3].map(() => ({ punto, eq: 40, min: 38, max: 42 })));
    const r = evaluar(
      { zona: "I", periodo: "nocturno", tipo: "interna", ventana: "cerrada", mediciones, ruidoFondo: [35, 35] },
      reglas,
    );
    expect(r.nivelSinFondo).toBe(50);
    expect(r.ruidoFondo?.corregido).toBe(45);
    expect(r.npc).toBe(48);
    expect(r.estado).toBe("SUPERA");
  });

  it("zona rural: límite = fondo + 10 cuando es menor que Zona III (art. 9)", () => {
    const r = evaluar(externa(48, { zona: "RURAL", periodo: "diurno", ruidoFondo: [35, 35] }), reglas);
    expect(r.limite).toBe(45);
    expect(r.estado).toBe("SUPERA");
  });

  it("zona rural: tope de Zona III", () => {
    const r = evaluar(externa(70, { zona: "RURAL", periodo: "nocturno", ruidoFondo: [48, 48] }), reglas);
    expect(r.limite).toBe(50);
  });

  it("advierte si el fondo no se estabilizó", () => {
    const r = evaluar(externa(70, { ruidoFondo: [50, 55] }), reglas);
    expect(r.advertencias).toHaveLength(1);
  });

  it("entrega el paso a paso con artículo", () => {
    const r = evaluar(externa(58), reglas);
    expect(r.pasos.length).toBeGreaterThanOrEqual(5);
    expect(r.pasos.every((p) => p.articulo && p.detalle)).toBe(true);
    expect(r.reglas).toEqual({ id: "ds38-2011", version: "1" });
  });
});

describe("validación de entrada", () => {
  const falla = (e: EntradaReceptor) => {
    try {
      evaluar(e, reglas);
    } catch (err) {
      return (err as EntradaInvalida).errores;
    }
    return [];
  };

  it("exige 3 mediciones por punto", () => {
    const e = externa(60);
    e.mediciones.pop();
    expect(falla(e)).toHaveLength(1);
  });
  it("exige 3 puntos en interna y ventana", () => {
    expect(falla(externa(60, { tipo: "interna" }))).toHaveLength(2);
  });
  it("rechaza NPSeq fuera de NPSmín–NPSmáx", () => {
    const e = externa(60);
    e.mediciones[0] = { punto: 1, eq: 60, min: 61, max: 65 };
    expect(falla(e)).toHaveLength(1);
  });
  it("exige ruido de fondo en zona rural", () => {
    expect(falla(externa(60, { zona: "RURAL" }))).toHaveLength(1);
  });
  it("exige al menos 2 registros de fondo", () => {
    expect(falla(externa(60, { ruidoFondo: [50] }))).toHaveLength(1);
  });
});
