# Ruido DS 38

MVP para informes de medición de ruido según el D.S. N° 38/2011 del MMA (Chile).
El acústico ingresa los datos de terreno desde el teléfono, la app calcula el NPC paso a paso,
el profesional revisa y firma, y el servidor entrega un informe Word con la marca de su empresa.

## Levantar la demo

Requiere Node 20 o superior.

```bash
npm install
```

```bash
npm run demo
```

Abre `http://localhost:3000` e ingresa con `demo@acusticademo.cl` / `demo1234`.

### Desde el teléfono

El GPS y la cámara del navegador solo funcionan sobre HTTPS, así que abrir la IP del computador no basta.
Con la demo corriendo, abre un túnel en otra terminal:

```bash
npx cloudflared tunnel --url http://localhost:3000
```

Abre en el teléfono la URL `https://….trycloudflare.com` que imprime. La URL es pública mientras el túnel esté abierto:
cambia la clave demo con la variable `DEMO_PASSWORD` antes de crear la base si vas a compartirla.

## Qué hay en el repositorio

| Carpeta | Contenido |
| --- | --- |
| `calc/` | Cálculo puro del NPC, correcciones y comparación con el límite. Las reglas viven en `calc/rules/*.json`, versionadas. |
| `server/` | API (Express), base SQLite, generación del Word con `docx-templates`. |
| `server/templates/` | Plantilla Word de ejemplo con marcadores y logo de ejemplo. |
| `web/` | PWA en React: formulario, cálculo preliminar, cola sin conexión, revisión y firma. |

## Tests

```bash
npm test
```

Los tests de `calc/` incluyen 7 casos reales (informes ETFA públicos y el ejemplo del protocolo SMA, Res. Ex. 867/2016).

## Plantilla Word

`server/templates/plantilla-ejemplo.docx` se genera con `npm run plantilla -w server` y también se puede editar en Word.
Los marcadores usan la sintaxis de docx-templates: `+++INS campo+++`, `+++FOR x IN lista+++ … +++END-FOR x+++` y `+++IMAGE logo()+++`.
El logo, el encabezado y el pie salen de la empresa del usuario que inició sesión.

## Límites conocidos del MVP

- Solo D.S. 38/2011. El D.S. 14/2024 lo reemplaza desde el 27-08-2028 (27-08-2027 para proyectos SEIA) y cambia el procedimiento de medición.
- Un receptor por informe. Sin croquis ni imagen satelital en la ficha de georreferenciación.
- No incluye anexos ETFA (declaraciones juradas, autorización).
- La zona DS 38 la ingresa el profesional; la app no la deduce del plano regulador.
- La firma es una declaración del usuario con sesión iniciada, no una firma electrónica avanzada.
- Demo con SQLite y archivos en disco (`server/data/`); en producción corresponde Postgres y almacenamiento tipo S3.
- Sin correcciones por ruido de fondo de −1 a −3, zona rural ni ventana cerrada en casos reales: esos tramos solo tienen tests sintéticos.
