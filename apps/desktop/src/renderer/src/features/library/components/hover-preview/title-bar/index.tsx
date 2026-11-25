import {
  IconArrowsExpandDiagonal,
  IconChevronLeft,
  IconChevronRight,
  IconExport,
  IconFullScreen,
  IconXmark,
} from "@pond/icons";
import { Button, TitleBar, Tooltip } from "@pond/ui";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  loadOpenWithApps,
  openWith,
  openWithKind,
  peekOpenWithApps,
} from "@/features/saves";
import type { OpenWithApp, ViewerPosition } from "@/features/saves";
import type { Save } from "@/features/saves/types";
import { CAN_SHARE } from "@/shared/lib/platform";
import { notify } from "@/shared/lib/toast";
import styles from "./styles.module.css";

interface PreviewBarProps {
  title: string;
  position: ViewerPosition | null;
  onClose: () => void;
  onStep: (delta: number) => void;
  onFullScreen?: () => void;
  onExpand?: () => void;
  children?: ReactNode;
}

function Bar({
  title,
  position,
  onClose,
  onStep,
  onFullScreen,
  onExpand,
  children,
}: PreviewBarProps) {
  const paged = position && position.count > 1 ? position : null;
  return (
    <Tooltip.Group>
      <TitleBar.Root className={styles.bar}>
        <TitleBar.Start className={styles.group}>
          <Tool label="Close" onClick={onClose}>
            <IconXmark />
          </Tool>
          {onFullScreen ? (
            <Tool label="Full Screen" onClick={onFullScreen}>
              <IconFullScreen />
            </Tool>
          ) : null}
          {onExpand ? (
            <Tool label="Open Save" onClick={onExpand}>
              <IconArrowsExpandDiagonal />
            </Tool>
          ) : null}
          {paged ? (
            <>
              <Tool
                label="Previous"
                disabled={paged.index === 0}
                onClick={() => onStep(-1)}
              >
                <IconChevronLeft />
              </Tool>
              <Tool
                label="Next"
                disabled={paged.index === paged.count - 1}
                onClick={() => onStep(1)}
              >
                <IconChevronRight />
              </Tool>
            </>
          ) : null}
        </TitleBar.Start>
        <TitleBar.Title className={styles.title}>
          <TitleBar.Label>{title}</TitleBar.Label>
          {paged ? (
            <TitleBar.Meta>
              {paged.index + 1} of {paged.count}
            </TitleBar.Meta>
          ) : null}
        </TitleBar.Title>
        <TitleBar.End className={styles.group}>{children}</TitleBar.End>
      </TitleBar.Root>
    </Tooltip.Group>
  );
}

function Tool({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label} side="bottom">
      <Button
        icon
        size="sm"
        variant="ghost"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

function OpenWith({ save, fileIndex }: { save: Save; fileIndex: number }) {
  const kind = openWithKind(save, fileIndex);
  const [apps, setApps] = useState<Array<OpenWithApp>>(() =>
    peekOpenWithApps(kind),
  );
  const [appsFor, setAppsFor] = useState({ id: save.id, fileIndex, kind });
  if (
    appsFor.id !== save.id ||
    appsFor.fileIndex !== fileIndex ||
    appsFor.kind !== kind
  ) {
    setAppsFor({ id: save.id, fileIndex, kind });
    setApps(peekOpenWithApps(kind));
  }
  useEffect(() => {
    let current = true;
    void loadOpenWithApps({
      ids: [save.id],
      fileIndex,
      kind,
      onApps: (next) => {
        if (current) {
          setApps(next);
        }
      },
    });
    return () => {
      current = false;
    };
  }, [save.id, fileIndex, kind]);
  const app = apps.find((entry) => entry.isDefault) ?? apps[0];
  if (!app) {
    return null;
  }
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => openWith([save.id], fileIndex, app.path)}
    >
      Open with {app.name.replace(/\.app$/i, "")}
    </Button>
  );
}

function Share({ save, fileIndex }: { save: Save; fileIndex: number }) {
  if (!CAN_SHARE) {
    return null;
  }
  return (
    <Tool
      label="Share"
      onClick={() => {
        void window.pond
          .query("saves.share", { id: save.id, fileIndex })
          .then((result) => {
            if (!result.ok) {
              notify({
                id: "share",
                title: result.error ?? "Couldn't share this file.",
              });
            }
          });
      }}
    >
      <IconExport />
    </Tool>
  );
}

export const PreviewBar = { Bar, Tool, OpenWith, Share };
