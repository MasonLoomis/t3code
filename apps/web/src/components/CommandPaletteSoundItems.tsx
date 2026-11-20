import { SOUND_PACK_IDS } from "@t3tools/contracts/settings";
import { useGT, useMessages } from "gt-react";
import { CheckIcon, PaletteIcon, Volume2Icon, VolumeXIcon } from "lucide-react";

import { applySoundThemeConfig, isSoundThemeConfigActive } from "../fork/soundThemeLinks";
import { getClientSettings, updateClientSettings, useClientSettings } from "../hooks/useSettings";
import { useTheme } from "../hooks/useTheme";
import { previewSoundEvent } from "../lib/soundEngine";
import { SOUND_PACK_LABELS } from "../lib/soundLabels";
import {
  hasDesktopNotifications,
  hasNotificationSound,
  unlockNotificationAudio,
} from "../threadNotifications";
import {
  ADDON_ICON_CLASS,
  ITEM_ICON_CLASS,
  type CommandPaletteActionItem,
  type CommandPaletteSubmenuItem,
} from "./CommandPalette.logic";

export function useCommandPaletteSoundItems() {
  const gt = useGT();
  const m = useMessages();
  const soundOn = useClientSettings((settings) => hasNotificationSound(settings.notificationMode));
  const selectedPack = useClientSettings((settings) => settings.soundPack);
  const settleSounds = useClientSettings((settings) => settings.settleSounds);
  const soundThemeConfigs = useClientSettings((settings) => settings.soundThemeConfigs);
  const { theme } = useTheme();
  const toggleSoundItem: CommandPaletteActionItem = {
    kind: "action",
    value: "action:toggle-notification-sound",
    title: soundOn ? gt("Mute notification sounds") : gt("Unmute notification sounds"),
    searchTerms: [gt("mute unmute sound audio chime notification volume")],
    icon: soundOn ? (
      <VolumeXIcon className={ITEM_ICON_CLASS} />
    ) : (
      <Volume2Icon className={ITEM_ICON_CLASS} />
    ),
    run: async () => {
      const { notificationMode } = getClientSettings();
      const desktop = hasDesktopNotifications(notificationMode);
      const muted = !hasNotificationSound(notificationMode);
      if (muted) unlockNotificationAudio();
      await updateClientSettings({
        notificationMode: desktop
          ? muted
            ? "notifications-and-sound"
            : "notifications"
          : muted
            ? "sound"
            : "off",
      });
    },
  };
  const changeSoundPackItem: CommandPaletteSubmenuItem = {
    kind: "submenu",
    value: "action:change-sound-pack",
    title: gt("Change sound pack"),
    searchTerms: [gt("Sound packs")],
    icon: <Volume2Icon className={ITEM_ICON_CLASS} />,
    addonIcon: <Volume2Icon className={ADDON_ICON_CLASS} />,
    groups: [
      {
        value: "sound-packs",
        label: gt("Sound packs"),
        items: SOUND_PACK_IDS.map((pack) => ({
          kind: "action",
          value: `sound-pack:${pack}`,
          title: m(SOUND_PACK_LABELS[pack]),
          searchTerms: [m(SOUND_PACK_LABELS[pack])],
          icon:
            selectedPack === pack ? (
              <CheckIcon className={ITEM_ICON_CLASS} aria-label={gt("Current sound pack")} />
            ) : (
              <Volume2Icon className={ITEM_ICON_CLASS} />
            ),
          run: () => {
            void previewSoundEvent("completion", getClientSettings(), pack);
            return updateClientSettings({ soundPack: pack });
          },
        })),
      },
    ],
  };
  const soundThemeConfigItem: CommandPaletteSubmenuItem | null =
    soundThemeConfigs.length > 0
      ? {
          kind: "submenu",
          value: "action:switch-sound-theme-config",
          title: gt("Switch theme & sound config"),
          searchTerms: [
            gt("theme sound pack preset profile config"),
            ...soundThemeConfigs.map((config) => config.name),
          ],
          icon: <PaletteIcon className={ITEM_ICON_CLASS} />,
          addonIcon: <Volume2Icon className={ADDON_ICON_CLASS} />,
          groups: [
            {
              value: "sound-theme-configs",
              label: gt("Theme & sound configs"),
              items: soundThemeConfigs.map((config) => {
                const active = isSoundThemeConfigActive(config, theme, {
                  soundPack: selectedPack,
                  settleSounds,
                });
                return {
                  kind: "action",
                  value: `sound-theme-config:${config.id}`,
                  title: config.name,
                  description: m(SOUND_PACK_LABELS[config.soundPack]),
                  searchTerms: [
                    config.name,
                    config.themeId,
                    m(SOUND_PACK_LABELS[config.soundPack]),
                  ],
                  icon: active ? (
                    <CheckIcon className={ITEM_ICON_CLASS} aria-label={gt("Active config")} />
                  ) : (
                    <PaletteIcon className={ITEM_ICON_CLASS} />
                  ),
                  run: () => applySoundThemeConfig(config, { preview: true }),
                };
              }),
            },
          ],
        }
      : null;
  return { toggleSoundItem, changeSoundPackItem, soundThemeConfigItem };
}
