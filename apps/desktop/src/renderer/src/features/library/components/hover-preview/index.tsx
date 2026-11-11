import { Button, Dialog } from "@pond/ui";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  activeVideoShown,
  CardThumb,
  collectionOwnsKeyboard,
  inspect,
  MediaViewer,
  onQuickPreviewRequest,
  type PreviewStepBinding,
  previewFileIndex,
  previewStepRuns,
  runViewerAction,
  StoredFileViewer,
  selectOnlySave,
  storedFileViewerKind,
  useInspect,
  type ViewerNav,
} from "@/features/saves";
import { pickPrimaryFile } from "@/features/saves/media";
import {
  resultNavigation,
  saveIdFromPath,
  selection,
  useSelectionCursor,
  useSelectionSize,
} from "@/features/saves/navigation";
import { ensureSaves, useSave } from "@/features/saves/pool";
import { getAppRouter } from "@/shared/lib/app-router";
import { isEditableTarget } from "@/shared/lib/editable-target";
import { bindingKeys, useShortcutBindings } from "@/shared/lib/shortcuts";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

export function HoverPreview() {
  const [open, setOpen] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [compareZoom, setCompareZoom] = useState(1);
  const heldKey = useRef<string | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const viewerNav = useRef<ViewerNav | null>(null);
  const navigation = useRef(Promise.resolve());
  const [prefs] = usePrefs("viewer");
  const shortcuts = useShortcutBindings();
  const { grayscale, compare } = useInspect();
  const selectedCount = useSelectionSize();
  const selectedId = useSelectionCursor();
  const compareIds = compare ? [...selection.snapshot()].slice(0, 2) : [];
  const save = useSave(open ? selectedId : hoverId);
  const compareA = useSave(compareIds[0] ?? null);
  const compareB = useSave(compareIds[1] ?? null);
  useEffect(() => {
    if (!compare) setCompareZoom(1);
  }, [compare]);

  useHotkey(
    bindingKeys(shortcuts, "grid.preview"),
    (event) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        isEditableTarget(event.target)
      )
        return;
      if (!open && !collectionOwnsKeyboard()) return;
      if (saveIdFromPath(getAppRouter()?.state.location.pathname ?? "")) return;
      const selected = selection.getCursor();
      if (!selected) return;
      if (
        open &&
        document.querySelector(
          "[data-quick-preview] video, [data-quick-preview] [data-gif-player]",
        )
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("button") &&
        !event.target.closest("[data-save-id]")
      )
        return;
      event.preventDefault();
      heldKey.current = event.code;
      if (prefs.spaceAction !== "preview") {
        runViewerAction(selected, prefs.spaceAction);
        return;
      }
      setOpen((previous) =>
        prefs.spaceBehavior === "hold" ? true : !previous,
      );
    },
    { preventDefault: false, ignoreInputs: true },
  );

  const showSave = useCallback(async (id: string) => {
    await ensureSaves([id]);
    selectOnlySave(id);
  }, []);
  useEffect(
    () =>
      onQuickPreviewRequest((saveId) => {
        void showSave(saveId).then(() => setOpen(true));
      }),
    [showSave],
  );
  useEffect(
    () =>
      window.pond.onPreviewNeighborRequested((request) => {
        void (async () => {
          if (request.windowId === null) return;
          let current = request.saveId;
          for (let checked = 0; checked < 50; checked++) {
            const saveId = await resultNavigation.next(current, request.delta);
            if (!saveId) return;
            await ensureSaves([saveId]);
            const fileIndex = previewFileIndex(saveId, request.kind);
            if (fileIndex !== null) {
              await window.pond.navigatePreviewWindow({
                windowId: request.windowId,
                saveId,
                fileIndex,
              });
              return;
            }
            current = saveId;
          }
        })().catch(() => {});
      }),
    [],
  );
  const step = (delta: number, withinSave: boolean) => {
    if (withinSave && viewerNav.current?.step(delta)) return;
    navigation.current = navigation.current
      .then(async () => {
        const id = selection.getCursor();
        if (!id) return;
        const next = await resultNavigation.next(id, delta);
        if (next) await showSave(next);
      })
      .catch(() => {});
  };
  const stepHotkey =
    (binding: PreviewStepBinding, delta: number) => (event: KeyboardEvent) => {
      if (
        !previewStepRuns({
          event,
          binding,
          bindings: shortcuts,
          videoShown: activeVideoShown(),
        })
      )
        return;
      event.preventDefault();
      step(delta, true);
    };
  const stepOptions = {
    enabled: open,
    ignoreInputs: true,
    preventDefault: false,
    conflictBehavior: "allow" as const,
  };
  useHotkey(
    bindingKeys(shortcuts, "viewer.step-prev"),
    stepHotkey("step", -1),
    stepOptions,
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.step-next"),
    stepHotkey("step", 1),
    stepOptions,
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.video-step-prev"),
    stepHotkey("video-step", -1),
    stepOptions,
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.video-step-next"),
    stepHotkey("video-step", 1),
    stepOptions,
  );
  useHotkey(bindingKeys(shortcuts, "viewer.prev-save"), () => step(-1, false), {
    enabled: open,
    ignoreInputs: true,
  });
  useHotkey(bindingKeys(shortcuts, "viewer.next-save"), () => step(1, false), {
    enabled: open,
    ignoreInputs: true,
  });

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (
        isEditableTarget(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (event.key.toLowerCase() === "z" && !open && collectionOwnsKeyboard())
        setHoverId(selection.getCursor());
    };
    const up = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "z") setHoverId(null);
      if (
        event.code === heldKey.current &&
        prefs.spaceAction === "preview" &&
        prefs.spaceBehavior === "hold"
      )
        setOpen(false);
    };
    const blur = () => {
      setHoverId(null);
      if (prefs.spaceAction === "preview" && prefs.spaceBehavior === "hold")
        setOpen(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [open, prefs.spaceAction, prefs.spaceBehavior]);

  if (!save && !compare) return null;
  if (!open && !compare && save)
    return (
      <div className={styles.root}>
        <div className={styles.frame} data-grayscale={grayscale || undefined}>
          <CardThumb save={save} />
        </div>
      </div>
    );
  const file = save ? pickPrimaryFile(save) : null;
  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) {
          setOpen(false);
          inspect.setCompare(false);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup
          ref={popupRef}
          initialFocus={popupRef}
          tabIndex={-1}
          className={styles.popup}
          data-quick-preview
        >
          <Dialog.Title className={styles["sr-only"]}>
            {compare ? "Compare Saves" : save?.title || "Preview"}
          </Dialog.Title>
          <div className={styles.viewer}>
            {compare && compareA && compareB ? (
              <div
                className={styles.compare}
                onWheel={(event) => {
                  event.preventDefault();
                  setCompareZoom((zoom) =>
                    Math.max(
                      0.5,
                      Math.min(4, zoom * (event.deltaY < 0 ? 1.1 : 0.9)),
                    ),
                  );
                }}
              >
                <div
                  className={styles.frame}
                  data-grayscale={grayscale || undefined}
                >
                  <div
                    className={styles.media}
                    style={{ transform: `scale(${compareZoom})` }}
                  >
                    <CardThumb save={compareA} />
                  </div>
                </div>
                <div
                  className={styles.frame}
                  data-grayscale={grayscale || undefined}
                >
                  <div
                    className={styles.media}
                    style={{ transform: `scale(${compareZoom})` }}
                  >
                    <CardThumb save={compareB} />
                  </div>
                </div>
              </div>
            ) : save ? (
              file && storedFileViewerKind(file) ? (
                <StoredFileViewer
                  save={save}
                  file={file}
                  showControls={false}
                />
              ) : (
                <MediaViewer
                  key={save.id}
                  save={save}
                  onNavigate={(id) => {
                    void showSave(id).catch(() => {});
                  }}
                  navRef={viewerNav}
                  showControls={false}
                />
              )
            ) : null}
          </div>
          {selectedCount >= 2 ? (
            <div className={styles.tools}>
              {compare ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Zoom Out"
                    onClick={() =>
                      setCompareZoom((zoom) => Math.max(0.5, zoom / 1.25))
                    }
                  >
                    −
                  </Button>
                  <span>{Math.round(compareZoom * 100)}%</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Zoom In"
                    onClick={() =>
                      setCompareZoom((zoom) => Math.min(4, zoom * 1.25))
                    }
                  >
                    +
                  </Button>
                </>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => inspect.toggleCompare()}
              >
                {compare ? "Close Comparison" : "Compare"}
              </Button>
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
