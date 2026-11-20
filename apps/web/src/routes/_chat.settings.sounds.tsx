import { createFileRoute } from "@tanstack/react-router";

import { SoundsSettingsPanel } from "../components/settings/SoundsSettingsPanel";

export const Route = createFileRoute("/_chat/settings/sounds")({
  component: SoundsSettingsPanel,
});
