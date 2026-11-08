let ctx: AudioContext | null = null;
let muted = typeof localStorage !== "undefined" && localStorage.getItem("colonos-mute") === "1";

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (typeof localStorage !== "undefined") localStorage.setItem("colonos-mute", value ? "1" : "0");
  if (value) stopAmbience();
  else if (ambienceWanted) startAmbience();
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

/* ---------- ambience: sea swell, surf hiss, a gull now and then ---------- */

let ambienceWanted = false;
let ambience: { stop: () => void } | null = null;

function noiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
  const data = buf.getChannelData(0);
  // brown-ish noise: softer than white, closer to water
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

function layer(ac: AudioContext, out: AudioNode, buffer: AudioBuffer, filter: BiquadFilterType, freq: number, level: number, swell: number, rate: number) {
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const f = ac.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  const g = ac.createGain();
  g.gain.value = level;
  const lfo = ac.createOscillator();
  lfo.frequency.value = rate;
  const depth = ac.createGain();
  depth.gain.value = swell;
  lfo.connect(depth).connect(g.gain);
  src.connect(f).connect(g).connect(out);
  src.start();
  lfo.start();
  return () => {
    src.stop();
    lfo.stop();
  };
}

function gull(ac: AudioContext, out: AudioNode): void {
  const calls = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < calls; i++) {
    const at = ac.currentTime + i * 0.32;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1500 + Math.random() * 200, at);
    osc.frequency.exponentialRampToValueAtTime(950, at + 0.22);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.018, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + 0.26);
  }
}

/** Starts the sea ambience for the table; waits quietly for the first tap if audio is still locked. */
export function startAmbience(): void {
  ambienceWanted = true;
  if (ambience) return;
  const ac = audio();
  if (!ac) return;
  if (ac.state === "suspended") {
    // browsers keep audio locked until the first tap on the page
    window.addEventListener("pointerdown", () => void ac.resume(), { once: true });
  }
  const out = ac.createGain();
  out.gain.value = 0;
  out.gain.linearRampToValueAtTime(1, ac.currentTime + 3);
  out.connect(ac.destination);
  const buffer = noiseBuffer(ac, 4);
  const stops = [
    layer(ac, out, buffer, "lowpass", 420, 0.05, 0.035, 0.09),
    layer(ac, out, buffer, "bandpass", 1600, 0.012, 0.01, 0.13),
  ];
  let timer = 0;
  const schedule = () => {
    timer = window.setTimeout(() => {
      gull(ac, out);
      schedule();
    }, 18000 + Math.random() * 30000);
  };
  schedule();
  ambience = {
    stop: () => {
      window.clearTimeout(timer);
      out.gain.linearRampToValueAtTime(0, ac.currentTime + 0.4);
      window.setTimeout(() => {
        stops.forEach((stop) => stop());
        out.disconnect();
      }, 500);
    },
  };
}

export function stopAmbience(leaving = false): void {
  if (leaving) ambienceWanted = false;
  ambience?.stop();
  ambience = null;
}
