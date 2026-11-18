// Fork-only (MasonLoomis/t3code): HTTP access to the user's settle sounds. See FORK.md.
import { AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";

import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import { requestUrl } from "../requestUrl.ts";
import * as SettleSoundFiles from "./SettleSoundFiles.ts";

const SETTLE_SOUNDS_ROUTE = "/api/fork/sounds";
const NO_STORE = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

function decodeSoundName(pathname: string): string | null {
  const raw = pathname.slice(SETTLE_SOUNDS_ROUTE.length).replace(/^\//, "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

// One wildcard route: the router also maps the bare prefix to it, which lists the folder.
// Services are captured when the route is registered, so handlers only need the request.
export const layerSettleSoundRoutes = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const auth = yield* EnvironmentAuth.EnvironmentAuth;
    const files = yield* SettleSoundFiles.SettleSoundFiles;

    yield* router.add(
      "GET",
      `${SETTLE_SOUNDS_ROUTE}/*`,
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const session = yield* auth.authenticateHttpRequest(request).pipe(Effect.option);
        if (Option.isNone(session) || !session.value.scopes.includes(AuthOrchestrationReadScope)) {
          return HttpServerResponse.text("Unauthorized", { status: 401 });
        }
        const url = requestUrl(request);
        if (Option.isNone(url)) return HttpServerResponse.text("Bad Request", { status: 400 });
        const name = decodeSoundName(url.value.pathname);
        if (name === "") {
          return HttpServerResponse.jsonUnsafe(
            { sounds: yield* files.list },
            { headers: NO_STORE },
          );
        }
        const file = name === null ? Option.none() : yield* files.read(name);
        if (Option.isNone(file)) return HttpServerResponse.text("Not Found", { status: 404 });
        return HttpServerResponse.uint8Array(file.value.bytes, {
          contentType: file.value.mimeType,
          headers: NO_STORE,
        });
      }),
    );
  }),
).pipe(Layer.provide(SettleSoundFiles.layer));
