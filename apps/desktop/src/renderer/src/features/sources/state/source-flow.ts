import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

export type SourceFlowPage = "connect-wait" | "import-scope" | "watch-target";

interface SourceFlowState {
  stack: SourceFlowPage[];
}

const store = new Store<SourceFlowState>({ stack: [] });

export const sourceFlow = {
  current(): SourceFlowPage | null {
    const stack = store.state.stack;
    return stack[stack.length - 1] ?? null;
  },
  stack(): readonly SourceFlowPage[] {
    return store.state.stack;
  },
  open(page: SourceFlowPage): void {
    store.setState(() => ({ stack: [page] }));
  },
  push(page: SourceFlowPage): void {
    store.setState((s) =>
      s.stack[s.stack.length - 1] === page ? s : { stack: [...s.stack, page] },
    );
  },
  back(): void {
    store.setState((s) =>
      s.stack.length <= 1 ? { stack: [] } : { stack: s.stack.slice(0, -1) },
    );
  },
  close(): void {
    store.setState((s) => (s.stack.length === 0 ? s : { stack: [] }));
  },
};

export function useSourceFlowPage(): SourceFlowPage | null {
  return useSelector(store, (s) => s.stack[s.stack.length - 1] ?? null);
}

export function useSourceFlowDepth(): number {
  return useSelector(store, (s) => s.stack.length);
}
