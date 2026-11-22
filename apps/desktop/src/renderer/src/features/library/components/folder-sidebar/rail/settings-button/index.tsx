import { IconGear3 } from "@pond/icons";
import { Button, Tooltip } from "@pond/ui";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";
import { useRouteLocation } from "@/shared/hooks/use-route-location";
import { openSettings } from "@/shared/lib/open-settings";

export function SettingsButton() {
  const active = useRouteLocation((location) =>
    location.pathname.startsWith("/settings"),
  );

  return (
    <Tooltip
      label="Settings"
      shortcut={<ShortcutKeys id="app.settings" />}
      side="right"
    >
      <Button
        icon
        variant="ghost"
        rounding="rounded"
        aria-label="Settings"
        aria-current={active ? "page" : undefined}
        data-pressed={active || undefined}
        onClick={() => openSettings()}
      >
        <IconGear3 />
      </Button>
    </Tooltip>
  );
}
