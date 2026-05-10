import { AlertDialog, Button, Tooltip, useToast } from "@pond/ui";
import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/card-thumb";
import { EmptyState } from "@/components/empty-state";
import { Library } from "@/components/library";
import { LibraryChrome, Shell } from "@/components/shell";
import { SaveDetail } from "@/pages/save-detail";
import { optimistic } from "@/pool/bootstrap";
import { useSaves } from "@/pool/hooks";
import { pool } from "@/pool/pool";
import type { Save } from "@/pool/types";

/**
 * Trash view. Shows every row whose `deletedAt` is set, sorted most-
 * recently-trashed first. Per-card hover affordances cover the per-row
 * Restore / Delete Forever flow; bulk Empty Trash / Restore All are not
 * surfaced here — retention is handled by Settings → Trash.
 *
 * All trash mutations route through `window.pond.tx`.
 */
export function TrashView() {
  const saves = useSaves();
  const toast = useToast();
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<Save | null>(null);

  const selectedId = params.id ?? null;
  const listBase =
    location.pathname.replace(/\/save\/[^/]+\/?$/, "") || "/trash";
  const buildSavePath = useCallback(
    (id: string) => `${listBase}/save/${id}`,
    [listBase],
  );
  const buildDetailPath = useCallback(
    (id: string) => `${listBase}/detail/${id}`,
    [listBase],
  );

  const select = useCallback(
    (id: string) => {
      navigate(buildSavePath(id));
    },
    [buildSavePath, navigate],
  );
  // Double-click → Linear-style detail page. The lightbox now lives
  // behind the cover image (and the inspector thumb), not double-click.
  const focus = useCallback(
    (id: string) => {
      navigate(buildDetailPath(id));
    },
    [buildDetailPath, navigate],
  );

  const trashed = useMemo(
    () =>
      saves
        .filter((s) => s.deletedAt)
        .sort((a, b) => deletedAtMs(b) - deletedAtMs(a)),
    [saves],
  );

  async function restore(id: string) {
    const prev = pool.get(id);
    if (!prev) return;
    setBusy(id);
    try {
      await optimistic(
        () => {
          pool.upsert({ ...prev, deletedAt: null } as typeof prev);
        },
        () => {
          pool.upsert(prev);
        },
        async () =>
          window.pond.tx({
            kind: "untrash",
            model: "save",
            id,
          }),
      );
      toast.add({ title: "Restored", type: "success" });
    } finally {
      setBusy(null);
    }
  }

  async function purge(save: Save) {
    const prev = pool.get(save.id);
    if (!prev) return;
    setBusy(save.id);
    try {
      await optimistic(
        () => {
          pool.delete(save.id);
        },
        () => {
          pool.upsert(prev);
        },
        async () =>
          window.pond.tx({
            kind: "purge",
            model: "save",
            id: save.id,
            before: save as unknown as Save,
          }),
      );
      toast.add({ title: "Deleted forever", type: "success" });
    } finally {
      setBusy(null);
      setConfirmPurge(null);
    }
  }

  return (
    <>
      <Shell.Main>
        <LibraryChrome />
        {trashed.length === 0 ? (
          <EmptyState.Root>
            <EmptyState.Description>Trash is empty.</EmptyState.Description>
          </EmptyState.Root>
        ) : (
          <Library.Grid>
            {trashed.map((save) => (
              <Library.Item
                key={save.id}
                selected={selectedId === save.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  void window.pond.showSaveContextMenu(save.id);
                }}
              >
                <Library.Item.Select
                  aria-pressed={selectedId === save.id}
                  onClick={() => select(save.id)}
                  onDoubleClick={() => focus(save.id)}
                >
                  <CardBody save={save} selected={selectedId === save.id} />
                </Library.Item.Select>
                <Library.Item.Actions>
                  <Tooltip.Root content="Restore">
                    <Button
                      size="sm"
                      disabled={busy === save.id}
                      onClick={(e) => {
                        e.preventDefault();
                        void restore(save.id);
                      }}
                      aria-label="Restore"
                    >
                      Restore
                    </Button>
                  </Tooltip.Root>
                  <Tooltip.Root content="Delete forever">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busy === save.id}
                      onClick={(e) => {
                        e.preventDefault();
                        setConfirmPurge(save);
                      }}
                      aria-label="Delete forever"
                    >
                      Delete
                    </Button>
                  </Tooltip.Root>
                </Library.Item.Actions>
              </Library.Item>
            ))}
          </Library.Grid>
        )}

        <AlertDialog.Root
          open={confirmPurge !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmPurge(null);
          }}
        >
          <AlertDialog.Content>
            <AlertDialog.Title>Delete forever?</AlertDialog.Title>
            <AlertDialog.Description>
              Permanently delete "{confirmPurge?.title ?? confirmPurge?.url}".
              This cannot be undone.
            </AlertDialog.Description>
            <AlertDialog.Actions>
              <AlertDialog.Close
                render={<Button variant="ghost">Cancel</Button>}
              />
              <AlertDialog.Close
                render={
                  <Button
                    variant="danger"
                    disabled={busy === confirmPurge?.id}
                    onClick={(e) => {
                      e.preventDefault();
                      if (confirmPurge) void purge(confirmPurge);
                    }}
                  >
                    Delete forever
                  </Button>
                }
              />
            </AlertDialog.Actions>
          </AlertDialog.Content>
        </AlertDialog.Root>
      </Shell.Main>
      <SaveDetail />
    </>
  );
}

function CardBody({ save, selected }: { save: Save; selected: boolean }) {
  return (
    <>
      <Library.Item.Media>
        <Card.Root save={save} selection={selected ? "primary" : undefined}>
          <Card.Media />
          <Card.DownloadingBadge />
        </Card.Root>
        {save.files.length > 1 ? (
          <Library.Item.Count aria-label={`${save.files.length} media files`}>
            {save.files.length}
          </Library.Item.Count>
        ) : null}
      </Library.Item.Media>
      <Library.Item.Meta>
        <Library.Item.Title>{save.title ?? save.url}</Library.Item.Title>
        <Library.Item.Time>{save.source}</Library.Item.Time>
      </Library.Item.Meta>
    </>
  );
}

function deletedAtMs(save: Save): number {
  if (!save.deletedAt) return 0;
  const t = new Date(save.deletedAt).getTime();
  return Number.isFinite(t) ? t : 0;
}
