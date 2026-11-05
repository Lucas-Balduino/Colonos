import { P } from "./palette.ts";
import { Raster, fbm, noise, ramp } from "./raster.ts";

/** Seamless water, tiled under the whole board and drifted for motion. */
export function seaTile(size = 128, seed = 91): Raster {
  const r = new Raster(size, size);
  const period = 12;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = fbm((x / size) * period, (y / size) * period, seed, 2, period) * 0.7 + 0.12;
      let c = ramp(P.water.slice(0, 4), t, x, y);
      const wave = noise((x / size) * 24, (y / size) * 72, seed + 5, 24);
      if (wave > 0.8) c = P.water[3]!;
      if (wave > 0.87) c = P.water[4]!;
      r.set(x, y, c);
    }
  }
  return r;
}
