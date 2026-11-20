import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const { synthesized, readClip } = vi.hoisted(() => ({
  synthesized: vi.fn(() => 0.6),
  readClip: vi.fn(),
}));
vi.mock("./soundSynthesizer", () => ({ playSynthesizedSound: synthesized }));
vi.mock("./customSoundStore", () => ({ readCustomSound: readClip }));

const playing = { time: 0, samples: 0, disconnected: 0, gains: [] as number[] };
class TestAudioContext {
  state = "running";
  destination = {};
  get currentTime() {
    return playing.time;
  }
  createGain() {
    return {
      gain: {
        set value(volume: number) {
          playing.gains.push(volume);
        },
      },
      connect() {},
      disconnect() {
        playing.disconnected += 1;
      },
    };
  }
  decodeAudioData() {
    return Promise.resolve({ duration: 0.6 });
  }
  createBufferSource() {
    return {
      connect() {},
      start() {
        playing.samples += 1;
      },
    };
  }
}

const defaults = () => DEFAULT_CLIENT_SETTINGS;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  Object.assign(playing, { time: 0, samples: 0, disconnected: 0, gains: [] });
  vi.stubGlobal("AudioContext", TestAudioContext);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new ArrayBuffer(0))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("preloads the original Default chimes once and plays them at the master volume", async () => {
  const { unlockSoundAudio, queueNotificationSound } = await import("./soundEngine");
  unlockSoundAudio(true);
  unlockSoundAudio(true);
  expect(fetch).toHaveBeenCalledTimes(2);
  queueNotificationSound("completion", () => ({ ...defaults(), soundVolume: 35 }));
  await vi.runAllTimersAsync();
  playing.time += 1;
  queueNotificationSound("input", defaults);
  await vi.runAllTimersAsync();
  expect(playing.samples).toBe(2);
  expect(playing.gains).toEqual([0.35, 0.8]);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("coalesces duplicate events and lets approval win a mixed burst regardless of arrival order", async () => {
  const { unlockSoundAudio, queueNotificationSound } = await import("./soundEngine");
  unlockSoundAudio();
  queueNotificationSound("completion", defaults);
  queueNotificationSound("approval", defaults);
  queueNotificationSound("approval", defaults);
  queueNotificationSound("input", defaults);
  await vi.runAllTimersAsync();
  expect(playing.samples).toBe(0);
  expect(synthesized.mock.calls).toHaveLength(1);
  expect(synthesized).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    "default",
    "approval",
    expect.any(Function),
  );
  queueNotificationSound("input", defaults);
  await vi.runAllTimersAsync();
  expect(playing.samples).toBe(0);
});

it("cuts off a lower priority chime and suppresses queued sounds while any dictation session is recording", async () => {
  const { unlockSoundAudio, queueNotificationSound, setDictationRecording } =
    await import("./soundEngine");
  unlockSoundAudio();
  queueNotificationSound("completion", defaults);
  await vi.runAllTimersAsync();
  queueNotificationSound("failed", defaults);
  await vi.runAllTimersAsync();
  expect(playing.samples).toBe(1);
  expect(playing.disconnected).toBe(1);

  const first = {};
  const second = {};
  queueNotificationSound("approval", defaults);
  setDictationRecording(first, true);
  setDictationRecording(second, true);
  setDictationRecording(first, false);
  queueNotificationSound("approval", defaults);
  await vi.runAllTimersAsync();
  expect(synthesized).toHaveBeenCalledTimes(1);
  expect(playing.disconnected).toBe(2);
  setDictationRecording(second, false);
  queueNotificationSound("approval", defaults);
  await vi.runAllTimersAsync();
  expect(synthesized).toHaveBeenCalledTimes(2);
});

it("rechecks notification eligibility before playback and keeps opted-out events silent", async () => {
  const { unlockSoundAudio, queueNotificationSound, playVoiceSound } =
    await import("./soundEngine");
  unlockSoundAudio();
  let allowed = true;
  queueNotificationSound("approval", () => (allowed ? defaults() : undefined));
  allowed = false;
  queueNotificationSound("all-done", defaults);
  await vi.runAllTimersAsync();
  await playVoiceSound("voice-start", defaults);
  expect(synthesized).not.toHaveBeenCalled();
  await playVoiceSound("voice-start", () => ({
    ...defaults(),
    soundEvents: { "voice-start": true },
  }));
  expect(synthesized).toHaveBeenCalledTimes(1);
});

it("stops a playing voice cue and discards a pending cue when a new recording starts", async () => {
  const { unlockSoundAudio, playVoiceSound, setDictationRecording } = await import("./soundEngine");
  vi.stubGlobal("indexedDB", {});
  unlockSoundAudio();
  const read = () => ({ ...defaults(), soundEvents: { "voice-stop": true } });
  const clip = { id: "stop", data: new ArrayBuffer(1) };
  readClip.mockResolvedValueOnce(clip);
  await playVoiceSound("voice-stop", read);
  expect(playing.samples).toBe(1);

  const pendingClip = Promise.withResolvers<typeof clip>();
  readClip.mockReturnValueOnce(pendingClip.promise);
  const pendingCue = playVoiceSound("voice-stop", read);
  setDictationRecording({}, true);
  pendingClip.resolve(clip);
  await pendingCue;
  expect(playing.disconnected).toBe(1);
  expect(playing.samples).toBe(1);
});

it("applies all three focus rules to the foreground, another thread, and an unfocused window", async () => {
  const { soundAllowedByFocus } = await import("./soundEngine");
  const targets = [
    [true, true],
    [true, false],
    [false, true],
  ] as const;
  expect(
    targets.map(([focused, viewing]) => soundAllowedByFocus("always", focused, viewing)),
  ).toEqual([true, true, true]);
  expect(
    targets.map(([focused, viewing]) =>
      soundAllowedByFocus("background-threads", focused, viewing),
    ),
  ).toEqual([false, true, true]);
  expect(
    targets.map(([focused, viewing]) => soundAllowedByFocus("unfocused", focused, viewing)),
  ).toEqual([false, false, true]);
});
