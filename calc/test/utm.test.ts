import { expect, it } from "vitest";
import { latLonAUtm } from "../src/utm.js";

// Valores de referencia calculados con pyproj (EPSG:4326 → UTM sur).
it.each([
  [-33.4378, -70.6505, { norte: 6298959, este: 346575, huso: 19, banda: "H" }],
  [-53.16, -70.91, { norte: 4108227, este: 372300, huso: 19, banda: "F" }],
  [-18.48, -70.31, { norte: 7956207, este: 361690, huso: 19, banda: "K" }],
  [-27.12, -109.36, { norte: 6999213, este: 662553, huso: 12, banda: "J" }],
])("lat %f lon %f", (lat, lon, esperado) => {
  expect(latLonAUtm(lat, lon)).toEqual(esperado);
});
