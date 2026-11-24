import { createListbox, definePrimitive, isComposing } from "@ui-sdk/core";
import { usePrimitive } from "@ui-sdk/react/primitive";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";

type ArrowKey = "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp";

export function nextPickerIndex(
  current: number,
  length: number,
  key: ArrowKey,
  columns = 1,
): number {
  if (length <= 0) {
    return -1;
  }
  const safeCurrent = current >= 0 && current < length ? current : 0;
  const step =
    key === "ArrowDown"
      ? Math.max(1, columns)
      : key === "ArrowUp"
        ? -Math.max(1, columns)
        : key === "ArrowRight"
          ? 1
          : -1;
  return (safeCurrent + step + length) % length;
}

function isArrowKey(key: string): key is ArrowKey {
  return (
    key === "ArrowDown" ||
    key === "ArrowUp" ||
    key === "ArrowLeft" ||
    key === "ArrowRight"
  );
}

interface CursorOptions {
  onHighlight?: (key: string | null) => void;
}

interface CursorState {
  highlighted: string | null;
}

const pickerCursor = definePrimitive({
  name: "picker-cursor",
  options: { onHighlight: "callback" },
  state: (_options: CursorOptions): CursorState => ({ highlighted: null }),
  api: (context) => ({
    listbox: createListbox(context, {
      key: "highlighted",
      focus: "virtual",
      onHighlight: (key) => context.options().onHighlight?.(key),
    }),
  }),
  /** Callers spread `getItemProps` on their own rows; this inert slot only keeps the instance type concrete. */
  slots: (slot) => ({ root: slot({ role: "none" }) }),
});

type Binder = (el: HTMLElement | null) => (() => void) | undefined;

function createBinders(
  listbox: Pick<ReturnType<typeof createListbox>, "bind">,
) {
  const binders = new Map<string, Binder>();
  return (key: string) => {
    let binder = binders.get(key);
    if (!binder) {
      binder = (el) =>
        el ? listbox.bind(el, { key, props: { value: key } }) : undefined;
      binders.set(key, binder);
    }
    return binder;
  };
}

export interface PickerCursorOptions<T> {
  activeId?: string | null;
  collectionId?: string;
  columns?: number;
  getId: (item: T) => string;
  items: ReadonlyArray<T>;
  onActivate: (item: T) => void;
  onActiveIdChange?: (id: string | null) => void;
  onHorizontalKey?: (key: "ArrowLeft" | "ArrowRight", item: T) => boolean;
  onTab?: (direction: 1 | -1) => void;
}

export function usePickerCursor<T>({
  activeId: controlledActiveId,
  collectionId: requestedCollectionId,
  columns = 1,
  getId,
  items,
  onActivate,
  onActiveIdChange,
  onHorizontalKey,
  onTab,
}: PickerCursorOptions<T>) {
  const reactId = useId().replaceAll(":", "");
  const collectionId = requestedCollectionId ?? `picker-collection-${reactId}`;
  const cursor = usePrimitive(pickerCursor, { onHighlight: onActiveIdChange });
  const { listbox } = cursor.api;
  const subscribe = useCallback(
    (listener: () => void) => cursor.instance.subscribe(listener),
    [cursor],
  );
  const highlighted = useSyncExternalStore(
    subscribe,
    () => cursor.instance.get().highlighted,
    () => null,
  );
  const ids = useMemo(() => items.map(getId), [getId, items]);
  const requestedActiveId =
    controlledActiveId === undefined ? highlighted : controlledActiveId;
  const activeId =
    requestedActiveId && ids.includes(requestedActiveId)
      ? requestedActiveId
      : (ids[0] ?? null);
  const activeIndex = activeId ? ids.indexOf(activeId) : -1;
  const optionId = (key: string) =>
    listbox.attrs(cursor.state, { key, props: { value: key } }).id;
  const activeDomId = activeId ? optionId(activeId) : undefined;

  /** Stable ref callbacks per option, so a render never unbinds and rebinds the highlighted row. */
  const bindOption = useMemo(() => createBinders(listbox), [listbox]);

  useEffect(() => {
    if (!activeDomId) {
      return;
    }
    document
      .getElementById(activeDomId)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeDomId]);

  function setActiveId(id: string | null) {
    listbox.highlight(id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const { key } = event;
    if (isComposing(event.nativeEvent)) {
      return;
    }

    if (key === "Tab" && onTab) {
      event.preventDefault();
      onTab(event.shiftKey ? -1 : 1);
      return;
    }

    if (key === "Enter") {
      const item = activeIndex >= 0 ? items[activeIndex] : undefined;
      if (!item) {
        return;
      }
      event.preventDefault();
      onActivate(item);
      return;
    }

    const activeItem = items[activeIndex];
    if (!activeItem) {
      return;
    }
    const horizontal = key === "ArrowLeft" || key === "ArrowRight";
    if (horizontal && onHorizontalKey?.(key, activeItem)) {
      event.preventDefault();
      return;
    }
    if (horizontal && columns === 1) {
      return;
    }
    if (!isArrowKey(key) && key !== "PageUp" && key !== "PageDown") {
      return;
    }

    /** The default first row is derived, so seed the listbox before it steps from it. */
    if (highlighted !== activeId) {
      listbox.highlight(activeId);
    }

    if (isArrowKey(key) && columns > 1) {
      event.preventDefault();
      const next = nextPickerIndex(activeIndex, items.length, key, columns);
      listbox.highlight(ids[next] ?? null, { event: event.nativeEvent });
      return;
    }

    if (listbox.keydown(event.nativeEvent) !== undefined) {
      event.preventDefault();
    }
  }

  function getItemProps(item: T) {
    const id = getId(item);
    return {
      id: optionId(id),
      ref: bindOption(id),
      active: id === activeId,
      onClick: () => onActivate(item),
      onMouseDown: (event: MouseEvent<HTMLElement>) => event.preventDefault(),
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (id !== activeId) {
          listbox.highlight(id, { event: event.nativeEvent });
        }
      },
    };
  }

  return {
    activeId,
    activeIndex,
    collectionId,
    getItemProps,
    inputProps: {
      "aria-activedescendant": activeDomId,
      "aria-autocomplete": "list" as const,
      "aria-controls": collectionId,
      "aria-expanded": true,
      role: "combobox" as const,
      onKeyDown,
    },
    setActiveId,
  };
}
