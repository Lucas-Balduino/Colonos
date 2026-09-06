let ctx: AudioContext | null = null;
let muted = typeof localStorage !== "undefined" && localStorage.getItem("colonos-mute") === "1";

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (typeof localStorage !== "undefined") localStorage.setItem("colonos-mute", value ? "1" : "0");
}

function audio(): AudioContext | null {
  if (muted || typeof window === "undefined") return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function blip(freq: number, dur: number, type: OscillatorType, gain = 0.06, at = 0) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + at + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + at);
  osc.stop(ac.currentTime + at + dur);
}

export type Sfx = "place" | "dice" | "win" | "illegal" | "click";

export function sfx(kind: Sfx): void {
  switch (kind) {
    case "click":
      blip(520, 0.04, "square", 0.03);
      break;
    case "place":
      blip(220, 0.08, "triangle", 0.07);
      blip(330, 0.06, "square", 0.04, 0.04);
      break;
    case "dice":
      for (let i = 0; i < 8; i++) blip(180 + (i % 3) * 40, 0.04, "square", 0.035, i * 0.04);
      break;
    case "illegal":
      blip(110, 0.12, "sawtooth", 0.05);
      break;
    case "win":
      blip(392, 0.12, "triangle", 0.07, 0);
      blip(494, 0.12, "triangle", 0.07, 0.12);
      blip(587, 0.22, "triangle", 0.08, 0.24);
      break;
  }
}
