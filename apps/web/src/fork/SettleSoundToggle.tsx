// Fork-only (MasonLoomis/t3code): header switch for settle sounds. See FORK.md.
import { Volume2Icon, VolumeOffIcon } from "lucide-react";

import { updateClientSettings, useClientSettings } from "../hooks/useSettings";
import { Button } from "../components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";

export function SettleSoundToggle() {
  const settings = useClientSettings((current) => current.settleSounds);
  const label = settings.enabled ? "Turn settle sounds off" : "Turn settle sounds on";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label={label}
            aria-pressed={settings.enabled}
            onClick={() =>
              void updateClientSettings({
                settleSounds: { ...settings, enabled: !settings.enabled },
              })
            }
          />
        }
      >
        {settings.enabled ? <Volume2Icon /> : <VolumeOffIcon />}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
}
