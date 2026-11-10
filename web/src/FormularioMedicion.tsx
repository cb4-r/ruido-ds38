import {
  EntradaInvalida, REGLAS, REGLAS_VIGENTES, TIPOS_ACTIVIDAD, certificadoVigente, evaluar, latLonAUtm,
  type Coordenadas, type DatosMedicion, type Instrumento, type Resultado,
} from "@ruido-ds38/calc";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { guardarBorrador } from "./cola";
import { aDatos, obtenerGps, reducirFoto, type Formulario } from "./modelo";
import { PasoAPaso } from "./PasoAPaso";

const Campo = ({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: string }) => (
  <label className="campo">
    <span>{etiqueta}</span>
    {children}
    {ayuda && <small>{ayuda}</small>}
  </label>
);

/** Como Campo, pero sin <label>: un label que envuelve varios botones activa siempre el primero. */
const Grupo = ({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: string }) => (
  <div className="campo">
    <span>{etiqueta}</span>
    {children}
    {ayuda && <small>{ayuda}</small>}
  </div>
);

const Opciones = <T extends string>({ valor, opciones, onChange, nombre }: {
  valor: T | ""; opciones: [T, string][]; onChange: (v: T) => void; nombre: string;
}) => (
  <div className="opciones" role="radiogroup" aria-label={nombre}>
    {opciones.map(([v, texto]) => (
      <button type="button" key={v} role="radio" aria-checked={valor === v} className={valor === v ? "activa" : ""} onClick={() => onChange(v)}>
        {texto}
      </button>
    ))}
  </div>
);

function Gps({ valor, onChange, nombre }: { valor: Coordenadas | null; onChange: (c: Coordenadas) => void; nombre: string }) {
  const [estado, setEstado] = useState<"" | "buscando" | string>("");
  const utm = valor && latLonAUtm(valor.lat, valor.lon);
  return (
    <div className="gps">
      <button
        type="button"
        className="secundario"
        disabled={estado === "buscando"}
        onClick={async () => {
          setEstado("buscando");
          try {
            onChange(await obtenerGps());
            setEstado("");
          } catch (e) {
            setEstado((e as Error).message);
          }
        }}
      >
        {estado === "buscando" ? "Obteniendo ubicación…" : valor ? `Actualizar GPS ${nombre}` : `Tomar GPS ${nombre}`}
      </button>
      {utm && valor && (
        <small>
          N {utm.norte.toLocaleString("es-CL")} · E {utm.este.toLocaleString("es-CL")} · Huso {utm.huso} {utm.banda}
          {valor.precision !== null && ` · ±${Math.round(valor.precision)} m`}
        </small>
      )}
      {estado && estado !== "buscando" && <small className="error">{estado}</small>}
    </div>
  );
}

function CamposInstrumento({ titulo, valor, onChange, fechaMedicion }: {
  titulo: string; valor: Instrumento; onChange: (i: Instrumento) => void; fechaMedicion: string;
}) {
  const set = (k: keyof Instrumento) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...valor, [k]: e.target.value });
  const vencido = valor.fechaCertificado && fechaMedicion && !certificadoVigente(valor.fechaCertificado, fechaMedicion);
  return (
    <fieldset>
      <legend>{titulo}</legend>
      <div className="fila">
        <Campo etiqueta="Marca"><input value={valor.marca} onChange={set("marca")} /></Campo>
        <Campo etiqueta="Modelo"><input value={valor.modelo} onChange={set("modelo")} /></Campo>
      </div>
      <Campo etiqueta="N° de serie"><input value={valor.serie} onChange={set("serie")} /></Campo>
      <div className="fila">
        <Campo etiqueta="N° certificado de calibración"><input value={valor.certificado} onChange={set("certificado")} /></Campo>
        <Campo etiqueta="Fecha de emisión"><input type="date" value={valor.fechaCertificado} onChange={set("fechaCertificado")} /></Campo>
      </div>
      {vencido && <p className="alerta mal">Certificado no vigente a la fecha de medición (dura 2 años). No se podrá emitir el informe.</p>}
    </fieldset>
  );
}

export function FormularioMedicion({ f, setF, onEnviar, onCancelar }: {
  f: Formulario; setF: (f: Formulario) => void; onEnviar: (d: DatosMedicion) => void; onCancelar: () => void;
}) {
  const [intentado, setIntentado] = useState(false);
  useEffect(() => void guardarBorrador(f), [f]);

  const { datos, faltantes } = useMemo(() => aDatos(f), [f]);
  const calculo = useMemo((): { r?: Resultado; errores: string[] } => {
    if (!datos) return { errores: [] };
    try {
      return { r: evaluar(datos.evaluacion, REGLAS[REGLAS_VIGENTES]!), errores: [] };
    } catch (e) {
      return { errores: e instanceof EntradaInvalida ? e.errores : [(e as Error).message] };
    }
  }, [datos]);

  const up = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setF({ ...f, [k]: v });
  const sub = <K extends "fuente" | "receptor" | "condiciones">(k: K, campo: keyof Formulario[K]) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: { ...f[k], [campo]: e.target.value } });
  const setMedicion = (p: number, m: number, campo: "eq" | "min" | "max", valor: string) =>
    up("puntos", f.puntos.map((punto, i) => (i !== p ? punto : punto.map((x, j) => (j !== m ? x : { ...x, [campo]: valor })))));

  const nPuntos = f.tipo === "interna" ? 3 : 1;
  const exigeFondo = f.fondoAfecta || f.zona === "RURAL";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setIntentado(true);
        if (datos && calculo.r) onEnviar(datos);
      }}
    >
      <section>
        <h2>1. Fuente emisora</h2>
        <Campo etiqueta="Nombre o razón social"><input value={f.fuente.nombre} onChange={sub("fuente", "nombre")} /></Campo>
        <div className="fila">
          <Campo etiqueta="RUT"><input value={f.fuente.rut} onChange={sub("fuente", "rut")} /></Campo>
          <Campo etiqueta="Comuna"><input value={f.fuente.comuna} onChange={sub("fuente", "comuna")} /></Campo>
        </div>
        <Campo etiqueta="Dirección"><input value={f.fuente.direccion} onChange={sub("fuente", "direccion")} /></Campo>
        <div className="fila">
          <Campo etiqueta="Tipo de actividad">
            <select value={f.fuente.tipoActividad} onChange={sub("fuente", "tipoActividad")}>
              {TIPOS_ACTIVIDAD.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Zona según IPT"><input value={f.fuente.zonaIpt} onChange={sub("fuente", "zonaIpt")} /></Campo>
        </div>
        <Gps nombre="de la fuente" valor={f.fuente.coordenadas} onChange={(c) => setF({ ...f, fuente: { ...f.fuente, coordenadas: c } })} />
      </section>

      <section>
        <h2>2. Receptor</h2>
        <div className="fila">
          <Campo etiqueta="Receptor N°"><input inputMode="numeric" value={f.receptor.numero} onChange={sub("receptor", "numero")} /></Campo>
          <Campo etiqueta="Comuna"><input value={f.receptor.comuna} onChange={sub("receptor", "comuna")} /></Campo>
        </div>
        <div className="fila">
          <Campo etiqueta="Calle"><input value={f.receptor.calle} onChange={sub("receptor", "calle")} /></Campo>
          <Campo etiqueta="Número"><input value={f.receptor.numeroCalle} onChange={sub("receptor", "numeroCalle")} /></Campo>
        </div>
        <div className="fila">
          <Campo etiqueta="Zona según IPT"><input value={f.receptor.zonaIpt} onChange={sub("receptor", "zonaIpt")} /></Campo>
          <Campo etiqueta="N° Cert. Informaciones Previas">
            <input value={f.receptor.certificadoInformacionesPrevias} onChange={sub("receptor", "certificadoInformacionesPrevias")} />
          </Campo>
        </div>
        <Grupo etiqueta="Zona DS 38 del receptor" ayuda="Homologada desde el IPT vigente. Define el límite aplicable.">
          <Opciones nombre="Zona DS 38" valor={f.zona} onChange={(v) => up("zona", v)}
            opciones={[["I", "I"], ["II", "II"], ["III", "III"], ["IV", "IV"], ["RURAL", "Rural"]]} />
        </Grupo>
        <Gps nombre="del receptor" valor={f.receptor.coordenadas} onChange={(c) => setF({ ...f, receptor: { ...f.receptor, coordenadas: c } })} />
      </section>

      <section>
        <h2>3. Condiciones de medición</h2>
        <Campo etiqueta="Fecha"><input type="date" value={f.condiciones.fecha} onChange={sub("condiciones", "fecha")} /></Campo>
        <div className="fila">
          <Campo etiqueta="Hora inicio"><input type="time" value={f.condiciones.horaInicio} onChange={sub("condiciones", "horaInicio")} /></Campo>
          <Campo etiqueta="Hora término"><input type="time" value={f.condiciones.horaTermino} onChange={sub("condiciones", "horaTermino")} /></Campo>
        </div>
        <Grupo etiqueta="Periodo">
          <Opciones nombre="Periodo" valor={f.periodo} onChange={(v) => up("periodo", v)}
            opciones={[["diurno", "Diurno (7 a 21 h)"], ["nocturno", "Nocturno (21 a 7 h)"]]} />
        </Grupo>
        <Grupo etiqueta="Lugar de medición">
          <Opciones nombre="Lugar de medición" valor={f.tipo} onChange={(v) => up("tipo", v)}
            opciones={[["externa", "Externa (1 punto)"], ["interna", "Interna (3 puntos)"]]} />
        </Grupo>
        {f.tipo === "interna" && (
          <Grupo etiqueta="Ventana">
            <Opciones nombre="Ventana" valor={f.ventana} onChange={(v) => up("ventana", v)}
              opciones={[["abierta", "Abierta (+5)"], ["cerrada", "Cerrada (+10)"]]} />
          </Grupo>
        )}
        <Campo etiqueta="Descripción del lugar"><input value={f.condiciones.descripcionLugar} onChange={sub("condiciones", "descripcionLugar")} /></Campo>
        {f.tipo === "externa" && (
          <div className="fila tres">
            <Campo etiqueta="Temp. [°C]"><input inputMode="decimal" value={f.condiciones.temperatura} onChange={sub("condiciones", "temperatura")} /></Campo>
            <Campo etiqueta="Humedad [%]"><input inputMode="decimal" value={f.condiciones.humedad} onChange={sub("condiciones", "humedad")} /></Campo>
            <Campo etiqueta="Viento [m/s]"><input inputMode="decimal" value={f.condiciones.viento} onChange={sub("condiciones", "viento")} /></Campo>
          </div>
        )}
      </section>

      <section>
        <h2>4. Instrumental</h2>
        <CamposInstrumento titulo="Sonómetro" valor={f.instrumental.sonometro} fechaMedicion={f.condiciones.fecha}
          onChange={(i) => up("instrumental", { ...f.instrumental, sonometro: i })} />
        <CamposInstrumento titulo="Calibrador acústico" valor={f.instrumental.calibrador} fechaMedicion={f.condiciones.fecha}
          onChange={(i) => up("instrumental", { ...f.instrumental, calibrador: i })} />
        <label className="casilla">
          <input type="checkbox" checked={f.instrumental.verificacionTerreno}
            onChange={(e) => up("instrumental", { ...f.instrumental, verificacionTerreno: e.target.checked })} />
          Verifiqué la calibración en terreno
        </label>
      </section>

      <section>
        <h2>5. Mediciones de la fuente</h2>
        <p className="nota">Tres mediciones de 1 minuto por punto, en dB(A) lento. Descarta y repite las que tengan ruidos ocasionales.</p>
        {Array.from({ length: nPuntos }, (_, p) => (
          <div key={p} className="punto">
            {nPuntos > 1 && <h3>Punto {p + 1}</h3>}
            <div className="grilla cabecera"><span /><span>NPSeq</span><span>NPSmín</span><span>NPSmáx</span></div>
            {f.puntos[p]!.map((m, i) => (
              <div className="grilla" key={i}>
                <span>{i + 1}</span>
                {(["eq", "min", "max"] as const).map((c) => (
                  <input key={c} inputMode="decimal" aria-label={`Punto ${p + 1}, medición ${i + 1}, ${c}`} value={m[c]}
                    onChange={(e) => setMedicion(p, i, c, e.target.value)} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </section>

      <section>
        <h2>6. Ruido de fondo</h2>
        <Campo etiqueta="Identificación del ruido de fondo">
          <input value={f.condiciones.identificacionRuidoFondo} onChange={sub("condiciones", "identificacionRuidoFondo")} placeholder="Ej.: tránsito vehicular" />
        </Campo>
        <label className="casilla">
          <input type="checkbox" checked={exigeFondo} disabled={f.zona === "RURAL"} onChange={(e) => up("fondoAfecta", e.target.checked)} />
          El ruido de fondo afecta la medición
        </label>
        {f.zona === "RURAL" && <p className="nota">En zona rural es obligatorio: define el límite.</p>}
        {exigeFondo && (
          <>
            <p className="nota">NPSeq acumulado cada 5 minutos, hasta que dos registros seguidos difieran en 2 dB(A) o menos. Máximo 30 minutos.</p>
            <div className="fondo">
              {f.fondo.map((x, i) => (
                <label key={i}>
                  <span>{(i + 1) * 5}′</span>
                  <input inputMode="decimal" aria-label={`Fondo a los ${(i + 1) * 5} minutos`} value={x}
                    onChange={(e) => up("fondo", f.fondo.map((y, j) => (j === i ? e.target.value : y)))} />
                </label>
              ))}
            </div>
            {f.fondo.length < 6 && (
              <button type="button" className="secundario" onClick={() => up("fondo", [...f.fondo, ""])}>Agregar registro</button>
            )}
          </>
        )}
        <Campo etiqueta="Observaciones">
          <textarea rows={3} value={f.condiciones.observaciones} onChange={sub("condiciones", "observaciones")} />
        </Campo>
      </section>

      <section>
        <h2>7. Fotografías</h2>
        <label className="boton secundario">
          Agregar foto
          <input type="file" accept="image/*" capture="environment" hidden
            onChange={async (e) => {
              const archivo = e.target.files?.[0];
              e.target.value = "";
              if (archivo) up("fotos", [...f.fotos, { descripcion: "", dataUrl: await reducirFoto(archivo) }]);
            }} />
        </label>
        {f.fotos.map((foto, i) => (
          <div className="foto" key={i}>
            <img src={foto.dataUrl} alt={foto.descripcion || `Foto ${i + 1}`} />
            <input placeholder="Descripción" value={foto.descripcion}
              onChange={(e) => up("fotos", f.fotos.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))} />
            <button type="button" className="enlace" onClick={() => up("fotos", f.fotos.filter((_, j) => j !== i))}>Quitar</button>
          </div>
        ))}
      </section>

      <section>
        <h2>Cálculo preliminar</h2>
        {calculo.r ? <PasoAPaso r={calculo.r} /> : <p className="nota">Completa zona, periodo y mediciones para ver el cálculo.</p>}
        {calculo.errores.map((e) => <p key={e} className="alerta mal">{e}</p>)}
        {intentado && faltantes.length > 0 && (
          <div className="alerta mal">
            Falta completar:
            <ul>{faltantes.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )}
      </section>

      <div className="acciones">
        <button type="button" className="secundario" onClick={onCancelar}>Volver</button>
        <button type="submit">Guardar y enviar</button>
      </div>
    </form>
  );
}
