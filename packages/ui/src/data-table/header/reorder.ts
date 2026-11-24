import { createChange, createReorder, definePrimitive } from "@ui-sdk/core";
import type {
  ChangeDetails,
  ReorderDraft,
  ReorderMessage,
  ReorderReason,
} from "@ui-sdk/core";
import { createParts } from "@ui-sdk/react/primitive";

type ColumnOrderOptions = {
  order?: Array<string>;
  onOrderChange?: (
    order: Array<string>,
    details: ChangeDetails<ReorderReason>,
  ) => void;
  columnLabel?: (id: string) => string | undefined;
};

interface ColumnProps {
  value: string;
  reorderable?: boolean;
}

interface ColumnOrderState {
  order: Array<string>;
  moving: ReorderDraft | null;
}

function announcement({ type, label, position, total }: ReorderMessage) {
  if (type === "grab") {
    return `Picked up ${label}.`;
  }
  if (type === "move") {
    return `${label} is at position ${position} of ${total}.`;
  }
  if (type === "drop") {
    return `Dropped ${label} at position ${position} of ${total}.`;
  }
  return `Moving ${label} was canceled.`;
}

const columnOrder = definePrimitive({
  name: "data-table-header",
  options: { order: "list", onOrderChange: "callback", columnLabel: "value" },
  controlled: ["order"],
  state: (options: ColumnOrderOptions): ColumnOrderState => ({
    order: options.order ?? [],
    moving: null,
  }),
  sync: (options) =>
    options.order === undefined ? {} : { order: options.order },
  api: (context) => {
    const change = createChange(context);
    const reorder = createReorder(context, {
      slot: "column",
      key: "order",
      draft: "moving",
      set: (value, details) => change("order", value, details),
      orientation: () => "horizontal",
      preview: true,
      disabled: ({ props }: { props: ColumnProps }) => !props.reorderable,
      label: (key) => context.options().columnLabel?.(key),
      message: announcement,
    });

    return {
      reorder,
      /** Staged so the move is announced like a keyboard drag. */
      nudge(key: string, offset: -1 | 1, event?: Event) {
        const order = reorder.order(context.store.get());
        const index = order.indexOf(key);
        const target = index + offset;
        if (index < 0 || target < 0 || target >= order.length) {
          return false;
        }
        if (!reorder.grab(key)) {
          return false;
        }
        reorder.moveTo(target);
        reorder.drop(event);
        return true;
      },
    };
  },
  slots: (slot) => ({
    root: slot<Record<never, never>, { order: Array<string> }>({
      role: "row",
      state: (state, { api }) => ({ order: api.reorder.order(state) }),
    }),
    column: slot<ColumnProps>({
      role: "columnheader",
      props: { value: "string", reorderable: "boolean" },
      attrs: (state, { api, key }) => ({
        "data-dragging": api.reorder.dragging(state, key) ? "" : undefined,
      }),
      on: {
        pointerdown: (event, { api, key }) =>
          api.reorder.pointerdown(event, key),
        keydown: (event, { api, key }) => {
          if (
            !event.altKey ||
            (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
          ) {
            return;
          }
          if (!api.nudge(key, event.key === "ArrowLeft" ? -1 : 1, event)) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
        },
      },
      bind: (el, part) => part.api.reorder.bind(el, part),
    }),
  }),
});

const { Root: ColumnRow, Column: ColumnHeader } = createParts(columnOrder, {
  root: "div",
  column: "div",
});

/** Turns a single-column move into the `reorderColumns(from, to)` pair that reproduces it. */
function movedColumn(
  before: ReadonlyArray<string>,
  after: ReadonlyArray<string>,
) {
  const first = after.findIndex((id, index) => id !== before[index]);
  if (first < 0) {
    return null;
  }
  let last = after.length - 1;
  while (last > first && after[last] === before[last]) {
    last -= 1;
  }
  const start = before[first];
  const end = before[last];
  if (start === undefined || end === undefined) {
    return null;
  }
  return after[last] === start
    ? { from: start, to: end }
    : { from: end, to: start };
}

export { ColumnHeader, ColumnRow, movedColumn };
