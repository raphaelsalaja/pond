import type {
  LibraryQueryPage,
  LibraryQueryRequest,
} from "@shared/library-query";
import { dequal } from "dequal/lite";
import { errorCopy } from "@/shared/lib/error-copy";
export interface QuerySessionState {
  page: LibraryQueryPage | null;
  loading: boolean;
  error: string | null;
}
interface Runtime {
  page(request: LibraryQueryRequest): Promise<LibraryQueryPage>;
  ids(request: LibraryQueryRequest): Promise<{ ids: string[] }>;
  refresh(ids: readonly string[]): Promise<void>;
}
function scopeKey(request: LibraryQueryRequest): string {
  return JSON.stringify({ ...request, keywords: undefined });
}

export function createQuerySession(
  runtime: Runtime,
  emit: (state: QuerySessionState) => void,
) {
  let request: LibraryQueryRequest | null = null;
  let key = "";
  let pageKey = "";
  let sequence = 0;
  let active = false;
  let state: QuerySessionState = { page: null, loading: true, error: null };
  function update(patch: Partial<QuerySessionState>) {
    state = { ...state, ...patch };
    emit(state);
  }
  async function load(append = false): Promise<void> {
    if (!request || (append && (active || !state.page?.nextCursor))) return;
    const captured = request;
    const capturedKey = key;
    const ticket = ++sequence;
    active = true;
    const previous = pageKey === capturedKey ? state.page : null;
    update({ loading: true, error: null });
    const current = () => ticket === sequence && capturedKey === key;
    try {
      let result = await runtime.page({
        ...captured,
        cursor: append ? previous?.nextCursor : null,
      });
      if (!current()) return;
      while (
        !append &&
        result.nextCursor &&
        result.ids.length < (previous?.ids.length ?? 0)
      ) {
        const next = await runtime.page({
          ...captured,
          cursor: result.nextCursor,
        });
        if (!current()) return;
        result = { ...next, ids: [...result.ids, ...next.ids] };
      }
      await runtime.refresh(result.ids);
      if (!current()) return;
      const page = {
        ...result,
        ids:
          append && previous
            ? [...new Set([...previous.ids, ...result.ids])]
            : result.ids,
      };
      pageKey = capturedKey;
      /** Sync actions reload the page; an identical result must not rebuild the grid. */
      if (!dequal(previous, page)) update({ page });
    } catch (cause) {
      if (!current()) return;
      if (append) {
        active = false;
        await load(false);
        return;
      }
      update({
        error: errorCopy(cause, "Couldn't complete the search. Try again."),
      });
    } finally {
      if (current()) {
        active = false;
        update({ loading: false });
      }
    }
  }
  return {
    snapshot: () => state,
    setRequest(next: LibraryQueryRequest): boolean {
      const nextKey = JSON.stringify(next);
      if (nextKey === key) return false;
      /** Typing only changes keywords, so current results stay up until the debounced search replaces them. */
      const retyped = request !== null && scopeKey(request) === scopeKey(next);
      request = next;
      key = nextKey;
      sequence++;
      active = false;
      update({ page: retyped ? state.page : null, loading: true, error: null });
      return retyped;
    },
    load,
    async allIds() {
      if (!request) return null;
      const capturedKey = key;
      const result = await runtime.ids(request);
      return key === capturedKey ? result.ids : null;
    },
    cancel() {
      sequence++;
      active = false;
    },
  };
}
