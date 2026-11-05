/**
 * Procedural pixel art. `npm run art` rewrites the HUD icons and cards, the
 * sea tile and the lobby poster in public/sprites (the island itself is
 * painted in the browser for each map). Pass a folder to also write zoomed
 * contact sheets there.
 */
import { join } from "node:path";
import { seaTile } from "../src/art/sea.ts";
import { card, DEV_ICONS, icon, ICONS, type DevIconName, type IconName } from "./art/icons.ts";
import { poster } from "./art/poster.ts";
import { Raster, scaleUp, writeIndexedPng, writePng } from "./art/raster.ts";

const out = join(import.meta.dirname, "..", "public", "sprites");

for (const name of Object.keys(ICONS) as IconName[]) {
  writePng(icon(name), join(out, `chip-${name}.png`));
  writePng(card(name), join(out, `card-${name}.png`));
}
for (const name of Object.keys(DEV_ICONS) as DevIconName[]) writePng(card(name), join(out, `card-${name}.png`));
const sea = seaTile();
writePng(sea, join(out, "sea-tile.png"));
writeIndexedPng(poster(out, sea), join(out, "poster.png"));

const sheetDir = process.argv[2];
if (sheetDir) {
  const names = [...Object.keys(ICONS), ...Object.keys(DEV_ICONS)] as Array<IconName | DevIconName>;
  const sheet = new Raster(names.length * 30, 58);
  for (let y = 0; y < 58; y++) for (let x = 0; x < sheet.w; x++) sheet.set(x, y, [58, 42, 32]);
  names.forEach((n, i) => {
    const ic = icon(n);
    const cd = card(n);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (ic.alpha(x, y)) sheet.set(i * 30 + 2 + x, 2 + y, ic.get(x, y)!);
    for (let y = 0; y < cd.h; y++) for (let x = 0; x < cd.w; x++) if (cd.alpha(x, y)) sheet.set(i * 30 + x + 2, 21 + y, cd.get(x, y)!);
  });
  writePng(scaleUp(sheet, 6), join(sheetDir, "icons.png"));
}
console.log("art written to", out);
