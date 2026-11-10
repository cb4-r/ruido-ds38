/** Conversión de latitud/longitud WGS84 a UTM, que es lo que piden las fichas de la SMA. */
export interface Utm {
  norte: number;
  este: number;
  huso: number;
  banda: string;
}

const A = 6378137;
const F = 1 / 298.257223563;
const K0 = 0.9996;
const BANDAS = "CDEFGHJKLMNPQRSTUVWX";

export function latLonAUtm(lat: number, lon: number): Utm {
  const huso = Math.floor((lon + 180) / 6) + 1;
  const lon0 = ((huso - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const e2 = F * (2 - F);
  const ep2 = e2 / (1 - e2);
  const phi = lat * (Math.PI / 180);
  const lam = lon * (Math.PI / 180);

  const N = A / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = ep2 * Math.cos(phi) ** 2;
  const AA = Math.cos(phi) * (lam - lon0);
  const M =
    A *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));

  const este =
    K0 * N * (AA + ((1 - T + C) * AA ** 3) / 6 + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * AA ** 5) / 120) + 500000;
  let norte =
    K0 *
    (M +
      N *
        Math.tan(phi) *
        (AA ** 2 / 2 +
          ((5 - T + 9 * C + 4 * C ** 2) * AA ** 4) / 24 +
          ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * AA ** 6) / 720));
  if (lat < 0) norte += 10000000;

  const banda = BANDAS[Math.min(19, Math.max(0, Math.floor((lat + 80) / 8)))]!;
  return { norte: Math.round(norte), este: Math.round(este), huso, banda };
}
