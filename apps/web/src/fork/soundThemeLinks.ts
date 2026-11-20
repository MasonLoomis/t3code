// Fork-only (MasonLoomis/t3code): links saved UI theme + sound pack + settle sound configs. See FORK.md.
import type { ClientSettings, SoundThemeConfig } from "@t3tools/contracts/settings";

import { getClientSettings, updateClientSettings } from "../hooks/useSettings";
import { getThemeSnapshot, setTheme, subscribeRenderedAppearance } from "../hooks/useTheme";
import { previewSoundEvent } from "../lib/soundEngine";

export function findLinkedSoundThemeConfig(
  themeId: string,
  configs: ReadonlyArray<SoundThemeConfig>,
): SoundThemeConfig | undefined {
  return configs.find((config) => config.autoApplyWithTheme && config.themeId === themeId);
}

export function isSoundThemeConfigActive(
  config: SoundThemeConfig,
  currentThemeId: string,
  settings: Pick<ClientSettings, "soundPack" | "settleSounds">,
): boolean {
  return (
    config.themeId === currentThemeId &&
    config.soundPack === settings.soundPack &&
    config.settleManualSound === settings.settleSounds.manualSound &&
    config.settleAutomaticSound === settings.settleSounds.automaticSound
  );
}

let applyingLinkedConfig = false;

/** Applies a theme + sound config together (UI theme, sound pack, and settle sounds). */
export async function applySoundThemeConfig(
  config: SoundThemeConfig,
  options?: { readonly preview?: boolean; readonly skipThemeChange?: boolean },
): Promise<void> {
  applyingLinkedConfig = true;
  try {
    if (!options?.skipThemeChange && getThemeSnapshot().theme !== config.themeId) {
      setTheme(config.themeId);
    }
    const current = getClientSettings();
    const nextSettleSounds = {
      ...current.settleSounds,
      manualSound: config.settleManualSound,
      automaticSound: config.settleAutomaticSound,
    };
    const needsSoundUpdate =
      current.soundPack !== config.soundPack ||
      current.settleSounds.manualSound !== nextSettleSounds.manualSound ||
      current.settleSounds.automaticSound !== nextSettleSounds.automaticSound;
    if (needsSoundUpdate) {
      await updateClientSettings({
        soundPack: config.soundPack,
        settleSounds: nextSettleSounds,
      });
    }
    if (options?.preview) {
      void previewSoundEvent(
        "completion",
        { ...getClientSettings(), soundPack: config.soundPack },
        config.soundPack,
      );
    }
  } finally {
    applyingLinkedConfig = false;
  }
}

/** Auto-applies a linked sound config whenever the user switches to its paired UI theme. */
export function startSoundThemeLinks(): () => void {
  let lastTheme = getThemeSnapshot().theme;
  return subscribeRenderedAppearance(() => {
    const nextTheme = getThemeSnapshot().theme;
    if (nextTheme === lastTheme) return;
    lastTheme = nextTheme;
    if (applyingLinkedConfig) return;
    const match = findLinkedSoundThemeConfig(nextTheme, getClientSettings().soundThemeConfigs);
    if (match) {
      void applySoundThemeConfig(match, { skipThemeChange: true });
    }
  });
}
