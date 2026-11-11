import { useHotkeys } from "@tanstack/react-hotkeys";
import { useParams } from "@tanstack/react-router";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppShell } from "@/features/library/components/workspace-shell";
import type { PreviewStepBinding, ViewerNav } from "@/features/saves";
import {
  activeVideoShown,
  isTextOnlySave,
  loadOpenWithApps,
  type OpenWithApp,
  openWithKind,
  peekOpenWithApps,
  previewStepRuns,
  saveOwnsKeyboard,
  useTrackVisit,
} from "@/features/saves";
import {
  closeSave,
  followDeparture,
  primarySelection,
  selection,
  stepSave,
} from "@/features/saves/navigation";
import { useSave } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import {
  buildViewerMenu,
  fileIndexFromSlide,
  hasArchive,
  SaveArchiveViewer,
  SaveViewer,
  setSaveViewerFileIndex,
  TextViewer,
  viewerEscape,
} from "@/features/saves/viewers";
import { tagClipboard } from "@/features/tags";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import {
  bindingKeys,
  type ShortcutDef,
  useShortcutBindings,
} from "@/shared/lib/shortcuts";
import styles from "./styles.module.css";

interface DetailHotkey {
  hotkey: NonNullable<ShortcutDef["keys"]>;
  when?: (event: KeyboardEvent) => boolean;
  run: () => void;
}

export function SaveDetailPage() {
  const { id } = useParams({ from: "/_library/save/$id" });
  const save = useSave(id);
  const shortcuts = useShortcutBindings();
  useTrackVisit(id);

  useEffect(() => {
    if (primarySelection.get() !== id) primarySelection.set(id);
    selection.setCursor(id);
  }, [id]);

  useEffect(() => followDeparture(id), [id]);

  const step = useCallback((delta: number) => stepSave(id, delta), [id]);

  const viewerNav = useRef<ViewerNav | null>(null);

  const stepImageOrSave = useCallback(
    (delta: number) => {
      if (viewerNav.current?.step(delta)) return;
      step(delta);
    },
    [step],
  );

  const stepRuns = (binding: PreviewStepBinding) => (event: KeyboardEvent) =>
    previewStepRuns({
      event,
      binding,
      bindings: shortcuts,
      videoShown: activeVideoShown(),
    });

  const hotkeys: DetailHotkey[] = [
    {
      hotkey: bindingKeys(shortcuts, "viewer.step-prev"),
      when: stepRuns("step"),
      run: () => stepImageOrSave(-1),
    },
    {
      hotkey: bindingKeys(shortcuts, "viewer.step-next"),
      when: stepRuns("step"),
      run: () => stepImageOrSave(1),
    },
    {
      hotkey: bindingKeys(shortcuts, "viewer.video-step-prev"),
      when: stepRuns("video-step"),
      run: () => stepImageOrSave(-1),
    },
    {
      hotkey: bindingKeys(shortcuts, "viewer.video-step-next"),
      when: stepRuns("video-step"),
      run: () => stepImageOrSave(1),
    },
    {
      hotkey: bindingKeys(shortcuts, "viewer.prev-save"),
      run: () => step(-1),
    },
    {
      hotkey: bindingKeys(shortcuts, "viewer.next-save"),
      run: () => step(1),
    },
    {
      hotkey: "Escape",
      run: () => {
        if (!viewerEscape.cancel()) closeSave();
      },
    },
  ];

  useHotkeys(
    hotkeys.map(({ hotkey, when, run }) => ({
      hotkey,
      callback: (event: KeyboardEvent) => {
        if (!saveOwnsKeyboard(event)) return;
        if (
          event.key !== "Escape" &&
          event.target instanceof HTMLElement &&
          event.target.closest("button, input, [role='slider']")
        )
          return;
        if (when && !when(event)) return;
        event.preventDefault();
        run();
      },
      options: {
        ignoreInputs: true,
        preventDefault: false,
        conflictBehavior: "allow" as const,
      },
    })),
  );

  return <SaveDetailSession key={id} save={save} viewerNav={viewerNav} />;
}

function SaveDetailSession({
  save,
  viewerNav,
}: {
  save: Save | undefined;
  viewerNav: RefObject<ViewerNav | null>;
}) {
  const pageRef = useRef<HTMLElement>(null);
  useEffect(() => {
    pageRef.current?.focus({ preventScroll: true });
  }, []);
  const [activeFileIndex, setActiveFileIndex] = useState<number | null>(null);
  const onActiveFileIndexChange = useCallback((fileIndex: number | null) => {
    setActiveFileIndex(fileIndex);
    setSaveViewerFileIndex(fileIndex);
  }, []);

  useEffect(() => () => setSaveViewerFileIndex(null), []);

  const menuVideo = useRef<HTMLVideoElement | null>(null);
  const menuFileIndex = useRef<number | null>(null);
  const [openWithApps, setOpenWithApps] = useState<OpenWithApp[]>([]);

  if (!save) {
    return (
      <AppShell.Content>
        <div className={styles.page} />
      </AppShell.Content>
    );
  }

  return (
    <AppShell.Content>
      <SpecContextMenu
        search
        searchLabel="Search save operations"
        buildItems={() => {
          const fileIndex = menuFileIndex.current ?? activeFileIndex;
          const peeked = peekOpenWithApps(openWithKind(save, fileIndex));
          return buildViewerMenu(save, {
            clipboardEmpty: tagClipboard.get().length === 0,
            video: menuVideo.current,
            fileIndex,
            openWithApps: peeked.length ? peeked : openWithApps,
          });
        }}
        onOpen={(eventDetails) => {
          const target = eventDetails.event?.target;
          const slide =
            target instanceof Element
              ? target.closest("[data-blossom-slide]")
              : null;
          menuVideo.current =
            slide?.querySelector<HTMLVideoElement>("video") ?? null;
          menuFileIndex.current = fileIndexFromSlide(slide) ?? activeFileIndex;
          void loadOpenWithApps({
            ids: [save.id],
            fileIndex: menuFileIndex.current,
            kind: openWithKind(save, menuFileIndex.current),
            onApps: setOpenWithApps,
          });
        }}
      >
        <section
          ref={pageRef}
          className={styles.page}
          data-save-details=""
          tabIndex={-1}
          aria-label={save.title || "Save viewer"}
        >
          <div className={styles.main}>
            {hasArchive(save) ? (
              <SaveArchiveViewer save={save} />
            ) : isTextOnlySave(save) ? (
              <TextViewer save={save} />
            ) : (
              <SaveViewer
                save={save}
                onActiveFileIndexChange={onActiveFileIndexChange}
                navRef={viewerNav}
              />
            )}
          </div>
        </section>
      </SpecContextMenu>
    </AppShell.Content>
  );
}
