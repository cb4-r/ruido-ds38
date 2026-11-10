import Database from "better-sqlite3";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DIR_DATOS = process.env.DATA_DIR ?? join(RAIZ, "data");
export const DIR_ARCHIVOS = join(DIR_DATOS, "archivos");
export const DIR_PLANTILLAS = join(RAIZ, "templates");

// Demo: SQLite y archivos en disco. El esquema es portable a Postgres y el
// almacenamiento a S3/Blob sin cambiar el resto del servidor.
const ESQUEMA = `
CREATE TABLE IF NOT EXISTS empresas (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  header_texto TEXT NOT NULL DEFAULT '',
  footer_texto TEXT NOT NULL DEFAULT '',
  logo_archivo TEXT,
  plantilla_archivo TEXT NOT NULL,
  plantilla_version TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  email TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  clave_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  creada TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Una medición es un receptor evaluado. datos_json guarda los datos crudos tal como llegaron.
CREATE TABLE IF NOT EXISTS mediciones (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  client_id TEXT NOT NULL,
  datos_json TEXT NOT NULL,
  creada TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, client_id)
);
CREATE TABLE IF NOT EXISTS fotos (
  id INTEGER PRIMARY KEY,
  medicion_id INTEGER NOT NULL REFERENCES mediciones(id),
  descripcion TEXT NOT NULL DEFAULT '',
  archivo TEXT NOT NULL
);
-- Cada informe fija la versión de reglas y de plantilla con que se emitió, para poder reproducirlo.
CREATE TABLE IF NOT EXISTS informes (
  id INTEGER PRIMARY KEY,
  medicion_id INTEGER NOT NULL REFERENCES mediciones(id),
  reglas_id TEXT NOT NULL,
  reglas_version TEXT NOT NULL,
  plantilla_version TEXT NOT NULL,
  resultado_json TEXT NOT NULL,
  firmado_por TEXT NOT NULL,
  firmado_en TEXT NOT NULL DEFAULT (datetime('now')),
  archivo TEXT NOT NULL
);
`;

export function hashClave(clave: string): string {
  const sal = randomBytes(16);
  return `${sal.toString("hex")}:${scryptSync(clave, sal, 32).toString("hex")}`;
}

export function claveCorrecta(clave: string, guardada: string): boolean {
  const [sal, hash] = guardada.split(":");
  if (!sal || !hash) return false;
  const esperado = Buffer.from(hash, "hex");
  const obtenido = scryptSync(clave, Buffer.from(sal, "hex"), esperado.length);
  return timingSafeEqual(esperado, obtenido);
}

export function abrirDb(): Database.Database {
  mkdirSync(DIR_ARCHIVOS, { recursive: true });
  const db = new Database(join(DIR_DATOS, "ruido.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(ESQUEMA);
  sembrarDemo(db);
  return db;
}

/** Empresa y usuario de ejemplo para la demo. */
function sembrarDemo(db: Database.Database) {
  if (db.prepare("SELECT 1 FROM empresas").get()) return;
  const logoOrigen = join(DIR_PLANTILLAS, "logo-ejemplo.png");
  if (existsSync(logoOrigen)) copyFileSync(logoOrigen, join(DIR_ARCHIVOS, "logo-empresa-1.png"));
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO empresas (nombre, header_texto, footer_texto, logo_archivo, plantilla_archivo, plantilla_version)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "Acústica Demo SpA",
      "Acústica Demo SpA · Ingeniería en ruido ambiental",
      "Av. Ejemplo 123, Santiago · contacto@acusticademo.cl · +56 2 2345 6789",
      "logo-empresa-1.png",
      "plantilla-ejemplo.docx",
      "ejemplo-1",
    );
  db.prepare("INSERT INTO usuarios (empresa_id, email, nombre, clave_hash) VALUES (?, ?, ?, ?)").run(
    lastInsertRowid,
    "demo@acusticademo.cl",
    "Usuario Demo",
    hashClave(process.env.DEMO_PASSWORD ?? "demo1234"),
  );
}
