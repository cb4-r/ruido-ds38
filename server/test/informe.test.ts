import { REGLAS, REGLAS_VIGENTES, evaluar } from "@ruido-ds38/calc";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { generarInforme } from "../src/informe.ts";
import { ejemplo } from "./ejemplo.ts";

const raiz = join(import.meta.dirname, "..");
// JPEG mínimo válido de 1×1 px.
const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=",
  "base64",
);

it("rellena la plantilla de ejemplo con los datos, el cálculo y el branding", async () => {
  const resultado = evaluar(ejemplo.evaluacion, REGLAS[REGLAS_VIGENTES]!);
  const docx = await generarInforme(
    readFileSync(join(raiz, "templates/plantilla-ejemplo.docx")),
    ejemplo,
    resultado,
    [{ descripcion: "Punto de medición en dormitorio", jpeg: process.env.FOTO ? readFileSync(process.env.FOTO) : jpeg }],
    {
      nombre: "Acústica Demo SpA",
      header: "Acústica Demo SpA · Ingeniería en ruido ambiental",
      footer: "Av. Ejemplo 123, Santiago",
      logo: readFileSync(join(raiz, "templates/logo-ejemplo.png")),
    },
    { numero: "INF-0001", fechaEmision: "2026-11-10", firmadoPor: "Usuario Demo", plantillaVersion: "ejemplo-1" },
  );
  const salida = process.env.SALIDA ?? join(mkdtempSync(join(tmpdir(), "informe-")), "informe.docx");
  writeFileSync(salida, docx);

  const xml = (parte: string) => execFileSync("unzip", ["-p", salida, parte], { maxBuffer: 1 << 26 }).toString();
  const cuerpo = xml("word/document.xml");
  expect(cuerpo).not.toContain("+++");
  expect(cuerpo).toContain("Supera");
  expect(cuerpo).toContain("46,99");
  expect(cuerpo).toContain("Punto de medición en dormitorio");
  expect(cuerpo).toContain("ds38-2011, versión 1");
  const listado = execFileSync("unzip", ["-Z1", salida]).toString();
  const header = xml(listado.split("\n").find((f) => /word\/header\d*\.xml/.test(f))!);
  expect(header).toContain("Ingeniería en ruido ambiental");
  expect(header).not.toContain("+++");
  const footer = xml(listado.split("\n").find((f) => /word\/footer\d*\.xml/.test(f))!);
  expect(footer).toContain("Av. Ejemplo 123");
});
