import {
  IconCheckFill,
  IconChevronDown,
  IconFaceSmile,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconFolders,
  IconLayers,
} from "@pond/icons";
import { cssVars, Menu } from "@pond/ui";
import type { QueryResult } from "@shared/query-contracts";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LibraryCustomizeDialog } from "@/features/library/components/library-customize-dialog";
import {
  createLibrary,
  mergeLibrary,
  openLibrary,
  switchLibrary,
} from "@/features/library/lib/library-location";
import { useSidebarWidth } from "@/features/library/state/library-chrome";
import { requestUpdateCheck } from "@/features/settings/update-check";
import defaultAppIcon from "@/generated/app-icon-previews/aqua.png";
import { BrowserExtensionDialog } from "@/shared/components/browser-extension-dialog";
import { openSettings } from "@/shared/lib/open-settings";
import { buildWorkspaceMenuItems } from "./spec";
import styles from "./styles.module.css";

type RecentLibrary = QueryResult<"library.recent">[number];

function SwitchLibraryMenu({
  libraries,
  onCustomize,
}: {
  libraries: RecentLibrary[];
  onCustomize: () => void;
}) {
  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger>
        <Menu.ItemIcon>
          <IconLayers />
        </Menu.ItemIcon>
        <Menu.ItemLabel>Switch Library</Menu.ItemLabel>
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner
          side="inline-end"
          align="start"
          sideOffset={-2}
          alignOffset={-4}
        >
          <Menu.Popup>
            <LibraryMenuContent
              libraries={libraries}
              onCustomize={onCustomize}
            />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
}

function LibraryMenuContent({
  libraries,
  onCustomize,
}: {
  libraries: RecentLibrary[];
  onCustomize: () => void;
}) {
  return (
    <>
      <Menu.Group>
        <Menu.List className={styles.libraries}>
          {libraries.length > 0 ? (
            libraries.map((entry) => (
              <Menu.Item
                disabled={!entry.available}
                closeOnClick={!entry.active}
                aria-current={entry.active ? "true" : undefined}
                key={entry.path}
                onClick={() => {
                  if (entry.active) return;
                  void switchLibrary(entry.path);
                }}
              >
                <Menu.ItemIcon className={styles.identity}>
                  <img
                    className={styles.icon}
                    src={entry.icon ?? defaultAppIcon}
                    alt=""
                  />
                </Menu.ItemIcon>
                <Menu.ItemLabel className={styles.label}>
                  {entry.name}
                </Menu.ItemLabel>
                {entry.active ? (
                  <Menu.SecondaryLabel
                    className={styles.label}
                    aria-label="Current Library"
                  >
                    <IconCheckFill size={12} />
                  </Menu.SecondaryLabel>
                ) : null}
              </Menu.Item>
            ))
          ) : (
            <Menu.Item disabled>
              <Menu.ItemLabel>No recent libraries</Menu.ItemLabel>
            </Menu.Item>
          )}
        </Menu.List>
      </Menu.Group>
      <Menu.Separator />
      <Menu.Group>
        <Menu.Item onClick={onCustomize}>
          <Menu.ItemIcon>
            <IconFaceSmile />
          </Menu.ItemIcon>
          <Menu.ItemLabel>Customize Library</Menu.ItemLabel>
        </Menu.Item>
        <Menu.Item onClick={() => void createLibrary()}>
          <Menu.ItemIcon>
            <IconFolderPlus />
          </Menu.ItemIcon>
          <Menu.ItemLabel>Create Library</Menu.ItemLabel>
        </Menu.Item>
        <Menu.Item onClick={() => void openLibrary()}>
          <Menu.ItemIcon>
            <IconFolderOpen />
          </Menu.ItemIcon>
          <Menu.ItemLabel>Open Library</Menu.ItemLabel>
        </Menu.Item>
        <Menu.Item onClick={() => void mergeLibrary()}>
          <Menu.ItemIcon>
            <IconFolders />
          </Menu.ItemIcon>
          <Menu.ItemLabel>Merge Library</Menu.ItemLabel>
        </Menu.Item>
      </Menu.Group>
      <Menu.Separator />
      <Menu.Item onClick={() => openSettings("library")}>
        <Menu.ItemIcon>
          <IconFolder />
        </Menu.ItemIcon>
        <Menu.ItemLabel>Library Settings</Menu.ItemLabel>
      </Menu.Item>
    </>
  );
}

export function WorkspaceMenu() {
  const [open, setOpen] = useState(false);
  const sidebarWidth = useSidebarWidth();
  const { data: info } = useQuery({
    queryKey: ["library-info"],
    queryFn: () => window.pond.query("library.info", {}),
  });
  const { data: recent = [], refetch } = useQuery({
    queryKey: ["recent-libraries"],
    queryFn: () => window.pond.query("library.recent", {}),
  });
  const [extensionOpen, setExtensionOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const items = buildWorkspaceMenuItems({
    onBrowserExtension: () => setExtensionOpen(true),
    onCheckForUpdates: () => requestUpdateCheck(),
  });
  const name = info?.name || "Pond";

  return (
    <>
      <Menu.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) void refetch();
        }}
      >
        <Menu.Trigger
          variant="ghost"
          density="compact"
          className={styles.trigger}
        >
          <span className={styles.mark} aria-hidden>
            <img
              className={styles.icon}
              src={info?.icon ?? defaultAppIcon}
              alt=""
            />
          </span>
          <span className={styles.name} title={name}>
            {name}
          </span>
          <IconChevronDown size={12} className={styles.chevron} aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="start" side="bottom" alignOffset={-2}>
            <Menu.Popup
              className={styles.switcher}
              style={cssVars({ "--menu-width": `${sidebarWidth - 30}px` })}
            >
              <SwitchLibraryMenu
                libraries={recent}
                onCustomize={() => setCustomizeOpen(true)}
              />
              <Menu.Separator />
              <Menu.Items items={items} />
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <BrowserExtensionDialog
        open={extensionOpen}
        onOpenChange={setExtensionOpen}
      />
      {customizeOpen && info ? (
        <LibraryCustomizeDialog
          library={info}
          onClose={() => setCustomizeOpen(false)}
        />
      ) : null}
    </>
  );
}
