// @effect-diagnostics nodeBuiltinImport:off - The fixture writes files before the Effect runtime runs.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/http";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import * as ServerConfig from "../config.ts";
import { layerSettleSoundRoutes, settleSoundMimeType } from "./settleSounds.ts";

describe("settleSoundMimeType", () => {
  it("accepts plain audio file names in the sounds folder", () => {
    expect(settleSoundMimeType("Transformers-G1-Scene-Transition.wav")).toBe("audio/wav");
    expect(settleSoundMimeType("chime.MP3")).toBe("audio/mpeg");
  });

  it("rejects paths, hidden files and other types", () => {
    for (const name of [
      "../secrets.wav",
      "a/b.wav",
      String.raw`a\b.wav`,
      "C:x.wav",
      ".wav",
      "",
      "notes.txt",
    ]) {
      expect(settleSoundMimeType(name)).toBeNull();
    }
  });
});

describe("settle sound routes", () => {
  it("register on the router, require a read session, list and serve files", async () => {
    const baseDir = NodeFS.mkdtempSync(NodePath.join(process.cwd(), ".settle-sounds-test-"));
    try {
      const layerAuth = Layer.mock(EnvironmentAuth.EnvironmentAuth)({
        authenticateHttpRequest: (request) =>
          request.headers.authorization === "Bearer ok"
            ? Effect.succeed({
                scopes: [AuthOrchestrationReadScope],
              } as unknown as EnvironmentAuth.AuthenticatedSession)
            : Effect.fail(new EnvironmentAuth.ServerAuthMissingCredentialError()),
      });
      // Route handlers read these per request, so they stay in the app's context.
      const layerApp = layerSettleSoundRoutes.pipe(
        Layer.provideMerge(layerAuth),
        Layer.provideMerge(ServerConfig.layerTest(process.cwd(), baseDir)),
        Layer.provideMerge(NodeServices.layer),
      );
      const { handler, dispose } = HttpRouter.toWebHandler(layerApp, { disableLogger: true });
      try {
        const get = (path: string, authorized = true) =>
          handler(
            new Request(`http://localhost${path}`, {
              headers: authorized ? { authorization: "Bearer ok" } : {},
            }),
          );

        expect((await get("/api/fork/sounds", false)).status).toBe(401);
        expect(await (await get("/api/fork/sounds")).json()).toEqual({ sounds: [] });

        const soundsDir = NodePath.join(baseDir, "userdata", "sounds");
        NodeFS.mkdirSync(soundsDir, { recursive: true });
        NodeFS.writeFileSync(NodePath.join(soundsDir, "Done Sound.wav"), "RIFF");
        NodeFS.writeFileSync(NodePath.join(soundsDir, "notes.txt"), "x");

        expect(await (await get("/api/fork/sounds")).json()).toEqual({
          sounds: ["Done Sound.wav"],
        });
        const file = await get("/api/fork/sounds/Done%20Sound.wav");
        expect(file.status).toBe(200);
        expect(file.headers.get("content-type")).toBe("audio/wav");
        expect(await file.text()).toBe("RIFF");
        expect((await get("/api/fork/sounds/..%2Fsettings.json")).status).toBe(404);
        expect((await get("/api/fork/sounds/missing.wav")).status).toBe(404);
      } finally {
        await dispose();
      }
    } finally {
      NodeFS.rmSync(baseDir, { recursive: true, force: true });
    }
  });
});
