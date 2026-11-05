/**
 * Procedural pixel art for the board. `npm run art` rewrites the sprites in
 * public/sprites; pass a folder to also write a zoomed contact sheet there.
 */
import { join } from "node:path";
import { card, DEV_ICONS, icon, ICONS, type DevIconName, type IconName } from "./art/icons.ts";
import { poster } from "./art/poster.ts";
import { Raster } from "./art/raster.ts";
import { claypit, desert, fields, forest, mountains, pasture, scaleUp, seaTile } from "./art/terrain.ts";

const out = join(import.meta.dirname, "..", "public", "sprites");
const tiles: Record<string, Raster> = {
  wood: forest(),
  sheep: pasture(),
  wheat: fields(),
  brick: claypit(),
  ore: mountains(),
  desert: desert(),
};

for (const [name, tile] of Object.entries(tiles)) tile.toPng(join(out, `hex-${name}.png`));
for (const name of Object.keys(ICONS) as IconName[]) {
  icon(name).toPng(join(out, `chip-${name}.png`));
  card(name).toPng(join(out, `card-${name}.png`));
}
for (const name of Object.keys(DEV_ICONS) as DevIconName[]) card(name).toPng(join(out, `card-${name}.png`));
const sea = seaTile();
sea.toPng(join(out, "sea-tile.png"));
poster(out, tiles, sea).toPng(join(out, "poster.png"));

const sheetDir = process.argv[2];
if (sheetDir) {
  const list = Object.values(tiles);
  const sheet = new Raster(list.length * 100 + 70, 116);
  list.forEach((t, i) => {
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
      const c = t.get(x, y);
      if (c) sheet.set(i * 100 + x, y + 2, c);
    }
  });
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) sheet.set(list.length * 100 + 4 + x, y + 2, sea.get(x, y)!);
  scaleUp(sheet, 3).toPng(join(sheetDir, "tiles.png"));
  const names = [...Object.keys(ICONS), ...Object.keys(DEV_ICONS)] as Array<IconName | DevIconName>;
  const icons = new Raster(names.length * 30, 58);
  for (let y = 0; y < 58; y++) for (let x = 0; x < icons.w; x++) icons.set(x, y, [58, 42, 32]);
  names.forEach((n, i) => {
    const ic = icon(n);
    const cd = card(n);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (ic.alpha(x, y)) icons.set(i * 30 + 2 + x, 2 + y, ic.get(x, y)!);
    for (let y = 0; y < cd.h; y++) for (let x = 0; x < cd.w; x++) if (cd.alpha(x, y)) icons.set(i * 30 + x + 2, 21 + y, cd.get(x, y)!);
  });
  scaleUp(icons, 6).toPng(join(sheetDir, "icons.png"));
}
console.log("art written to", out);
