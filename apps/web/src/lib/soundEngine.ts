import {
  DEFAULT_SOUND_EVENT_ENABLED,
  DEFAULT_SOUND_VOLUME,
  type ClientSettings,
  type SoundEventId,
  type SoundFocusPolicy,
  type SoundPackId,
} from "@t3tools/contracts/settings";

import completionUrl from "../assets/notification-completion.mp3";
import inputUrl from "../assets/notification-input.mp3";
import { readCustomSound } from "./customSoundStore";
import { playSynthesizedSound } from "./soundSynthesizer";

type SoundSettings = Pick<ClientSettings, "soundPack" | "soundVolume" | "soundEvents">;
type NotificationEvent = Exclude<SoundEventId, `voice-${string}`>;
type VoiceEvent = Extract<SoundEventId, `voice-${string}`>;

const DEFAULT_SAMPLES = { completion: completionUrl, input: inputUrl } as const;
const PRIORITY: Record<NotificationEvent, number> = {
  failed: 4,
  approval: 4,
  input: 3,
  "all-done": 2,
  completion: 1,
};
const BURST_MS = 60;

interface AudioOutput {
  readonly context: AudioContext;
  readonly master: GainNode;
  readonly bundled: Map<string, Promise<AudioBuffer>>;
  readonly custom: Map<SoundEventId, { id: string; buffer: Promise<AudioBuffer> }>;
}

interface Playback {
  readonly stop: () => void;
  readonly endsAt: number;
}

let audio: AudioOutput | undefined;
let resume: Promise<void> | undefined;
let activeNotification: (Playback & { event: NotificationEvent }) | undefined;
let activePreview: Playback | undefined;
let previewSequence = 0;
let notificationEpoch = 0;
let preloadedNotifications = false;
const recordingSessions = new Set<object>();
const pending = new Map<NotificationEvent, Array<() => SoundSettings | undefined>>();
let burstTimer: ReturnType<typeof setTimeout> | undefined;

function getAudio(): AudioOutput {
  if (!audio) {
    const context = new AudioContext();
    const master = context.createGain();
    master.connect(context.destination);
    audio = { context, master, bundled: new Map(), custom: new Map() };
  }
  return audio;
}

function wakeAudio(output: AudioOutput): Promise<void> {
  if (output.context.state === "running") return Promise.resolve();
  return (resume ??= output.context.resume().finally(() => {
    resume = undefined;
  }));
}

function loadBundled(output: AudioOutput, url: string): Promise<AudioBuffer> {
  const cached = output.bundled.get(url);
  if (cached) return cached;
  const loading = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error("Sound request failed");
      return response.arrayBuffer();
    })
    .then((data) => output.context.decodeAudioData(data))
    .catch((error: unknown) => {
      output.bundled.delete(url);
      throw error;
    });
  output.bundled.set(url, loading);
  return loading;
}

export function unlockSoundAudio(preloadNotifications = false): void {
  try {
    const output = getAudio();
    void wakeAudio(output).catch(() => undefined);
    if (preloadNotifications && !preloadedNotifications) {
      preloadedNotifications = true;
      for (const url of Object.values(DEFAULT_SAMPLES)) {
        void loadBundled(output, url).catch(() => undefined);
      }
    }
  } catch {
    // Audio can be unavailable in embedded browsers.
  }
}

export function decodeCustomSound(data: ArrayBuffer): Promise<AudioBuffer> {
  return Promise.resolve().then(() => getAudio().context.decodeAudioData(data));
}

export function soundEventEnabled(
  event: SoundEventId,
  settings: Pick<SoundSettings, "soundEvents">,
): boolean {
  return settings.soundEvents[event] ?? DEFAULT_SOUND_EVENT_ENABLED[event];
}

export function soundAllowedByFocus(
  policy: SoundFocusPolicy,
  windowFocused: boolean,
  foregroundTarget: boolean,
): boolean {
  return (
    policy === "always" || !windowFocused || (policy === "background-threads" && !foregroundTarget)
  );
}

export function setDictationRecording(session: object, recording: boolean): void {
  if (!recording) {
    recordingSessions.delete(session);
    return;
  }
  recordingSessions.add(session);
  notificationEpoch += 1;
  pending.clear();
  activeNotification?.stop();
  activeNotification = undefined;
}

async function loadEvent(
  output: AudioOutput,
  event: SoundEventId,
  pack: SoundPackId,
  useCustom: boolean,
): Promise<AudioBuffer | undefined> {
  if (useCustom && typeof indexedDB !== "undefined") {
    const clip = await readCustomSound(event).catch(() => undefined);
    if (clip) {
      let cached = output.custom.get(event);
      if (cached?.id !== clip.id) {
        cached = { id: clip.id, buffer: output.context.decodeAudioData(clip.data) };
        output.custom.set(event, cached);
      }
      const buffer = await cached.buffer.catch(() => undefined);
      if (buffer) return buffer;
      if (output.custom.get(event) === cached) output.custom.delete(event);
    } else {
      output.custom.delete(event);
    }
  }
  if (pack === "default" && (event === "completion" || event === "input")) {
    return loadBundled(output, DEFAULT_SAMPLES[event]).catch(() => undefined);
  }
  return undefined;
}

function play(
  output: AudioOutput,
  volume: number,
  schedule: (destination: AudioNode, ended: () => void) => number,
): Playback {
  const { context, master } = output;
  master.gain.value = volume / 100;
  const channel = context.createGain();
  channel.connect(master);
  let connected = true;
  const stop = () => {
    if (!connected) return;
    connected = false;
    channel.disconnect();
  };
  try {
    return { stop, endsAt: context.currentTime + schedule(channel, stop) };
  } catch (error) {
    stop();
    throw error;
  }
}

function playBuffer(
  context: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  ended: () => void,
): number {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(destination);
  source.onended = ended;
  source.start();
  return buffer.duration;
}

function playEvent(
  output: AudioOutput,
  event: SoundEventId,
  pack: SoundPackId,
  volume: number,
  buffer?: AudioBuffer,
): Playback {
  return play(output, volume, (destination, ended) =>
    buffer
      ? playBuffer(output.context, destination, buffer, ended)
      : playSynthesizedSound(output.context, destination, pack, event, ended),
  );
}

function eligible(event: SoundEventId, read: () => SoundSettings | undefined) {
  const settings = read();
  return settings && settings.soundVolume > 0 && soundEventEnabled(event, settings)
    ? settings
    : undefined;
}

async function flushNotifications() {
  burstTimer = undefined;
  const batch = [...pending].sort(([a], [b]) => PRIORITY[b] - PRIORITY[a]);
  pending.clear();
  const output = audio;
  if (!output || output.context.state !== "running" || recordingSessions.size > 0) return;
  const epoch = notificationEpoch;
  for (const [event, readers] of batch) {
    const read = () => {
      for (const candidate of readers) {
        const settings = candidate();
        if (settings) return settings;
      }
      return undefined;
    };
    const settings = eligible(event, read);
    if (!settings) continue;
    const buffer = await loadEvent(output, event, settings.soundPack, true);
    if (
      epoch !== notificationEpoch ||
      recordingSessions.size > 0 ||
      output.context.state !== "running"
    )
      return;
    const current = eligible(event, read);
    if (!current || current.soundPack !== settings.soundPack) continue;
    if (activeNotification && activeNotification.endsAt > output.context.currentTime) {
      if (
        activeNotification.event === event ||
        PRIORITY[activeNotification.event] > PRIORITY[event]
      )
        return;
      activeNotification.stop();
    }
    activeNotification = {
      ...playEvent(output, event, current.soundPack, current.soundVolume, buffer),
      event,
    };
    return;
  }
}

export function queueNotificationSound(
  event: NotificationEvent,
  read: () => SoundSettings | undefined,
): void {
  if (!audio || recordingSessions.size > 0 || !eligible(event, read)) return;
  if (audio.context.state !== "running") {
    void wakeAudio(audio).catch(() => undefined);
  }
  const earlier = pending.get(event);
  if (earlier) earlier.push(read);
  else pending.set(event, [read]);
  burstTimer ??= setTimeout(() => {
    void flushNotifications().catch(() => undefined);
  }, BURST_MS);
}

export async function playVoiceSound(
  event: VoiceEvent,
  read: () => SoundSettings | undefined,
): Promise<void> {
  const output = audio;
  const settings = eligible(event, read);
  if (!output || !settings || output.context.state !== "running") return;
  try {
    const buffer = await loadEvent(output, event, settings.soundPack, true);
    const current = eligible(event, read);
    if (current && current.soundPack === settings.soundPack && output.context.state === "running") {
      playEvent(output, event, current.soundPack, current.soundVolume, buffer);
    }
  } catch {
    // An unavailable earcon must not interrupt dictation.
  }
}

export async function previewSoundEvent(
  event: SoundEventId,
  settings: SoundSettings,
  pack?: SoundPackId,
): Promise<void> {
  const sequence = ++previewSequence;
  activePreview?.stop();
  activePreview = undefined;
  if (settings.soundVolume === 0) return;
  try {
    const output = getAudio();
    await wakeAudio(output);
    const selectedPack = pack ?? settings.soundPack;
    const buffer = await loadEvent(output, event, selectedPack, pack === undefined);
    if (sequence === previewSequence && output.context.state === "running") {
      activePreview = playEvent(output, event, selectedPack, settings.soundVolume, buffer);
    }
  } catch {
    // Preview is best effort when browser audio is unavailable.
  }
}

export async function playBundledSound(url: string, volume = DEFAULT_SOUND_VOLUME): Promise<void> {
  if (volume === 0) return;
  try {
    const output = getAudio();
    await wakeAudio(output);
    const buffer = await loadBundled(output, url);
    if (output.context.state === "running") {
      play(output, volume, (destination, ended) =>
        playBuffer(output.context, destination, buffer, ended),
      );
    }
  } catch {
    // Capturing a screenshot does not depend on its feedback sound.
  }
}
