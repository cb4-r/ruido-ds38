// Genera templates/plantilla-ejemplo.docx: una plantilla Word con marcadores
// (+++INS campo+++, +++FOR x IN lista+++, +++IMAGE fn()+++) que rellena docx-templates.
// Una empresa puede reemplazarla por su propio .docx editado en Word, manteniendo los marcadores.
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, Packer, PageNumber,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SALIDA = join(dirname(fileURLToPath(import.meta.url)), "../../templates/plantilla-ejemplo.docx");
const FUENTE = "Calibri";
const GRIS = "E7EBEF";
const ANCHO = 9638; // ancho útil de una hoja carta con márgenes de 2 cm, en DXA

const p = (texto: string, o: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; color?: string; after?: number } = {}) =>
  new Paragraph({
    alignment: o.align,
    spacing: { after: o.after ?? 80 },
    children: [new TextRun({ text: texto, bold: o.bold, size: o.size ?? 20, font: FUENTE, color: o.color })],
  });

const h = (texto: string) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text: texto, bold: true, size: 24, font: FUENTE, color: "14405A" })],
  });

const borde = { style: BorderStyle.SINGLE, size: 4, color: "9AA5AF" };
const bordes = { top: borde, bottom: borde, left: borde, right: borde };

const celda = (texto: string, ancho: number, o: { cabecera?: boolean; bold?: boolean } = {}) =>
  new TableCell({
    width: { size: ancho, type: WidthType.DXA },
    borders: bordes,
    shading: o.cabecera ? { type: ShadingType.CLEAR, fill: GRIS, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [p(texto, { bold: o.cabecera || o.bold, size: 18, after: 0 })],
  });

const tabla = (anchos: number[], filas: TableRow[]) =>
  new Table({ width: { size: ANCHO, type: WidthType.DXA }, columnWidths: anchos, rows: filas });

/** Tabla de dos columnas: etiqueta y valor. */
const fichaPares = (pares: [string, string][]) =>
  tabla([3200, ANCHO - 3200], pares.map(([k, v]) => new TableRow({ children: [celda(k, 3200, { cabecera: true }), celda(v, ANCHO - 3200)] })));

/** Tabla con cabecera y una fila que se repite por cada elemento de `lista`. */
const tablaBucle = (anchos: number[], cabeceras: string[], variable: string, lista: string, campos: string[]) => {
  const n = anchos.length;
  const filaComando = (cmd: string) =>
    new TableRow({ children: [celda(cmd, anchos[0]!), ...anchos.slice(1).map((a) => celda("", a))] });
  return tabla(anchos, [
    new TableRow({ tableHeader: true, children: cabeceras.map((c, i) => celda(c, anchos[i]!, { cabecera: true })) }),
    filaComando(`+++FOR ${variable} IN ${lista}+++`),
    new TableRow({ children: campos.map((c, i) => celda(`+++INS $${variable}.${c}+++`, anchos[i % n]!)) }),
    filaComando(`+++END-FOR ${variable}+++`),
  ]);
};

const doc = new Document({
  styles: { default: { document: { run: { font: FUENTE, size: 20 } } } },
  sections: [
    {
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1700, bottom: 1300, left: 1134, right: 1134 } } },
      headers: {
        default: new Header({
          children: [
            p("+++IMAGE logo()+++", { after: 40 }),
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "14405A", space: 4 } },
              spacing: { after: 120 },
              children: [new TextRun({ text: "+++INS empresa.header+++", size: 16, font: FUENTE, color: "5A6570" })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: "9AA5AF", space: 4 } },
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "+++INS empresa.footer+++", size: 16, font: FUENTE, color: "5A6570" }),
                new TextRun({ text: "   ·   Página ", size: 16, font: FUENTE, color: "5A6570" }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, font: FUENTE, color: "5A6570" }),
              ],
            }),
          ],
        }),
      },
      children: [
        p("INFORME DE MEDICIÓN DE RUIDO", { bold: true, size: 32, align: AlignmentType.CENTER, color: "14405A", after: 40 }),
        p("D.S. N° 38/2011 del Ministerio del Medio Ambiente", { size: 22, align: AlignmentType.CENTER, after: 40 }),
        p("Norma de Emisión de Ruidos Generados por Fuentes que Indica", { size: 18, align: AlignmentType.CENTER, color: "5A6570", after: 200 }),
        fichaPares([
          ["Informe N°", "+++INS informe.numero+++"],
          ["Fecha de emisión", "+++INS informe.fechaEmision+++"],
          ["Fuente emisora", "+++INS fuente.nombre+++"],
          ["Elaborado por", "+++INS empresa.nombre+++"],
        ]),

        h("1. Resultado"),
        tabla(
          [1100, 1300, 1700, 1100, 1500, 1200, 1738],
          [
            new TableRow({
              children: ["Receptor N°", "NPC [dBA]", "Ruido de fondo [dBA]", "Zona DS 38", "Periodo", "Límite [dBA]", "Estado"].map((c, i) =>
                celda(c, [1100, 1300, 1700, 1100, 1500, 1200, 1738][i]!, { cabecera: true }),
              ),
            }),
            new TableRow({
              children: ["receptor.numero", "resultado.npc", "resultado.fondo", "resultado.zona", "resultado.periodo", "resultado.limite", "resultado.estado"].map((c, i) =>
                celda(`+++INS ${c}+++`, [1100, 1300, 1700, 1100, 1500, 1200, 1738][i]!, { bold: true }),
              ),
            }),
          ],
        ),
        p("+++INS resultado.conclusion+++", { after: 60 }),
        p("+++INS resultado.advertencias+++", { size: 18, color: "8A4B00" }),

        h("2. Ficha de información de medición de ruido"),
        p("Identificación de la fuente emisora de ruido", { bold: true }),
        fichaPares([
          ["Nombre o razón social", "+++INS fuente.nombre+++"],
          ["RUT", "+++INS fuente.rut+++"],
          ["Dirección", "+++INS fuente.direccion+++"],
          ["Comuna", "+++INS fuente.comuna+++"],
          ["Zona de emplazamiento (IPT vigente)", "+++INS fuente.zonaIpt+++"],
          ["Caracterización de la fuente", "+++INS fuente.tipoActividad+++"],
          ["Coordenadas UTM (WGS84)", "+++INS fuente.utm+++"],
        ]),
        p("", { after: 120 }),
        p("Instrumental de medición", { bold: true }),
        fichaPares([
          ["Sonómetro", "+++INS instrumental.sonometro+++"],
          ["Certificado de calibración del sonómetro", "+++INS instrumental.sonometroCertificado+++"],
          ["Calibrador acústico", "+++INS instrumental.calibrador+++"],
          ["Certificado de calibración del calibrador", "+++INS instrumental.calibradorCertificado+++"],
          ["Ponderación en frecuencia / temporal", "A / Lenta"],
          ["Verificación de calibración en terreno", "+++INS instrumental.verificacionTerreno+++"],
        ]),
        p("", { after: 120 }),
        p("Identificación del receptor", { bold: true }),
        fichaPares([
          ["Receptor N°", "+++INS receptor.numero+++"],
          ["Dirección", "+++INS receptor.direccion+++"],
          ["Comuna", "+++INS receptor.comuna+++"],
          ["Zona de emplazamiento (IPT vigente)", "+++INS receptor.zonaIpt+++"],
          ["N° Certificado de Informaciones Previas", "+++INS receptor.cip+++"],
          ["Zonificación DS N° 38/11 MMA", "+++INS resultado.zona+++"],
          ["Coordenadas UTM (WGS84)", "+++INS receptor.utm+++"],
        ]),
        p("", { after: 120 }),
        p("Condiciones de medición", { bold: true }),
        fichaPares([
          ["Fecha de medición", "+++INS condiciones.fecha+++"],
          ["Hora de inicio / término", "+++INS condiciones.horas+++"],
          ["Periodo de medición", "+++INS condiciones.periodo+++"],
          ["Lugar de medición", "+++INS condiciones.lugar+++"],
          ["Descripción del lugar de medición", "+++INS condiciones.descripcionLugar+++"],
          ["Condiciones de ventana", "+++INS condiciones.ventana+++"],
          ["Identificación del ruido de fondo", "+++INS condiciones.identificacionRuidoFondo+++"],
          ["Temperatura / Humedad / Viento", "+++INS condiciones.meteorologia+++"],
          ["Profesional de terreno", "+++INS condiciones.profesional+++"],
        ]),

        h("3. Ficha de georreferenciación"),
        fichaPares([
          ["Datum", "WGS84"],
          ["Fuente emisora", "+++INS fuente.coordenadas+++"],
          ["Receptor / lugar de medición", "+++INS receptor.coordenadas+++"],
        ]),

        h("4. Ficha de medición de niveles de ruido"),
        p("Registro de medición de ruido de la fuente emisora, en dB(A) lento", { bold: true }),
        tablaBucle(
          [1300, 1300, 1700, 1700, 1700, 1938],
          ["Punto", "Medición", "NPSeq", "NPSmín", "NPSmáx", "NPSmáx − 5"],
          "m", "mediciones", ["punto", "n", "eq", "min", "max", "maxMenos5"],
        ),
        p("", { after: 120 }),
        p("Registro de ruido de fondo", { bold: true }),
        fichaPares([
          ["¿Ruido de fondo afecta la medición?", "+++INS fondo.afecta+++"],
          ["NPSeq cada 5 minutos [dBA]", "+++INS fondo.registros+++"],
          ["Observaciones", "+++INS condiciones.observaciones+++"],
        ]),

        h("5. Ficha de evaluación: cálculo paso a paso"),
        tablaBucle([2700, 1500, ANCHO - 4200], ["Paso", "Artículo DS 38", "Cálculo"], "s", "pasos", ["titulo", "articulo", "detalle"]),

        h("6. Registro fotográfico"),
        p("+++INS fotosNota+++", { size: 18, color: "5A6570" }),
        p("+++FOR f IN fotos+++"),
        p("+++IMAGE foto($f.indice)+++", { align: AlignmentType.CENTER, after: 40 }),
        p("+++INS $f.descripcion+++", { size: 18, align: AlignmentType.CENTER, color: "5A6570", after: 200 }),
        p("+++END-FOR f+++"),

        h("7. Revisión y firma"),
        fichaPares([
          ["Revisado y firmado por", "+++INS firma.nombre+++"],
          ["Fecha de firma", "+++INS firma.fecha+++"],
          ["Reglas de cálculo utilizadas", "+++INS firma.reglas+++"],
          ["Plantilla utilizada", "+++INS firma.plantilla+++"],
        ]),
        p("", { after: 120 }),
        p(
          "El cálculo de este informe fue generado automáticamente a partir de los datos de terreno y revisado por el profesional que firma, quien es responsable de su contenido y de la conclusión de cumplimiento.",
          { size: 16, color: "5A6570" },
        ),
      ],
    },
  ],
});

writeFileSync(SALIDA, await Packer.toBuffer(doc));
console.log("Plantilla creada:", SALIDA);
