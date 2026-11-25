import { sourceLabel } from "@pond/schema/sources";
import type { WireSyncAction } from "@shared/wire";
import { useEffect } from "react";
import { pool } from "@/features/saves/pool";
import { startConnect } from "@/features/sources/lib/create";
import { connectFlow } from "@/features/sources/state/connect-flow";
import { sourceFlow } from "@/features/sources/state/source-flow";
import { notify, toastManager } from "@/shared/lib/toast";

const REFRESH_BLOCKED_TIMEOUT_MS = 10_000;
/** Long enough to see the connected state before the dialog closes. */
const CLOSE_AFTER_CONNECT_MS = 1200;

interface RefreshBlockedDeps {
  notify: typeof notify;
  startConnect: typeof startConnect;
  refreshSave: (id: string) => void;
  closeConnect: () => void;
  closeToast: (id: string) => void;
}

const liveDeps: RefreshBlockedDeps = {
  notify,
  closeToast: (id) => toastManager.close(id),
  startConnect,
  refreshSave: (id) => void window.pond.refreshSave(id),
  closeConnect: () => {
    const account = connectFlow.account();
    /** A new account still has to pick what to import, so its step stays open. */
    if (account?.sync.importPending) return;
    setTimeout(() => {
      /** A connection started during the delay owns the dialog. */
      if (connectFlow.account() !== account) return;
      connectFlow.clear();
      sourceFlow.close();
    }, CLOSE_AFTER_CONNECT_MS);
  },
};

export function notifyRefreshBlocked(
  action: WireSyncAction,
  deps: RefreshBlockedDeps = liveDeps,
): void {
  if (action.modelName !== "save") return;
  if (action.actorReason !== "pipeline:refresh-blocked") return;
  const saveId = action.modelId;
  const source = pool.get(saveId)?.source;
  if (!source) return;
  /** The toast timer pauses while the app is in the background during sign-in, so the toast must close here. */
  const signIn = () => {
    deps.closeToast(toastId);
    void deps.startConnect(source, () => {
      deps.refreshSave(saveId);
      deps.closeConnect();
    });
  };
  const toastId = deps.notify({
    id: "refresh-blocked",
    title: `${sourceLabel(source)} needs a sign-in`,
    action: { label: "Sign In", onClick: signIn },
    timeout: REFRESH_BLOCKED_TIMEOUT_MS,
  });
}

export function RefreshBlockedToast() {
  useEffect(
    () => window.pond.onSyncAction((action) => notifyRefreshBlocked(action)),
    [],
  );
  return null;
}
