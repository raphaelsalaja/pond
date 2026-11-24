import { Button, Dialog, Logo, Progress, Shimmer } from "@pond/ui";
import type { QueryResult } from "@shared/query-contracts";
import { type UpdateNotice, UpdateNoticeSchema } from "@shared/update-notice";
import { useEffect, useRef, useState } from "react";
import { updateScreen } from "./screen";
import {
  dismissUpdateDialog,
  presentUpdateNotice,
  readUpdateDialog,
  requestUpdateCheck,
  showUpdateRestarting,
  type UpdateDialogView,
} from "./session";
import styles from "./styles.module.css";
import { useUpdateDialog } from "./use-update-dialog";

type UpdateAction = "updates.download" | "updates.install";
type UpdateActionResult = QueryResult<UpdateAction>;

interface UpdateNoticeSubscriptionDependencies {
  current(): Promise<UpdateNotice | null>;
  subscribe(listener: (notice: UpdateNotice) => void): () => void;
  warn(error: Error): void;
}

const defaultSubscriptionDependencies: UpdateNoticeSubscriptionDependencies = {
  current: async () => {
    const result = await window.pond.query("updates.currentNotice", {});
    return UpdateNoticeSchema.nullable().parse(result);
  },
  subscribe: (listener) => window.pond.onUpdateNotice(listener),
  warn: (error) => console.warn("[pond updater] replay failed", error),
};

const FALLBACK_ERRORS = {
  "updates.download": "Couldn't download the update. Try again.",
  "updates.install": "Couldn't restart Pond. Try again.",
} satisfies Record<UpdateAction, string>;

function noticeKey(notice: UpdateNotice): string {
  if (notice.phase === "downloaded") return `downloaded:${notice.version}`;
  return `available:${notice.version}:${notice.downloading}:${notice.progress ?? ""}`;
}

/** Leaves out download state: a failed download's notice and its error reply arrive in either order. */
function viewKey(view: UpdateDialogView | null): string {
  if (!view) return "none";
  switch (view.kind) {
    case "checking":
      return "checking";
    case "current":
      return `current:${view.version}`;
    case "failed":
      return `failed:${view.retry}:${view.message}`;
    case "update":
      return `update:${view.notice.phase}:${view.notice.version}`;
    case "restarting":
      return `restarting:${view.version}`;
  }
}

export function UpdateDialog() {
  const model = useUpdateDialog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const key = viewKey(model.view);
  const [trackedKey, setTrackedKey] = useState(key);
  if (trackedKey !== key) {
    setTrackedKey(key);
    setBusy(false);
    setError(null);
  }

  useEffect(() => subscribeToUpdateNotices(presentUpdateNotice), []);

  const screen = model.view ? updateScreen(model.view) : null;
  const step = stepKey(model.view);
  const working = busy || (screen !== null && screen.action === null);
  const startingDownload =
    busy &&
    model.view?.kind === "update" &&
    model.view.notice.phase === "available";

  useEffect(() => {
    if (step === "none") return;
    actionRef.current?.focus({ preventScroll: true });
  }, [step]);

  async function confirm() {
    const current = readUpdateDialog();
    const view = current.view;
    if (!current.open || !view) return;
    if (view.kind === "checking" || view.kind === "restarting") return;
    if (view.kind === "current" || (view.kind === "failed" && !view.retry)) {
      dismissUpdateDialog();
      return;
    }
    if (view.kind === "failed") {
      requestUpdateCheck();
      return;
    }
    if (view.notice.phase === "available" && view.notice.downloading) return;
    const started = viewKey(view);
    const action =
      view.notice.phase === "downloaded"
        ? "updates.install"
        : "updates.download";
    setBusy(true);
    setError(null);
    const failure = await runUpdateAction(action);
    if (
      !readUpdateDialog().open ||
      viewKey(readUpdateDialog().view) !== started
    )
      return;
    if (!failure && action === "updates.install") {
      showUpdateRestarting(view.notice.version);
      return;
    }
    setError(failure);
    setBusy(false);
  }

  return (
    <Dialog.Root
      open={model.open}
      onOpenChange={(next) => {
        if (!next) dismissUpdateDialog();
      }}
    >
      {screen ? (
        <Dialog.Portal>
          <Dialog.Popup
            size="full"
            aria-busy={working}
            initialFocus={screen.action ? actionRef : undefined}
          >
            <div className={styles.column}>
              <Logo size={66} className={styles.mark} aria-hidden />
              <div key={`copy:${step}`} className={styles.copy}>
                <Dialog.Title className={styles.title}>
                  {screen.action === null && model.view?.kind !== "failed" ? (
                    <Shimmer.Root tone="neutral">{screen.title}</Shimmer.Root>
                  ) : (
                    screen.title
                  )}
                </Dialog.Title>
                <Dialog.Description className={styles.description}>
                  {screen.description}
                </Dialog.Description>
              </div>
              <Progress.Root
                className={styles.meter}
                size="md"
                value={progressValue(screen.meter.value)}
              >
                <Progress.Track>
                  <Progress.Indicator />
                </Progress.Track>
                <Progress.Label key={`label:${step}`} className={styles.label}>
                  {screen.meter.label}
                </Progress.Label>
              </Progress.Root>
              {error ? (
                <Dialog.Description
                  role="alert"
                  className={styles.error}
                  data-error
                >
                  {error}
                </Dialog.Description>
              ) : null}
              <div
                key={`actions:${step}:${startingDownload}`}
                className={styles.actions}
              >
                {startingDownload ? null : screen.dismiss ? (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={dismissUpdateDialog}
                  >
                    {screen.dismiss}
                  </Button>
                ) : null}
                {!startingDownload && screen.action ? (
                  <Button
                    ref={actionRef}
                    size="md"
                    loading={busy}
                    onClick={() => void confirm()}
                  >
                    {screen.action}
                  </Button>
                ) : null}
              </div>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      ) : null}
    </Dialog.Root>
  );
}

/** Changes on every step the overlay animates into, but not on each percent of a download. */
function stepKey(view: UpdateDialogView | null): string {
  if (view?.kind === "update" && view.notice.phase === "available") {
    return `${viewKey(view)}:${view.notice.downloading}`;
  }
  return viewKey(view);
}

function progressValue(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100);
}

export function subscribeToUpdateNotices(
  present: (notice: UpdateNotice) => void,
  dependencies: UpdateNoticeSubscriptionDependencies = defaultSubscriptionDependencies,
): () => void {
  let active = true;
  let lastNotice = "";
  const presentOnce = (notice: UpdateNotice) => {
    const key = noticeKey(notice);
    if (key === lastNotice) return;
    lastNotice = key;
    present(notice);
  };
  const unsubscribe = dependencies.subscribe(presentOnce);
  void dependencies
    .current()
    .then((notice) => {
      if (active && notice) presentOnce(notice);
    })
    .catch((error) => {
      dependencies.warn(
        error instanceof Error ? error : new Error("Unknown updater error"),
      );
    });
  return () => {
    active = false;
    unsubscribe();
  };
}

/** Resolves to an error message, or null when the action succeeded. */
export async function runUpdateAction(
  name: UpdateAction,
  run: (name: UpdateAction) => Promise<UpdateActionResult> = (next) =>
    window.pond.query(next, {}),
): Promise<string | null> {
  try {
    const result = await run(name);
    if (result.ok) return null;
    return (
      result.error ??
      (result.reason === "dev_build"
        ? "Updates aren't available in development builds."
        : FALLBACK_ERRORS[name])
    );
  } catch (error) {
    return error instanceof Error ? error.message : FALLBACK_ERRORS[name];
  }
}
