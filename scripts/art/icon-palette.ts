/** Palette the HUD icons and cards were drawn with. */
import { hex } from "./raster.ts";

export const P = {
  grass: ["#2c4a26", "#3d6630", "#55853a", "#74a244", "#9cbf55", "#c2d673"].map(hex),
  meadow: ["#3f6a2c", "#5a8c36", "#7aab42", "#9cc452", "#bfd86c"].map(hex),
  floor: ["#1f3320", "#2a4527", "#37592f", "#4a6f38"].map(hex),
  pine: ["#1a3020", "#24452a", "#2f5d33", "#40763c", "#5b9147"].map(hex),
  oak: ["#22401f", "#33602a", "#4c8034", "#6fa040", "#98bf50"].map(hex),
  autumn: ["#5a2414", "#8e3a1a", "#c25a22", "#e2832e", "#f2ad4c"].map(hex),
  gold: ["#5e4a14", "#957019", "#c99a24", "#e6c03a", "#f4de70"].map(hex),
  trunk: ["#2e1d12", "#4a3020", "#6b4a2e"].map(hex),
  soil: ["#3a2516", "#56391f", "#76512e", "#97703f", "#b48d55"].map(hex),
  sand: ["#9a7340", "#b98f52", "#d3ab68", "#e4c483", "#f1dca6"].map(hex),
  clay: ["#5a2216", "#7f3420", "#a3492a", "#c26438", "#d9844c", "#e9a66a"].map(hex),
  stone: ["#2e303a", "#454856", "#5f6372", "#7d8291", "#a3a8b4", "#c9cdd4"].map(hex),
  snow: ["#9fb1c2", "#cfdbe4", "#f2f6f8"].map(hex),
  wheat: ["#7d5d17", "#a8801f", "#cfa42c", "#e6c446", "#f5df7e"].map(hex),
  wool: ["#8a8478", "#c2bcae", "#e8e3d6", "#fbf8ef"].map(hex),
  water: ["#0d3550", "#134b6a", "#1b6486", "#2b7fa0", "#4ea2bf", "#8fd0de"].map(hex),
  ink: hex("#1c140e"),
};
