import type { SoundPackId, SynthesizedSoundEventId } from "@t3tools/contracts/settings";

interface SynthNote {
  readonly type: OscillatorType;
  readonly freq: number;
  readonly endFreq?: number;
  readonly start: number;
  readonly duration: number;
  readonly gain: number;
  readonly attack?: number;
  readonly filterFreq?: number;
  readonly filterEndFreq?: number;
  readonly filterQ?: number;
  /** Optional FM vibrato/warble for droid-style chirps. */
  readonly fmFreq?: number;
  readonly fmDepth?: number;
}

function scheduleNotes(
  context: AudioContext,
  destination: AudioNode,
  notes: ReadonlyArray<SynthNote>,
  ended: () => void,
): number {
  const now = context.currentTime;
  const maxEnd = Math.max(...notes.map((note) => note.start + note.duration));

  for (const note of notes) {
    const startTime = now + note.start;
    const endTime = startTime + note.duration;
    const osc = context.createOscillator();
    osc.type = note.type;
    osc.frequency.setValueAtTime(note.freq, startTime);
    if (note.endFreq !== undefined && note.endFreq !== note.freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, note.endFreq), endTime);
    }

    let modulator: OscillatorNode | null = null;
    if (note.fmFreq !== undefined && note.fmDepth !== undefined) {
      modulator = context.createOscillator();
      const modGain = context.createGain();
      modulator.type = "sine";
      modulator.frequency.setValueAtTime(note.fmFreq, startTime);
      modGain.gain.setValueAtTime(note.fmDepth, startTime);
      modulator.connect(modGain);
      modGain.connect(osc.frequency);
      modulator.start(startTime);
      modulator.stop(endTime + 0.01);
    }

    const env = context.createGain();
    const attack = Math.min(note.attack ?? 0.008, note.duration * 0.4);
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(note.gain, startTime + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, endTime);

    if (note.filterFreq !== undefined && typeof context.createBiquadFilter === "function") {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(note.filterFreq, startTime);
      if (note.filterEndFreq !== undefined) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(40, note.filterEndFreq), endTime);
      }
      if (note.filterQ !== undefined) {
        filter.Q.setValueAtTime(note.filterQ, startTime);
      }
      osc.connect(filter);
      filter.connect(env);
    } else {
      osc.connect(env);
    }

    env.connect(destination);
    if (note.start + note.duration === maxEnd) osc.onended = ended;
    osc.start(startTime);
    osc.stop(endTime + 0.015);
  }

  return maxEnd;
}

const DEFAULT_EXTRAS: Readonly<Record<SynthesizedSoundEventId, ReadonlyArray<SynthNote>>> = {
  completion: [
    { type: "sine", freq: 587.33, start: 0, duration: 0.14, gain: 0.22 },
    { type: "sine", freq: 880, start: 0.09, duration: 0.24, gain: 0.24 },
  ],
  input: [
    { type: "triangle", freq: 523.25, start: 0, duration: 0.11, gain: 0.22 },
    { type: "triangle", freq: 659.25, start: 0.08, duration: 0.18, gain: 0.22 },
  ],
  approval: [
    { type: "triangle", freq: 698.46, start: 0, duration: 0.11, gain: 0.26 },
    { type: "triangle", freq: 698.46, start: 0.14, duration: 0.11, gain: 0.26 },
    { type: "sine", freq: 932.33, start: 0.28, duration: 0.2, gain: 0.22 },
  ],
  failed: [
    { type: "triangle", freq: 349.23, endFreq: 261.63, start: 0, duration: 0.16, gain: 0.28 },
    { type: "sine", freq: 220, endFreq: 174.61, start: 0.14, duration: 0.24, gain: 0.26 },
  ],
  "all-done": [
    { type: "sine", freq: 523.25, start: 0, duration: 0.14, gain: 0.18 },
    { type: "sine", freq: 659.25, start: 0.09, duration: 0.16, gain: 0.2 },
    { type: "sine", freq: 783.99, start: 0.18, duration: 0.2, gain: 0.22 },
    { type: "sine", freq: 1046.5, start: 0.28, duration: 0.3, gain: 0.2 },
  ],
  "voice-start": [
    { type: "sine", freq: 440, endFreq: 660, start: 0, duration: 0.08, gain: 0.16, attack: 0.005 },
  ],
  "voice-stop": [
    {
      type: "sine",
      freq: 587.33,
      endFreq: 392,
      start: 0,
      duration: 0.09,
      gain: 0.15,
      attack: 0.005,
    },
  ],
  "voice-error": [
    { type: "triangle", freq: 293.66, endFreq: 220, start: 0, duration: 0.12, gain: 0.2 },
  ],
  "settle-manual": [
    { type: "sine", freq: 659.25, start: 0, duration: 0.11, gain: 0.2 },
    { type: "sine", freq: 440, start: 0.08, duration: 0.22, gain: 0.22 },
  ],
  "settle-automatic": [
    { type: "sine", freq: 523.25, start: 0, duration: 0.1, gain: 0.16, attack: 0.012 },
    { type: "sine", freq: 392, start: 0.08, duration: 0.2, gain: 0.16, attack: 0.012 },
  ],
  unsettle: [
    { type: "triangle", freq: 523.25, start: 0, duration: 0.09, gain: 0.19, attack: 0.006 },
    { type: "sine", freq: 659.25, start: 0.065, duration: 0.11, gain: 0.21, attack: 0.006 },
    { type: "sine", freq: 1046.5, start: 0.13, duration: 0.22, gain: 0.23, attack: 0.006 },
  ],
};

const MINIMAL_PACK: Readonly<Record<SynthesizedSoundEventId, ReadonlyArray<SynthNote>>> = {
  completion: [
    { type: "sine", freq: 528, start: 0, duration: 0.22, gain: 0.18, attack: 0.015 },
    { type: "sine", freq: 792, start: 0.1, duration: 0.28, gain: 0.14, attack: 0.02 },
  ],
  input: [
    { type: "sine", freq: 440, start: 0, duration: 0.15, gain: 0.16, attack: 0.012 },
    { type: "sine", freq: 554.37, start: 0.11, duration: 0.2, gain: 0.16, attack: 0.015 },
  ],
  approval: [
    { type: "sine", freq: 587.33, start: 0, duration: 0.12, gain: 0.2, attack: 0.01 },
    { type: "sine", freq: 587.33, start: 0.16, duration: 0.18, gain: 0.2, attack: 0.01 },
  ],
  failed: [
    {
      type: "sine",
      freq: 311.13,
      endFreq: 233.08,
      start: 0,
      duration: 0.26,
      gain: 0.22,
      attack: 0.012,
    },
  ],
  "all-done": [
    { type: "sine", freq: 440, start: 0, duration: 0.18, gain: 0.14, attack: 0.015 },
    { type: "sine", freq: 659.25, start: 0.12, duration: 0.22, gain: 0.16, attack: 0.015 },
    { type: "sine", freq: 880, start: 0.24, duration: 0.32, gain: 0.14, attack: 0.02 },
  ],
  "voice-start": [
    { type: "sine", freq: 523.25, start: 0, duration: 0.06, gain: 0.12, attack: 0.006 },
  ],
  "voice-stop": [{ type: "sine", freq: 392, start: 0, duration: 0.07, gain: 0.12, attack: 0.006 }],
  "voice-error": [
    { type: "sine", freq: 261.63, endFreq: 220, start: 0, duration: 0.12, gain: 0.16 },
  ],
  "settle-manual": [
    { type: "sine", freq: 528, start: 0, duration: 0.14, gain: 0.15, attack: 0.012 },
    { type: "sine", freq: 396, start: 0.09, duration: 0.24, gain: 0.14, attack: 0.016 },
  ],
  "settle-automatic": [
    {
      type: "sine",
      freq: 440,
      endFreq: 330,
      start: 0,
      duration: 0.22,
      gain: 0.13,
      attack: 0.015,
    },
  ],
  unsettle: [
    { type: "sine", freq: 440, start: 0, duration: 0.11, gain: 0.14, attack: 0.01 },
    { type: "sine", freq: 659.25, start: 0.075, duration: 0.14, gain: 0.16, attack: 0.01 },
    { type: "sine", freq: 880, start: 0.15, duration: 0.22, gain: 0.16, attack: 0.012 },
  ],
};

const RETRO_PACK: Readonly<Record<SynthesizedSoundEventId, ReadonlyArray<SynthNote>>> = {
  completion: [
    { type: "square", freq: 523.25, start: 0, duration: 0.07, gain: 0.12, filterFreq: 2400 },
    { type: "square", freq: 659.25, start: 0.07, duration: 0.07, gain: 0.12, filterFreq: 2400 },
    { type: "square", freq: 783.99, start: 0.14, duration: 0.14, gain: 0.13, filterFreq: 2800 },
  ],
  input: [
    { type: "square", freq: 659.25, start: 0, duration: 0.06, gain: 0.12, filterFreq: 2200 },
    { type: "square", freq: 880, start: 0.08, duration: 0.09, gain: 0.12, filterFreq: 2400 },
  ],
  approval: [
    { type: "square", freq: 783.99, start: 0, duration: 0.07, gain: 0.14, filterFreq: 2000 },
    { type: "square", freq: 587.33, start: 0.08, duration: 0.07, gain: 0.12, filterFreq: 2000 },
    { type: "square", freq: 783.99, start: 0.17, duration: 0.12, gain: 0.14, filterFreq: 2400 },
  ],
  failed: [
    { type: "sawtooth", freq: 330, start: 0, duration: 0.09, gain: 0.15, filterFreq: 1400 },
    { type: "sawtooth", freq: 261.63, start: 0.09, duration: 0.1, gain: 0.15, filterFreq: 1200 },
    { type: "sawtooth", freq: 196, start: 0.19, duration: 0.18, gain: 0.16, filterFreq: 1000 },
  ],
  "all-done": [
    { type: "square", freq: 523.25, start: 0, duration: 0.06, gain: 0.11, filterFreq: 2600 },
    { type: "square", freq: 659.25, start: 0.06, duration: 0.06, gain: 0.11, filterFreq: 2600 },
    { type: "square", freq: 783.99, start: 0.12, duration: 0.06, gain: 0.12, filterFreq: 2800 },
    { type: "square", freq: 1046.5, start: 0.18, duration: 0.2, gain: 0.13, filterFreq: 3200 },
  ],
  "voice-start": [
    { type: "square", freq: 440, start: 0, duration: 0.045, gain: 0.1, filterFreq: 2000 },
    { type: "square", freq: 880, start: 0.045, duration: 0.055, gain: 0.1, filterFreq: 2400 },
  ],
  "voice-stop": [
    { type: "square", freq: 659.25, start: 0, duration: 0.045, gain: 0.1, filterFreq: 2000 },
    { type: "square", freq: 392, start: 0.045, duration: 0.06, gain: 0.1, filterFreq: 1800 },
  ],
  "voice-error": [
    {
      type: "sawtooth",
      freq: 220,
      endFreq: 146.83,
      start: 0,
      duration: 0.14,
      gain: 0.14,
      filterFreq: 1100,
    },
  ],
  "settle-manual": [
    { type: "square", freq: 659.25, start: 0, duration: 0.055, gain: 0.11, filterFreq: 2400 },
    { type: "square", freq: 523.25, start: 0.055, duration: 0.055, gain: 0.11, filterFreq: 2200 },
    { type: "square", freq: 392, start: 0.11, duration: 0.12, gain: 0.12, filterFreq: 2000 },
  ],
  "settle-automatic": [
    { type: "square", freq: 523.25, start: 0, duration: 0.055, gain: 0.1, filterFreq: 2000 },
    { type: "square", freq: 392, start: 0.06, duration: 0.11, gain: 0.1, filterFreq: 1800 },
  ],
  unsettle: [
    { type: "square", freq: 523.25, start: 0, duration: 0.05, gain: 0.11, filterFreq: 2600 },
    { type: "square", freq: 659.25, start: 0.05, duration: 0.05, gain: 0.11, filterFreq: 3000 },
    { type: "square", freq: 1046.5, start: 0.1, duration: 0.14, gain: 0.13, filterFreq: 3600 },
  ],
};

const GALACTIC_PACK: Readonly<Record<SynthesizedSoundEventId, ReadonlyArray<SynthNote>>> = {
  completion: [
    {
      type: "sine",
      freq: 980,
      endFreq: 1580,
      start: 0,
      duration: 0.085,
      gain: 0.2,
      fmFreq: 34,
      fmDepth: 110,
    },
    {
      type: "triangle",
      freq: 1420,
      endFreq: 1080,
      start: 0.095,
      duration: 0.075,
      gain: 0.18,
      fmFreq: 28,
      fmDepth: 85,
    },
    {
      type: "sine",
      freq: 1240,
      endFreq: 1960,
      start: 0.18,
      duration: 0.14,
      gain: 0.2,
      fmFreq: 22,
      fmDepth: 60,
    },
  ],
  input: [
    {
      type: "sine",
      freq: 840,
      endFreq: 1180,
      start: 0,
      duration: 0.08,
      gain: 0.2,
      fmFreq: 26,
      fmDepth: 75,
    },
    {
      type: "sine",
      freq: 1020,
      endFreq: 1740,
      start: 0.105,
      duration: 0.13,
      gain: 0.21,
      fmFreq: 18,
      fmDepth: 55,
    },
  ],
  approval: [
    {
      type: "sawtooth",
      freq: 620,
      endFreq: 560,
      start: 0,
      duration: 0.13,
      gain: 0.15,
      filterFreq: 1650,
      filterEndFreq: 900,
      filterQ: 4,
    },
    {
      type: "sawtooth",
      freq: 620,
      endFreq: 560,
      start: 0.18,
      duration: 0.15,
      gain: 0.16,
      filterFreq: 1750,
      filterEndFreq: 850,
      filterQ: 4,
    },
  ],
  failed: [
    {
      type: "sine",
      freq: 920,
      endFreq: 420,
      start: 0,
      duration: 0.19,
      gain: 0.22,
      fmFreq: 24,
      fmDepth: 65,
    },
    {
      type: "triangle",
      freq: 430,
      endFreq: 185,
      start: 0.17,
      duration: 0.28,
      gain: 0.22,
      filterFreq: 1200,
      filterEndFreq: 420,
    },
  ],
  "all-done": [
    {
      type: "sine",
      freq: 784,
      endFreq: 1174,
      start: 0,
      duration: 0.1,
      gain: 0.18,
      fmFreq: 28,
      fmDepth: 70,
    },
    {
      type: "sine",
      freq: 1174,
      endFreq: 1568,
      start: 0.11,
      duration: 0.12,
      gain: 0.19,
      fmFreq: 20,
      fmDepth: 50,
    },
    {
      type: "triangle",
      freq: 1568,
      start: 0.23,
      duration: 0.26,
      gain: 0.16,
      filterFreq: 3200,
      filterEndFreq: 1400,
    },
  ],
  "voice-start": [
    {
      type: "sawtooth",
      freq: 140,
      endFreq: 240,
      start: 0,
      duration: 0.12,
      gain: 0.14,
      attack: 0.015,
      filterFreq: 320,
      filterEndFreq: 1600,
      filterQ: 3.5,
    },
  ],
  "voice-stop": [
    {
      type: "sawtooth",
      freq: 230,
      endFreq: 115,
      start: 0,
      duration: 0.11,
      gain: 0.13,
      attack: 0.008,
      filterFreq: 1400,
      filterEndFreq: 260,
      filterQ: 3,
    },
  ],
  "voice-error": [
    {
      type: "sawtooth",
      freq: 310,
      endFreq: 170,
      start: 0,
      duration: 0.15,
      gain: 0.16,
      fmFreq: 42,
      fmDepth: 45,
      filterFreq: 950,
    },
  ],
  "settle-manual": [
    {
      type: "sine",
      freq: 1180,
      endFreq: 720,
      start: 0,
      duration: 0.11,
      gain: 0.19,
      fmFreq: 26,
      fmDepth: 70,
    },
    {
      type: "triangle",
      freq: 640,
      endFreq: 480,
      start: 0.11,
      duration: 0.14,
      gain: 0.16,
      filterFreq: 1600,
      filterEndFreq: 750,
    },
  ],
  "settle-automatic": [
    {
      type: "sine",
      freq: 880,
      endFreq: 560,
      start: 0,
      duration: 0.14,
      gain: 0.16,
      fmFreq: 20,
      fmDepth: 45,
    },
  ],
  unsettle: [
    {
      type: "triangle",
      freq: 520,
      endFreq: 960,
      start: 0,
      duration: 0.09,
      gain: 0.17,
      filterFreq: 900,
      filterEndFreq: 2800,
    },
    {
      type: "sine",
      freq: 980,
      endFreq: 1760,
      start: 0.085,
      duration: 0.14,
      gain: 0.2,
      fmFreq: 32,
      fmDepth: 80,
    },
  ],
};

const PACKS: Readonly<
  Record<SoundPackId, Readonly<Record<SynthesizedSoundEventId, ReadonlyArray<SynthNote>>>>
> = {
  default: DEFAULT_EXTRAS,
  minimal: MINIMAL_PACK,
  retro: RETRO_PACK,
  galactic: GALACTIC_PACK,
};

export function playSynthesizedSound(
  context: AudioContext,
  destination: AudioNode,
  pack: SoundPackId,
  event: SynthesizedSoundEventId,
  ended: () => void,
): number {
  return scheduleNotes(context, destination, PACKS[pack][event], ended);
}
