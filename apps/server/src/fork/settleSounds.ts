// Fork-only (MasonLoomis/t3code): serves the user's own sound files from
// `<T3 home>/userdata/sounds` so clients can play them when a thread settles. See FORK.md.
import { AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";

import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import * as ServerConfig from "../config.ts";
import { requestUrl } from "../requestUrl.ts";

const SETTLE_SOUNDS_ROUTE = "/api/fork/sounds";

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
const NO_STORE = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

/** The MIME type for a plain file name in the sounds folder, or null for anything else. */
export function settleSoundMimeType(name: string): string | null {
  if (name.length === 0 || name.length > 255 || name.startsWith(".")) return null;
  if (/[\\/:\0]/.test(name) || name.includes("..")) return null;
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? null : (SOUND_MIME_TYPES[name.slice(dot).toLowerCase()] ?? null);
}

const isAuthorized = Effect.fnUntraced(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const auth = yield* EnvironmentAuth.EnvironmentAuth;
  const session = yield* auth.authenticateHttpRequest(request).pipe(Effect.option);
  return Option.isSome(session) && session.value.scopes.includes(AuthOrchestrationReadScope);
});

const soundsDir = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const path = yield* Path.Path;
  return path.join(config.stateDir, "sounds");
});

const listSounds = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const entries = yield* fs
    .readDirectory(yield* soundsDir)
    .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
  const sounds = entries.filter((name) => settleSoundMimeType(name) !== null).toSorted();
  return HttpServerResponse.jsonUnsafe({ sounds }, { headers: NO_STORE });
});

// One wildcard route: the router also maps the bare prefix to it, which lists the folder.
export const layerSettleSoundRoutes = HttpRouter.add(
  "GET",
  `${SETTLE_SOUNDS_ROUTE}/*`,
  Effect.gen(function* () {
    if (!(yield* isAuthorized())) return HttpServerResponse.text("Unauthorized", { status: 401 });
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = requestUrl(request);
    if (Option.isNone(url)) return HttpServerResponse.text("Bad Request", { status: 400 });
    const rawName = url.value.pathname.slice(SETTLE_SOUNDS_ROUTE.length).replace(/^\//, "");
    if (rawName.length === 0) return yield* listSounds;
    const name = (() => {
      try {
        return decodeURIComponent(rawName);
      } catch {
        return "";
      }
    })();
    const mimeType = settleSoundMimeType(name);
    if (mimeType === null) return HttpServerResponse.text("Not Found", { status: 404 });
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const filePath = path.join(yield* soundsDir, name);
    const bytes = yield* fs.stat(filePath).pipe(
      Effect.flatMap((info) =>
        info.type === "File" && Number(info.size) <= MAX_SOUND_BYTES
          ? fs.readFile(filePath)
          : Effect.succeed(null),
      ),
      Effect.orElseSucceed(() => null),
    );
    if (bytes === null) return HttpServerResponse.text("Not Found", { status: 404 });
    return HttpServerResponse.uint8Array(bytes, { contentType: mimeType, headers: NO_STORE });
  }),
);
