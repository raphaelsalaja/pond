import { Button, Empty } from "@pond/ui";
import type {
  MissingLibraryChoice,
  MissingLibraryView,
} from "@shared/missing-library-contracts";
import { MotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import type { PondMissingLibraryApi } from "../../../../preload/missing-library";
import { Finder } from "./finder";
import styles from "./styles.module.css";

declare global {
  interface Window {
    pondMissingLibrary?: PondMissingLibraryApi;
  }
}

function fileName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

function useView(): MissingLibraryView | null {
  const [view, setView] = useState<MissingLibraryView | null>(null);
  useEffect(() => {
    const api = window.pondMissingLibrary;
    if (!api) return;
    let active = true;
    const apply = (next: MissingLibraryView) => {
      if (active)
        setView((current) =>
          current && current.attempt >= next.attempt ? current : next,
        );
    };
    const stop = api.onView(apply);
    void api.ready().then(apply);
    return () => {
      active = false;
      stop();
    };
  }, []);
  return view;
}

export function MissingLibraryWindow() {
  const view = useView();
  const [answer, setAnswer] = useState<{
    attempt: number;
    choice: MissingLibraryChoice;
  } | null>(null);
  const busy = view !== null && answer?.attempt === view.attempt;
  const choice = busy ? (answer?.choice ?? null) : null;

  const choose = (next: MissingLibraryChoice) => {
    if (!view || busy) return;
    setAnswer({ attempt: view.attempt, choice: next });
    void window.pondMissingLibrary?.choose(next);
  };

  return (
    <MotionConfig reducedMotion="user">
      <main className={styles.root}>
        <div className={styles.drag} />
        {view ? (
          <Empty.Root className={styles.empty}>
            <Empty.Title>Library Not Found</Empty.Title>
            <Empty.Description aria-live="polite">
              Pond can't find {view.name} at{" "}
              <span className={styles.path}>{view.path}</span>. {view.detail}
            </Empty.Description>
            <Finder file={fileName(view.path)} />
            <Empty.Action>
              <Button
                loading={choice === "retry"}
                disabled={busy}
                onClick={() => choose("retry")}
              >
                Try Again
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => choose("locate")}
              >
                Locate Library
              </Button>
            </Empty.Action>
            <p className={styles.hint}>
              Can't find it?{" "}
              <Button
                variant="link"
                size="xs"
                disabled={busy}
                onClick={() => choose("new")}
              >
                Create a New Library
              </Button>
            </p>
          </Empty.Root>
        ) : null}
      </main>
    </MotionConfig>
  );
}
