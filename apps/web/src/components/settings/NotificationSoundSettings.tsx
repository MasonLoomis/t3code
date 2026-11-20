import {
  DEFAULT_SOUND_EVENT_ENABLED,
  MAX_SOUND_VOLUME,
  MIN_SOUND_VOLUME,
  SOUND_EVENT_IDS,
  SOUND_FOCUS_POLICIES,
  SOUND_PACK_IDS,
  type SoundEventId,
} from "@t3tools/contracts/settings";
import * as Schema from "effect/Schema";
import { msg, useGT, useMessages } from "gt-react";
import { ChevronDownIcon, PlayIcon } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import { getClientSettings, useClientSettings } from "../../hooks/useSettings";
import {
  CustomSoundError,
  exportCustomSoundPack,
  importCustomSoundPack,
  listCustomSoundNames,
  resetCustomSound,
  saveCustomSound,
} from "../../lib/customSoundStore";
import { decodeCustomSound, previewSoundEvent, soundEventEnabled } from "../../lib/soundEngine";
import { SOUND_EVENT_LABELS, SOUND_PACK_LABELS } from "../../lib/soundLabels";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Radio, RadioGroup } from "../ui/radio-group";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingsRow } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";
import { useUpdateScopedSettings } from "./useScopedSettings";

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

export function NotificationSoundSettings() {
  const gt = useGT();
  const m = useMessages();
  const setting = useSearchableSetting();
  const updateSettings = useUpdateScopedSettings();
  const pack = useClientSettings((settings) => settings.soundPack);
  const volume = useClientSettings((settings) => settings.soundVolume);
  const focus = useClientSettings((settings) => settings.soundFocusPolicy);
  const [draftVolume, setDraftVolume] = useState<number | null>(null);
  const displayedVolume = draftVolume ?? volume;
  const volumeRatio = displayedVolume / MAX_SOUND_VOLUME;
  const sliderStyle = {
    "--settings-slider-progress": `${displayedVolume}%`,
    "--settings-slider-fill-offset": `${0.5 - volumeRatio}rem`,
  } as CSSProperties;
  const commitVolume = (value: number) => {
    setDraftVolume(null);
    if (value === volume) return;
    updateSettings({ soundVolume: value });
    void previewSoundEvent("completion", { ...getClientSettings(), soundVolume: value }, pack);
  };

  return (
    <>
      <SettingsRow
        {...setting("notification-sound-pack")}
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
                  const selected = SOUND_PACK_IDS.find((pack) => pack === value);
                  if (selected) updateSettings({ soundPack: selected });
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
                      disabled={volume === 0}
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
        control={
          <div className="flex w-full items-center gap-3 sm:w-52">
            <output
              className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
              htmlFor="notification-volume"
            >
              {displayedVolume}%
            </output>
            <input
              id="notification-volume"
              aria-label={gt("Sound volume")}
              className="settings-slider min-w-0 flex-1"
              type="range"
              min={MIN_SOUND_VOLUME}
              max={MAX_SOUND_VOLUME}
              value={displayedVolume}
              style={sliderStyle}
              onChange={(event) => setDraftVolume(event.currentTarget.valueAsNumber)}
              onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
              onPointerUp={(event) => commitVolume(event.currentTarget.valueAsNumber)}
              onPointerCancel={() => setDraftVolume(null)}
              onKeyUp={(event) => {
                if (draftVolume !== null) commitVolume(event.currentTarget.valueAsNumber);
              }}
              onBlur={(event) => {
                if (draftVolume !== null) commitVolume(event.currentTarget.valueAsNumber);
              }}
            />
          </div>
        }
      />
      <SettingsRow
        {...setting("notification-sound-focus")}
        control={
          <Select
            value={focus}
            onValueChange={(value) => {
              const policy = SOUND_FOCUS_POLICIES.find((policy) => policy === value);
              if (policy) updateSettings({ soundFocusPolicy: policy });
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
      <SoundEventSettings />
    </>
  );
}

function SoundEventSettings() {
  const gt = useGT();
  const setting = useSearchableSetting();
  const [open, setOpen] = useState(false);
  return (
    <>
      <SettingsRow
        {...setting("notification-sound-events")}
        description={gt(
          "Choose which events play a sound and replace individual clips on this device.",
        )}
        control={
          <Button
            variant="outline"
            size="sm"
            aria-expanded={open}
            aria-controls="custom-sound-events"
            onClick={() => setOpen(!open)}
          >
            {open ? gt("Hide sound events") : gt("Customize sound events")}
          </Button>
        }
      />
      <div id="custom-sound-events" hidden={!open}>
        {open && <CustomSoundEvents />}
      </div>
    </>
  );
}

function CustomSoundEvents() {
  const gt = useGT();
  const m = useMessages();
  const updateSettings = useUpdateScopedSettings();
  const soundEvents = useClientSettings((settings) => settings.soundEvents);
  const volume = useClientSettings((settings) => settings.soundVolume);
  const [names, setNames] = useState<Awaited<ReturnType<typeof listCustomSoundNames>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CustomSoundError["reason"] | "storage" | null>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const packInput = useRef<HTMLInputElement>(null);
  const uploadEvent = useRef<SoundEventId | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Reads the device-local sound library when expanded.
  useEffect(() => {
    let mounted = true;
    void listCustomSoundNames().then(
      (result) => {
        if (mounted) setNames(result);
      },
      () => {
        if (mounted) setError("storage");
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  const mutate = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      setNames(await listCustomSoundNames());
    } catch (error) {
      setError(isCustomSoundError(error) ? error.reason : "storage");
    } finally {
      setBusy(false);
    }
  };
  const download = async () => {
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

  return (
    <div className="space-y-3 border-t border-border/60 px-3 py-3 sm:px-4">
      <input
        ref={audioInput}
        type="file"
        hidden
        accept=".mp3,.wav,.ogg,.m4a"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          const target = uploadEvent.current;
          if (file && target) {
            void mutate(() => saveCustomSound(target, file, decodeCustomSound));
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
          if (file) void mutate(() => importCustomSoundPack(file, decodeCustomSound));
        }}
      />
      <ul className="divide-y divide-border/60">
        {SOUND_EVENT_IDS.map((event) => {
          const label = m(SOUND_EVENT_LABELS[event]);
          const name = names?.[event];
          return (
            <li
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2"
              key={event}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Switch
                  size="sm"
                  aria-label={label}
                  checked={soundEventEnabled(event, { soundEvents })}
                  onCheckedChange={(enabled) => {
                    const overrides = { ...getClientSettings().soundEvents };
                    if (enabled === DEFAULT_SOUND_EVENT_ENABLED[event]) delete overrides[event];
                    else overrides[event] = enabled;
                    updateSettings({ soundEvents: overrides });
                  }}
                />
                <div className="min-w-0">
                  <div className="text-sm">{label}</div>
                  {name && (
                    <div className="text-xs wrap-anywhere text-muted-foreground">{name}</div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={volume === 0}
                  aria-label={gt("Play {sound}", { sound: label })}
                  onClick={() => void previewSoundEvent(event, getClientSettings())}
                >
                  <PlayIcon aria-hidden />
                  {gt("Play")}
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={busy || !names}
                  aria-label={gt("Upload audio for {sound}", { sound: label })}
                  onClick={() => {
                    uploadEvent.current = event;
                    audioInput.current?.click();
                  }}
                >
                  {gt("Upload audio")}
                </Button>
                {name && (
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={busy}
                    aria-label={gt("Reset {sound} to pack", { sound: label })}
                    onClick={() => void mutate(() => resetCustomSound(event))}
                  >
                    {gt("Reset to pack")}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !names}
          onClick={() => packInput.current?.click()}
        >
          {gt("Import sound pack")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !names || Object.keys(names).length === 0}
          onClick={() => void download()}
        >
          {gt("Export sound pack")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error === "storage"
            ? gt("Could not access custom sounds on this device.")
            : m(FILE_ERRORS[error])}
        </p>
      )}
    </div>
  );
}
