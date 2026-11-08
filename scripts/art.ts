/**
 * Procedural pixel art. `npm run art` rewrites the HUD icons and cards, the
 * board pieces, the sea tile and the lobby poster in public/sprites (the island itself is
 * painted in the browser for each map). Pass a folder to also write zoomed
 * contact sheets there.
 */
import { join } from "node:path";
import { boat, city, ghost, pier, roadTile, settlement, token } from "../src/art/pieces.ts";
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
const FACTIONS = { red: "#c44536", blue: "#2b6cb0", orange: "#d97706", ivory: "#e8e0d0" };
const pieces: Record<string, Raster> = {};
// two frames per piece, like the robber: name.png and name-1.png
for (const [id, color] of Object.entries(FACTIONS)) {
  pieces[`settlement-${id}`] = settlement(color, 0);
  pieces[`settlement-${id}-1`] = settlement(color, 1);
  pieces[`city-${id}`] = city(color, 0);
  pieces[`city-${id}-1`] = city(color, 1);
  pieces[`road-${id}`] = roadTile(color);
}
pieces["settlement-ghost"] = ghost(settlement(FACTIONS.ivory));
pieces["city-ghost"] = ghost(city(FACTIONS.ivory));
pieces.token = token();
pieces["port-any"] = pier(0);
pieces["port-any-1"] = pier(1);
pieces["port-2"] = boat(0);
pieces["port-2-1"] = boat(1);
for (const [name, img] of Object.entries(pieces)) writePng(img, join(out, `${name}.png`));
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
  const list = Object.values(pieces);
  const pw = list.reduce((n, p) => n + p.w + 6, 0);
  const ps = new Raster(pw, 70);
  for (let y = 0; y < 70; y++) for (let x = 0; x < pw; x++) ps.set(x, y, (x >> 3) % 2 ? [92, 128, 64] : [84, 118, 58]);
  let px = 0;
  for (const p of list) {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const a = p.alpha(x, y);
      if (!a) continue;
      const under = ps.get(px + x, y + 2)!;
      const c = p.get(x, y)!;
      ps.set(px + x, y + 2, a === 255 ? c : [under[0] + (c[0] - under[0]) * (a / 255), under[1] + (c[1] - under[1]) * (a / 255), under[2] + (c[2] - under[2]) * (a / 255)]);
    }
    px += p.w + 6;
  }
  writePng(scaleUp(ps, 4), join(sheetDir, "pieces.png"));
}
console.log("art written to", out);
