import { DEFAULT_CLIENT_SETTINGS, type ClientSettings } from "@t3tools/contracts/settings";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../test/render";
import { SoundsSettingsPanel } from "./SoundsSettingsPanel";

const state = vi.hoisted(() => ({
  settings: null as unknown as ClientSettings,
  updateClientSettings: vi.fn<(patch: Partial<ClientSettings>) => Promise<void>>(),
  listSettleSounds: vi.fn<() => Promise<ReadonlyArray<string>>>(),
  previewSettleSound: vi.fn<(name: string, volume: number) => void>(),
  previewSoundEvent: vi.fn<(...args: unknown[]) => Promise<void>>(),
  playSnapShotSound: vi.fn<(...args: unknown[]) => void>(),
  listCustomSoundNames: vi.fn<() => Promise<Record<string, string>>>(),
}));

vi.mock(import("../../hooks/useSettings"), async (original) => ({
  ...(await original()),
  getClientSettings: () => state.settings,
  useClientSettings: ((selector?: (current: ClientSettings) => unknown) =>
    selector ? selector(state.settings) : state.settings) as never,
  updateClientSettings: ((patch: Partial<ClientSettings>) =>
    state.updateClientSettings(patch)) as never,
}));

vi.mock(import("../../fork/settleSounds"), () => ({
  listSettleSounds: () => state.listSettleSounds(),
  previewSettleSound: (name: string, volume: number) => state.previewSettleSound(name, volume),
}));

vi.mock(import("../../lib/soundEngine"), async (original) => ({
  ...(await original()),
  previewSoundEvent: (...args: unknown[]) => state.previewSoundEvent(...args),
}));

vi.mock(import("../../lib/snapShotSound"), () => ({
  playSnapShotSound: (...args: unknown[]) => state.playSnapShotSound(...args),
}));

vi.mock(import("../../lib/customSoundStore"), async (original) => ({
  ...(await original()),
  listCustomSoundNames: () => state.listCustomSoundNames(),
}));

function setup(overrides: Partial<ClientSettings> = {}) {
  state.settings = { ...DEFAULT_CLIENT_SETTINGS, ...overrides };
  state.updateClientSettings.mockReset().mockResolvedValue(undefined);
  state.listSettleSounds
    .mockReset()
    .mockResolvedValue([
      "Transformers-G1-Scene-Transition.wav",
      "Transformers-G1-Transformation.wav",
    ]);
  state.previewSettleSound.mockReset();
  state.previewSoundEvent.mockReset().mockResolvedValue(undefined);
  state.playSnapShotSound.mockReset();
  state.listCustomSoundNames.mockReset().mockResolvedValue({});
}

describe("SoundsSettingsPanel", () => {
  it("renders all unified sound sections and plays settle sounds at the resolved volume", async () => {
    setup({
      soundVolume: 75,
      soundEventVolumes: { "settle-manual": 40 },
    });

    await using _screen = await render(<SoundsSettingsPanel />, { router: "/settings/sounds" });

    await expect.element(page.getByRole("heading", { name: "Defaults", level: 2 })).toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "Settle sounds", level: 2 }))
      .toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "Notification events", level: 2 }))
      .toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "Voice & capture", level: 2 }))
      .toBeVisible();

    await userEvent.click(page.getByRole("button", { name: "Play manual settle sound" }));
    expect(state.previewSettleSound).toHaveBeenCalledWith(
      "Transformers-G1-Scene-Transition.wav",
      0.4,
    );

    await userEvent.click(page.getByRole("button", { name: "Play automatic settle sound" }));
    expect(state.previewSettleSound).toHaveBeenCalledWith(
      "Transformers-G1-Transformation.wav",
      0.75,
    );
  });

  it("lets any event reset a custom volume override back to master default", async () => {
    setup({
      soundVolume: 80,
      soundEventVolumes: { completion: 30 },
    });

    await using _screen = await render(<SoundsSettingsPanel />, { router: "/settings/sounds" });

    await userEvent.click(page.getByRole("button", { name: "Volume for Thread completed: 30%" }));
    await userEvent.click(page.getByRole("button", { name: "Use default" }));

    expect(state.updateClientSettings).toHaveBeenCalledWith({ soundEventVolumes: {} });
  });
});
