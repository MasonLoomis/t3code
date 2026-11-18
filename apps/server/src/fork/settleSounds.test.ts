import { describe, expect, it } from "vite-plus/test";

import { settleSoundMimeType } from "./settleSounds.ts";

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
