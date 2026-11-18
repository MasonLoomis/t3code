// Fork-only (MasonLoomis/t3code): plays the user's own sounds when a thread settles. A manual
// settle from this client plays `manualSound`; any other settle seen in the live thread list
// (auto-settle after a merge or idle days, an agent organizing threads, another device) plays
// `automaticSound`. Files come from `<T3 home>/userdata/sounds` on the primary server. See FORK.md.
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import type { ClientSettings } from "@t3tools/contracts/settings";
import * as Option from "effect/Option";
import type { AtomRegistry } from "effect/reactivity";

import { readDesktopPrimaryBearerToken } from "../environments/primary/desktopAuth";
import { resolvePrimaryEnvironmentHttpUrl } from "../environments/primary/target";
import { getClientSettings, subscribeClientSettings } from "../hooks/useSettings";
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

const objectUrls = new Map<string, Promise<string | null>>();

function soundObjectUrl(name: string): Promise<string | null> {
  let cached = objectUrls.get(name);
  if (cached === undefined) {
    cached = fetchPrimary(`${SOUNDS_ROUTE}/${encodeURIComponent(name)}`)
      .then(async (response) =>
        response === null ? null : URL.createObjectURL(await response.blob()),
      )
      .catch(() => null);
    // A missing file is retried next time, so a sound copied in later starts working.
    void cached.then((url) => {
      if (url === null) objectUrls.delete(name);
    });
    objectUrls.set(name, cached);
  }
  return cached;
}

/** Plays one sound file at a volume from 0 to 1. Missing files and blocked playback are silent. */
export function previewSettleSound(name: string, volume: number): void {
  if (name.length === 0) return;
  void soundObjectUrl(name).then((url) => {
    if (url === null) return;
    const audio = new Audio(url);
    audio.volume = Math.min(1, Math.max(0, volume));
    void audio.play().catch(() => undefined);
  });
}

let lastPlayedAt = 0;

function playSettleSound(kind: SettleSoundKind, settings: ClientSettings["settleSounds"]): void {
  if (!settings.enabled) return;
  const now = Date.now();
  if (now - lastPlayedAt < MIN_GAP_MS) return;
  lastPlayedAt = now;
  previewSettleSound(
    kind === "manual" ? settings.manualSound : settings.automaticSound,
    settings.volume,
  );
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
        if (result.settled.length > 0 && currentSettings !== null) {
          playSettleSound("automatic", currentSettings);
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
  };
}
