import { SOUND_EVENT_IDS, type SoundEventId } from "@t3tools/contracts/settings";
import * as Schema from "effect/Schema";
import { randomUUID } from "./utils";

const MAX_CLIP_BYTES = 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_CLIP_BYTES / 3) * 4;
const MAX_PACK_BYTES = SOUND_EVENT_IDS.length * (MAX_BASE64_LENGTH + 1024);
const FORMATS = new Set(["mp3", "wav", "ogg", "m4a"]);
const STORE = "sounds";

export class CustomSoundError extends Schema.TaggedError<
  CustomSoundError,
  { readonly brand: unique symbol }
>()("CustomSoundError", {
  reason: Schema.Literals(["size", "format", "decode", "duration", "pack"]),
}) {}

interface CustomSoundClip {
  readonly event: SoundEventId;
  readonly id: string;
  readonly name: string;
  readonly data: ArrayBuffer;
}

type DecodeSound = (data: ArrayBuffer) => Promise<AudioBuffer>;

let database: Promise<IDBDatabase> | undefined;

function openDatabase() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("t3code:custom-sounds", 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "event" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error: unknown) => {
    database = undefined;
    throw error;
  }));
}

async function withSounds<A>(
  mode: IDBTransactionMode,
  use: (store: IDBObjectStore) => IDBRequest<A> | void,
) {
  const transaction = (await openDatabase()).transaction(STORE, mode);
  const completion = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
  const request = use(transaction.objectStore(STORE));
  await completion;
  return request?.result;
}

export async function readCustomSound(event: SoundEventId): Promise<CustomSoundClip | undefined> {
  return withSounds<CustomSoundClip>("readonly", (store) => store.get(event));
}

function listClips() {
  return withSounds<CustomSoundClip[]>("readonly", (store) => store.getAll());
}

export async function listCustomSoundNames(): Promise<Partial<Record<SoundEventId, string>>> {
  return Object.fromEntries(((await listClips()) ?? []).map(({ event, name }) => [event, name]));
}

async function validateClip(name: string, data: ArrayBuffer, decode: DecodeSound) {
  if (data.byteLength === 0 || data.byteLength > MAX_CLIP_BYTES) {
    throw new CustomSoundError({ reason: "size" });
  }
  if (name.length > 255 || !FORMATS.has(name.split(".").at(-1)?.toLowerCase() ?? "")) {
    throw new CustomSoundError({ reason: "format" });
  }
  const buffer = await decode(data.slice(0)).catch(() => {
    throw new CustomSoundError({ reason: "decode" });
  });
  if (buffer.duration > 10 || buffer.numberOfChannels > 2) {
    throw new CustomSoundError({ reason: "duration" });
  }
}

function putClips(clips: readonly CustomSoundClip[]) {
  return withSounds("readwrite", (store) => {
    for (const clip of clips) store.put(clip);
  });
}

export async function saveCustomSound(event: SoundEventId, file: File, decode: DecodeSound) {
  if (file.size > MAX_CLIP_BYTES) throw new CustomSoundError({ reason: "size" });
  const data = await file.arrayBuffer();
  await validateClip(file.name, data, decode);
  await putClips([{ event, id: randomUUID(), name: file.name, data }]);
}

export async function resetCustomSound(event: SoundEventId) {
  await withSounds("readwrite", (store) => store.delete(event));
}

export async function exportCustomSoundPack(): Promise<string> {
  const clips = (await listClips()) ?? [];
  const sounds = Object.fromEntries(
    clips.map(({ event, name, data }) => {
      const bytes = new Uint8Array(data);
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      }
      return [event, { name, base64: btoa(binary) }];
    }),
  );
  return JSON.stringify({ version: 1, sounds }, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function importCustomSoundPack(file: File, decode: DecodeSound): Promise<void> {
  if (file.size > MAX_PACK_BYTES) throw new CustomSoundError({ reason: "pack" });
  const parsed: unknown = await file
    .text()
    .then((text) => JSON.parse(text))
    .catch(() => {
      throw new CustomSoundError({ reason: "pack" });
    });
  if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.sounds)) {
    throw new CustomSoundError({ reason: "pack" });
  }
  const clips: CustomSoundClip[] = [];
  for (const [key, entry] of Object.entries(parsed.sounds)) {
    const event = SOUND_EVENT_IDS.find((event) => event === key);
    if (
      !event ||
      !isRecord(entry) ||
      typeof entry.name !== "string" ||
      typeof entry.base64 !== "string" ||
      entry.base64.length > MAX_BASE64_LENGTH
    ) {
      throw new CustomSoundError({ reason: "pack" });
    }
    let data: ArrayBuffer;
    try {
      data = Uint8Array.from(atob(entry.base64), (byte) => byte.charCodeAt(0)).buffer;
    } catch {
      throw new CustomSoundError({ reason: "pack" });
    }
    await validateClip(entry.name, data, decode);
    clips.push({ event, id: randomUUID(), name: entry.name, data });
  }
  if (clips.length === 0) throw new CustomSoundError({ reason: "pack" });
  await putClips(clips);
}
