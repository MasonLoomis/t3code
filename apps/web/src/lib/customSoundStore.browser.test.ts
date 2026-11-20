import { expect, it } from "vite-plus/test";

import completionUrl from "../assets/notification-completion.mp3";
import {
  exportCustomSoundPack,
  importCustomSoundPack,
  listCustomSoundNames,
  readCustomSound,
  resetCustomSound,
  saveCustomSound,
} from "./customSoundStore";

const packFile = (contents: unknown) =>
  new File([JSON.stringify(contents)], "sounds.json", { type: "application/json" });

it("round-trips a saved clip through IndexedDB and rejects a failed import atomically", async () => {
  await using cleanup = new AsyncDisposableStack();
  cleanup.defer(async () => {
    await resetCustomSound("completion");
    await resetCustomSound("approval");
  });
  const audio = new OfflineAudioContext(1, 1, 44_100);
  const decode = (data: ArrayBuffer) => audio.decodeAudioData(data);
  const original = await (await fetch(completionUrl)).arrayBuffer();
  await saveCustomSound("completion", new File([original], "original.mp3"), decode);

  const exported = await exportCustomSoundPack();
  await resetCustomSound("completion");
  expect(await readCustomSound("completion")).toBeUndefined();
  await importCustomSoundPack(new File([exported], "exported.json"), decode);
  const restored = await readCustomSound("completion");
  expect(restored?.name).toBe("original.mp3");
  expect(new Uint8Array(restored!.data)).toEqual(new Uint8Array(original));

  const base64 = btoa(String.fromCharCode(...new Uint8Array(original)));
  await expect(
    importCustomSoundPack(
      packFile({
        version: 1,
        sounds: {
          completion: { name: "replacement.mp3", base64 },
          approval: { name: "broken.mp3", base64: "AAAA" },
        },
      }),
      decode,
    ),
  ).rejects.toMatchObject({ reason: "decode" });
  expect(await listCustomSoundNames()).toEqual({ completion: "original.mp3" });
  expect((await readCustomSound("completion"))?.id).toBe(restored?.id);
});

it.each([
  { version: 2, sounds: {} },
  { version: 1, sounds: {} },
  { version: 1, sounds: { unexpected: { name: "sound.mp3", base64: "AAAA" } } },
  { version: 1, sounds: { completion: { name: "sound.mp3", base64: "!" } } },
])("rejects invalid sound pack entries %#", async (pack) => {
  await expect(
    importCustomSoundPack(
      packFile(pack),
      async () => new AudioBuffer({ length: 1, sampleRate: 8_000 }),
    ),
  ).rejects.toMatchObject({ reason: "pack" });
});

it.each([
  { size: 0, name: "clip.wav", frames: 1, channels: 1, reason: "size" },
  { size: 1024 * 1024 + 1, name: "clip.wav", frames: 1, channels: 1, reason: "size" },
  { size: 1, name: "clip.txt", frames: 1, channels: 1, reason: "format" },
  { size: 1, name: "clip.wav", frames: 80_001, channels: 1, reason: "duration" },
  { size: 1, name: "clip.wav", frames: 1, channels: 3, reason: "duration" },
])("rejects an upload with $reason outside the clip limits %#", async (test) => {
  const file = new File([new ArrayBuffer(test.size)], test.name);
  await expect(
    saveCustomSound(
      "completion",
      file,
      async () =>
        new AudioBuffer({
          length: test.frames,
          numberOfChannels: test.channels,
          sampleRate: 8_000,
        }),
    ),
  ).rejects.toMatchObject({ reason: test.reason });
});
