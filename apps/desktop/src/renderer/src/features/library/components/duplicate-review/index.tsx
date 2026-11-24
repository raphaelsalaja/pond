import { IconDuplicate } from "@pond/icons";
import { Button, Dialog, Empty, Loader } from "@pond/ui";
import {
  describeDuplicateGroup,
  isMergeableRelation,
  relationRank,
} from "@shared/duplicate-contracts";
import type {
  DuplicateDismissal,
  DuplicatePair,
} from "@shared/duplicate-contracts";
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
import { defaultKeeper, Group, groupKey } from "./group";
import type { DuplicateGroup } from "./group";
import styles from "./styles.module.css";

function isMergeable(group: DuplicateGroup) {
  return isMergeableRelation(group.relation);
}

/** Saves that open the review come first, then the strongest relations. */
function arrange(groups: Array<DuplicateGroup>, saveId: string | null) {
  return [...groups].sort(
    (a, b) =>
      Number(Boolean(saveId && b.ids.includes(saveId))) -
        Number(Boolean(saveId && a.ids.includes(saveId))) ||
      relationRank(a.relation) - relationRank(b.relation),
  );
}

function dismissalsFor(
  groups: ReadonlyArray<DuplicateGroup>,
  pairs: ReadonlyArray<DuplicatePair>,
): Array<DuplicateDismissal> {
  return groups.flatMap((group) =>
    group.pairs.flatMap((index) => {
      const pair = pairs[index];
      return pair ? [{ ids: pair.ids, relation: pair.relation }] : [];
    }),
  );
}

function indexingNote(pending: number) {
  return `Still indexing ${pending.toLocaleString()} ${pending === 1 ? "file" : "files"}. Results may be incomplete.`;
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
  ids?: Array<string> | null;
}) {
  const [groups, setGroups] = useState<Array<DuplicateGroup>>([]);
  const [pairs, setPairs] = useState<Array<DuplicatePair>>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let active = true;
    void window.pond
      .query("saves.findDuplicates", ids ? { ids } : {})
      .then((result) => {
        if (!active) {
          return;
        }
        setGroups(result.groups);
        setPairs(result.pairs);
        setPending(result.index.pending);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) {
          return;
        }
        setError(errorCopy(cause, "Couldn't find duplicates. Try again."));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ids]);

  const shown = useMemo(() => arrange(groups, saveId), [groups, saveId]);
  const keeperOf = (group: DuplicateGroup) => {
    const key = groupKey(group);
    if (picks[key]) {
      return picks[key];
    }
    if (saveId && group.ids.includes(saveId)) {
      return saveId;
    }
    return undefined;
  };
  const trashing = new Set<string>();
  const plan = shown.flatMap((group) => {
    const key = groupKey(group);
    if (!isMergeable(group) || skipped.has(key)) {
      return [];
    }
    const keepId =
      keeperOf(group) ?? defaultKeeper(group.ids, (id) => pool.get(id));
    if (trashing.has(keepId)) {
      return [];
    }
    const selected = group.ids.filter(
      (id) => id === keepId || !trashing.has(id),
    );
    if (selected.length < 2) {
      return [];
    }
    for (const id of selected) {
      if (id !== keepId) {
        trashing.add(id);
      }
    }
    return [{ keepId, ids: selected }];
  });
  const hasMergeable = shown.some(isMergeable);
  const keptSeparate = shown.filter(
    (group) => isMergeable(group) && skipped.has(groupKey(group)),
  );

  const listRef = useRef<HTMLDivElement>(null);
  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual returns unstable methods by design; the compiler skips memoizing this component.
  const virtual = useVirtualizer({
    count: shown.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 248,
    overscan: 3,
  });

  const merge = async () => {
    if (merging || (plan.length === 0 && keptSeparate.length === 0)) {
      return;
    }
    setMerging(true);
    setError(null);
    const merged: Array<{ keepId: string; ids: Array<string> }> = [];
    try {
      if (keptSeparate.length > 0) {
        const result = await window.pond.query("saves.dismissDuplicates", {
          pairs: dismissalsFor(keptSeparate, pairs),
        });
        if (!result.ok) {
          throw Error(result.error ?? "Couldn't keep these saves separate.");
        }
        const separate = new Set(keptSeparate.map(groupKey));
        setGroups((items) =>
          items.filter((item) => !separate.has(groupKey(item))),
        );
      }
      for (const item of plan) {
        const result = await window.pond.query("saves.mergeDuplicates", item);
        if (!result.ok) {
          throw Error(result.error ?? "Couldn't merge these saves. Try again.");
        }
        merged.push(item);
      }
    } catch (error_) {
      setError(errorCopy(error_, "Couldn't merge these saves."));
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
        if (!open && !merging) {
          closeDuplicateReview();
        }
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
                  if (!group) {
                    return null;
                  }
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
                        evidence={describeDuplicateGroup(group, pairs)}
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
                            if (include) {
                              next.delete(key);
                            } else {
                              next.add(key);
                            }
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
              ) : !loading && pending > 0 ? (
                <p className={styles.note} role="status">
                  {indexingNote(pending)}
                </p>
              ) : null
            }
          >
            {hasMergeable || loading ? (
              <>
                <Dialog.Cancel disabled={merging} />
                <Button
                  disabled={
                    merging || (plan.length === 0 && keptSeparate.length === 0)
                  }
                  loading={merging}
                  onClick={() => void merge()}
                >
                  {plan.length > 0
                    ? `Merge (${plan.length})`
                    : keptSeparate.length > 0
                      ? "Keep Separate"
                      : "Merge"}
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
