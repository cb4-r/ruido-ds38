import ds38v1 from "../rules/ds38-2011.v1.json" with { type: "json" };
import type { Reglas } from "./tipos.js";

export * from "./tipos.js";
export { evaluar, validar, EntradaInvalida } from "./calc.js";

/** Conjuntos de reglas disponibles, por "id@version". Un informe guarda cuál usó. */
export const REGLAS: Record<string, Reglas> = {
  "ds38-2011@1": ds38v1 as Reglas,
};
export const REGLAS_VIGENTES = "ds38-2011@1";
export * from "./datos.js";
export { latLonAUtm, type Utm } from "./utm.js";
