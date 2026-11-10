import type { Resultado } from "@ruido-ds38/calc";

const ESTADO = {
  NO_SUPERA: { texto: "No supera", clase: "ok" },
  SUPERA: { texto: "Supera", clase: "mal" },
  NULA_NO_CONCLUYENTE: { texto: "No concluyente", clase: "aviso" },
} as const;

export function PasoAPaso({ r }: { r: Resultado }) {
  const e = ESTADO[r.estado];
  return (
    <div className="resultado">
      <div className={`veredicto ${e.clase}`}>
        <div>
          <span className="etiqueta">NPC</span>
          <strong>{r.npc === null ? `Nulo (${r.nivelSinFondo})` : r.npc} dBA</strong>
        </div>
        <div>
          <span className="etiqueta">Límite</span>
          <strong>{r.limite} dBA</strong>
        </div>
        <div>
          <span className="etiqueta">Estado</span>
          <strong>{e.texto}</strong>
        </div>
      </div>
      {r.advertencias.map((a) => (
        <p key={a} className="alerta aviso">{a}</p>
      ))}
      <ol className="pasos">
        {r.pasos.map((p, i) => (
          <li key={i}>
            <div className="paso-titulo">
              {p.titulo} <span className="articulo">Art. {p.articulo}</span>
            </div>
            <div className="paso-detalle">{p.detalle}</div>
          </li>
        ))}
      </ol>
      <p className="nota">Reglas: {r.reglas.id}, versión {r.reglas.version}.</p>
    </div>
  );
}
