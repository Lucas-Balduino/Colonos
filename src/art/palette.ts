import { hex } from "./raster.ts";

const ramp = (...c: string[]) => c.map(hex);

/** One palette for the whole island: warm autumn light, cool shadows. */
export const P = {
  // meadow grass, from the gaps between blades to sunlit tips
  grass: ramp("#26341a", "#33461f", "#435a25", "#56702c", "#6b8633", "#839c3c", "#a0b24a", "#bdc35e"),
  forestFloor: ramp("#1b2814", "#243419", "#2f421e", "#3c5224", "#4b622b"),
  litter: ramp("#6a2a14", "#9a3e18", "#c45e22", "#e0822e", "#eda64a"),
  pine: ramp("#14261a", "#1d3622", "#28482b", "#355c33", "#47733d", "#5f8a48"),
  oak: ramp("#1e3418", "#2b4a1e", "#3d6226", "#557c2e", "#719838", "#93b048"),
  autumn: ramp("#4e1c10", "#7a2c14", "#a8401a", "#cc5c22", "#e47e2e", "#f2a444"),
  rust: ramp("#4a1810", "#702414", "#983418", "#b84a20", "#d0682c", "#e48a40"),
  gold: ramp("#5a4212", "#8a6618", "#b88a20", "#d8ac30", "#ecc84a", "#f6e07a"),
  trunk: ramp("#24170e", "#3a2617", "#553820", "#714c2c"),
  soil: ramp("#2e1d12", "#46301c", "#634426", "#835c34", "#a27a48", "#bf9a62"),
  sand: ramp("#8c6a3c", "#a8824a", "#c29c5c", "#d8b674", "#e8cc90", "#f4e2b2"),
  wetSand: ramp("#6e5634", "#86683e", "#9e7c4c"),
  clay: ramp("#4a1c12", "#6c2a18", "#8e3a20", "#ac4e2a", "#c66838", "#da8648", "#e8a666"),
  stone: ramp("#25262e", "#353742", "#4a4d5a", "#636776", "#7f8492", "#a0a5b0", "#c4c8d0"),
  snow: ramp("#7f93a8", "#a8bccc", "#d0dce6", "#eef3f6", "#ffffff"),
  wheat: ramp("#6e5214", "#94701c", "#b8901f", "#d4aa2c", "#e6c444", "#f2da70", "#faec9c"),
  stubble: ramp("#7a6630", "#9a8240", "#b49c54"),
  wool: ramp("#7a7468", "#a49e90", "#cac4b4", "#e6e0d2", "#f8f4ea"),
  water: ramp("#0d3550", "#134b6a", "#1b6486", "#2b7fa0", "#4ea2bf", "#8fd0de"),
  flowers: ramp("#f6f0e0", "#f2d24a", "#e8885a", "#d65a6a", "#b8a8f0"),
  ink: hex("#1a120c"),
};
