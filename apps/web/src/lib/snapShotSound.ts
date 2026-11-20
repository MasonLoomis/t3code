import type { SnapShotSound } from "@t3tools/contracts";

import snapShotClickUrl from "../assets/snap-shot-click.mp3?url";
import snapShotWhooshUrl from "../assets/snap-shot-whoosh.mp3?url";
import { getClientSettings } from "../hooks/useSettings";
import { playBundledSound } from "./soundEngine";

export function playSnapShotSound(sound: SnapShotSound): void {
  const url = sound === "soft-pop" ? snapShotWhooshUrl : snapShotClickUrl;
  void playBundledSound(url, getClientSettings().soundVolume);
}
