import type { CreateGameOptions, GameState } from "../core/types.ts";

export const SOLO_SAVE_KEY = "colonos-solo-v1";

export interface SoloSave {
  state: GameState;
  opts: CreateGameOptions;
}

export function readSoloSave(): SoloSave | null {
  try {
    const raw = localStorage.getItem(SOLO_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SoloSave;
    if (!parsed?.state?.board || !parsed.state.players || !parsed.opts?.players) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSoloSave(save: SoloSave): void {
  localStorage.setItem(SOLO_SAVE_KEY, JSON.stringify(save));
}

export function clearSoloSave(): void {
  localStorage.removeItem(SOLO_SAVE_KEY);
}
