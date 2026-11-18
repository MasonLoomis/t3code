// Fork-only (MasonLoomis/t3code): the user's own sound files in `<T3 home>/userdata/sounds`,
// played by clients when a thread settles. See FORK.md.
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";

const SOUND_MIME_TYPES: Readonly<Record<string, string>> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
};
const MAX_SOUND_BYTES = 20 * 1024 * 1024;

/** The MIME type for a plain file name in the sounds folder, or null for anything else. */
export function settleSoundMimeType(name: string): string | null {
  if (name.length === 0 || name.length > 255 || name.startsWith(".")) return null;
  if (/[\\/:\0]/.test(name) || name.includes("..")) return null;
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? null : (SOUND_MIME_TYPES[name.slice(dot).toLowerCase()] ?? null);
}

export class SettleSoundFiles extends Context.Service<
  SettleSoundFiles,
  {
    /** Playable file names, sorted; empty when the folder is missing or unreadable. */
    readonly list: Effect.Effect<ReadonlyArray<string>>;
    /** One file's bytes; none for unsafe names, other types, missing or oversized files. */
    readonly read: (
      name: string,
    ) => Effect.Effect<Option.Option<{ readonly bytes: Uint8Array; readonly mimeType: string }>>;
  }
>()("t3/fork/SettleSoundFiles") {}

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig.ServerConfig;
  const soundsDir = path.join(config.stateDir, "sounds");

  const list = Effect.fn("SettleSoundFiles.list")(function* () {
    const entries = yield* fs
      .readDirectory(soundsDir)
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
    return entries.filter((name) => settleSoundMimeType(name) !== null).toSorted();
  });

  const read = Effect.fn("SettleSoundFiles.read")(function* (name: string) {
    const mimeType = settleSoundMimeType(name);
    if (mimeType === null) return Option.none();
    const filePath = path.join(soundsDir, name);
    return yield* fs.stat(filePath).pipe(
      Effect.flatMap((info) =>
        info.type === "File" && Number(info.size) <= MAX_SOUND_BYTES
          ? Effect.map(fs.readFile(filePath), (bytes) => Option.some({ bytes, mimeType }))
          : Effect.succeedNone,
      ),
      Effect.orElseSucceed(() => Option.none()),
    );
  });

  return SettleSoundFiles.of({ list: list(), read });
});

export const layer = Layer.effect(SettleSoundFiles, make);
