import { Dialog } from "@pond/ui";
import type { QueryResult } from "@shared/query-contracts";
import { type UpdateNotice, UpdateNoticeSchema } from "@shared/update-notice";
import { useEffect, useState } from "react";
import { updateDialogPrompt } from "./prompt";
import {
  dismissUpdateDialog,
  presentUpdateNotice,
  readUpdateDialog,
  requestUpdateCheck,
  type UpdateDialogView,
} from "./session";
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
      return `update:${view.notice.phase}:${view.notice.version}:${
        view.notice.phase === "available" ? view.notice.downloading : ""
      }`;
  }
}

export function UpdateDialog() {
  const model = useUpdateDialog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = viewKey(model.view);
  const [trackedKey, setTrackedKey] = useState(key);
  if (trackedKey !== key) {
    setTrackedKey(key);
    setBusy(false);
    setError(null);
  }

  useEffect(() => subscribeToUpdateNotices(presentUpdateNotice), []);

  const prompt = model.view ? updateDialogPrompt(model.view) : null;
  const pending = Boolean(prompt?.pending || busy);

  async function confirm() {
    const current = readUpdateDialog();
    const view = current.view;
    if (!current.open || !view || view.kind === "checking") return;
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
    if (!failure && action === "updates.install") return;
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
      {prompt ? (
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup aria-busy={pending}>
            <Dialog.Header>
              <Dialog.Title>{prompt.title}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Content>
              <Dialog.Description>{prompt.description}</Dialog.Description>
              {error ? (
                <Dialog.Description role="alert" data-error>
                  {error}
                </Dialog.Description>
              ) : null}
            </Dialog.Content>
            <Dialog.Footer>
              {prompt.cancel ? (
                <Dialog.Cancel>{prompt.cancel}</Dialog.Cancel>
              ) : null}
              <Dialog.Confirm
                disabled={pending}
                loading={pending}
                onClick={() => void confirm()}
              >
                {prompt.action}
              </Dialog.Confirm>
            </Dialog.Footer>
          </Dialog.Popup>
        </Dialog.Portal>
      ) : null}
    </Dialog.Root>
  );
}

export function subscribeToUpdateNotices(
  present: (notice: UpdateNotice) => void,
  dependencies: UpdateNoticeSubscriptionDependencies = defaultSubscriptionDependencies,
): () => void {
  let active = true;
  let lastNotice = "";
  const presentOnce = (notice: UpdateNotice) => {
    const key = `${notice.phase}:${notice.version}:${"downloading" in notice ? notice.downloading : ""}`;
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
