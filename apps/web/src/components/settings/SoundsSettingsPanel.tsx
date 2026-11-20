// Fork-only (MasonLoomis/t3code): unified Sounds settings page (/settings/sounds). See FORK.md.
import type { SnapShotSound } from "@t3tools/contracts";
import {
  DEFAULT_SOUND_EVENT_ENABLED,
  MAX_SOUND_VOLUME,
  MIN_SOUND_VOLUME,
  resolveSoundVolume,
  SOUND_FOCUS_POLICIES,
  SOUND_PACK_IDS,
  type ClientSettings,
  type CustomSoundClipId,
  type SoundEventId,
  type SoundVolumeEventId,
} from "@t3tools/contracts/settings";
import * as Schema from "effect/Schema";
import { msg, useGT, useMessages } from "gt-react";
import { ChevronDownIcon, PlayIcon, RotateCcwIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import { listSettleSounds, previewSettleSound } from "../../fork/settleSounds";
import {
  getClientSettings,
  updateClientSettings,
  useClientSettings,
} from "../../hooks/useSettings";
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
import { Button } from "../ui/button";
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
  readonly available: ReadonlyArray<string>;
  readonly onChange: (value: string) => void;
}) {
  const gt = useGT();
  const options =
    props.value && !props.available.includes(props.value)
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
          {props.value
            ? props.available.includes(props.value)
              ? props.value
              : gt("{file} (missing)", { file: props.value })
            : gt("Off")}
        </SelectValue>
      </SelectTrigger>
      <SelectPopup align="end" alignItemWithTrigger={false}>
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
    } finally {
      setBusy(false);
    }
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
              {customName ?? gt("Pack default ({pack})", { pack: m(SOUND_PACK_LABELS[pack]) })}
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
          description={gt("Default sound theme for notification and dictation cues.")}
          devicePreference
          control={
            <Popover>
              <PopoverTrigger
                render={<Button variant="outline" size="sm" />}
                aria-label={gt("Sound pack")}
              >
                {m(SOUND_PACK_LABELS[pack])}
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

      <SettingsSection id="settle-sounds" title={gt("Settle sounds")}>
        <SettingsRow
          {...setting("settle-sounds")}
          description={gt(
            "Play a sound when a thread settles. Also in the chat header. Files come from the sounds folder inside your T3 Code data folder.",
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
                available={availableSettleSounds}
                onChange={(manualSound) => saveSettle({ manualSound })}
              />
              <EventVolumeControl
                event="settle-manual"
                label={gt("When you settle a thread")}
                masterVolume={masterVolume}
                overrideVolume={soundEventVolumes["settle-manual"]}
                onPreview={(volume) => previewSettleSound(settleSounds.manualSound, volume / 100)}
              />
              <Button
                size="xs"
                variant="ghost"
                disabled={!settleSounds.manualSound || manualSettleVolume === 0}
                aria-label={gt("Play manual settle sound")}
                onClick={() =>
                  previewSettleSound(settleSounds.manualSound, manualSettleVolume / 100)
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
                available={availableSettleSounds}
                onChange={(automaticSound) => saveSettle({ automaticSound })}
              />
              <EventVolumeControl
                event="settle-automatic"
                label={gt("When T3 Code settles a thread")}
                masterVolume={masterVolume}
                overrideVolume={soundEventVolumes["settle-automatic"]}
                onPreview={(volume) =>
                  previewSettleSound(settleSounds.automaticSound, volume / 100)
                }
              />
              <Button
                size="xs"
                variant="ghost"
                disabled={!settleSounds.automaticSound || automaticSettleVolume === 0}
                aria-label={gt("Play automatic settle sound")}
                onClick={() =>
                  previewSettleSound(settleSounds.automaticSound, automaticSettleVolume / 100)
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
