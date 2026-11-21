import { resolveSoundVolume, type SnapShotSound } from "@t3tools/contracts";

import snapShotClickUrl from "../assets/snap-shot-click.mp3?url";
import snapShotWhooshUrl from "../assets/snap-shot-whoosh.mp3?url";
import { getClientSettings } from "../hooks/useSettings";
import { playCustomOrBundledSound } from "./soundEngine";

export function playSnapShotSound(
  sound: SnapShotSound,
  options?: { readonly useCustom?: boolean },
): void {
  const settings = getClientSettings();
  const url = sound === "soft-pop" ? snapShotWhooshUrl : snapShotClickUrl;
  void playCustomOrBundledSound(
    "snap-shot",
    url,
    resolveSoundVolume("snap-shot", settings),
    options,
  );
}
