import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import type { TagEntity } from "@/features/tags/operations/tag-operations";

interface TagCreationRequest {
  token: number;
  kind: TagEntity;
}

const store = new Store<TagCreationRequest>({ token: 0, kind: "tag" });

/** The last token a Tags page handled, so remounting does not replay it. */
let handledToken = 0;

export const tagCreation = {
  request(kind: TagEntity): void {
    store.setState((state) => ({ token: state.token + 1, kind }));
  },
  /**
   * Returns the pending request once. The Tags page unmounts when you visit
   * another section; without this, coming back would reopen the old draft.
   */
  takeRequest(): TagCreationRequest | null {
    const state = store.state;
    if (state.token === 0 || state.token === handledToken) return null;
    handledToken = state.token;
    return state;
  },
};

export function useTagCreationRequest(): TagCreationRequest {
  return useSelector(store, (state) => state);
}
