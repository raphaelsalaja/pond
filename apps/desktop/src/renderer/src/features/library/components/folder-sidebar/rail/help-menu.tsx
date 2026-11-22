import {
  IconBookOpen,
  IconBug,
  IconCircleQuestion,
  IconFileExport,
  IconKeyboard,
  IconSparkle,
} from "@pond/icons";
import { Menu, type MenuItemSpec, Tooltip } from "@pond/ui";
import {
  exportDebugReport,
  runNewAction,
} from "@/features/library/components/new-menu/actions";
import { openSettings } from "@/shared/lib/open-settings";
import { whatsNewDialog } from "@/shared/state/whats-new";

const HELP_CENTER = "https://github.com/raphaelsalaja/pond#readme";
const ISSUES = "https://github.com/raphaelsalaja/pond/issues";

export function buildHelpMenuItems(): MenuItemSpec[] {
  return [
    {
      label: "Keyboard Shortcuts",
      icon: <IconKeyboard />,
      onClick: () => openSettings("shortcuts"),
    },
    {
      label: "What's New",
      icon: <IconSparkle />,
      onClick: () => whatsNewDialog.open(),
    },
    { type: "separator" },
    {
      label: "Help Center",
      icon: <IconBookOpen />,
      onClick: () => void window.pond.openExternal(HELP_CENTER),
    },
    {
      label: "Report an Issue",
      icon: <IconBug />,
      onClick: () => void window.pond.openExternal(ISSUES),
    },
    {
      label: "Export Debug Report",
      icon: <IconFileExport />,
      onClick: () => void runNewAction(exportDebugReport),
    },
  ];
}

export function HelpMenu() {
  return (
    <Menu.Root>
      <Tooltip label="Help" side="right">
        <Menu.Trigger
          icon
          variant="ghost"
          rounding="rounded"
          aria-label="Help"
        >
          <IconCircleQuestion />
        </Menu.Trigger>
      </Tooltip>
      <Menu.Portal>
        <Menu.Positioner side="right" align="end">
          <Menu.Popup>
            <Menu.Items items={buildHelpMenuItems()} />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
