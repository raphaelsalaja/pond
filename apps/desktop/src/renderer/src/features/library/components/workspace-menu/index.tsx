import {
  IconCheck,
  IconFaceSmile,
  IconFolderOpen,
  IconFolderPlus,
  IconMerge,
  IconNut,
} from "@pond/icons";
import { cssVars, Menu, Tooltip } from "@pond/ui";
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
import defaultAppIcon from "@/generated/app-icon-previews/aqua.png";
import { openSettings } from "@/shared/lib/open-settings";
import styles from "./styles.module.css";

type RecentLibrary = QueryResult<"library.recent">[number];

function LibraryMenuContent({
  libraries,
  onCustomize,
}: {
  libraries: Array<RecentLibrary>;
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
                  if (entry.active) {
                    return;
                  }
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
                    <IconCheck size={12} />
                  </Menu.SecondaryLabel>
                ) : null}
              </Menu.Item>
            ))
          ) : (
            <Menu.Item disabled>
              <Menu.ItemLabel>No Recent Libraries</Menu.ItemLabel>
            </Menu.Item>
          )}
        </Menu.List>
      </Menu.Group>
      <Menu.Separator />
      <Menu.Group>
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
            <IconMerge />
          </Menu.ItemIcon>
          <Menu.ItemLabel>Merge Library</Menu.ItemLabel>
        </Menu.Item>
      </Menu.Group>
      <Menu.Separator />
      <Menu.Group>
        <Menu.Item onClick={onCustomize}>
          <Menu.ItemIcon>
            <IconFaceSmile />
          </Menu.ItemIcon>
          <Menu.ItemLabel>Customize Library</Menu.ItemLabel>
        </Menu.Item>
        <Menu.Item onClick={() => openSettings("library")}>
          <Menu.ItemIcon>
            <IconNut />
          </Menu.ItemIcon>
          <Menu.ItemLabel>Library Settings</Menu.ItemLabel>
        </Menu.Item>
      </Menu.Group>
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
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const name = info?.name || "Pond";

  return (
    <>
      <Menu.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            void refetch();
          }
        }}
      >
        <Tooltip label={name} side="right">
          <Menu.Trigger
            icon
            variant="ghost"
            rounding="rounded"
            aria-label={name}
          >
            <span className={styles.mark} aria-hidden>
              <img
                className={styles.icon}
                src={info?.icon ?? defaultAppIcon}
                alt=""
              />
            </span>
          </Menu.Trigger>
        </Tooltip>
        <Menu.Portal>
          <Menu.Positioner align="start" side="right">
            <Menu.Popup
              className={styles.switcher}
              style={cssVars({ "--menu-width": `${sidebarWidth - 30}px` })}
            >
              <LibraryMenuContent
                libraries={recent}
                onCustomize={() => setCustomizeOpen(true)}
              />
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {customizeOpen && info ? (
        <LibraryCustomizeDialog
          library={info}
          onClose={() => setCustomizeOpen(false)}
        />
      ) : null}
    </>
  );
}
