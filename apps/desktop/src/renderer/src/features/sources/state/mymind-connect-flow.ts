import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { sourceFlow } from "./source-flow";

const store = new Store<{ accountId?: string; revision: number }>({
  revision: 0,
});

let onConnected: (() => void) | null = null;

export const mymindConnectFlow = {
  start(accountId?: string, whenConnected: (() => void) | null = null): void {
    onConnected = whenConnected;
    store.setState((state) => ({ accountId, revision: state.revision + 1 }));
    sourceFlow.open("connect-mymind");
  },
  complete(): void {
    const callback = onConnected;
    onConnected = null;
    callback?.();
  },
  clear(): void {
    onConnected = null;
  },
};

export function useMymindConnectSession() {
  return useSelector(store, (state) => state);
}
