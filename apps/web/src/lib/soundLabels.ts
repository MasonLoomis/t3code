import type { SoundEventId, SoundPackId } from "@t3tools/contracts/settings";
import { msg } from "gt-react";

export const SOUND_PACK_LABELS = {
  default: msg("Default"),
  minimal: msg("Minimal"),
  retro: msg("Retro"),
  galactic: msg("Galactic Droid"),
} satisfies Record<SoundPackId, string>;

export const SOUND_EVENT_LABELS = {
  completion: msg("Thread completed"),
  input: msg("Input needed"),
  approval: msg("Approval needed"),
  failed: msg("Run failed"),
  "all-done": msg("All threads finished"),
  "voice-start": msg("Dictation started"),
  "voice-stop": msg("Dictation stopped"),
  "voice-error": msg("Dictation error"),
} satisfies Record<SoundEventId, string>;
