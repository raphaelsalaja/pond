import {
  IconDotsOutline18,
  IconFolder5Outline18,
  IconGlobe2Outline18,
  IconRefreshOutline18,
  IconSidebarLeft2HideOutline18,
  IconTrashOutline18,
} from "@pond/icons/outline/18";
import { Menu, Tooltip, useToast } from "@pond/ui";
import { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTrackVisit } from "@/components/recents";
import { SavePreview } from "@/components/save-preview";
import {
  humaniseRefreshReason,
  REVEAL_LABEL,
} from "@/components/save-preview/helpers";
import { useInspector } from "@/lib/use-inspector";
import { optimistic } from "@/pool/bootstrap";
import { useSave } from "@/pool/hooks";
import { pool } from "@/pool/pool";
import styles from "./styles.module.css";

export function SaveDetail() {
  const { id } = useParams<{ id: string }>();
  const save = useSave(id);
  const { open, toggle } = useInspector();

  useTrackVisit(id);

  if (!open) return null;

  return (
    <aside aria-label="Inspector" className={styles.pane}>
      <div className={styles.toolbar}>
        <Tooltip.Root content="Hide inspector" side="bottom">
          <button
            type="button"
            className={styles["toolbar-btn"]}
            onClick={toggle}
            aria-label="Hide inspector"
          >
            <span className={styles["toolbar-btn-flip"]} aria-hidden>
              <IconSidebarLeft2HideOutline18 width={14} height={14} />
            </span>
          </button>
        </Tooltip.Root>
        <KebabMenu save={save ?? null} />
      </div>
      <div className={styles.body}>
        {save ? (
          <SavePreview.Pane save={save} />
        ) : id ? (
          <p className={styles.empty}>Save not found.</p>
        ) : (
          <p className={styles.empty}>Select a save to inspect.</p>
        )}
      </div>
    </aside>
  );
}

function KebabMenu({ save }: { save: ReturnType<typeof useSave> | null }) {
  const navigate = useNavigate();
  const toast = useToast();

  const hasUrl = !!save?.url;
  const hasLocalFile = (save?.files ?? []).length > 0;

  const onOpenOriginal = useCallback(() => {
    if (!save?.url) return;
    void window.pond.openExternal(save.url);
  }, [save?.url]);

  const onReveal = useCallback(() => {
    if (!save || !hasLocalFile) return;
    void window.pond.revealSave(save.id);
  }, [save, hasLocalFile]);

  const onRefresh = useCallback(async () => {
    if (!save?.url) return;
    try {
      const res = await window.pond.refreshSave(save.id);
      if (res.ok) {
        toast.add({
          title: "Metadata refreshed",
          type: "success",
          description:
            res.method === "og"
              ? "Pulled fresh OpenGraph data from the source."
              : "Re-scraped via signed-in session.",
        });
        return;
      }
      toast.add({
        title: "Refresh failed",
        type: "error",
        description: humaniseRefreshReason(res.reason),
      });
    } catch (err) {
      toast.add({
        title: "Refresh failed",
        type: "error",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, [save?.id, save?.url, toast]);

  const onDelete = useCallback(async () => {
    if (!save) return;
    const prev = pool.get(save.id);
    if (!prev) return;
    const now = Date.now();
    await optimistic(
      () => {
        pool.upsert({ ...prev, deletedAt: now } as typeof prev);
      },
      () => {
        pool.upsert(prev);
      },
      async () => window.pond.tx({ kind: "trash", model: "save", id: save.id }),
    );
    toast.add({ title: "Moved to trash", type: "success" });
    navigate(-1);
  }, [save, toast, navigate]);

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <button
            type="button"
            aria-label="More options"
            className={styles["toolbar-btn"]}
            disabled={!save}
          >
            <IconDotsOutline18 width={14} height={14} />
          </button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={6}>
          <Menu.Popup>
            <Menu.Item disabled={!hasUrl} onClick={onOpenOriginal}>
              <Menu.ItemIcon>
                <IconGlobe2Outline18 width={14} height={14} />
              </Menu.ItemIcon>
              <Menu.ItemLabel>Open Original</Menu.ItemLabel>
            </Menu.Item>
            <Menu.Item disabled={!hasLocalFile} onClick={onReveal}>
              <Menu.ItemIcon>
                <IconFolder5Outline18 width={14} height={14} />
              </Menu.ItemIcon>
              <Menu.ItemLabel>{REVEAL_LABEL}</Menu.ItemLabel>
            </Menu.Item>
            <Menu.Item disabled={!hasUrl} onClick={onRefresh}>
              <Menu.ItemIcon>
                <IconRefreshOutline18 width={14} height={14} />
              </Menu.ItemIcon>
              <Menu.ItemLabel>Refresh</Menu.ItemLabel>
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item disabled={!save} onClick={onDelete}>
              <Menu.ItemIcon>
                <IconTrashOutline18 width={14} height={14} />
              </Menu.ItemIcon>
              <Menu.ItemLabel>Move to Trash</Menu.ItemLabel>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
