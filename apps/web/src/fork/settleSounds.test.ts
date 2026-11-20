import {
  DEFAULT_CLIENT_SETTINGS,
  SETTLE_SOUND_PACK_DEFAULT,
  type ClientSettings,
} from "@t3tools/contracts/settings";
import type { EnvironmentId, OrchestrationV2ThreadShell, ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Atom, AtomRegistry } from "effect/reactivity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mockState = vi.hoisted(() => ({
  settings: null as unknown as ClientSettings,
  settingsListeners: new Set<() => void>(),
  playPackSynthesizedEvent: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));

const ENV_ID = "env-1" as EnvironmentId;
const envIdsAtom = Atom.make<ReadonlyArray<EnvironmentId>>([ENV_ID]);
const shellAtom = Atom.make<{
  readonly status: "live" | "loading";
  readonly snapshot: Option.Option<{
    readonly threads: ReadonlyArray<
      Pick<OrchestrationV2ThreadShell, "lineage" | "settledOverride" | "archivedAt"> & {
        readonly id: ThreadId;
      }
    >;
  }>;
}>({
  status: "loading",
  snapshot: Option.none(),
});

vi.mock("../hooks/useSettings", () => ({
  getClientSettings: () => mockState.settings,
  subscribeClientSettings: (listener: () => void) => {
    mockState.settingsListeners.add(listener);
    return () => {
      mockState.settingsListeners.delete(listener);
    };
  },
}));

vi.mock("../lib/soundEngine", () => ({
  playPackSynthesizedEvent: (...args: unknown[]) => mockState.playPackSynthesizedEvent(...args),
}));

vi.mock("../state/presentation", () => ({
  environmentSummaries: {
    environmentIdsAtom: envIdsAtom,
  },
}));

vi.mock("../state/shell", () => ({
  environmentShell: {
    stateValueAtom: () => shellAtom,
  },
}));

const threadShell = (id: string, settled: boolean) => ({
  id: id as ThreadId,
  lineage: {
    parentThreadId: null,
    relationshipToParent: null,
    rootThreadId: id,
  } as unknown as OrchestrationV2ThreadShell["lineage"],
  settledOverride: settled ? ("settled" as const) : null,
  archivedAt: null,
});

function setSettings(overrides: Partial<ClientSettings>): void {
  mockState.settings = { ...DEFAULT_CLIENT_SETTINGS, ...overrides };
  for (const listener of mockState.settingsListeners) listener();
}

describe("settleSounds playback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    mockState.settingsListeners.clear();
    mockState.settings = DEFAULT_CLIENT_SETTINGS;
    mockState.playPackSynthesizedEvent.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("plays the unsettle cue on settled -> unsettled transitions with resolved volume and independent debounce", async () => {
    const { playManualSettleSound, previewSettleSound, startSettleSounds } =
      await import("./settleSounds");
    const registry = AtomRegistry.make();
    setSettings({
      soundPack: "retro",
      soundVolume: 80,
      soundEventVolumes: { unsettle: 60 },
    });
    registry.set(shellAtom, {
      status: "live",
      snapshot: Option.some({ threads: [threadShell("t1", true), threadShell("t2", true)] }),
    });

    const stop = startSettleSounds(registry);
    try {
      expect(mockState.playPackSynthesizedEvent).not.toHaveBeenCalled();

      // A manual settle right before an unsettle (e.g. Undo) should not suppress the unsettle cue.
      playManualSettleSound();
      expect(mockState.playPackSynthesizedEvent).toHaveBeenLastCalledWith(
        "settle-manual",
        "retro",
        80,
      );

      registry.set(shellAtom, {
        status: "live",
        snapshot: Option.some({ threads: [threadShell("t1", false), threadShell("t2", true)] }),
      });
      expect(mockState.playPackSynthesizedEvent).toHaveBeenCalledTimes(2);
      expect(mockState.playPackSynthesizedEvent).toHaveBeenLastCalledWith("unsettle", "retro", 60);

      // A second unsettle within the gap window is debounced.
      vi.advanceTimersByTime(500);
      registry.set(shellAtom, {
        status: "live",
        snapshot: Option.some({ threads: [threadShell("t1", false), threadShell("t2", false)] }),
      });
      expect(mockState.playPackSynthesizedEvent).toHaveBeenCalledTimes(2);

      // Previewing unsettle directly respects the requested pack and volume.
      previewSettleSound(SETTLE_SOUND_PACK_DEFAULT, 0.45, { kind: "unsettle", pack: "galactic" });
      expect(mockState.playPackSynthesizedEvent).toHaveBeenLastCalledWith(
        "unsettle",
        "galactic",
        45,
      );
    } finally {
      stop();
    }
  });

  it("stays silent when unsettle sound is off or settle sounds are disabled", async () => {
    const { startSettleSounds } = await import("./settleSounds");
    const registry = AtomRegistry.make();
    setSettings({
      settleSounds: {
        ...DEFAULT_CLIENT_SETTINGS.settleSounds,
        unsettleSound: "",
      },
    });
    registry.set(shellAtom, {
      status: "live",
      snapshot: Option.some({ threads: [threadShell("t1", true)] }),
    });

    const stop = startSettleSounds(registry);
    try {
      registry.set(shellAtom, {
        status: "live",
        snapshot: Option.some({ threads: [threadShell("t1", false)] }),
      });
      expect(mockState.playPackSynthesizedEvent).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });
});
