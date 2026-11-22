import { IconDuplicate } from "@pond/icons";
import { Button, Dialog, Empty, Loader } from "@pond/ui";
import { useSelector } from "@tanstack/react-store";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  closeDuplicateReview,
  duplicateReview,
} from "@/features/library/state/duplicate-review";
import { pool, reloadSaves } from "@/features/saves/pool";
import { errorCopy } from "@/shared/lib/error-copy";
import { notify } from "@/shared/lib/toast";
import { type DuplicateGroup, defaultKeeper, Group, groupKey } from "./group";
import styles from "./styles.module.css";

const GROUP_ORDER = {
  exact: 0,
  "visual-near": 1,
  "semantic-near": 2,
} satisfies Record<DuplicateGroup["kind"], number>;

function isMergeable(group: DuplicateGroup) {
  return group.kind !== "semantic-near";
}

/** Saves that open the review come first; near matches already covered by an exact group are dropped. */
function arrange(groups: DuplicateGroup[], saveId: string | null) {
  const sorted = [...groups].sort(
    (a, b) =>
      Number(Boolean(saveId && b.ids.includes(saveId))) -
        Number(Boolean(saveId && a.ids.includes(saveId))) ||
      GROUP_ORDER[a.kind] - GROUP_ORDER[b.kind],
  );
  const exact = sorted.filter((group) => group.kind === "exact");
  return sorted.filter(
    (group) =>
      group.kind === "exact" ||
      !exact.some((match) => group.ids.every((id) => match.ids.includes(id))),
  );
}

export function DuplicateReviewHost() {
  const request = useSelector(duplicateReview, (value) => value);
  return request ? (
    <DuplicateReview
      key={request.id}
      saveId={request.saveId}
      ids={request.ids}
    />
  ) : null;
}

export function DuplicateReview({
  saveId,
  ids,
}: {
  saveId: string | null;
  ids?: string[] | null;
}) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let active = true;
    void window.pond
      .query("saves.findDuplicates", {})
      .then((result) => {
        if (!active) return;
        setGroups(
          ids
            ? result.groups.filter((group) =>
                group.ids.some((id) => ids.includes(id)),
              )
            : result.groups,
        );
        setLoading(false);
      })
      .catch((reason) => {
        if (!active) return;
        setError(errorCopy(reason, "Couldn't find duplicates. Try again."));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ids]);

  const shown = useMemo(() => arrange(groups, saveId), [groups, saveId]);
  const keeperOf = (group: DuplicateGroup) => {
    const key = groupKey(group);
    if (picks[key]) return picks[key];
    if (saveId && group.ids.includes(saveId)) return saveId;
    return undefined;
  };
  const trashing = new Set<string>();
  const plan = shown.flatMap((group) => {
    const key = groupKey(group);
    if (!isMergeable(group) || skipped.has(key)) return [];
    const keepId =
      keeperOf(group) ?? defaultKeeper(group.ids, (id) => pool.get(id));
    if (trashing.has(keepId)) return [];
    const selected = group.ids.filter(
      (id) => id === keepId || !trashing.has(id),
    );
    if (selected.length < 2) return [];
    for (const id of selected) if (id !== keepId) trashing.add(id);
    return [{ keepId, ids: selected }];
  });
  const hasMergeable = shown.some(isMergeable);

  const listRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: shown.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 248,
    overscan: 3,
  });

  const merge = async () => {
    if (merging || plan.length === 0) return;
    setMerging(true);
    setError(null);
    const merged: { keepId: string; ids: string[] }[] = [];
    try {
      for (const item of plan) {
        const result = await window.pond.query("saves.mergeDuplicates", item);
        if (!result.ok)
          throw Error(result.error ?? "Couldn't merge these saves. Try again.");
        merged.push(item);
      }
    } catch (reason) {
      setError(errorCopy(reason, "Couldn't merge these saves."));
    }
    if (merged.length > 0) {
      const trashed = new Set(
        merged.flatMap((item) => item.ids.filter((id) => id !== item.keepId)),
      );
      await reloadSaves(merged.flatMap((item) => item.ids));
      setGroups((items) =>
        items
          .map((item) => ({
            ...item,
            ids: item.ids.filter((id) => !trashed.has(id)),
          }))
          .filter((item) => item.ids.length > 1),
      );
      notify({
        id: "duplicate-merge",
        title: "Duplicates merged",
        description:
          "The other saves are in Trash. Use Undo to restore the merge.",
      });
    }
    setMerging(false);
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !merging) closeDuplicateReview();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Header>
            <Dialog.Title>Review Duplicates</Dialog.Title>
          </Dialog.Header>
          <div
            className={styles.list}
            ref={listRef}
            data-scroll-fade="vertical"
          >
            {loading ? (
              <Empty.Root size="card">
                <Empty.Media>
                  <Loader.Spinner />
                </Empty.Media>
                <Empty.Title role="status">Finding duplicates</Empty.Title>
              </Empty.Root>
            ) : shown.length === 0 ? (
              <Empty.Root size="card">
                <Empty.Media>
                  <IconDuplicate size={14} />
                </Empty.Media>
                <Empty.Title>No duplicates found</Empty.Title>
              </Empty.Root>
            ) : (
              <div
                className={styles.rows}
                style={{ height: virtual.getTotalSize() }}
              >
                {virtual.getVirtualItems().map((row) => {
                  const group = shown[row.index];
                  if (!group) return null;
                  const key = groupKey(group);
                  return (
                    <div
                      key={key}
                      ref={virtual.measureElement}
                      data-index={row.index}
                      className={styles.row}
                      style={{ transform: `translateY(${row.start}px)` }}
                    >
                      <Group
                        group={group}
                        keepId={keeperOf(group)}
                        included={!skipped.has(key)}
                        mergeable={isMergeable(group)}
                        disabled={merging}
                        onKeep={(id) =>
                          setPicks((current) => ({ ...current, [key]: id }))
                        }
                        onInclude={(include) =>
                          setSkipped((current) => {
                            const next = new Set(current);
                            if (include) next.delete(key);
                            else next.add(key);
                            return next;
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <Dialog.Footer
            leading={
              error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null
            }
          >
            {hasMergeable || loading ? (
              <>
                <Dialog.Cancel disabled={merging} />
                <Button
                  disabled={merging || plan.length === 0}
                  loading={merging}
                  onClick={() => void merge()}
                >
                  {plan.length > 0 ? `Merge (${plan.length})` : "Merge"}
                </Button>
              </>
            ) : (
              <Dialog.Cancel>Close</Dialog.Cancel>
            )}
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
