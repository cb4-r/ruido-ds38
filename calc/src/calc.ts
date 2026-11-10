import type { EntradaReceptor, Paso, Reglas, Resultado, ValorMedicion } from "./tipos.js";

export class EntradaInvalida extends Error {
  constructor(public readonly errores: string[]) {
    super(errores.join(" "));
    this.name = "EntradaInvalida";
  }
}

// Los niveles llegan con un decimal; se opera en décimas enteras para que el
// redondeo del art. 18 b) no dependa de errores de punto flotante.
const aDecimas = (x: number) => Math.round(x * 10);
const fmt = (x: number) => x.toFixed(1).replace(".", ",");

/** Redondeo a entero: decimal menor a 5 baja, mayor o igual a 5 sube (art. 18 b). */
function redondearCociente(numerador: number, denominador: number): number {
  return Math.floor((2 * numerador + denominador) / (2 * denominador));
}

export function validar(entrada: EntradaReceptor, reglas: Reglas): string[] {
  const errores: string[] = [];
  const { medicionesPorPunto, puntos } = reglas.procedimiento;
  const puntosEsperados = puntos[entrada.tipo];

  const porPunto = new Map<number, number>();
  for (const m of entrada.mediciones) porPunto.set(m.punto, (porPunto.get(m.punto) ?? 0) + 1);

  if (porPunto.size !== puntosEsperados) {
    errores.push(`Una medición ${entrada.tipo} requiere ${puntosEsperados} punto(s); se recibieron ${porPunto.size}.`);
  }
  for (const [punto, n] of porPunto) {
    if (n !== medicionesPorPunto) {
      errores.push(`El punto ${punto} requiere ${medicionesPorPunto} mediciones válidas; tiene ${n}.`);
    }
  }
  entrada.mediciones.forEach((m, i) => {
    if (![m.eq, m.min, m.max].every(Number.isFinite)) {
      errores.push(`La medición ${i + 1} tiene valores no numéricos.`);
    } else if (m.eq < m.min || m.eq > m.max) {
      errores.push(`La medición ${i + 1} tiene NPSeq (${fmt(m.eq)}) fuera del rango NPSmín–NPSmáx (${fmt(m.min)}–${fmt(m.max)}).`);
    }
  });

  if (entrada.tipo === "interna" && !entrada.ventana) {
    errores.push("En mediciones internas hay que indicar si la ventana estaba abierta o cerrada.");
  }

  const fondo = entrada.ruidoFondo;
  if (entrada.zona === "RURAL" && !fondo?.length) {
    errores.push("En zona rural el ruido de fondo es obligatorio, porque define el límite.");
  }
  if (fondo?.length) {
    const { minRegistros, maxRegistros } = reglas.ruidoFondo;
    if (fondo.length < minRegistros || fondo.length > maxRegistros) {
      errores.push(`El ruido de fondo requiere entre ${minRegistros} y ${maxRegistros} registros de 5 minutos; se recibieron ${fondo.length}.`);
    }
    if (!fondo.every(Number.isFinite)) errores.push("El ruido de fondo tiene valores no numéricos.");
  }
  return errores;
}

export function evaluar(entrada: EntradaReceptor, reglas: Reglas): Resultado {
  const errores = validar(entrada, reglas);
  if (errores.length) throw new EntradaInvalida(errores);

  const art = reglas.procedimiento.articulos;
  const pasos: Paso[] = [];
  const advertencias: string[] = [];

  // Art. 18 a): mayor entre NPSeq y NPSmáx − 5, por medición.
  const resta = reglas.procedimiento.restaNpsMax;
  const valores: ValorMedicion[] = entrada.mediciones.map((m) => {
    const maxMenosResta = (aDecimas(m.max) - resta * 10) / 10;
    return { ...m, maxMenosResta, elegido: Math.max(m.eq, maxMenosResta) };
  });
  pasos.push({
    titulo: `Mayor entre NPSeq y NPSmáx − ${resta}, por medición`,
    articulo: art.valor,
    detalle: valores
      .map((v) => `P${v.punto}: máx(${fmt(v.eq)}; ${fmt(v.max)} − ${resta} = ${fmt(v.maxMenosResta)}) = ${fmt(v.elegido)}`)
      .join(" · "),
  });

  // Art. 18 a) y b): promedio aritmético de todos los valores, a entero.
  const suma = valores.reduce((s, v) => s + aDecimas(v.elegido), 0);
  const n = valores.length;
  const promedio = suma / (10 * n);
  const promedioRedondeado = redondearCociente(suma, 10 * n);
  pasos.push({
    titulo: "Promedio aritmético, redondeado a entero",
    articulo: `${art.valor} y ${art.redondeo}`,
    detalle: `(${valores.map((v) => fmt(v.elegido)).join(" + ")}) / ${n} = ${promedio.toFixed(2).replace(".", ",")} → ${promedioRedondeado} dB(A)`,
  });

  // Art. 18 c): corrección por ventana, solo en mediciones internas.
  const correccionVentana = entrada.tipo === "interna" ? reglas.correccionVentana[entrada.ventana!] : 0;
  const nivelSinFondo = promedioRedondeado + correccionVentana;
  pasos.push({
    titulo: "Corrección por ventana, puerta o vano",
    articulo: reglas.correccionVentana.articulo,
    detalle:
      entrada.tipo === "interna"
        ? `Medición interna con ventana ${entrada.ventana}: ${promedioRedondeado} + ${correccionVentana} = ${nivelSinFondo} dB(A)`
        : "Medición externa: no aplica (0 dB(A)).",
  });

  // Art. 19: ruido de fondo.
  let ruidoFondo: Resultado["ruidoFondo"] = null;
  let medicionNula = false;
  let npc: number | null = nivelSinFondo;

  if (entrada.ruidoFondo?.length) {
    const registros = entrada.ruidoFondo;
    const ultimo = registros[registros.length - 1]!;
    const penultimo = registros[registros.length - 2]!;
    const estabilizado =
      Math.abs(aDecimas(ultimo) - aDecimas(penultimo)) <= reglas.ruidoFondo.estabilizacionMaxDif * 10;
    if (!estabilizado) {
      advertencias.push(
        `El ruido de fondo no se estabilizó: los dos últimos registros difieren en más de ${reglas.ruidoFondo.estabilizacionMaxDif} dB(A) (art. ${reglas.ruidoFondo.articulo}).`,
      );
    }
    const redondeado = redondearCociente(aDecimas(ultimo), 10);
    const corregido = redondeado + correccionVentana;
    const diferencia = nivelSinFondo - corregido;
    const tramo = reglas.correccionFondo.tramos.find((t) => diferencia >= t.diferenciaMin);
    medicionNula = diferencia < reglas.correccionFondo.nulaBajo || !tramo;
    const correccion = medicionNula ? null : tramo!.correccion;
    npc = correccion === null ? null : nivelSinFondo + correccion;
    ruidoFondo = { ultimoRegistro: ultimo, redondeado, corregido, estabilizado, diferencia, correccion };
    pasos.push({
      titulo: "Ruido de fondo",
      articulo: `${art.fondo} b) a d)`,
      detalle:
        `Registros: ${registros.map(fmt).join("; ")}. Último registro ${fmt(ultimo)} → ${redondeado} dB(A)` +
        (correccionVentana ? `; con corrección de ventana: ${corregido} dB(A).` : "."),
    });
    pasos.push({
      titulo: "Corrección por ruido de fondo",
      articulo: reglas.correccionFondo.articulo,
      detalle: medicionNula
        ? `Diferencia ${nivelSinFondo} − ${corregido} = ${diferencia} dB(A), menor a ${reglas.correccionFondo.nulaBajo}: medición nula.`
        : `Diferencia ${nivelSinFondo} − ${corregido} = ${diferencia} dB(A) → corrección ${correccion} → NPC = ${npc} dB(A)`,
    });
  } else {
    pasos.push({
      titulo: "Corrección por ruido de fondo",
      articulo: reglas.correccionFondo.articulo,
      detalle: `Se declaró que el ruido de fondo no afecta la medición: sin corrección. NPC = ${npc} dB(A)`,
    });
  }

  // Arts. 7 y 9: límite según zona y periodo del receptor.
  let limite: number;
  if (entrada.zona === "RURAL") {
    const tope = reglas.limites[reglas.rural.zonaTope][entrada.periodo];
    const porFondo = ruidoFondo!.corregido + reglas.rural.sumaAlFondo;
    limite = Math.min(porFondo, tope);
    pasos.push({
      titulo: "Límite en zona rural",
      articulo: reglas.rural.articulo,
      detalle: `Menor entre fondo + ${reglas.rural.sumaAlFondo} = ${porFondo} y Zona ${reglas.rural.zonaTope} ${entrada.periodo} = ${tope}: ${limite} dB(A)`,
    });
  } else {
    limite = reglas.limites[entrada.zona][entrada.periodo];
    pasos.push({
      titulo: "Límite",
      articulo: reglas.limites.articulo,
      detalle: `Zona ${entrada.zona}, periodo ${entrada.periodo}: ${limite} dB(A)`,
    });
  }

  // Art. 7 ("no podrán exceder") y art. 19 f) para medición nula.
  let estado: Resultado["estado"];
  if (medicionNula) {
    estado = nivelSinFondo <= limite ? "NO_SUPERA" : "NULA_NO_CONCLUYENTE";
    pasos.push({
      titulo: "Evaluación con medición nula",
      articulo: `${art.fondo} f)`,
      detalle:
        estado === "NO_SUPERA"
          ? `El nivel sin corregir por fondo (${nivelSinFondo}) no excede el límite (${limite}): la fuente cumple aunque la medición sea nula.`
          : `El nivel sin corregir por fondo (${nivelSinFondo}) excede el límite (${limite}): no se puede concluir; hay que medir con menor ruido de fondo.`,
    });
  } else {
    estado = npc! <= limite ? "NO_SUPERA" : "SUPERA";
    pasos.push({
      titulo: "Evaluación",
      articulo: "7",
      detalle: `NPC ${npc} ${npc! <= limite ? "≤" : ">"} límite ${limite} dB(A): ${estado === "SUPERA" ? "supera" : "no supera"}.`,
    });
  }

  return {
    reglas: { id: reglas.id, version: reglas.version },
    valores,
    promedio,
    promedioRedondeado,
    correccionVentana,
    nivelSinFondo,
    ruidoFondo,
    medicionNula,
    npc,
    limite,
    estado,
    pasos,
    advertencias,
  };
}
