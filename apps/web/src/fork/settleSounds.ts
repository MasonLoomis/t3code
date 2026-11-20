// Fork-only (MasonLoomis/t3code): plays pack-styled or custom sounds when a thread settles or
// unsettles. Manual settles play `manualSound`, other settles play `automaticSound`, and settled
// threads waking back up play `unsettleSound`. Custom files come from `<T3 home>/userdata/sounds`.
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import {
  resolveSoundVolume,
  SETTLE_SOUND_PACK_DEFAULT,
  type ClientSettings,
  type SettleSoundEventId,
  type SoundPackId,
} from "@t3tools/contracts/settings";
import * as Option from "effect/Option";
import type { AtomRegistry } from "effect/reactivity";

import { readDesktopPrimaryBearerToken } from "../environments/primary/desktopAuth";
import { resolvePrimaryEnvironmentHttpUrl } from "../environments/primary/target";
import { getClientSettings, subscribeClientSettings } from "../hooks/useSettings";
import { playPackSynthesizedEvent } from "../lib/soundEngine";
import { environmentSummaries } from "../state/presentation";
import { environmentShell } from "../state/shell";
import {
  MANUAL_SETTLE_CLAIM_MS,
  newlySettledThreads,
  type SettleSoundKind,
} from "./settleSounds.logic";

const SOUNDS_ROUTE = "/api/fork/sounds";
// Bulk settles and reconnect catch-up should sound once, not once per thread.
const MIN_GAP_MS = 1_500;

async function fetchPrimary(pathname: string): Promise<Response | null> {
  try {
    const url = resolvePrimaryEnvironmentHttpUrl(pathname);
    const sameOrigin =
      window.desktopBridge === undefined && new URL(url).origin === window.location.origin;
    const token = sameOrigin ? null : await readDesktopPrimaryBearerToken();
    const response = await fetch(url, {
      credentials: sameOrigin ? "include" : "omit",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return response.ok ? response : null;
  } catch {
    return null;
  }
}

/** Sound file names found in the server's sounds folder; empty when it is missing or unreachable. */
export async function listSettleSounds(): Promise<ReadonlyArray<string>> {
  const response = await fetchPrimary(SOUNDS_ROUTE);
  if (response === null) return [];
  const body: unknown = await response.json().catch(() => null);
  const sounds = typeof body === "object" && body !== null && "sounds" in body ? body.sounds : null;
  return Array.isArray(sounds) ? sounds.filter((name) => typeof name === "string") : [];
}

// Insertion-ordered, so the oldest entry is evicted first. Three selections plus one preview fit.
const objectUrls = new Map<string, Promise<string | null>>();
const MAX_CACHED_SOUNDS = 4;

function forgetSound(name: string): void {
  const cached = objectUrls.get(name);
  if (cached === undefined) return;
  objectUrls.delete(name);
  void cached.then((url) => {
    if (url !== null) URL.revokeObjectURL(url);
  });
}

function soundObjectUrl(name: string): Promise<string | null> {
  let cached = objectUrls.get(name);
  if (cached !== undefined) {
    objectUrls.delete(name);
    objectUrls.set(name, cached);
  } else {
    while (objectUrls.size >= MAX_CACHED_SOUNDS) {
      const oldest = objectUrls.keys().next();
      if (oldest.done === true) break;
      forgetSound(oldest.value);
    }
    cached = fetchPrimary(`${SOUNDS_ROUTE}/${encodeURIComponent(name)}`)
      .then(async (response) =>
        response === null ? null : URL.createObjectURL(await response.blob()),
      )
      .catch(() => null);
    // A missing file is retried next time, so a sound copied in later starts working.
    void cached.then((url) => {
      if (url === null && objectUrls.get(name) === cached) objectUrls.delete(name);
    });
    objectUrls.set(name, cached);
  }
  return cached;
}

function settleSoundEvent(kind: SettleSoundKind): SettleSoundEventId {
  switch (kind) {
    case "manual":
      return "settle-manual";
    case "automatic":
      return "settle-automatic";
    case "unsettle":
      return "unsettle";
  }
}

function settleSoundSetting(
  kind: SettleSoundKind,
  settings: ClientSettings["settleSounds"],
): string {
  switch (kind) {
    case "manual":
      return settings.manualSound;
    case "automatic":
      return settings.automaticSound;
    case "unsettle":
      return settings.unsettleSound;
  }
}

/** Plays a settle or unsettle sound (either the active sound pack's cue or a file from `userdata/sounds`) at 0..1 volume. */
export function previewSettleSound(
  name: string,
  volume: number,
  options?: { readonly kind?: SettleSoundKind; readonly pack?: SoundPackId },
): void {
  const clamped = Math.min(1, Math.max(0, volume));
  if (name.length === 0 || clamped <= 0) return;
  if (name === SETTLE_SOUND_PACK_DEFAULT) {
    const event = settleSoundEvent(options?.kind ?? "manual");
    const pack = options?.pack ?? getClientSettings().soundPack;
    void playPackSynthesizedEvent(event, pack, Math.round(clamped * 100));
    return;
  }
  void soundObjectUrl(name).then((url) => {
    if (url === null) return;
    const audio = new Audio(url);
    audio.volume = clamped;
    void audio.play().catch(() => undefined);
  });
}

// Track settle and unsettle gaps independently so undoing a settle immediately still sounds.
const lastPlayedAt = { settle: 0, unsettle: 0 };

function playSettleSound(kind: SettleSoundKind, settings: ClientSettings["settleSounds"]): void {
  if (!settings.enabled) return;
  const soundName = settleSoundSetting(kind, settings);
  if (soundName.length === 0) return;
  const clientSettings = getClientSettings();
  const volume = resolveSoundVolume(settleSoundEvent(kind), clientSettings) / 100;
  if (volume <= 0) return;
  const bucket = kind === "unsettle" ? "unsettle" : "settle";
  const now = Date.now();
  if (now - lastPlayedAt[bucket] < MIN_GAP_MS) return;
  lastPlayedAt[bucket] = now;
  previewSettleSound(soundName, volume, {
    kind,
    pack: clientSettings.soundPack,
  });
}

const manualClaims = new Map<string, Map<ThreadId, number>>();

/** Called when the user settles a thread here, before the command is sent. */
export function claimManualSettle(target: ScopedThreadRef): void {
  const now = Date.now();
  const claims = manualClaims.get(target.environmentId) ?? new Map<ThreadId, number>();
  for (const [threadId, at] of claims) {
    if (now - at >= MANUAL_SETTLE_CLAIM_MS) claims.delete(threadId);
  }
  claims.set(target.threadId, now);
  manualClaims.set(target.environmentId, claims);
}

/** Called when the user's settle failed, so the next settle of that thread is not ignored. */
export function releaseManualSettle(target: ScopedThreadRef): void {
  manualClaims.get(target.environmentId)?.delete(target.threadId);
}

// Set while startSettleSounds runs, so settling before app start (or in tests) stays silent.
let currentSettings: ClientSettings["settleSounds"] | null = null;

/** Called once the server accepted the user's settle. */
export function playManualSettleSound(): void {
  if (currentSettings !== null) playSettleSound("manual", currentSettings);
}

/** Watches every connected environment's thread list for settles this client did not start. */
export function startSettleSounds(registry: AtomRegistry.AtomRegistry): () => void {
  const watched = new Map<EnvironmentId, () => void>();

  const watch = (environmentId: EnvironmentId) => {
    let previous: Map<ThreadId, boolean> | null = null;
    return registry.subscribe(
      environmentShell.stateValueAtom(environmentId),
      (shell) => {
        if (shell.status !== "live" || Option.isNone(shell.snapshot)) {
          previous = null;
          return;
        }
        const nowMs = Date.now();
        const claims = manualClaims.get(environmentId) ?? new Map<ThreadId, number>();
        const result = newlySettledThreads({
          previous,
          threads: shell.snapshot.value.threads,
          manualClaims: claims,
          nowMs,
        });
        previous = result.next;
        for (const threadId of result.consumed) claims.delete(threadId);
        if (currentSettings !== null) {
          if (result.settled.length > 0) {
            playSettleSound("automatic", currentSettings);
          }
          if (result.unsettled.length > 0) {
            playSettleSound("unsettle", currentSettings);
          }
        }
      },
      { immediate: true },
    );
  };

  const sync = () => {
    currentSettings = getClientSettings().settleSounds;
    const ids = currentSettings.enabled
      ? registry.get(environmentSummaries.environmentIdsAtom)
      : [];
    const active = new Set(ids);
    for (const [environmentId, unsubscribe] of watched) {
      if (active.has(environmentId)) continue;
      unsubscribe();
      watched.delete(environmentId);
    }
    for (const environmentId of ids) {
      if (!watched.has(environmentId)) watched.set(environmentId, watch(environmentId));
    }
  };

  const unsubscribeSettings = subscribeClientSettings(sync);
  const unsubscribeIds = registry.subscribe(environmentSummaries.environmentIdsAtom, sync);
  sync();
  return () => {
    unsubscribeSettings();
    unsubscribeIds();
    for (const unsubscribe of watched.values()) unsubscribe();
    watched.clear();
    currentSettings = null;
    for (const name of objectUrls.keys()) forgetSound(name);
  };
}
