import { IconMinus, IconPlus } from "@pond/icons";
import { Button, cssVars, Dialog } from "@pond/ui";
import { useHotkey } from "@tanstack/react-hotkeys";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  activeVideoShown,
  CardThumb,
  collectionOwnsKeyboard,
  displayTitleForSave,
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
  type ViewerPosition,
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
import type { SaveFile } from "@/features/saves/types";
import { getAppRouter } from "@/shared/lib/app-router";
import { isEditableTarget } from "@/shared/lib/editable-target";
import { bindingKeys, useShortcutBindings } from "@/shared/lib/shortcuts";
import { usePrefs } from "@/shared/state/prefs";
import { Compare } from "./compare";
import styles from "./styles.module.css";
import { PreviewBar } from "./title-bar";

export function HoverPreview() {
  const [open, setOpen] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [compareZoom, setCompareZoom] = useState(1);
  const [position, setPosition] = useState<{
    saveId: string;
    position: ViewerPosition | null;
  } | null>(null);
  const heldKey = useRef<string | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerNav = useRef<ViewerNav | null>(null);
  const navigation = useRef(Promise.resolve());
  const [prefs] = usePrefs("viewer");
  const shortcuts = useShortcutBindings();
  const { grayscale, compare } = useInspect();
  const selectedCount = useSelectionSize();
  const selectedId = useSelectionCursor();
  const compareIds = compare ? [...selection.snapshot()].slice(0, 2) : [];
  const save = useSave(selectedId);
  const peekSave = useSave(open || compare ? null : hoverId);
  const compareA = useSave(compareIds[0] ?? null);
  const compareB = useSave(compareIds[1] ?? null);
  useEffect(() => {
    if (!compare) setCompareZoom(1);
  }, [compare]);

  useHotkey(
    bindingKeys(shortcuts, "grid.preview"),
    (event) => {
      if (event.isComposing || event.repeat || isEditableTarget(event.target))
        return;
      if (open) {
        event.preventDefault();
        heldKey.current = null;
        setOpen(false);
        return;
      }
      if (event.defaultPrevented || !collectionOwnsKeyboard()) return;
      if (saveIdFromPath(getAppRouter()?.state.location.pathname ?? "")) return;
      const selected = selection.getCursor();
      if (!selected) return;
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
      setOpen(true);
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

  const saveId = save?.id ?? null;
  const onPositionChange = useCallback(
    (next: ViewerPosition | null) => {
      if (saveId) setPosition({ saveId, position: next });
    },
    [saveId],
  );
  const attachPopup = useCallback(
    (node: HTMLDivElement | null) => {
      popupRef.current = node;
      if (node && !compare) zoomToCard(node, selection.getCursor());
    },
    [compare],
  );
  useLayoutEffect(() => {
    const node = popupRef.current;
    if (!open && node && !compare) zoomToCard(node, selection.getCursor());
  }, [open, compare]);

  const close = () => {
    setOpen(false);
    inspect.setCompare(false);
  };

  if (peekSave) {
    const peekFile = pickPrimaryFile(peekSave);
    const fit =
      peekFile && storedFileViewerKind(peekFile)
        ? undefined
        : mediaFit(peekFile, peekSave);
    return (
      <div className={styles.root}>
        <div
          className={styles.frame}
          style={fit}
          data-fit={fit ? "" : undefined}
          data-grayscale={grayscale || undefined}
        >
          <CardThumb save={peekSave} />
        </div>
      </div>
    );
  }

  const file = save ? pickPrimaryFile(save) : null;
  const storedFile = file && storedFileViewerKind(file) ? file : null;
  const fit =
    save && !compare && !storedFile ? mediaFit(file, save) : undefined;
  const current = position?.saveId === saveId ? position.position : null;
  const fileIndex =
    current?.fileIndex ?? (save && file ? save.files.indexOf(file) : -1);
  const comparing = compare && compareA && compareB;
  const title = comparing
    ? "Compare Saves"
    : save
      ? displayTitleForSave(save)
      : "Preview";

  return (
    <Dialog.Root
      open={(open || compare) && !!(save || comparing)}
      modal={false}
      disablePointerDismissal
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Popup
          ref={attachPopup}
          initialFocus={popupRef}
          tabIndex={-1}
          aria-label={title}
          className={styles.popup}
          style={fit}
          data-fit={fit ? "" : undefined}
          data-sized={fit ? "" : undefined}
          data-quick-preview
        >
          <PreviewBar.Bar
            title={title}
            position={comparing ? null : current}
            onClose={close}
            onStep={(delta) => viewerNav.current?.step(delta)}
            onFullScreen={
              comparing
                ? undefined
                : () => {
                    void viewerRef.current
                      ?.querySelector<HTMLElement>("[data-viewer-root]")
                      ?.requestFullscreen()
                      .catch(() => {});
                  }
            }
          >
            {comparing ? (
              <>
                <PreviewBar.Tool
                  label="Zoom Out"
                  onClick={() =>
                    setCompareZoom((zoom) => Math.max(0.5, zoom / 1.25))
                  }
                >
                  <IconMinus />
                </PreviewBar.Tool>
                <span className={styles.zoom}>
                  {Math.round(compareZoom * 100)}%
                </span>
                <PreviewBar.Tool
                  label="Zoom In"
                  onClick={() =>
                    setCompareZoom((zoom) => Math.min(4, zoom * 1.25))
                  }
                >
                  <IconPlus />
                </PreviewBar.Tool>
              </>
            ) : null}
            {selectedCount >= 2 ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => inspect.toggleCompare()}
              >
                {compare ? "Close Comparison" : "Compare"}
              </Button>
            ) : null}
            {save && !comparing && fileIndex >= 0 ? (
              <>
                <PreviewBar.OpenWith save={save} fileIndex={fileIndex} />
                <PreviewBar.Share save={save} fileIndex={fileIndex} />
              </>
            ) : null}
          </PreviewBar.Bar>
          <div ref={viewerRef} className={styles.viewer}>
            {comparing ? (
              <Compare
                saves={[compareA, compareB]}
                zoom={compareZoom}
                grayscale={grayscale}
                onZoom={setCompareZoom}
              />
            ) : save ? (
              storedFile ? (
                <StoredFileViewer
                  save={save}
                  file={storedFile}
                  showControls={false}
                />
              ) : (
                <MediaViewer
                  key={save.id}
                  save={save}
                  onNavigate={(id) => {
                    void showSave(id).catch(() => {});
                  }}
                  onPositionChange={onPositionChange}
                  navRef={viewerNav}
                  showControls={false}
                />
              )
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function mediaFit(
  ...sources: ReadonlyArray<Pick<SaveFile, "width" | "height"> | null>
): CSSProperties | undefined {
  const size = sources.find((source) => source?.width && source.height);
  if (!size?.width || !size.height) return undefined;
  return cssVars({
    "--ratio": size.width / size.height,
    "--natural-width": `${size.width}px`,
  });
}

/** Sets the popup's enter and exit transform so it grows out of, and shrinks back into, the save's card. */
function zoomToCard(popup: HTMLElement, saveId: string | null): void {
  const thumb = saveId
    ? document.querySelector(
        `[data-library-card][data-save-id="${CSS.escape(saveId)}"] [data-card-thumb]`,
      )
    : null;
  const rect = thumb?.getBoundingClientRect();
  const visible =
    rect &&
    rect.width > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth;
  if (!visible || !popup.offsetWidth || !popup.offsetHeight) {
    delete popup.dataset.zoom;
    return;
  }
  popup.dataset.zoom = "";
  popup.style.setProperty(
    "--zoom-x",
    `${rect.left + rect.width / 2 - popup.offsetLeft}px`,
  );
  popup.style.setProperty(
    "--zoom-y",
    `${rect.top + rect.height / 2 - popup.offsetTop}px`,
  );
  popup.style.setProperty(
    "--zoom-scale",
    String(
      Math.max(
        rect.width / popup.offsetWidth,
        rect.height / popup.offsetHeight,
      ),
    ),
  );
}
