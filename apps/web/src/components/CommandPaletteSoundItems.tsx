import { SOUND_PACK_IDS } from "@t3tools/contracts/settings";
import { useGT, useMessages } from "gt-react";
import { CheckIcon, Volume2Icon, VolumeXIcon } from "lucide-react";

import { getClientSettings, updateClientSettings, useClientSettings } from "../hooks/useSettings";
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
  return { toggleSoundItem, changeSoundPackItem };
}
