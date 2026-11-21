// Fork-only (MasonLoomis/t3code): unified Sounds settings page (/settings/sounds). See FORK.md.
import type { SnapShotSound } from "@t3tools/contracts";
import {
  DEFAULT_SOUND_EVENT_ENABLED,
  MAX_SOUND_VOLUME,
  MIN_SOUND_VOLUME,
  resolveSoundVolume,
  SETTLE_SOUND_PACK_DEFAULT,
  SOUND_FOCUS_POLICIES,
  SOUND_PACK_IDS,
  type ClientSettings,
  type CustomSoundClipId,
  type SoundEventId,
  type SoundPackId,
  type SoundThemeConfig,
  type SoundVolumeEventId,
} from "@t3tools/contracts/settings";
import { BUILT_IN_THEMES } from "@t3tools/shared/themePalettes";
import * as Schema from "effect/Schema";
import { msg, useGT, useMessages } from "gt-react";
import {
  CheckIcon,
  ChevronDownIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import { listSettleSounds, previewSettleSound } from "../../fork/settleSounds";
import { applySoundThemeConfig, isSoundThemeConfigActive } from "../../fork/soundThemeLinks";
import { useCustomThemes } from "../../hooks/useCustomThemes";
import { useEnvironmentThemeDefinitions } from "../../hooks/useEnvironmentTheme";
import {
  getClientSettings,
  updateClientSettings,
  useClientSettings,
} from "../../hooks/useSettings";
import { useTheme } from "../../hooks/useTheme";
import {
  CustomSoundError,
  exportCustomSoundPack,
  importCustomSoundPack,
  listCustomSoundNames,
  resetCustomSound,
  saveCustomSound,
} from "../../lib/customSoundStore";
import { playSnapShotSound } from "../../lib/snapShotSound";
import { decodeCustomSound, previewSoundEvent, soundEventEnabled } from "../../lib/soundEngine";
import { SOUND_EVENT_LABELS, SOUND_PACK_LABELS } from "../../lib/soundLabels";
import { randomUUID } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Radio, RadioGroup } from "../ui/radio-group";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";

type SettleSounds = ClientSettings["settleSounds"];

const SETTLE_OFF = "__off__";

const NOTIFICATION_EVENT_IDS: ReadonlyArray<SoundEventId> = [
  "completion",
  "input",
  "approval",
  "failed",
  "all-done",
];

const VOICE_EVENT_IDS: ReadonlyArray<SoundEventId> = ["voice-start", "voice-stop", "voice-error"];

const FOCUS_LABELS = {
  always: msg("Always"),
  "background-threads": msg("Other threads or unfocused"),
  unfocused: msg("Only when unfocused"),
};

const FILE_ERRORS = {
  size: msg("Choose a nonempty audio file up to 1 MB."),
  format: msg("Choose an MP3, WAV, OGG, or M4A file."),
  decode: msg("This device could not decode the audio file."),
  duration: msg("Choose a mono or stereo clip up to 10 seconds long."),
  pack: msg("This JSON file is not a valid sound pack."),
};

const isCustomSoundError = Schema.is(CustomSoundError);

interface ThemeOption {
  readonly id: string;
  readonly label: string;
}

interface SoundThemeDraft {
  readonly id: string | null;
  readonly name: string;
  readonly themeId: string;
  readonly soundPack: SoundPackId;
  readonly settleManualSound: string;
  readonly settleAutomaticSound: string;
  readonly unsettleSound: string;
  readonly autoApplyWithTheme: boolean;
}

function useAvailableThemeOptions(): ReadonlyArray<ThemeOption> {
  const gt = useGT();
  const customThemes = useCustomThemes();
  const environmentThemes = useEnvironmentThemeDefinitions();
  const seen = new Set<string>(["system", "light", "dark"]);
  const options: ThemeOption[] = [
    { id: "system", label: gt("T3 Code (System)") },
    { id: "light", label: gt("T3 Code (Light)") },
    { id: "dark", label: gt("T3 Code (Dark)") },
  ];
  for (const theme of [...BUILT_IN_THEMES, ...customThemes, ...environmentThemes]) {
    if (seen.has(theme.id)) continue;
    seen.add(theme.id);
    options.push({ id: theme.id, label: theme.label });
  }
  return options;
}

function volumeSliderStyle(value: number): CSSProperties {
  const ratio = value / MAX_SOUND_VOLUME;
  return {
    "--settings-slider-progress": `${value}%`,
    "--settings-slider-fill-offset": `${0.5 - ratio}rem`,
  } as CSSProperties;
}

function updateEventVolume(event: SoundVolumeEventId, volume: number | undefined): void {
  const overrides = { ...getClientSettings().soundEventVolumes };
  if (volume === undefined) delete overrides[event];
  else overrides[event] = volume;
  void updateClientSettings({ soundEventVolumes: overrides });
}

function EventVolumeControl(props: {
  readonly event: SoundVolumeEventId;
  readonly label: string;
  readonly masterVolume: number;
  readonly overrideVolume: number | undefined;
  readonly onPreview: (volume: number) => void;
}) {
  const gt = useGT();
  const effectiveVolume = props.overrideVolume ?? props.masterVolume;
  const isCustom = props.overrideVolume !== undefined;
  const [draftVolume, setDraftVolume] = useState<number | null>(null);
  const displayedVolume = draftVolume ?? effectiveVolume;

  const commit = (value: number) => {
    setDraftVolume(null);
    const next = value === props.masterVolume ? undefined : value;
    updateEventVolume(props.event, next);
    props.onPreview(value);
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant={isCustom ? "secondary" : "ghost"}
            size="xs"
            aria-label={gt("Volume for {sound}: {volume}%", {
              sound: props.label,
              volume: effectiveVolume,
            })}
          />
        }
      >
        {effectiveVolume === 0 ? <VolumeXIcon aria-hidden /> : <Volume2Icon aria-hidden />}
        <span className="tabular-nums">{isCustom ? `${effectiveVolume}%` : gt("Default")}</span>
      </PopoverTrigger>
      <PopoverPopup align="end" width="sm" padding="compact" aria-label={gt("Volume")}>
        <div className="space-y-3 p-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-foreground">{props.label}</span>
            <output className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-foreground">
              {displayedVolume}%
            </output>
          </div>
          <input
            aria-label={gt("{sound} volume", { sound: props.label })}
            className="settings-slider w-full"
            type="range"
            min={MIN_SOUND_VOLUME}
            max={MAX_SOUND_VOLUME}
            value={displayedVolume}
            style={volumeSliderStyle(displayedVolume)}
            onChange={(event) => setDraftVolume(event.currentTarget.valueAsNumber)}
            onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
            onPointerUp={(event) => commit(event.currentTarget.valueAsNumber)}
            onPointerCancel={() => setDraftVolume(null)}
            onKeyUp={(event) => {
              if (draftVolume !== null) commit(event.currentTarget.valueAsNumber);
            }}
            onBlur={(event) => {
              if (draftVolume !== null) commit(event.currentTarget.valueAsNumber);
            }}
          />
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {isCustom
                ? gt("Custom override")
                : gt("Using master volume ({volume}%)", { volume: props.masterVolume })}
            </span>
            {isCustom && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setDraftVolume(null);
                  updateEventVolume(props.event, undefined);
                  props.onPreview(props.masterVolume);
                }}
              >
                <RotateCcwIcon aria-hidden />
                {gt("Use default")}
              </Button>
            )}
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function SettleSoundPicker(props: {
  readonly label: string;
  readonly value: string;
  readonly packLabel: string;
  readonly available: ReadonlyArray<string>;
  readonly onChange: (value: string) => void;
}) {
  const gt = useGT();
  const isPackDefault = props.value === SETTLE_SOUND_PACK_DEFAULT;
  const isCustomFile = props.value.length > 0 && !isPackDefault;
  const options =
    isCustomFile && !props.available.includes(props.value)
      ? [...props.available, props.value]
      : props.available;
  return (
    <Select
      value={props.value || SETTLE_OFF}
      onValueChange={(value) => {
        if (typeof value === "string") props.onChange(value === SETTLE_OFF ? "" : value);
      }}
    >
      <SelectTrigger size="sm" className="w-full sm:w-56" aria-label={props.label}>
        <SelectValue>
          {isPackDefault
            ? gt("Pack default ({pack})", { pack: props.packLabel })
            : isCustomFile
              ? props.available.includes(props.value)
                ? props.value
                : gt("{file} (missing)", { file: props.value })
              : gt("Off")}
        </SelectValue>
      </SelectTrigger>
      <SelectPopup align="end" alignItemWithTrigger={false}>
        <SelectItem hideIndicator value={SETTLE_SOUND_PACK_DEFAULT}>
          {gt("Pack default ({pack})", { pack: props.packLabel })}
        </SelectItem>
        <SelectItem hideIndicator value={SETTLE_OFF}>
          {gt("Off")}
        </SelectItem>
        {options.map((name) => (
          <SelectItem key={name} hideIndicator value={name}>
            {name}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

function SoundThemeConfigsSection(props: {
  readonly availableSettleSounds: ReadonlyArray<string>;
}) {
  const gt = useGT();
  const m = useMessages();
  const setting = useSearchableSetting();
  const { theme } = useTheme();
  const themeOptions = useAvailableThemeOptions();
  const soundPack = useClientSettings((settings) => settings.soundPack);
  const settleSounds = useClientSettings((settings) => settings.settleSounds);
  const configs = useClientSettings((settings) => settings.soundThemeConfigs);
  const [draft, setDraft] = useState<SoundThemeDraft | null>(null);

  const themeLabelFor = (themeId: string) =>
    themeOptions.find((option) => option.id === themeId)?.label ?? themeId;

  const describeSettle = (config: SoundThemeConfig) => {
    if (
      config.settleManualSound === SETTLE_SOUND_PACK_DEFAULT &&
      config.settleAutomaticSound === SETTLE_SOUND_PACK_DEFAULT &&
      config.unsettleSound === SETTLE_SOUND_PACK_DEFAULT
    ) {
      return gt("Pack settle sounds");
    }
    if (
      config.settleManualSound === "" &&
      config.settleAutomaticSound === "" &&
      config.unsettleSound === ""
    ) {
      return gt("Settle sounds off");
    }
    if (
      config.settleManualSound === config.settleAutomaticSound &&
      config.settleManualSound === config.unsettleSound &&
      config.settleManualSound
    ) {
      return config.settleManualSound;
    }
    return gt("Custom settle sounds");
  };

  const openNewDraft = () => {
    setDraft({
      id: null,
      name: "",
      themeId: theme,
      soundPack,
      settleManualSound: settleSounds.manualSound,
      settleAutomaticSound: settleSounds.automaticSound,
      unsettleSound: settleSounds.unsettleSound,
      autoApplyWithTheme: true,
    });
  };

  const openEditDraft = (config: SoundThemeConfig) => {
    setDraft({
      id: config.id,
      name: config.name,
      themeId: config.themeId,
      soundPack: config.soundPack,
      settleManualSound: config.settleManualSound,
      settleAutomaticSound: config.settleAutomaticSound,
      unsettleSound: config.unsettleSound,
      autoApplyWithTheme: config.autoApplyWithTheme,
    });
  };

  const saveDraft = () => {
    if (!draft) return;
    const trimmedName = draft.name.trim();
    if (!trimmedName) return;
    const nextConfig: SoundThemeConfig = {
      id: draft.id ?? randomUUID(),
      name: trimmedName,
      themeId: draft.themeId,
      soundPack: draft.soundPack,
      settleManualSound: draft.settleManualSound,
      settleAutomaticSound: draft.settleAutomaticSound,
      unsettleSound: draft.unsettleSound,
      autoApplyWithTheme: draft.autoApplyWithTheme,
    };
    const nextConfigs =
      draft.id === null
        ? [...configs, nextConfig]
        : configs.map((item) => (item.id === draft.id ? nextConfig : item));
    void updateClientSettings({ soundThemeConfigs: nextConfigs });
    setDraft(null);
  };

  const removeConfig = (id: string) => {
    void updateClientSettings({
      soundThemeConfigs: configs.filter((item) => item.id !== id),
    });
    if (draft?.id === id) setDraft(null);
  };

  const toggleAutoApply = (id: string, autoApplyWithTheme: boolean) => {
    void updateClientSettings({
      soundThemeConfigs: configs.map((item) =>
        item.id === id ? { ...item, autoApplyWithTheme } : item,
      ),
    });
  };

  const draftThemeOptions =
    draft && !themeOptions.some((option) => option.id === draft.themeId)
      ? [...themeOptions, { id: draft.themeId, label: draft.themeId }]
      : themeOptions;

  return (
    <SettingsSection id="sounds-theme-configs" title={gt("Theme & sound configs")}>
      <SettingsRow
        {...setting("sounds-theme-configs")}
        description={gt(
          "Pair a UI theme with a sound pack and saved settle sounds. Switching to a linked theme applies its sounds automatically.",
        )}
        devicePreference
        control={
          <Button variant="outline" size="sm" onClick={openNewDraft}>
            <PlusIcon aria-hidden />
            {gt("New config")}
          </Button>
        }
      />

      {configs.length > 0 && (
        <ul className="divide-y divide-border/60 border-t border-border/60">
          {configs.map((config) => {
            const active = isSoundThemeConfigActive(config, theme, {
              soundPack,
              settleSounds,
            });
            return (
              <li
                key={config.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5 sm:px-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{config.name}</span>
                    {active && (
                      <Badge variant="secondary">
                        <CheckIcon className="size-3" aria-hidden />
                        {gt("Active")}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {themeLabelFor(config.themeId)} · {m(SOUND_PACK_LABELS[config.soundPack])} ·{" "}
                    {describeSettle(config)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch
                      size="sm"
                      checked={config.autoApplyWithTheme}
                      aria-label={gt("Auto-apply {name} when theme is selected", {
                        name: config.name,
                      })}
                      onCheckedChange={(checked) => toggleAutoApply(config.id, checked)}
                    />
                    <span>{gt("Link to theme")}</span>
                  </label>
                  <Button
                    variant={active ? "secondary" : "outline"}
                    size="xs"
                    aria-label={gt("Apply {name}", { name: config.name })}
                    onClick={() => void applySoundThemeConfig(config, { preview: true })}
                  >
                    {gt("Apply")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label={gt("Edit {name}", { name: config.name })}
                    onClick={() => openEditDraft(config)}
                  >
                    <PencilIcon aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label={gt("Delete {name}", { name: config.name })}
                    onClick={() => removeConfig(config.id)}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {draft && (
        <div className="space-y-3 border-t border-border/60 bg-muted/20 px-3 py-3 sm:px-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="sound-theme-config-name"
                className="text-xs font-medium text-foreground"
              >
                {gt("Config name")}
              </label>
              <Input
                id="sound-theme-config-name"
                size="sm"
                placeholder={gt("e.g. Transformers")}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-foreground">{gt("UI theme")}</div>
              <Select
                value={draft.themeId}
                onValueChange={(value) => {
                  if (typeof value === "string") setDraft({ ...draft, themeId: value });
                }}
              >
                <SelectTrigger size="sm" className="w-full" aria-label={gt("Config UI theme")}>
                  <SelectValue>{themeLabelFor(draft.themeId)}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {draftThemeOptions.map((option) => (
                    <SelectItem key={option.id} hideIndicator value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-foreground">{gt("Sound pack")}</div>
              <Select
                value={draft.soundPack}
                onValueChange={(value) => {
                  const selected = SOUND_PACK_IDS.find((candidate) => candidate === value);
                  if (selected) setDraft({ ...draft, soundPack: selected });
                }}
              >
                <SelectTrigger size="sm" className="w-full" aria-label={gt("Config sound pack")}>
                  <SelectValue>{m(SOUND_PACK_LABELS[draft.soundPack])}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {SOUND_PACK_IDS.map((option) => (
                    <SelectItem key={option} hideIndicator value={option}>
                      {m(SOUND_PACK_LABELS[option])}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-foreground">{gt("Manual settle sound")}</div>
              <SettleSoundPicker
                label={gt("Config manual settle sound")}
                value={draft.settleManualSound}
                packLabel={m(SOUND_PACK_LABELS[draft.soundPack])}
                available={props.availableSettleSounds}
                onChange={(settleManualSound) => setDraft({ ...draft, settleManualSound })}
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-foreground">
                {gt("Automatic settle sound")}
              </div>
              <SettleSoundPicker
                label={gt("Config automatic settle sound")}
                value={draft.settleAutomaticSound}
                packLabel={m(SOUND_PACK_LABELS[draft.soundPack])}
                available={props.availableSettleSounds}
                onChange={(settleAutomaticSound) => setDraft({ ...draft, settleAutomaticSound })}
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-foreground">{gt("Unsettle sound")}</div>
              <SettleSoundPicker
                label={gt("Config unsettle sound")}
                value={draft.unsettleSound}
                packLabel={m(SOUND_PACK_LABELS[draft.soundPack])}
                available={props.availableSettleSounds}
                onChange={(unsettleSound) => setDraft({ ...draft, unsettleSound })}
              />
            </div>
            <div className="flex items-end sm:col-span-2">
              <label className="flex cursor-pointer items-center gap-2 py-1.5 text-sm text-foreground">
                <Switch
                  size="sm"
                  checked={draft.autoApplyWithTheme}
                  onCheckedChange={(autoApplyWithTheme) =>
                    setDraft({ ...draft, autoApplyWithTheme })
                  }
                />
                <span>{gt("Auto-apply when switching to this theme")}</span>
              </label>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
              {gt("Cancel")}
            </Button>
            <Button size="sm" disabled={draft.name.trim().length === 0} onClick={saveDraft}>
              {draft.id === null ? gt("Save config") : gt("Update config")}
            </Button>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}

export function SoundsSettingsPanel() {
  const gt = useGT();
  const m = useMessages();
  const setting = useSearchableSetting();

  const pack = useClientSettings((settings) => settings.soundPack);
  const masterVolume = useClientSettings((settings) => settings.soundVolume);
  const focus = useClientSettings((settings) => settings.soundFocusPolicy);
  const soundEvents = useClientSettings((settings) => settings.soundEvents);
  const soundEventVolumes = useClientSettings((settings) => settings.soundEventVolumes);
  const settleSounds = useClientSettings((settings) => settings.settleSounds);
  const snapShotPlaySound = useClientSettings((settings) => settings.snapShotPlaySound);
  const snapShotSound = useClientSettings((settings) => settings.snapShotSound);

  const [draftMasterVolume, setDraftMasterVolume] = useState<number | null>(null);
  const displayedMasterVolume = draftMasterVolume ?? masterVolume;

  const [availableSettleSounds, setAvailableSettleSounds] = useState<ReadonlyArray<string>>([]);
  const [customNames, setCustomNames] =
    useState<Awaited<ReturnType<typeof listCustomSoundNames>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CustomSoundError["reason"] | "storage" | null>(null);

  const audioInput = useRef<HTMLInputElement>(null);
  const packInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<CustomSoundClipId | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- loads folder sounds and device-local custom clips once when the page mounts
  useEffect(() => {
    let mounted = true;
    void listSettleSounds().then((sounds) => {
      if (mounted) setAvailableSettleSounds(sounds);
    });
    void listCustomSoundNames().then(
      (result) => {
        if (mounted) setCustomNames(result);
      },
      () => {
        if (mounted) setError("storage");
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  const commitMasterVolume = (value: number) => {
    setDraftMasterVolume(null);
    if (value === masterVolume) return;
    void updateClientSettings({ soundVolume: value });
    void previewSoundEvent("completion", { ...getClientSettings(), soundVolume: value }, pack);
  };

  const saveSettle = (patch: Partial<SettleSounds>) =>
    void updateClientSettings({ settleSounds: { ...settleSounds, ...patch } });

  const mutateCustomClips = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      setCustomNames(await listCustomSoundNames());
    } catch (caught) {
      setError(isCustomSoundError(caught) ? caught.reason : "storage");
    }
    // Not a `finally` block: React Compiler can't lower try/finally and would skip this
    // whole component. The catch never rethrows, so this always runs.
    setBusy(false);
  };

  const downloadPack = async () => {
    setError(null);
    try {
      const json = await exportCustomSoundPack();
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "t3-code-sound-pack.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setError("storage");
    }
  };

  const packLabel = m(SOUND_PACK_LABELS[pack]);

  const renderEventRow = (event: SoundEventId) => {
    const label = m(SOUND_EVENT_LABELS[event]);
    const customName = customNames?.[event];
    const overrideVolume = soundEventVolumes[event];
    const effectiveVolume = resolveSoundVolume(event, {
      soundVolume: masterVolume,
      soundEventVolumes,
    });
    return (
      <li
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5 sm:px-4"
        key={event}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Switch
            size="sm"
            aria-label={label}
            checked={soundEventEnabled(event, { soundEvents })}
            onCheckedChange={(enabled) => {
              const overrides = { ...getClientSettings().soundEvents };
              if (enabled === DEFAULT_SOUND_EVENT_ENABLED[event]) delete overrides[event];
              else overrides[event] = enabled;
              void updateClientSettings({ soundEvents: overrides });
            }}
          />
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{label}</div>
            <div className="text-xs wrap-anywhere text-muted-foreground">
              {customName ?? gt("Pack default ({pack})", { pack: packLabel })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <EventVolumeControl
            event={event}
            label={label}
            masterVolume={masterVolume}
            overrideVolume={overrideVolume}
            onPreview={(volume) => {
              const current = getClientSettings();
              void previewSoundEvent(event, {
                ...current,
                soundEventVolumes: { ...current.soundEventVolumes, [event]: volume },
              });
            }}
          />
          <Button
            variant="ghost"
            size="xs"
            disabled={effectiveVolume === 0}
            aria-label={gt("Play {sound}", { sound: label })}
            onClick={() => void previewSoundEvent(event, getClientSettings())}
          >
            <PlayIcon aria-hidden />
            {gt("Play")}
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={busy || !customNames}
            aria-label={gt("Upload audio for {sound}", { sound: label })}
            onClick={() => {
              uploadTarget.current = event;
              audioInput.current?.click();
            }}
          >
            {gt("Upload audio")}
          </Button>
          {customName && (
            <Button
              variant="ghost"
              size="xs"
              disabled={busy}
              aria-label={gt("Reset {sound} to pack", { sound: label })}
              onClick={() => void mutateCustomClips(() => resetCustomSound(event))}
            >
              {gt("Reset")}
            </Button>
          )}
        </div>
      </li>
    );
  };

  const manualSettleVolume = resolveSoundVolume("settle-manual", {
    soundVolume: masterVolume,
    soundEventVolumes,
  });
  const automaticSettleVolume = resolveSoundVolume("settle-automatic", {
    soundVolume: masterVolume,
    soundEventVolumes,
  });
  const unsettleVolume = resolveSoundVolume("unsettle", {
    soundVolume: masterVolume,
    soundEventVolumes,
  });
  const snapShotVolume = resolveSoundVolume("snap-shot", {
    soundVolume: masterVolume,
    soundEventVolumes,
  });
  const snapShotCustomName = customNames?.["snap-shot"];

  return (
    <SettingsPageContainer>
      <input
        ref={audioInput}
        type="file"
        hidden
        accept=".mp3,.wav,.ogg,.m4a"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          const target = uploadTarget.current;
          if (file && target) {
            void mutateCustomClips(() => saveCustomSound(target, file, decodeCustomSound));
          }
        }}
      />
      <input
        ref={packInput}
        type="file"
        hidden
        accept=".json,application/json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void mutateCustomClips(() => importCustomSoundPack(file, decodeCustomSound));
        }}
      />

      <SettingsSection id="sounds-defaults" title={gt("Defaults")}>
        <SettingsRow
          {...setting("notification-sound-pack")}
          description={gt("Default sound theme for notification, settle, and dictation cues.")}
          devicePreference
          control={
            <Popover>
              <PopoverTrigger
                render={<Button variant="outline" size="sm" />}
                aria-label={gt("Sound pack")}
              >
                {packLabel}
                <ChevronDownIcon aria-hidden />
              </PopoverTrigger>
              <PopoverPopup align="end" width="sm" padding="compact" aria-label={gt("Sound pack")}>
                <RadioGroup
                  aria-label={gt("Sound pack")}
                  value={pack}
                  onValueChange={(value) => {
                    const selected = SOUND_PACK_IDS.find((candidate) => candidate === value);
                    if (selected) void updateClientSettings({ soundPack: selected });
                  }}
                >
                  {SOUND_PACK_IDS.map((option) => (
                    <div key={option} className="flex items-center justify-between gap-2">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                        <Radio aria-label={m(SOUND_PACK_LABELS[option])} value={option} />
                        <span>{m(SOUND_PACK_LABELS[option])}</span>
                      </label>
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={masterVolume === 0}
                        aria-label={gt("Play {sound}", { sound: m(SOUND_PACK_LABELS[option]) })}
                        onClick={() =>
                          void previewSoundEvent("completion", getClientSettings(), option)
                        }
                      >
                        <PlayIcon aria-hidden />
                        {gt("Play")}
                      </Button>
                    </div>
                  ))}
                </RadioGroup>
              </PopoverPopup>
            </Popover>
          }
        />
        <SettingsRow
          {...setting("notification-sound-volume")}
          description={gt(
            "Default volume for all sounds. Any sound below can set its own volume override.",
          )}
          devicePreference
          control={
            <div className="flex w-full items-center gap-3 sm:w-52">
              <output
                className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                htmlFor="master-sound-volume"
              >
                {displayedMasterVolume}%
              </output>
              <input
                id="master-sound-volume"
                aria-label={gt("Sound volume")}
                className="settings-slider min-w-0 flex-1"
                type="range"
                min={MIN_SOUND_VOLUME}
                max={MAX_SOUND_VOLUME}
                value={displayedMasterVolume}
                style={volumeSliderStyle(displayedMasterVolume)}
                onChange={(event) => setDraftMasterVolume(event.currentTarget.valueAsNumber)}
                onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
                onPointerUp={(event) => commitMasterVolume(event.currentTarget.valueAsNumber)}
                onPointerCancel={() => setDraftMasterVolume(null)}
                onKeyUp={(event) => {
                  if (draftMasterVolume !== null)
                    commitMasterVolume(event.currentTarget.valueAsNumber);
                }}
                onBlur={(event) => {
                  if (draftMasterVolume !== null)
                    commitMasterVolume(event.currentTarget.valueAsNumber);
                }}
              />
            </div>
          }
        />
        <SettingsRow
          {...setting("notification-sound-focus")}
          description={gt("Controls when thread notification chimes play based on window focus.")}
          devicePreference
          control={
            <Select
              value={focus}
              onValueChange={(value) => {
                const policy = SOUND_FOCUS_POLICIES.find((candidate) => candidate === value);
                if (policy) void updateClientSettings({ soundFocusPolicy: policy });
              }}
            >
              <SelectTrigger size="sm" aria-label={gt("When notification sounds play")}>
                <SelectValue>{m(FOCUS_LABELS[focus])}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {SOUND_FOCUS_POLICIES.map((policy) => (
                  <SelectItem key={policy} value={policy}>
                    {m(FOCUS_LABELS[policy])}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>

      <SoundThemeConfigsSection availableSettleSounds={availableSettleSounds} />

      <SettingsSection id="settle-sounds" title={gt("Settle sounds")}>
        <SettingsRow
          {...setting("settle-sounds")}
          description={gt(
            "Play a sound when a thread settles or unsettles. Also in the chat header. Defaults follow your sound pack; saved files live in the sounds folder inside your T3 Code data folder.",
          )}
          devicePreference
          control={
            <Switch
              checked={settleSounds.enabled}
              onCheckedChange={(enabled) => saveSettle({ enabled })}
              aria-label={gt("Settle sounds")}
            />
          }
        />
        <SettingsRow
          {...setting("settle-sound-manual")}
          description={gt("Plays when you settle a thread from this app.")}
          devicePreference
          control={
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <SettleSoundPicker
                label={gt("Manual settle sound")}
                value={settleSounds.manualSound}
                packLabel={packLabel}
                available={availableSettleSounds}
                onChange={(manualSound) => saveSettle({ manualSound })}
              />
              <EventVolumeControl
                event="settle-manual"
                label={gt("When you settle a thread")}
                masterVolume={masterVolume}
                overrideVolume={soundEventVolumes["settle-manual"]}
                onPreview={(volume) =>
                  previewSettleSound(settleSounds.manualSound, volume / 100, {
                    kind: "manual",
                    pack,
                  })
                }
              />
              <Button
                size="xs"
                variant="ghost"
                disabled={!settleSounds.manualSound || manualSettleVolume === 0}
                aria-label={gt("Play manual settle sound")}
                onClick={() =>
                  previewSettleSound(settleSounds.manualSound, manualSettleVolume / 100, {
                    kind: "manual",
                    pack,
                  })
                }
              >
                <PlayIcon aria-hidden />
                {gt("Play")}
              </Button>
            </div>
          }
        />
        <SettingsRow
          {...setting("settle-sound-automatic")}
          description={gt(
            "Plays when a thread settles on its own: after a merge, after idle days, or when an agent or another device settles it.",
          )}
          devicePreference
          control={
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <SettleSoundPicker
                label={gt("Automatic settle sound")}
                value={settleSounds.automaticSound}
                packLabel={packLabel}
                available={availableSettleSounds}
                onChange={(automaticSound) => saveSettle({ automaticSound })}
              />
              <EventVolumeControl
                event="settle-automatic"
                label={gt("When T3 Code settles a thread")}
                masterVolume={masterVolume}
                overrideVolume={soundEventVolumes["settle-automatic"]}
                onPreview={(volume) =>
                  previewSettleSound(settleSounds.automaticSound, volume / 100, {
                    kind: "automatic",
                    pack,
                  })
                }
              />
              <Button
                size="xs"
                variant="ghost"
                disabled={!settleSounds.automaticSound || automaticSettleVolume === 0}
                aria-label={gt("Play automatic settle sound")}
                onClick={() =>
                  previewSettleSound(settleSounds.automaticSound, automaticSettleVolume / 100, {
                    kind: "automatic",
                    pack,
                  })
                }
              >
                <PlayIcon aria-hidden />
                {gt("Play")}
              </Button>
            </div>
          }
        />
        <SettingsRow
          {...setting("settle-sound-unsettle")}
          description={gt(
            "Plays when a settled thread wakes back up: when you unsettle it, send a message, or another device or agent unsettles it.",
          )}
          devicePreference
          control={
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <SettleSoundPicker
                label={gt("Unsettle sound")}
                value={settleSounds.unsettleSound}
                packLabel={packLabel}
                available={availableSettleSounds}
                onChange={(unsettleSound) => saveSettle({ unsettleSound })}
              />
              <EventVolumeControl
                event="unsettle"
                label={gt("When a thread unsettles")}
                masterVolume={masterVolume}
                overrideVolume={soundEventVolumes.unsettle}
                onPreview={(volume) =>
                  previewSettleSound(settleSounds.unsettleSound, volume / 100, {
                    kind: "unsettle",
                    pack,
                  })
                }
              />
              <Button
                size="xs"
                variant="ghost"
                disabled={!settleSounds.unsettleSound || unsettleVolume === 0}
                aria-label={gt("Play unsettle sound")}
                onClick={() =>
                  previewSettleSound(settleSounds.unsettleSound, unsettleVolume / 100, {
                    kind: "unsettle",
                    pack,
                  })
                }
              >
                <PlayIcon aria-hidden />
                {gt("Play")}
              </Button>
            </div>
          }
        />
      </SettingsSection>

      <SettingsSection id="sounds-notifications" title={gt("Notification events")}>
        <ul className="divide-y divide-border/60">{NOTIFICATION_EVENT_IDS.map(renderEventRow)}</ul>
      </SettingsSection>

      <SettingsSection id="sounds-voice-capture" title={gt("Voice & capture")}>
        <ul className="divide-y divide-border/60">
          {VOICE_EVENT_IDS.map(renderEventRow)}
          <li
            id="sounds-snap-shot"
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5 sm:px-4"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Switch
                size="sm"
                aria-label={gt("SnapShot capture")}
                checked={snapShotPlaySound}
                onCheckedChange={(checked) =>
                  void updateClientSettings({ snapShotPlaySound: checked })
                }
              />
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{gt("SnapShot capture")}</div>
                <div className="text-xs wrap-anywhere text-muted-foreground">
                  {snapShotCustomName ??
                    (snapShotSound === "soft-pop" ? gt("Whoosh (Default)") : gt("Click"))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Select
                value={snapShotSound}
                onValueChange={(value) => {
                  if (value === "soft-pop" || value === "camera-shutter") {
                    void updateClientSettings({ snapShotSound: value as SnapShotSound });
                  }
                }}
              >
                <SelectTrigger size="xs" className="w-36" aria-label={gt("SnapShot sound preset")}>
                  <SelectValue>
                    {snapShotSound === "soft-pop" ? gt("Whoosh (Default)") : gt("Click")}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="soft-pop">
                    {gt("Whoosh (Default)")}
                  </SelectItem>
                  <SelectItem hideIndicator value="camera-shutter">
                    {gt("Click")}
                  </SelectItem>
                </SelectPopup>
              </Select>
              <EventVolumeControl
                event="snap-shot"
                label={gt("SnapShot capture")}
                masterVolume={masterVolume}
                overrideVolume={soundEventVolumes["snap-shot"]}
                onPreview={() => playSnapShotSound(snapShotSound)}
              />
              <Button
                variant="ghost"
                size="xs"
                disabled={snapShotVolume === 0}
                aria-label={gt("Play {sound}", { sound: gt("SnapShot capture") })}
                onClick={() => playSnapShotSound(snapShotSound)}
              >
                <PlayIcon aria-hidden />
                {gt("Play")}
              </Button>
              <Button
                variant="outline"
                size="xs"
                disabled={busy || !customNames}
                aria-label={gt("Upload audio for {sound}", { sound: gt("SnapShot capture") })}
                onClick={() => {
                  uploadTarget.current = "snap-shot";
                  audioInput.current?.click();
                }}
              >
                {gt("Upload audio")}
              </Button>
              {snapShotCustomName && (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy}
                  aria-label={gt("Reset {sound} to default", { sound: gt("SnapShot capture") })}
                  onClick={() => void mutateCustomClips(() => resetCustomSound("snap-shot"))}
                >
                  {gt("Reset")}
                </Button>
              )}
            </div>
          </li>
        </ul>
      </SettingsSection>

      <SettingsSection id="sounds-custom-packs" title={gt("Custom sound packs")}>
        <SettingsRow
          {...setting("notification-sound-events")}
          description={gt("Import or export your uploaded custom audio clips as a JSON pack.")}
          devicePreference
          control={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !customNames}
                onClick={() => packInput.current?.click()}
              >
                {gt("Import sound pack")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !customNames || Object.keys(customNames).length === 0}
                onClick={() => void downloadPack()}
              >
                {gt("Export sound pack")}
              </Button>
            </div>
          }
        />
        {error && (
          <p role="alert" className="px-3 py-2 text-sm text-destructive sm:px-4">
            {error === "storage"
              ? gt("Could not access custom sounds on this device.")
              : m(FILE_ERRORS[error])}
          </p>
        )}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
