import type { DatosMedicion } from "@ruido-ds38/calc";
import { useCallback, useEffect, useState } from "react";
import { ErrorApi, api, sesion, type MedicionDetalle, type MedicionResumen, type Yo } from "./api";
import { borrarBorrador, encolar, leerBorrador, pendientes, quitar, sincronizar, type EnCola } from "./cola";
import { FormularioMedicion } from "./FormularioMedicion";
import { nuevoFormulario, type Formulario } from "./modelo";
import { PasoAPaso } from "./PasoAPaso";

type Vista = { tipo: "inicio" } | { tipo: "formulario" } | { tipo: "revision"; id: number };

function useEnLinea() {
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  useEffect(() => {
    const si = () => setEnLinea(true);
    const no = () => setEnLinea(false);
    addEventListener("online", si);
    addEventListener("offline", no);
    return () => (removeEventListener("online", si), removeEventListener("offline", no));
  }, []);
  return enLinea;
}

function Login({ onEntrar }: { onEntrar: () => void }) {
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="login"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          sesion.token = (await api.login(email, clave)).token;
          onEntrar();
        } catch (err) {
          setError(err instanceof ErrorApi ? err.message : "Sin conexión con el servidor.");
        }
      }}
    >
      <h1>Ruido DS 38</h1>
      <p className="nota">Informes de medición de ruido, D.S. 38/2011 MMA</p>
      <label className="campo"><span>Correo</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label className="campo"><span>Clave</span><input type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} required /></label>
      {error && <p className="alerta mal">{error}</p>}
      <button type="submit">Ingresar</button>
    </form>
  );
}

function Revision({ id, yo, onVolver }: { id: number; yo: Yo | null; onVolver: () => void }) {
  const [m, setM] = useState<MedicionDetalle | null>(null);
  const [revisado, setRevisado] = useState(false);
  const [error, setError] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(() => api.medicion(id).then(setM).catch((e) => setError([e.message])), [id]);
  useEffect(() => void cargar(), [cargar]);

  if (!m) return <p className="nota">{error[0] ?? "Cargando…"}</p>;
  return (
    <>
      <section>
        <h2>Revisión del cálculo</h2>
        <p className="nota">
          {m.datos.fuente.nombre} · Receptor N° {m.datos.receptor.numero} · Zona {m.datos.evaluacion.zona === "RURAL" ? "rural" : m.datos.evaluacion.zona} ·{" "}
          {m.datos.evaluacion.periodo} · {m.nFotos} foto(s)
        </p>
        <PasoAPaso r={m.resultado} />
      </section>
      <section>
        <h2>Firma y emisión</h2>
        {m.bloqueos.map((b) => <p key={b} className="alerta mal">{b}</p>)}
        {m.informe ? (
          <>
            <p className="alerta ok">Informe emitido y firmado por {m.informe.firmadoPor}.</p>
            <button onClick={() => api.descargar(m.informe!.id).catch((e) => setError([e.message]))}>Descargar Word</button>
          </>
        ) : (
          <>
            <label className="casilla">
              <input type="checkbox" checked={revisado} onChange={(e) => setRevisado(e.target.checked)} />
              Revisé los datos y el cálculo paso a paso, y firmo este informe como {yo?.usuario.nombre ?? "responsable"}.
            </label>
            <button
              disabled={!revisado || ocupado || m.bloqueos.length > 0}
              onClick={async () => {
                setOcupado(true);
                setError([]);
                try {
                  const { informeId } = await api.emitir(id);
                  await cargar();
                  await api.descargar(informeId);
                } catch (e) {
                  setError(e instanceof ErrorApi ? [e.message, ...e.errores] : ["Sin conexión. Intenta de nuevo cuando tengas señal."]);
                } finally {
                  setOcupado(false);
                }
              }}
            >
              {ocupado ? "Generando…" : "Emitir informe Word"}
            </button>
          </>
        )}
        {error.map((e) => <p key={e} className="alerta mal">{e}</p>)}
      </section>
      <div className="acciones"><button className="secundario" onClick={onVolver}>Volver al inicio</button></div>
    </>
  );
}

export function App() {
  const [conSesion, setConSesion] = useState(!!sesion.token);
  const [yo, setYo] = useState<Yo | null>(null);
  const [vista, setVista] = useState<Vista>({ tipo: "inicio" });
  const [form, setForm] = useState<Formulario | null>(null);
  const [cola, setCola] = useState<EnCola[]>([]);
  const [lista, setLista] = useState<MedicionResumen[]>([]);
  const enLinea = useEnLinea();

  const salir = () => {
    sesion.token = null;
    setConSesion(false);
  };

  const refrescar = useCallback(async () => {
    try {
      await sincronizar();
      setLista(await api.mediciones());
    } catch (e) {
      if (e instanceof ErrorApi && e.status === 401) salir();
    }
    setCola(await pendientes());
  }, []);

  useEffect(() => {
    if (!conSesion) return;
    api.yo().then(setYo).catch((e) => e instanceof ErrorApi && e.status === 401 && salir());
    void refrescar();
  }, [conSesion, enLinea, refrescar]);

  if (!conSesion) return <main><Login onEntrar={() => setConSesion(true)} /></main>;

  const enviar = async (datos: DatosMedicion) => {
    await encolar(datos);
    await borrarBorrador();
    const ultimo = form;
    setForm(null);
    // Se conserva el instrumental para la siguiente medición.
    if (ultimo) localStorage.setItem("instrumental", JSON.stringify(ultimo.instrumental));
    let creados: number[] = [];
    try {
      creados = await sincronizar();
    } catch {
      /* queda en cola */
    }
    await refrescar();
    setVista(creados.length === 1 ? { tipo: "revision", id: creados[0]! } : { tipo: "inicio" });
  };

  const abrirFormulario = async () => {
    const borrador = await leerBorrador<Formulario>();
    const instrumental = localStorage.getItem("instrumental");
    setForm(borrador ?? nuevoFormulario(instrumental ? ({ instrumental: JSON.parse(instrumental) } as Formulario) : undefined));
    setVista({ tipo: "formulario" });
  };

  return (
    <>
      <header className="barra">
        <div>
          <strong>Ruido DS 38</strong>
          <span>{yo ? `${yo.empresa.nombre} · ${yo.usuario.nombre}` : " "}</span>
        </div>
        <button className="enlace claro" onClick={salir}>Salir</button>
      </header>
      {!enLinea && <div className="sin-senal">Sin conexión: las mediciones se guardan en el teléfono y se envían al recuperar señal.</div>}
      <main>
        {vista.tipo === "formulario" && form && (
          <FormularioMedicion f={form} setF={setForm} onEnviar={enviar} onCancelar={() => setVista({ tipo: "inicio" })} />
        )}
        {vista.tipo === "revision" && <Revision id={vista.id} yo={yo} onVolver={() => (void refrescar(), setVista({ tipo: "inicio" }))} />}
        {vista.tipo === "inicio" && (
          <>
            <button className="principal" onClick={abrirFormulario}>Nueva medición</button>
            {cola.length > 0 && (
              <section>
                <h2>Pendientes de envío ({cola.length})</h2>
                {cola.map((c) => (
                  <div className="item" key={c.datos.clientId}>
                    <div>
                      <strong>{c.datos.fuente.nombre}</strong>
                      <span>Receptor N° {c.datos.receptor.numero} · {c.datos.condiciones.fecha}</span>
                      {c.error ? <span className="error">{c.error}</span> : <span>En cola: se enviará al recuperar señal.</span>}
                    </div>
                    {c.error && <button className="enlace" onClick={async () => (await quitar(c.datos.clientId), refrescar())}>Descartar</button>}
                  </div>
                ))}
                <button className="secundario" onClick={refrescar}>Reintentar envío</button>
              </section>
            )}
            <section>
              <h2>Mediciones</h2>
              {lista.length === 0 && <p className="nota">Aún no hay mediciones enviadas.</p>}
              {lista.map((m) => (
                <button className="item" key={m.id} onClick={() => setVista({ tipo: "revision", id: m.id })}>
                  <div>
                    <strong>{m.fuente}</strong>
                    <span>Receptor N° {m.receptor} · {m.fecha}</span>
                  </div>
                  <span className={`chip ${m.informeId ? "ok" : "aviso"}`}>{m.informeId ? "Emitido" : "Por firmar"}</span>
                </button>
              ))}
            </section>
          </>
        )}
      </main>
    </>
  );
}
