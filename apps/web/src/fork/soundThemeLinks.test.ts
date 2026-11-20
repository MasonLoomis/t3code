import {
  DEFAULT_CLIENT_SETTINGS,
  SETTLE_SOUND_PACK_DEFAULT,
  type SoundThemeConfig,
} from "@t3tools/contracts/settings";
import { describe, expect, it } from "vite-plus/test";

import { findLinkedSoundThemeConfig, isSoundThemeConfigActive } from "./soundThemeLinks";

const TRANSFORMERS: SoundThemeConfig = {
  id: "transformers",
  name: "Transformers",
  themeId: "transformers",
  soundPack: "retro",
  settleManualSound: "Transformers-G1-Scene-Transition.wav",
  settleAutomaticSound: "Transformers-G1-Transformation.wav",
  unsettleSound: SETTLE_SOUND_PACK_DEFAULT,
  autoApplyWithTheme: true,
};

const GALACTIC: SoundThemeConfig = {
  id: "galactic",
  name: "Galactic",
  themeId: "t3-chat",
  soundPack: "galactic",
  settleManualSound: SETTLE_SOUND_PACK_DEFAULT,
  settleAutomaticSound: SETTLE_SOUND_PACK_DEFAULT,
  unsettleSound: SETTLE_SOUND_PACK_DEFAULT,
  autoApplyWithTheme: false,
};

describe("soundThemeLinks", () => {
  it("finds auto-apply configs matching a switched theme and ignores manual-only configs", () => {
    expect(findLinkedSoundThemeConfig("transformers", [GALACTIC, TRANSFORMERS])).toEqual(
      TRANSFORMERS,
    );
    expect(findLinkedSoundThemeConfig("t3-chat", [GALACTIC, TRANSFORMERS])).toBeUndefined();
    expect(findLinkedSoundThemeConfig("ocean", [GALACTIC, TRANSFORMERS])).toBeUndefined();
  });

  it("detects when the current UI theme and sound settings match a saved config", () => {
    expect(
      isSoundThemeConfigActive(TRANSFORMERS, "transformers", {
        soundPack: "retro",
        settleSounds: {
          ...DEFAULT_CLIENT_SETTINGS.settleSounds,
          manualSound: "Transformers-G1-Scene-Transition.wav",
          automaticSound: "Transformers-G1-Transformation.wav",
          unsettleSound: SETTLE_SOUND_PACK_DEFAULT,
        },
      }),
    ).toBe(true);

    expect(
      isSoundThemeConfigActive(TRANSFORMERS, "t3-chat", {
        soundPack: "retro",
        settleSounds: {
          ...DEFAULT_CLIENT_SETTINGS.settleSounds,
          manualSound: "Transformers-G1-Scene-Transition.wav",
          automaticSound: "Transformers-G1-Transformation.wav",
          unsettleSound: SETTLE_SOUND_PACK_DEFAULT,
        },
      }),
    ).toBe(false);

    expect(
      isSoundThemeConfigActive(TRANSFORMERS, "transformers", {
        soundPack: "retro",
        settleSounds: {
          ...DEFAULT_CLIENT_SETTINGS.settleSounds,
          manualSound: "Transformers-G1-Scene-Transition.wav",
          automaticSound: "Transformers-G1-Transformation.wav",
          unsettleSound: "",
        },
      }),
    ).toBe(false);
  });
});
