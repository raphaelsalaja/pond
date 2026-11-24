import { Button, Empty } from "@pond/ui";
import { useSelector } from "@tanstack/react-store";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  dismissLibrarySwitch,
  librarySwitchStore,
  showLibrarySwitch,
} from "@/features/library/state/library-switch";
import defaultAppIcon from "@/generated/app-icon-previews/aqua.png";
import styles from "./styles.module.css";

export function LibrarySwitchCover() {
  const state = useSelector(librarySwitchStore, (value) => value);
  const failed = state?.phase === "failed";

  useEffect(() => window.pond.onLibrarySwitch(showLibrarySwitch), []);

  useEffect(() => {
    if (!failed) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissLibrarySwitch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [failed]);

  if (!state) {
    return null;
  }

  return createPortal(
    <div
      className={styles.cover}
      data-failed={failed || undefined}
      role={failed ? "alertdialog" : "status"}
      aria-busy={!failed}
      aria-labelledby="library-switch-title"
      aria-describedby={
        failed || state.waiting ? "library-switch-detail" : undefined
      }
    >
      <div className={styles.drag} aria-hidden="true" />
      <Empty.Root className={styles.empty}>
        <Empty.Media className={styles.media}>
          <img
            className={styles.icon}
            src={state.library.icon ?? defaultAppIcon}
            alt=""
            draggable={false}
          />
        </Empty.Media>
        <Empty.Title id="library-switch-title">
          {failed
            ? `Couldn't Open ${state.library.name}`
            : `Opening ${state.library.name}`}
        </Empty.Title>
        {state.phase === "failed" ? (
          <Empty.Description id="library-switch-detail">
            {state.error}
          </Empty.Description>
        ) : state.waiting === "transfer" ? (
          <Empty.Description id="library-switch-detail">
            Finishing an import or export in this library first.
          </Empty.Description>
        ) : null}
        {failed ? (
          <Empty.Action>
            <Button
              variant="secondary"
              autoFocus
              onClick={dismissLibrarySwitch}
            >
              Back to Library
            </Button>
          </Empty.Action>
        ) : null}
      </Empty.Root>
    </div>,
    document.body,
  );
}
