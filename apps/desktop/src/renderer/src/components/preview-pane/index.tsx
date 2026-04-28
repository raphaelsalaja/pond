import ArrowUpRight from "@pond/icons/outline/arrow-up-right";
import XMark from "@pond/icons/outline/xmark";
import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useSave } from "../../pool/hooks";
import { Button, Tooltip } from "../../ui";
import { SavePreview } from "../save-preview";
import styles from "./styles.module.css";

/**
 * Right-side preview pane (Eagle-style). Reads `?id=<saveId>` from
 * the URL and slides in when present. Cards in `<SavesView>` and
 * `<TrashView>` flip the search param via `useSearchParams` instead
 * of navigating, so the grid stays mounted.
 *
 * Why the URL and not React state:
 *   - back/forward navigates between selected saves
 *   - deep-linkable (`pond://item?id=…` could land directly here)
 *   - all sibling list views see the same selection
 *
 * The pane lives in the shell (`<App>`) so it overlays consistently
 * regardless of which list view is mounted. It renders nothing when
 * no `?id=` is set, so list views without selection take the full
 * width of `<main>`.
 */
export function PreviewPane() {
  const [searchParams, setSearchParams] = useSearchParams();
  const id = searchParams.get("id");
  const save = useSave(id ?? undefined);

  const close = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("id");
    next.delete("focus");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const expand = useCallback(() => {
    if (!id) return;
    const next = new URLSearchParams(searchParams);
    next.set("focus", id);
    setSearchParams(next, { replace: true });
  }, [id, searchParams, setSearchParams]);

  // ESC closes the pane. Only listen while open so we don't fight with
  // dialogs / menus that have their own ESC handling.
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, close]);

  if (!id) return null;

  return (
    <aside className={styles.pane} aria-label="Preview">
      <div className={styles.toolbar}>
        <Tooltip content="Open fullscreen (double-click card)">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={expand}
            aria-label="Open fullscreen preview"
          >
            <ArrowUpRight width={14} height={14} />
          </Button>
        </Tooltip>
        <Tooltip content="Close preview (Esc)">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={close}
            aria-label="Close preview"
          >
            <XMark width={14} height={14} />
          </Button>
        </Tooltip>
      </div>
      <div className={styles.body}>
        {save ? (
          <SavePreview save={save} variant="pane" />
        ) : (
          <p className={styles.empty}>Save not found.</p>
        )}
      </div>
    </aside>
  );
}
