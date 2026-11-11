import { Checkbox } from "@pond/ui";
import type { DuplicateGroupResult } from "@shared/saves-mutation-contracts";
import { useSelector } from "@tanstack/react-store";
import { type ReactNode, useEffect, useId } from "react";
import { SaveTile } from "@/features/saves";
import { pickPrimaryFile } from "@/features/saves/media";
import {
  ensureSaves,
  savesStore,
  useRetainedSaves,
} from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import { formatBytes } from "@/shared/lib/format";
import styles from "./styles.module.css";

export type DuplicateGroup = DuplicateGroupResult;

export function groupKey(group: DuplicateGroup) {
  return `${group.kind}:${group.ids.join(":")}`;
}

function rank(save: Save | undefined) {
  const file = save ? pickPrimaryFile(save) : null;
  return {
    pixels: (file?.width ?? 0) * (file?.height ?? 0),
    bytes: file?.size ?? 0,
  };
}

/** Highest resolution wins, then the larger file, then the order Pond returned. */
export function defaultKeeper(
  ids: readonly string[],
  lookup: (id: string) => Save | undefined,
) {
  let best = ids[0] ?? "";
  let top = rank(lookup(best));
  for (const id of ids.slice(1)) {
    const next = rank(lookup(id));
    if (
      next.pixels > top.pixels ||
      (next.pixels === top.pixels && next.bytes > top.bytes)
    ) {
      best = id;
      top = next;
    }
  }
  return best;
}

const SUMMARY = {
  exact: "matching saves",
  "visual-near": "similar saves",
  "semantic-near": "related saves",
} satisfies Record<DuplicateGroup["kind"], string>;

function Tile({
  save,
  id,
  keep,
  mergeable,
  disabled,
  onKeep,
}: {
  save: Save | undefined;
  id: string;
  keep: boolean;
  mergeable: boolean;
  disabled: boolean;
  onKeep: () => void;
}) {
  const title = save?.title || "Untitled";
  const file = save ? pickPrimaryFile(save) : null;
  const extension = file?.path.split(".").pop()?.toUpperCase();
  const detail = [
    extension,
    file?.size ? formatBytes(file.size) : null,
    file?.width && file.height ? `${file.width} × ${file.height}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <SaveTile
      saveId={id}
      selected={mergeable && keep}
      dimmed={mergeable && !keep}
      detail={detail || undefined}
      fallback={{ icon: null, title }}
      aria-pressed={mergeable ? keep : undefined}
      aria-label={mergeable ? `Keep ${title}` : title}
      disabled={!mergeable || disabled}
      onClick={mergeable ? onKeep : undefined}
    />
  );
}

function Strip({ children }: { children: ReactNode }) {
  return (
    <ul className={styles.strip} data-scroll-fade="horizontal">
      {children}
    </ul>
  );
}

export function Group({
  group,
  keepId,
  included,
  mergeable,
  disabled,
  onKeep,
  onInclude,
}: {
  group: DuplicateGroup;
  keepId: string | undefined;
  included: boolean;
  mergeable: boolean;
  disabled: boolean;
  onKeep: (id: string) => void;
  onInclude: (included: boolean) => void;
}) {
  const includeId = useId();
  const saves = useSelector(
    savesStore,
    (state) => group.ids.map((id) => state.byId.get(id)),
    {
      compare: (a, b) =>
        a.length === b.length && a.every((save, index) => save === b[index]),
    },
  );
  useRetainedSaves(group.ids);
  useEffect(() => {
    void ensureSaves(group.ids);
  }, [group.ids]);
  const keeper =
    keepId ?? defaultKeeper(group.ids, (id) => saves[group.ids.indexOf(id)]);
  const summary = `${group.ids.length.toLocaleString()} ${SUMMARY[group.kind]}`;
  return (
    <section className={styles.group} data-skipped={!included || undefined}>
      <header className={styles.header}>
        {mergeable ? (
          <label className={styles.include} htmlFor={includeId}>
            <Checkbox.Root
              id={includeId}
              checked={included}
              disabled={disabled}
              onCheckedChange={(checked) => onInclude(checked === true)}
            >
              <Checkbox.Indicator />
            </Checkbox.Root>
            <span>{summary}</span>
          </label>
        ) : (
          <span className={styles.include}>{summary}</span>
        )}
      </header>
      <Strip>
        {group.ids.map((id, index) => (
          <Tile
            key={id}
            id={id}
            save={saves[index]}
            keep={id === keeper}
            mergeable={mergeable}
            disabled={disabled || !included}
            onKeep={() => onKeep(id)}
          />
        ))}
      </Strip>
    </section>
  );
}
