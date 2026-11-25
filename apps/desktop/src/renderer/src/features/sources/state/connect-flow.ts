import type { ImportScope, Source } from "@pond/schema/db";
import { connectsByHandle } from "@pond/schema/sources";
import type { SessionImportFailureReason } from "@shared/wire";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { playUiSuccess } from "@/shared/lib/sounds";

export interface ConnectedAccount {
  id: string;
  source: Source;
  handle: string | null;
  label: string | null;
  avatarUrl?: string | null;
  sync: { importScope?: ImportScope; importPending?: boolean };
}

/** `signed_out` keeps waiting: another browser profile with the extension may still send a signed-in session. */
export type ConnectProblem = "signed_out" | "unavailable" | "not_found";

interface ConnectFlowState {
  source: Source | null;
  waiting: Source | null;
  connectedBefore: ReadonlySet<string>;
  completed: boolean;
  problem: ConnectProblem | null;
  account: ConnectedAccount | null;
}

const store = new Store<ConnectFlowState>({
  source: null,
  waiting: null,
  connectedBefore: new Set<string>(),
  completed: false,
  problem: null,
  account: null,
});

/** Kept outside the store: a callback is not state any view renders. */
let onConnected: (() => void) | null = null;

export const connectFlow = {
  start(
    source: Source,
    connectedIds: Iterable<string>,
    whenConnected: (() => void) | null = null,
  ): void {
    onConnected = whenConnected;
    store.setState(() => ({
      source,
      waiting: source,
      connectedBefore: new Set(connectedIds),
      completed: false,
      problem: null,
      account: null,
    }));
    void requestConnection(source);
  },
  retry(): void {
    const source = store.state.source;
    if (!source) return;
    store.setState((s) => ({ ...s, problem: null }));
    void requestConnection(source);
  },
  complete(account: ConnectedAccount): void {
    const already = store.state.completed;
    store.setState((s) =>
      s.completed ? s : { ...s, completed: true, problem: null, account },
    );
    if (already) return;
    playUiSuccess();
    const callback = onConnected;
    onConnected = null;
    callback?.();
  },
  /** Success arrives through the `sessionImported` broadcast the arrival hook already listens for. */
  async submitHandle(handle: string): Promise<void> {
    const source = store.state.source;
    if (!source) return;
    store.setState((s) => ({ ...s, problem: null }));
    try {
      const result = await window.pond.connectSourceHandle(source, handle);
      if (!result.ok) {
        markProblem(
          source,
          result.reason === "unavailable" ? "unavailable" : "not_found",
        );
      }
    } catch {
      markProblem(source, "unavailable");
    }
  },
  rejectSession(source: Source, reason: SessionImportFailureReason): void {
    markProblem(source, problemForReason(reason));
  },
  account(): ConnectedAccount | null {
    return store.state.account;
  },
  clear(): void {
    onConnected = null;
    const waiting = store.state.waiting;
    store.setState((s) => (s.waiting === null ? s : { ...s, waiting: null }));
    if (waiting) void window.pond.clearPendingSession(waiting);
  },
};

function problemForReason(reason: SessionImportFailureReason): ConnectProblem {
  return reason === "no_cookie_domain" ? "unavailable" : "signed_out";
}

export function useConnectSource(): Source | null {
  return useSelector(store, (s) => s.source);
}

export function useConnectWaiting(): Source | null {
  return useSelector(store, (s) => s.waiting);
}

export function useConnectedBefore(): ReadonlySet<string> {
  return useSelector(store, (s) => s.connectedBefore);
}

export function useConnectCompleted(): boolean {
  return useSelector(store, (s) => s.completed);
}

export function useConnectedAccount(): ConnectedAccount | null {
  return useSelector(store, (s) => s.account);
}

export function useConnectProblem(): ConnectProblem | null {
  return useSelector(store, (s) => s.problem);
}

async function requestConnection(source: Source): Promise<void> {
  if (connectsByHandle(source)) return;
  try {
    const result = await window.pond.connectSource(source);
    if (!result.ok) markProblem(source, "unavailable");
  } catch {
    markProblem(source, "unavailable");
  }
}

function markProblem(source: Source, problem: ConnectProblem): void {
  store.setState((s) =>
    s.waiting === source && !s.completed && s.problem !== problem
      ? { ...s, problem }
      : s,
  );
}
