import {
  EntradaInvalida, REGLAS, REGLAS_VIGENTES, certificadoVigente, evaluar,
  type DatosMedicion, type Resultado,
} from "@ruido-ds38/calc";
import type Database from "better-sqlite3";
import express, { type NextFunction, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DIR_ARCHIVOS, DIR_PLANTILLAS, claveCorrecta } from "./db.ts";
import { generarInforme } from "./informe.ts";

interface Sesion {
  usuarioId: number;
  usuarioNombre: string;
  email: string;
  empresaId: number;
  empresaNombre: string;
}

type Autenticada = Request & { sesion: Sesion };

const DIR_WEB = join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");

/** Motivos que impiden emitir un informe aunque el cálculo sea válido. */
function bloqueos(datos: DatosMedicion): string[] {
  const motivos: string[] = [];
  const { sonometro, calibrador } = datos.instrumental;
  if (!certificadoVigente(sonometro.fechaCertificado, datos.condiciones.fecha)) {
    motivos.push("El certificado de calibración del sonómetro no está vigente a la fecha de medición (vigencia de 2 años).");
  }
  if (!certificadoVigente(calibrador.fechaCertificado, datos.condiciones.fecha)) {
    motivos.push("El certificado de calibración del calibrador no está vigente a la fecha de medición (vigencia de 2 años).");
  }
  if (!datos.instrumental.verificacionTerreno) {
    motivos.push("Falta la verificación de calibración en terreno (art. 15 a).");
  }
  return motivos;
}

export function crearApp(db: Database.Database) {
  const app = express();
  app.use(express.json({ limit: "40mb" }));

  const autenticar = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    const sesion = token
      ? (db
          .prepare(
            `SELECT u.id AS usuarioId, u.nombre AS usuarioNombre, u.email, e.id AS empresaId, e.nombre AS empresaNombre
             FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id JOIN empresas e ON e.id = u.empresa_id
             WHERE s.token = ?`,
          )
          .get(token) as Sesion | undefined)
      : undefined;
    if (!sesion) return res.status(401).json({ error: "Sesión no válida. Vuelve a ingresar." });
    (req as Autenticada).sesion = sesion;
    next();
  };

  app.post("/api/login", (req, res) => {
    const { email, clave } = req.body ?? {};
    const u = db.prepare("SELECT id, clave_hash FROM usuarios WHERE email = ?").get(String(email ?? "").trim().toLowerCase()) as
      | { id: number; clave_hash: string }
      | undefined;
    if (!u || !claveCorrecta(String(clave ?? ""), u.clave_hash)) {
      return res.status(401).json({ error: "Correo o clave incorrectos." });
    }
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sesiones (token, usuario_id) VALUES (?, ?)").run(token, u.id);
    res.json({ token });
  });

  app.get("/api/yo", autenticar, (req, res) => {
    const s = (req as Autenticada).sesion;
    res.json({ usuario: { nombre: s.usuarioNombre, email: s.email }, empresa: { nombre: s.empresaNombre } });
  });

  // El logo se deduce del usuario: no hay forma de pedir el de otra empresa.
  app.get("/api/logo", autenticar, (req, res) => {
    const { logo_archivo } = db.prepare("SELECT logo_archivo FROM empresas WHERE id = ?").get((req as Autenticada).sesion.empresaId) as {
      logo_archivo: string | null;
    };
    if (!logo_archivo) return res.status(404).end();
    res.type("png").send(readFileSync(join(DIR_ARCHIVOS, logo_archivo)));
  });

  /** Recibe los datos de terreno, los guarda crudos y devuelve el cálculo. Reintentar con el mismo clientId no duplica. */
  app.post("/api/mediciones", autenticar, (req, res) => {
    const s = (req as Autenticada).sesion;
    const datos = req.body as DatosMedicion;
    if (!datos?.clientId || !datos.evaluacion || !datos.condiciones || !datos.instrumental) {
      return res.status(400).json({ error: "Faltan datos de la medición." });
    }
    let resultado: Resultado;
    try {
      resultado = evaluar(datos.evaluacion, REGLAS[REGLAS_VIGENTES]!);
    } catch (e) {
      if (e instanceof EntradaInvalida) return res.status(422).json({ error: "Datos de medición inválidos.", errores: e.errores });
      throw e;
    }

    const existente = db.prepare("SELECT id FROM mediciones WHERE empresa_id = ? AND client_id = ?").get(s.empresaId, datos.clientId) as
      | { id: number }
      | undefined;
    if (existente) return res.json({ id: existente.id, resultado, bloqueos: bloqueos(datos) });

    const { fotos, ...sinFotos } = datos;
    const id = db.transaction(() => {
      const medicionId = Number(
        db
          .prepare("INSERT INTO mediciones (empresa_id, usuario_id, client_id, datos_json) VALUES (?, ?, ?, ?)")
          .run(s.empresaId, s.usuarioId, datos.clientId, JSON.stringify(sinFotos)).lastInsertRowid,
      );
      (fotos ?? []).forEach((f, i) => {
        const m = /^data:image\/jpeg;base64,(.+)$/.exec(f.dataUrl ?? "");
        if (!m) return;
        const archivo = `medicion-${medicionId}-foto-${i + 1}.jpg`;
        writeFileSync(join(DIR_ARCHIVOS, archivo), Buffer.from(m[1]!, "base64"));
        db.prepare("INSERT INTO fotos (medicion_id, descripcion, archivo) VALUES (?, ?, ?)").run(medicionId, f.descripcion ?? "", archivo);
      });
      return medicionId;
    })();
    res.status(201).json({ id, resultado, bloqueos: bloqueos(datos) });
  });

  app.get("/api/mediciones", autenticar, (req, res) => {
    const filas = db
      .prepare(
        `SELECT m.id, m.creada, m.datos_json, (SELECT MAX(i.id) FROM informes i WHERE i.medicion_id = m.id) AS informeId
         FROM mediciones m WHERE m.empresa_id = ? ORDER BY m.id DESC LIMIT 100`,
      )
      .all((req as Autenticada).sesion.empresaId) as { id: number; creada: string; datos_json: string; informeId: number | null }[];
    res.json(
      filas.map((f) => {
        const d = JSON.parse(f.datos_json) as DatosMedicion;
        return { id: f.id, creada: f.creada, fuente: d.fuente.nombre, receptor: d.receptor.numero, fecha: d.condiciones.fecha, informeId: f.informeId };
      }),
    );
  });

  const cargar = (empresaId: number, id: number) => {
    const fila = db.prepare("SELECT datos_json FROM mediciones WHERE id = ? AND empresa_id = ?").get(id, empresaId) as
      | { datos_json: string }
      | undefined;
    return fila ? ({ ...JSON.parse(fila.datos_json), fotos: [] } as DatosMedicion) : null;
  };

  app.get("/api/mediciones/:id", autenticar, (req, res) => {
    const s = (req as Autenticada).sesion;
    const id = Number(req.params.id);
    const datos = cargar(s.empresaId, id);
    if (!datos) return res.status(404).json({ error: "Medición no encontrada." });
    const informe = db
      .prepare("SELECT id, firmado_por AS firmadoPor, firmado_en AS firmadoEn FROM informes WHERE medicion_id = ? ORDER BY id DESC")
      .get(id);
    const nFotos = (db.prepare("SELECT COUNT(*) AS n FROM fotos WHERE medicion_id = ?").get(id) as { n: number }).n;
    res.json({ id, datos, nFotos, resultado: evaluar(datos.evaluacion, REGLAS[REGLAS_VIGENTES]!), bloqueos: bloqueos(datos), informe: informe ?? null });
  });

  /** Emite el Word. Exige que quien firma declare haber revisado el cálculo. */
  app.post("/api/mediciones/:id/informe", autenticar, async (req, res, next) => {
    try {
      const s = (req as Autenticada).sesion;
      const id = Number(req.params.id);
      const datos = cargar(s.empresaId, id);
      if (!datos) return res.status(404).json({ error: "Medición no encontrada." });
      if (req.body?.confirmoRevision !== true) {
        return res.status(400).json({ error: "Debes confirmar que revisaste el cálculo antes de emitir." });
      }
      const motivos = bloqueos(datos);
      if (motivos.length) return res.status(409).json({ error: "No se puede emitir el informe.", errores: motivos });

      const empresa = db.prepare("SELECT * FROM empresas WHERE id = ?").get(s.empresaId) as {
        nombre: string; header_texto: string; footer_texto: string; logo_archivo: string | null; plantilla_archivo: string; plantilla_version: string;
      };
      const resultado = evaluar(datos.evaluacion, REGLAS[REGLAS_VIGENTES]!);
      const fotos = (db.prepare("SELECT descripcion, archivo FROM fotos WHERE medicion_id = ? ORDER BY id").all(id) as { descripcion: string; archivo: string }[]).map(
        (f) => ({ descripcion: f.descripcion, jpeg: readFileSync(join(DIR_ARCHIVOS, f.archivo)) }),
      );

      const ahora = new Date().toISOString();
      const informeId = Number(
        db
          .prepare(
            `INSERT INTO informes (medicion_id, reglas_id, reglas_version, plantilla_version, resultado_json, firmado_por, firmado_en, archivo)
             VALUES (?, ?, ?, ?, ?, ?, ?, '')`,
          )
          .run(id, resultado.reglas.id, resultado.reglas.version, empresa.plantilla_version, JSON.stringify(resultado), s.usuarioNombre, ahora).lastInsertRowid,
      );
      const numero = `INF-${String(informeId).padStart(4, "0")}`;
      const docx = await generarInforme(
        readFileSync(join(DIR_PLANTILLAS, empresa.plantilla_archivo)),
        datos,
        resultado,
        fotos,
        {
          nombre: empresa.nombre,
          header: empresa.header_texto,
          footer: empresa.footer_texto,
          logo: empresa.logo_archivo ? readFileSync(join(DIR_ARCHIVOS, empresa.logo_archivo)) : null,
        },
        { numero, fechaEmision: ahora, firmadoPor: s.usuarioNombre, plantillaVersion: empresa.plantilla_version },
      );
      const archivo = `informe-${informeId}.docx`;
      writeFileSync(join(DIR_ARCHIVOS, archivo), docx);
      db.prepare("UPDATE informes SET archivo = ? WHERE id = ?").run(archivo, informeId);
      res.status(201).json({ informeId, numero });
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/informes/:id/docx", autenticar, (req, res) => {
    const fila = db
      .prepare("SELECT i.id, i.archivo FROM informes i JOIN mediciones m ON m.id = i.medicion_id WHERE i.id = ? AND m.empresa_id = ?")
      .get(Number(req.params.id), (req as Autenticada).sesion.empresaId) as { id: number; archivo: string } | undefined;
    if (!fila?.archivo) return res.status(404).json({ error: "Informe no encontrado." });
    res
      .type("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      .setHeader("Content-Disposition", `attachment; filename="INF-${String(fila.id).padStart(4, "0")}.docx"`)
      .send(readFileSync(join(DIR_ARCHIVOS, fila.archivo)));
  });

  if (existsSync(DIR_WEB)) {
    app.use(express.static(DIR_WEB));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(DIR_WEB, "index.html")));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Error interno del servidor." });
  });
  return app;
}
