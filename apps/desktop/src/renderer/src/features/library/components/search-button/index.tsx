import { IconMagnifier } from "@pond/icons";
import { Button, Tooltip } from "@pond/ui";
import { commandMenu } from "@/features/library/state/command-menu";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";

export function SearchButton() {
  return (
    <Tooltip label="Search" shortcut={<ShortcutKeys id="library.search" />}>
      <Button
        icon
        size="sm"
        variant="ghost"
        aria-label="Search Pond"
        onClick={() => commandMenu.open()}
      >
        <IconMagnifier />
      </Button>
    </Tooltip>
  );
}
