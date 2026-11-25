import { IconCircleCheck } from "@pond/icons";
import { connectsByHandle } from "@pond/schema/sources";
import { Button, Dialog } from "@pond/ui";
import { useEffect, useState } from "react";
import { HandleForm } from "@/features/sources/components/flow/connect/handle";
import { ConnectionVisual } from "@/features/sources/components/flow/connection-visual";
import { useAccounts } from "@/features/sources/hooks/use-accounts";
import type { AccountRow } from "@/features/sources/hooks/use-accounts";
import { openSources } from "@/features/sources/lib/open";
import { getSourceDef } from "@/features/sources/lib/registry";
import {
  connectFlow,
  useConnectCompleted,
  useConnectedAccount,
  useConnectedBefore,
  useConnectProblem,
  useConnectSource,
  useConnectWaiting,
} from "@/features/sources/state/connect-flow";
import { sourceFlow } from "@/features/sources/state/source-flow";
import { syncMonitor } from "@/features/sources/state/sync-monitor";
import { BrowserExtensionDialog } from "@/shared/components/browser-extension-dialog";
import { findArrivedAccount } from "./arrival";
import styles from "./styles.module.css";

export function ConnectWaitSection() {
  const source = useConnectSource();
  const completed = useConnectCompleted();
  const problem = useConnectProblem();
  const account = useConnectedAccount();
  useConnectArrival();
  if (!source) return null;
  const label = getSourceDef(source).label;
  const byHandle = connectsByHandle(source);
  const step = completed ? "connected" : (problem ?? "waiting");
  const choosing = completed && account?.sync.importPending === true;
  const next = completed && !choosing;
  const askHandle = byHandle && !completed && step !== "unavailable";

  return (
    <div className={styles.body}>
      <ConnectionVisual
        source={source}
        state={
          completed
            ? "connected"
            : problem === "unavailable"
              ? "failed"
              : "waiting"
        }
      />
      <div
        key={step}
        className={styles.copy}
        data-state={step === "waiting" ? undefined : step}
        aria-live="polite"
      >
        <h2 className={styles.title}>
          {step === "connected"
            ? `${label} is connected`
            : step === "unavailable"
              ? `Couldn't connect ${label}`
              : step === "signed_out"
                ? `Signed out of ${label}`
                : `Connect ${label} to Pond`}
        </h2>
        {askHandle ? (
          <HandleForm label={label} notFound={problem === "not_found"} />
        ) : (
          <p className={styles.description}>
            {choosing ? (
              <>
                Next, choose what Pond imports.
                <br />
                Nothing syncs until you start the import.
              </>
            ) : next ? (
              <>
                Pond is syncing your saved posts now.
                <br />
                New saves keep arriving in your library.
              </>
            ) : step === "unavailable" ? (
              byHandle ? (
                `Pond couldn't reach ${label}. Check your connection and try again.`
              ) : (
                "Pond couldn't open the sign-in page. Try again."
              )
            ) : step === "signed_out" ? (
              <>
                Pond&apos;s extension found a browser profile signed out of{" "}
                {label}.
                <br />
                Sign in there, or add the extension to the profile you use.
              </>
            ) : (
              <>
                Sign in to {label} in your browser.
                <br />
                Pond will finish the connection here.
              </>
            )}
          </p>
        )}
      </div>
      <ConnectPromises
        completed={completed}
        label={label}
        byHandle={byHandle}
      />
    </div>
  );
}

const RESPONSIBLE_USE_URL = "https://pond.raphaelsalaja.com/responsible-use";

const SESSION_PROMISES = [
  "Keep your session on this device",
  "Read your saved posts",
  "Add new saves to your library",
];

const HANDLE_PROMISES = [
  "Read only what's public",
  "Read your liked posts",
  "Add new likes to your library",
];

function ConnectPromises({
  completed,
  label,
  byHandle,
}: {
  completed: boolean;
  label: string;
  byHandle: boolean;
}) {
  return (
    <>
      <div className={styles.details}>
        <p className={styles.heading}>Pond will</p>
        <ul className={styles.checklist}>
          {(byHandle ? HANDLE_PROMISES : SESSION_PROMISES).map((promise) => (
            <li key={promise}>
              <IconCircleCheck size={12} className={styles.check} />
              <span>{promise}</span>
            </li>
          ))}
        </ul>
      </div>
      {completed ? null : (
        <>
          {byHandle ? null : <ExtensionNote />}
          <p className={styles.note}>
            You&apos;re responsible for following {label}&apos;s terms while
            Pond syncs your account.{" "}
            <Button
              variant="link"
              size="xs"
              onClick={() => void window.pond.openExternal(RESPONSIBLE_USE_URL)}
            >
              Responsible Use
            </Button>
          </p>
        </>
      )}
    </>
  );
}

/** The extension pushes cookies as soon as a sign-in page finishes loading, so this long without a message means it can't reach Pond. */
const EXTENSION_SILENT_MS = 20_000;
const EXTENSION_POLL_MS = 3000;

function useExtensionSilent(): boolean {
  const waiting = useConnectWaiting();
  const problem = useConnectProblem();
  const [silent, setSilent] = useState(false);
  const [watched, setWatched] = useState({ waiting, problem });
  if (watched.waiting !== waiting || watched.problem !== problem) {
    setWatched({ waiting, problem });
    setSilent(false);
  }

  useEffect(() => {
    if (!waiting || problem) {
      return;
    }
    const startedAt = Date.now();
    let cancelled = false;
    const check = async () => {
      const result = await window.pond
        .query("sources.extensionLastSeen", {})
        .catch(() => null);
      if (cancelled || !result) return;
      const heard = result.at !== null && result.at >= startedAt;
      setSilent(!heard && Date.now() - startedAt >= EXTENSION_SILENT_MS);
    };
    const timer = setInterval(() => void check(), EXTENSION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [waiting, problem]);

  return silent;
}

function ExtensionNote() {
  const [open, setOpen] = useState(false);
  const silent = useExtensionSilent();
  return (
    <p className={styles.note} data-state={silent ? "silent" : undefined}>
      {silent
        ? "Pond hasn't heard from its extension yet. Open the extension in the browser you sign in with to check that it can reach Pond."
        : "Pond gets your session through its browser extension. Install it in the browser you sign in with."}{" "}
      <Button variant="link" size="xs" onClick={() => setOpen(true)}>
        Get Extension
      </Button>
      <BrowserExtensionDialog open={open} onOpenChange={setOpen} />
    </p>
  );
}

export function ConnectActions() {
  const completed = useConnectCompleted();
  const problem = useConnectProblem();
  const account = useConnectedAccount();
  if (completed && account) {
    return (
      <Dialog.Confirm
        onClick={() => {
          connectFlow.clear();
          sourceFlow.close();
          openSources({ type: "inspect-account", id: account.id });
        }}
      >
        Continue
      </Dialog.Confirm>
    );
  }
  return (
    <>
      <Dialog.Cancel />
      {problem === "unavailable" ? (
        <Dialog.Confirm onClick={() => connectFlow.retry()}>
          Try Again
        </Dialog.Confirm>
      ) : problem === "signed_out" ? (
        <Dialog.Confirm onClick={() => connectFlow.retry()}>
          Open Sign-In Page
        </Dialog.Confirm>
      ) : null}
    </>
  );
}

function useConnectArrival(): void {
  const waiting = useConnectWaiting();
  const connectedBefore = useConnectedBefore();
  const { refetch } = useAccounts();

  useEffect(() => {
    if (!waiting) return;
    const source = waiting;
    let cancelled = false;
    let arrivedOnce = false;
    let inflight = false;
    let pending = false;
    let importedAccountId: string | null = null;

    const finish = (account: AccountRow) => {
      if (cancelled || arrivedOnce) return;
      arrivedOnce = true;
      syncMonitor.seed(account.id, source, { connected: true });
      if (!account.sync.importPending) void window.pond.syncRunNow(account.id);
      connectFlow.complete(account);
    };

    const tick = () => {
      if (cancelled || arrivedOnce) return;
      if (inflight) {
        pending = true;
        return;
      }
      inflight = true;
      void (async () => {
        try {
          const list = await refetch();
          if (cancelled || arrivedOnce) return;
          const arrived = findArrivedAccount(
            list,
            source,
            connectedBefore,
            importedAccountId,
          );
          if (!arrived) return;
          finish(arrived);
        } catch {
          /** A failed refetch is retried on the next tick. */
        } finally {
          inflight = false;
          if (pending) {
            pending = false;
            tick();
          }
        }
      })();
    };

    const stopListen = window.pond.onSessionImported((payload) => {
      if (payload.source !== source) return;
      importedAccountId = payload.accountId;
      tick();
    });
    const stopFailureListen = window.pond.onSessionImportFailed((payload) => {
      if (payload.source !== source) return;
      connectFlow.rejectSession(source, payload.reason);
    });

    tick();
    const timer = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
      stopListen();
      stopFailureListen();
    };
  }, [waiting, connectedBefore, refetch]);
}
