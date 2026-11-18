// Fork-only (MasonLoomis/t3code): the Sounds settings section. See FORK.md.
import type { ClientSettings } from "@t3tools/contracts/settings";
import { useEffect, useState } from "react";

import { updateClientSettings, useClientSettings } from "../hooks/useSettings";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { SettingsRow, SettingsSection } from "../components/settings/settingsLayout";
import { listSettleSounds, previewSettleSound } from "./settleSounds";

type SettleSounds = ClientSettings["settleSounds"];
const OFF = "__off__";

function SoundPicker(props: {
  readonly label: string;
  readonly value: string;
  readonly available: ReadonlyArray<string>;
  readonly volume: number;
  readonly onChange: (value: string) => void;
}) {
  const options =
    props.value && !props.available.includes(props.value)
      ? [...props.available, props.value]
      : props.available;
  return (
    <div className="flex items-center gap-2">
      <Select
        value={props.value || OFF}
        onValueChange={(value) => {
          if (typeof value === "string") props.onChange(value === OFF ? "" : value);
        }}
      >
        <SelectTrigger size="sm" className="w-full sm:w-64" aria-label={props.label}>
          <SelectValue>
            {props.value
              ? props.available.includes(props.value)
                ? props.value
                : `${props.value} (missing)`
              : "Off"}
          </SelectValue>
        </SelectTrigger>
        <SelectPopup align="end" alignItemWithTrigger={false}>
          <SelectItem hideIndicator value={OFF}>
            Off
          </SelectItem>
          {options.map((name) => (
            <SelectItem key={name} hideIndicator value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      <Button
        size="sm"
        variant="outline"
        disabled={!props.value}
        onClick={() => previewSettleSound(props.value, props.volume)}
      >
        Play
      </Button>
    </div>
  );
}

export function SettleSoundSettingsSection() {
  const settings = useClientSettings((current) => current.settleSounds);
  const [available, setAvailable] = useState<ReadonlyArray<string>>([]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads the server's sounds folder once when the section mounts
  useEffect(() => {
    let cancelled = false;
    void listSettleSounds().then((sounds) => {
      if (!cancelled) setAvailable(sounds);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const save = (patch: Partial<SettleSounds>) =>
    void updateClientSettings({ settleSounds: { ...settings, ...patch } });

  return (
    <SettingsSection id="settle-sounds" title="Sounds">
      <SettingsRow
        title="Settle sounds"
        description="Play a sound when a thread settles. Also in the chat header."
        devicePreference
        control={
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) => save({ enabled: checked })}
            aria-label="Settle sounds"
          />
        }
      />
      <SettingsRow
        title="When you settle a thread"
        description="Plays when you settle a thread from this app."
        devicePreference
        control={
          <SoundPicker
            label="Manual settle sound"
            value={settings.manualSound}
            available={available}
            volume={settings.volume}
            onChange={(manualSound) => save({ manualSound })}
          />
        }
      />
      <SettingsRow
        title="When T3 Code settles a thread"
        description="Plays when a thread settles on its own: after a merge, after idle days, or when an agent or another device settles it."
        devicePreference
        control={
          <SoundPicker
            label="Automatic settle sound"
            value={settings.automaticSound}
            available={available}
            volume={settings.volume}
            onChange={(automaticSound) => save({ automaticSound })}
          />
        }
      />
      <SettingsRow
        title="Volume"
        description="Sound files live in the sounds folder inside your T3 Code data folder."
        devicePreference
        control={
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(settings.volume * 100)}
            aria-label="Settle sound volume"
            className="w-full accent-primary sm:w-56"
            onChange={(event) => save({ volume: Number(event.currentTarget.value) / 100 })}
          />
        }
      />
    </SettingsSection>
  );
}
