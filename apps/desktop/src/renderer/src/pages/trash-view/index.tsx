import { useCallback, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/card-thumb";
import { EmptyState } from "@/components/empty-state";
import { Inspector } from "@/components/inspector";
import { Library } from "@/components/library";
import { SaveContextMenu } from "@/components/save-context-menu";
import { LibraryChrome, Shell } from "@/components/shell";
import { useSaves } from "@/pool/hooks";
import { buildMediaUnits } from "@/pool/media";
import type { Save } from "@/pool/types";

export function TrashView() {
  const saves = useSaves();
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

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
              <SaveContextMenu key={save.id} save={save}>
                <Library.Item selected={selectedId === save.id}>
                  <Library.Item.Select
                    aria-pressed={selectedId === save.id}
                    onClick={() => select(save.id)}
                    onDoubleClick={() => focus(save.id)}
                  >
                    <CardBody save={save} selected={selectedId === save.id} />
                  </Library.Item.Select>
                </Library.Item>
              </SaveContextMenu>
            ))}
          </Library.Grid>
        )}
      </Shell.Main>
      <Inspector />
    </>
  );
}

function CardBody({ save, selected }: { save: Save; selected: boolean }) {
  const mediaUnitCount = useMemo(() => buildMediaUnits(save).length, [save]);
  return (
    <>
      <Library.Item.Media>
        <Card.Root save={save} selection={selected ? "primary" : undefined}>
          <Card.Media />
          <Card.DownloadingBadge />
        </Card.Root>
        {mediaUnitCount > 1 ? (
          <Library.Item.Count aria-label={`${mediaUnitCount} media files`}>
            {mediaUnitCount}
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
