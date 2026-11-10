import { crearApp } from "./app.ts";
import { abrirDb } from "./db.ts";

const puerto = Number(process.env.PORT ?? 3000);
crearApp(abrirDb()).listen(puerto, () => {
  console.log(`Ruido DS 38 escuchando en http://localhost:${puerto}`);
  console.log("Usuario demo: demo@acusticademo.cl / demo1234");
});
