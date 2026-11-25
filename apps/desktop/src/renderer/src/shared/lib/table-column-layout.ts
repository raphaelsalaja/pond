import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { z } from "zod";
import { libraryScopedKey } from "@/shared/lib/library-scope";

const StoredTableColumnLayoutSchema = z
  .object({
    order: z.array(z.string()).optional().catch(undefined),
    hidden: z.array(z.string()).optional().catch(undefined),
    sort: z
      .object({ id: z.string(), desc: z.boolean().optional().catch(undefined) })
      .nullable()
      .optional()
      .catch(undefined),
  })
  .catch({});

export type StoredTableColumnLayout = z.infer<
  typeof StoredTableColumnLayoutSchema
>;

export interface TableColumnSpec<Id extends string> {
  id: Id;
  label: string;
  sortable?: boolean;
}

export interface TableSort<Id extends string> {
  id: Id;
  desc: boolean;
}

export interface TableColumnLayout<Id extends string> {
  order: Array<Id>;
  hidden: Array<Id>;
  sort: TableSort<Id> | null;
}

export interface TableColumnLayoutController<Id extends string> {
  snapshot(): TableColumnLayout<Id>;
  setHidden(id: Id, hidden: boolean): void;
  setSort(sort: TableSort<Id> | null): void;
  applyVisibleOrder(visibleOrder: ReadonlyArray<string>): void;
  reset(): void;
  useLayout(): TableColumnLayout<Id>;
  normalize(value: StoredTableColumnLayout): TableColumnLayout<Id>;
  mergeVisibleOrder(
    order: ReadonlyArray<Id>,
    hidden: ReadonlyArray<Id>,
    visibleOrder: ReadonlyArray<string>,
  ): Array<Id>;
  defaultLayout(): TableColumnLayout<Id>;
}

export function createTableColumnLayout<Id extends string>({
  storageKey,
  columns,
  lockedId,
  defaultSort = null,
  defaultHidden = [],
}: {
  storageKey: string;
  columns: ReadonlyArray<TableColumnSpec<Id>>;
  lockedId: Id;
  defaultSort?: TableSort<Id> | null;
  defaultHidden?: ReadonlyArray<Id>;
}): TableColumnLayoutController<Id> {
  const columnIds = columns.map((column) => column.id);

  function isColumnId(value: string | undefined): value is Id {
    return columnIds.some((id) => id === value);
  }

  function defaultLayout(): TableColumnLayout<Id> {
    return {
      order: [...columnIds],
      hidden: columnIds.filter(
        (id) => id !== lockedId && defaultHidden.includes(id),
      ),
      sort: defaultSort,
    };
  }

  function mergeVisibleOrder(
    order: ReadonlyArray<Id>,
    hidden: ReadonlyArray<Id>,
    visibleOrder: ReadonlyArray<string>,
  ): Array<Id> {
    const concealed = new Set(hidden);
    let index = 0;
    return order.map((id) => {
      if (concealed.has(id)) return id;
      const next = visibleOrder[index++];
      return isColumnId(next) ? next : id;
    });
  }

  function normalize(value: StoredTableColumnLayout): TableColumnLayout<Id> {
    const seen = new Set<Id>();
    const order: Array<Id> = [];
    for (const id of value.order ?? []) {
      if (!isColumnId(id) || seen.has(id)) continue;
      seen.add(id);
      order.push(id);
    }
    for (const id of columnIds) {
      if (!seen.has(id)) order.push(id);
    }
    const hidden = (value.hidden ?? defaultHidden).filter(
      (id): id is Id => isColumnId(id) && id !== lockedId && order.includes(id),
    );
    const storedSort = value.sort;
    const sort =
      storedSort && isColumnId(storedSort.id)
        ? { id: storedSort.id, desc: storedSort.desc === true }
        : defaultSort;
    return { order, hidden: [...new Set(hidden)], sort };
  }

  function key(): string {
    return libraryScopedKey(storageKey);
  }

  function readLayout(): TableColumnLayout<Id> {
    try {
      const raw = localStorage.getItem(key());
      if (!raw) return defaultLayout();
      return normalize(StoredTableColumnLayoutSchema.parse(JSON.parse(raw)));
    } catch {
      return defaultLayout();
    }
  }

  function writeLayout(layout: TableColumnLayout<Id>): TableColumnLayout<Id> {
    try {
      localStorage.setItem(key(), JSON.stringify(layout));
    } catch {
      return layout;
    }
    return layout;
  }

  const store = new Store<TableColumnLayout<Id>>(readLayout());

  return {
    snapshot: () => store.state,
    setHidden(id, hidden) {
      if (id === lockedId) return;
      store.setState((state) => {
        const next = new Set(state.hidden);
        if (hidden) next.add(id);
        else next.delete(id);
        return writeLayout({
          ...state,
          hidden: state.order.filter((columnId) => next.has(columnId)),
        });
      });
    },
    setSort(sort) {
      store.setState((state) => writeLayout({ ...state, sort }));
    },
    applyVisibleOrder(visibleOrder) {
      store.setState((state) =>
        writeLayout({
          ...state,
          order: mergeVisibleOrder(state.order, state.hidden, visibleOrder),
        }),
      );
    },
    reset() {
      store.setState(() => writeLayout(defaultLayout()));
    },
    useLayout() {
      return useSelector(store, (state) => state);
    },
    normalize,
    mergeVisibleOrder,
    defaultLayout,
  };
}
