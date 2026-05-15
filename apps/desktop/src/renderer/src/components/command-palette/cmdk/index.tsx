import * as React from "react";
import { commandScore } from "./score";

type Children = { children?: React.ReactNode };
type DivProps = React.ComponentPropsWithoutRef<"div">;

type EmptyProps = Children & DivProps;
type SeparatorProps = DivProps & {
  alwaysRender?: boolean;
};
type ListProps = Children &
  DivProps & {
    label?: string;
  };
type ItemProps = Children &
  Omit<DivProps, "disabled" | "onSelect" | "value"> & {
    disabled?: boolean;
    onSelect?: (value: string) => void;
    value?: string;
    keywords?: string[];
    forceMount?: boolean;
  };
type GroupProps = Children &
  Omit<DivProps, "heading" | "value"> & {
    heading?: React.ReactNode;
    value?: string;
    forceMount?: boolean;
  };
type InputProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "value" | "onChange" | "type"
> & {
  value?: string;
  onValueChange?: (search: string) => void;
};
type CommandFilter = (
  value: string,
  search: string,
  keywords?: string[],
) => number;
type CommandProps = Children &
  DivProps & {
    label?: string;
    shouldFilter?: boolean;
    filter?: CommandFilter;
    defaultValue?: string;
    value?: string;
    onValueChange?: (value: string) => void;
    loop?: boolean;
    disablePointerSelection?: boolean;
    vimBindings?: boolean;
  };

type Context = {
  value: (id: string, value: string, keywords?: string[]) => void;
  item: (id: string, groupId: string) => () => void;
  group: (id: string) => () => void;
  filter: () => boolean;
  label: string;
  getDisablePointerSelection: () => boolean;
  listId: string;
  labelId: string;
  inputId: string;
  listInnerRef: React.RefObject<HTMLDivElement | null>;
};
type State = {
  search: string;
  value: string;
  selectedItemId?: string;
  filtered: { count: number; items: Map<string, number>; groups: Set<string> };
};
type Store = {
  subscribe: (callback: () => void) => () => void;
  snapshot: () => State;
  setState: <K extends keyof State>(
    key: K,
    value: State[K],
    opts?: boolean,
  ) => void;
  emit: () => void;
};
type Group = {
  id: string;
  forceMount?: boolean;
};

const GROUP_SELECTOR = `[cmdk-group=""]`;
const GROUP_ITEMS_SELECTOR = `[cmdk-group-items=""]`;
const GROUP_HEADING_SELECTOR = `[cmdk-group-heading=""]`;
const ITEM_SELECTOR = `[cmdk-item=""]`;
const VALID_ITEM_SELECTOR = `${ITEM_SELECTOR}:not([aria-disabled="true"])`;
const SELECT_EVENT = `cmdk-item-select`;
const VALUE_ATTR = `data-value`;
const defaultFilter: CommandFilter = (value, search, keywords = []) =>
  commandScore(value, search, keywords);

const CommandContext = React.createContext<Context>(
  undefined as unknown as Context,
);
const useCommand = () => React.useContext(CommandContext);
const StoreContext = React.createContext<Store>(undefined as unknown as Store);
const useStore = () => React.useContext(StoreContext);
const GroupContext = React.createContext<Group | undefined>(undefined);

const useIsoLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

const Root = React.forwardRef<HTMLDivElement, CommandProps>(
  (props, forwardedRef) => {
    const state = useLazyRef<State>(() => ({
      search: "",
      value: props.value ?? props.defaultValue ?? "",
      selectedItemId: undefined,
      filtered: {
        count: 0,
        items: new Map(),
        groups: new Set(),
      },
    }));
    const allItems = useLazyRef<Set<string>>(() => new Set());
    const allGroups = useLazyRef<Map<string, Set<string>>>(() => new Map());
    const ids = useLazyRef<Map<string, { value: string; keywords?: string[] }>>(
      () => new Map(),
    );
    const listeners = useLazyRef<Set<() => void>>(() => new Set());
    const propsRef = useAsRef(props);
    const {
      label,
      value,
      filter,
      shouldFilter,
      loop,
      disablePointerSelection = false,
      vimBindings = true,
      defaultValue,
      onValueChange,
      ...etc
    } = props;
    void filter;
    void shouldFilter;
    void loop;
    void defaultValue;
    void onValueChange;

    const listId = React.useId();
    const labelId = React.useId();
    const inputId = React.useId();

    const listInnerRef = React.useRef<HTMLDivElement>(null);

    const schedule = useScheduleLayoutEffect();

    useIsoLayoutEffect(() => {
      if (value !== undefined) {
        const v = value.trim();
        state.current.value = v;
        store.emit();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    useIsoLayoutEffect(() => {
      schedule(6, scrollSelectedIntoView);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const store: Store = React.useMemo(() => {
      return {
        subscribe: (cb) => {
          listeners.current.add(cb);
          return () => {
            listeners.current.delete(cb);
          };
        },
        snapshot: () => state.current,
        setState: (key, val, opts) => {
          if (Object.is(state.current[key], val)) return;
          state.current[key] = val;

          if (key === "search") {
            filterItems();
            sort();
            schedule(1, selectFirstItem);
          } else if (key === "value") {
            const activeElement = document.activeElement;
            if (
              activeElement &&
              (activeElement.hasAttribute("cmdk-input") ||
                activeElement.hasAttribute("cmdk-root"))
            ) {
              const input = inputId ? document.getElementById(inputId) : null;
              if (input) input.focus();
              else if (listId) document.getElementById(listId)?.focus();
            }

            schedule(7, () => {
              state.current.selectedItemId = getSelectedItem()?.id;
              store.emit();
            });

            if (!opts) schedule(5, scrollSelectedIntoView);

            if (propsRef.current?.value !== undefined) {
              const newValue = (val ?? "") as string;
              propsRef.current.onValueChange?.(newValue);
              return;
            }
          }

          store.emit();
        },
        emit: () => {
          listeners.current.forEach((l) => l());
        },
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      listeners.current.add,
      getSelectedItem,
      listeners.current.delete,
      state.current,
      filterItems,
      propsRef.current?.value,
      listeners.current.forEach,
      schedule,
      propsRef.current.onValueChange,
      inputId,
      listId,
      selectFirstItem,
      scrollSelectedIntoView,
      sort,
    ]);

    const context: Context = React.useMemo(
      () => ({
        value: (id, val, keywords) => {
          if (val !== ids.current.get(id)?.value) {
            ids.current.set(id, { value: val, keywords });
            state.current.filtered.items.set(id, score(val, keywords));
            schedule(2, () => {
              sort();
              store.emit();
            });
          }
        },
        item: (id, groupId) => {
          allItems.current.add(id);

          if (groupId) {
            if (!allGroups.current.has(groupId)) {
              allGroups.current.set(groupId, new Set([id]));
            } else {
              allGroups.current.get(groupId)?.add(id);
            }
          }

          schedule(3, () => {
            filterItems();
            sort();
            if (!state.current.value) selectFirstItem();
            store.emit();
          });

          return () => {
            ids.current.delete(id);
            allItems.current.delete(id);
            state.current.filtered.items.delete(id);
            const selectedItem = getSelectedItem();

            schedule(4, () => {
              filterItems();
              if (selectedItem?.getAttribute("id") === id) selectFirstItem();
              store.emit();
            });
          };
        },
        group: (id) => {
          if (!allGroups.current.has(id)) {
            allGroups.current.set(id, new Set());
          }
          return () => {
            ids.current.delete(id);
            allGroups.current.delete(id);
          };
        },
        filter: () => propsRef.current.shouldFilter ?? true,
        label: label || props["aria-label"] || "",
        getDisablePointerSelection: () =>
          propsRef.current.disablePointerSelection ?? false,
        listId,
        inputId,
        labelId,
        listInnerRef,
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [
        ids.current.set,
        ids.current.delete,
        getSelectedItem,
        allItems.current.add,
        allItems.current.delete,
        state.current.filtered.items.set,
        sort,
        ids.current.get,
        schedule,
        propsRef.current.shouldFilter,
        allGroups.current.get,
        state.current.value,
        state.current.filtered.items.delete,
        label,
        labelId,
        listId,
        propsRef.current.disablePointerSelection,
        props["aria-label"],
        score,
        selectFirstItem,
        allGroups.current.has,
        store.emit,
        inputId,
        allGroups.current.set,
        filterItems,
        allGroups.current.delete,
      ],
    );

    function score(val: string, keywords?: string[]): number {
      const filterFn = propsRef.current?.filter ?? defaultFilter;
      return val ? filterFn(val, state.current.search, keywords) : 0;
    }

    function sort(): void {
      if (!state.current.search || propsRef.current.shouldFilter === false) {
        return;
      }

      const scores = state.current.filtered.items;

      const groups: [string, number][] = [];
      state.current.filtered.groups.forEach((groupId) => {
        const items = allGroups.current.get(groupId);
        let max = 0;
        if (items) {
          items.forEach((item) => {
            const s = scores.get(item) ?? 0;
            max = Math.max(s, max);
          });
        }
        groups.push([groupId, max]);
      });

      const listInsertionElement = listInnerRef.current;

      getValidItems()
        .sort((a, b) => {
          const idA = a.getAttribute("id") ?? "";
          const idB = b.getAttribute("id") ?? "";
          return (scores.get(idB) ?? 0) - (scores.get(idA) ?? 0);
        })
        .forEach((item) => {
          const group = item.closest(GROUP_ITEMS_SELECTOR);

          if (group) {
            const target =
              item.parentElement === group
                ? item
                : item.closest(`${GROUP_ITEMS_SELECTOR} > *`);
            if (target) group.appendChild(target);
          } else if (listInsertionElement) {
            const target =
              item.parentElement === listInsertionElement
                ? item
                : item.closest(`${GROUP_ITEMS_SELECTOR} > *`);
            if (target) listInsertionElement.appendChild(target);
          }
        });

      groups
        .sort((a, b) => b[1] - a[1])
        .forEach((group) => {
          const element = listInnerRef.current?.querySelector(
            `${GROUP_SELECTOR}[${VALUE_ATTR}="${encodeURIComponent(group[0])}"]`,
          );
          if (element?.parentElement) {
            element.parentElement.appendChild(element);
          }
        });
    }

    function selectFirstItem(): void {
      const item = getValidItems().find(
        (i) => i.getAttribute("aria-disabled") !== "true",
      );
      const val = item?.getAttribute(VALUE_ATTR);
      store.setState("value", val ?? "");
    }

    function filterItems(): void {
      if (!state.current.search || propsRef.current.shouldFilter === false) {
        state.current.filtered.count = allItems.current.size;
        return;
      }

      state.current.filtered.groups = new Set();
      let itemCount = 0;

      for (const id of allItems.current) {
        const val = ids.current.get(id)?.value ?? "";
        const keywords = ids.current.get(id)?.keywords ?? [];
        const rank = score(val, keywords);
        state.current.filtered.items.set(id, rank);
        if (rank > 0) itemCount++;
      }

      for (const [groupId, group] of allGroups.current) {
        for (const itemId of group) {
          if ((state.current.filtered.items.get(itemId) ?? 0) > 0) {
            state.current.filtered.groups.add(groupId);
            break;
          }
        }
      }

      state.current.filtered.count = itemCount;
    }

    function scrollSelectedIntoView(): void {
      requestAnimationFrame(() => {
        const item = getSelectedItem();
        if (!item) return;
        if (item.parentElement?.firstChild === item) {
          item
            .closest(GROUP_SELECTOR)
            ?.querySelector(GROUP_HEADING_SELECTOR)
            ?.scrollIntoView({ block: "nearest" });
        }
        item.scrollIntoView({ block: "nearest" });
      });
    }

    function getSelectedItem(): HTMLElement | null | undefined {
      return listInnerRef.current?.querySelector(
        `${ITEM_SELECTOR}[aria-selected="true"]`,
      ) as HTMLElement | null | undefined;
    }

    function getValidItems(): HTMLElement[] {
      return Array.from(
        listInnerRef.current?.querySelectorAll<HTMLElement>(
          VALID_ITEM_SELECTOR,
        ) ?? [],
      );
    }

    function updateSelectedToIndex(index: number): void {
      const items = getValidItems();
      const item = items[index];
      if (item) store.setState("value", item.getAttribute(VALUE_ATTR) ?? "");
    }

    function updateSelectedByItem(change: 1 | -1): void {
      const selected = getSelectedItem();
      const items = getValidItems();
      const index = items.indexOf(selected);

      let newSelected = items[index + change];

      if (propsRef.current?.loop) {
        newSelected =
          index + change < 0
            ? items[items.length - 1]
            : index + change === items.length
              ? items[0]
              : items[index + change];
      }

      if (newSelected)
        store.setState("value", newSelected.getAttribute(VALUE_ATTR) ?? "");
    }

    function updateSelectedByGroup(change: 1 | -1): void {
      const selected = getSelectedItem();
      let group = selected?.closest(GROUP_SELECTOR) ?? null;
      let item: HTMLElement | null | undefined;

      while (group && !item) {
        group =
          change > 0
            ? findNextSibling(group, GROUP_SELECTOR)
            : findPreviousSibling(group, GROUP_SELECTOR);
        item =
          (group?.querySelector(VALID_ITEM_SELECTOR) as HTMLElement | null) ??
          undefined;
      }

      if (item) {
        store.setState("value", item.getAttribute(VALUE_ATTR) ?? "");
      } else {
        updateSelectedByItem(change);
      }
    }

    const last = (): void => updateSelectedToIndex(getValidItems().length - 1);

    const next = (e: React.KeyboardEvent): void => {
      e.preventDefault();
      if (e.metaKey) last();
      else if (e.altKey) updateSelectedByGroup(1);
      else updateSelectedByItem(1);
    };

    const prev = (e: React.KeyboardEvent): void => {
      e.preventDefault();
      if (e.metaKey) updateSelectedToIndex(0);
      else if (e.altKey) updateSelectedByGroup(-1);
      else updateSelectedByItem(-1);
    };

    return (
      <div
        ref={forwardedRef}
        tabIndex={-1}
        {...etc}
        cmdk-root=""
        onKeyDown={(e) => {
          etc.onKeyDown?.(e);

          const isComposing =
            (e.nativeEvent as KeyboardEvent).isComposing || e.keyCode === 229;
          if (e.defaultPrevented || isComposing) return;

          switch (e.key) {
            case "n":
            case "j":
              if (vimBindings && e.ctrlKey) next(e);
              break;
            case "ArrowDown":
              next(e);
              break;
            case "p":
            case "k":
              if (vimBindings && e.ctrlKey) prev(e);
              break;
            case "ArrowUp":
              prev(e);
              break;
            case "Home":
              e.preventDefault();
              updateSelectedToIndex(0);
              break;
            case "End":
              e.preventDefault();
              last();
              break;
            case "Enter":
              e.preventDefault();
              {
                const item = getSelectedItem();
                if (item) {
                  const event = new Event(SELECT_EVENT);
                  item.dispatchEvent(event);
                }
              }
              break;
            default:
              break;
          }
        }}
      >
        <label
          cmdk-label=""
          htmlFor={context.inputId}
          id={context.labelId}
          style={srOnlyStyles}
        >
          {label}
        </label>
        <StoreContext.Provider value={store}>
          <CommandContext.Provider value={context}>
            {props.children}
          </CommandContext.Provider>
        </StoreContext.Provider>
      </div>
    );
  },
);
Root.displayName = "Command";

const Item = React.forwardRef<HTMLDivElement, ItemProps>(
  (props, forwardedRef) => {
    const id = React.useId();
    const ref = React.useRef<HTMLDivElement>(null);
    const groupContext = React.useContext(GroupContext);
    const context = useCommand();
    const propsRef = useAsRef(props);
    const forceMount = propsRef.current?.forceMount ?? groupContext?.forceMount;

    useIsoLayoutEffect(() => {
      if (!forceMount) return context.item(id, groupContext?.id ?? "");
      return undefined;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [forceMount]);

    const value = useValue(
      id,
      ref,
      [props.value, props.children, ref],
      props.keywords,
    );

    const store = useStore();
    const selected = useCmdk(
      (state) => !!state.value && state.value === value.current,
    );
    const render = useCmdk((state) =>
      forceMount
        ? true
        : context.filter() === false
          ? true
          : !state.search
            ? true
            : (state.filtered.items.get(id) ?? 0) > 0,
    );

    React.useEffect(() => {
      const element = ref.current;
      if (!element || props.disabled) return;
      element.addEventListener(SELECT_EVENT, onSelect);
      return () => element.removeEventListener(SELECT_EVENT, onSelect);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.disabled, onSelect]);

    function onSelect(): void {
      select();
      propsRef.current.onSelect?.(value.current ?? "");
    }

    function select(): void {
      store.setState("value", value.current ?? "", true);
    }

    if (!render) return null;

    const {
      disabled,
      value: _v,
      onSelect: _o,
      forceMount: _f,
      keywords: _k,
      ...etc
    } = props;
    void _v;
    void _o;
    void _f;
    void _k;

    return (
      <div
        ref={mergeRefs([ref, forwardedRef])}
        {...etc}
        id={id}
        cmdk-item=""
        role="option"
        aria-disabled={Boolean(disabled)}
        aria-selected={Boolean(selected)}
        data-disabled={Boolean(disabled)}
        data-selected={Boolean(selected)}
        onPointerMove={
          disabled || context.getDisablePointerSelection() ? undefined : select
        }
        onClick={disabled ? undefined : onSelect}
      >
        {props.children}
      </div>
    );
  },
);
Item.displayName = "Command.Item";

const GroupComp = React.forwardRef<HTMLDivElement, GroupProps>(
  (props, forwardedRef) => {
    const { heading, children, forceMount, ...etc } = props;
    const id = React.useId();
    const ref = React.useRef<HTMLDivElement>(null);
    const headingRef = React.useRef<HTMLDivElement>(null);
    const headingId = React.useId();
    const context = useCommand();
    const render = useCmdk((state) =>
      forceMount
        ? true
        : context.filter() === false
          ? true
          : !state.search
            ? true
            : state.filtered.groups.has(id),
    );

    useIsoLayoutEffect(() => {
      return context.group(id);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useValue(id, ref, [props.value, props.heading, headingRef]);

    const contextValue = React.useMemo(
      () => ({ id, forceMount }),
      [id, forceMount],
    );

    return (
      <div
        ref={mergeRefs([ref, forwardedRef])}
        {...etc}
        cmdk-group=""
        role="presentation"
        hidden={render ? undefined : true}
      >
        {heading ? (
          <div
            ref={headingRef}
            cmdk-group-heading=""
            aria-hidden
            id={headingId}
          >
            {heading}
          </div>
        ) : null}
        <div
          cmdk-group-items=""
          role="group"
          aria-labelledby={heading ? headingId : undefined}
        >
          <GroupContext.Provider value={contextValue}>
            {children}
          </GroupContext.Provider>
        </div>
      </div>
    );
  },
);
GroupComp.displayName = "Command.Group";

const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  (props, forwardedRef) => {
    const { alwaysRender, ...etc } = props;
    const ref = React.useRef<HTMLDivElement>(null);
    const render = useCmdk((state) => !state.search);
    if (!alwaysRender && !render) return null;
    return (
      <div
        ref={mergeRefs([ref, forwardedRef])}
        {...etc}
        cmdk-separator=""
        role="separator"
      />
    );
  },
);
Separator.displayName = "Command.Separator";

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (props, forwardedRef) => {
    const { onValueChange, ...etc } = props;
    const isControlled = props.value != null;
    const store = useStore();
    const search = useCmdk((state) => state.search);
    const selectedItemId = useCmdk((state) => state.selectedItemId);
    const context = useCommand();

    React.useEffect(() => {
      if (props.value != null) store.setState("search", props.value);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.value, store.setState]);

    return (
      <input
        ref={forwardedRef}
        {...etc}
        cmdk-input=""
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-autocomplete="list"
        role="combobox"
        aria-expanded={true}
        aria-controls={context.listId}
        aria-labelledby={context.labelId}
        aria-activedescendant={selectedItemId}
        id={context.inputId}
        type="text"
        value={isControlled ? (props.value ?? "") : search}
        onChange={(e) => {
          if (!isControlled) store.setState("search", e.target.value);
          onValueChange?.(e.target.value);
        }}
      />
    );
  },
);
Input.displayName = "Command.Input";

const List = React.forwardRef<HTMLDivElement, ListProps>(
  (props, forwardedRef) => {
    const { children, label = "Suggestions", ...etc } = props;
    void children;
    const ref = React.useRef<HTMLDivElement>(null);
    const height = React.useRef<HTMLDivElement>(null);
    const selectedItemId = useCmdk((state) => state.selectedItemId);
    const context = useCommand();

    React.useEffect(() => {
      if (height.current && ref.current) {
        const el = height.current;
        const wrapper = ref.current;
        let animationFrame: number | undefined;
        const observer = new ResizeObserver(() => {
          animationFrame = requestAnimationFrame(() => {
            const h = el.offsetHeight;
            wrapper.style.setProperty(
              "--cmdk-list-height",
              `${h.toFixed(1)}px`,
            );
          });
        });
        observer.observe(el);
        return () => {
          if (animationFrame !== undefined)
            cancelAnimationFrame(animationFrame);
          observer.unobserve(el);
        };
      }
      return undefined;
    }, []);

    return (
      <div
        ref={mergeRefs([ref, forwardedRef])}
        {...etc}
        cmdk-list=""
        role="listbox"
        tabIndex={-1}
        aria-activedescendant={selectedItemId}
        aria-label={label}
        id={context.listId}
      >
        <div ref={mergeRefs([height, context.listInnerRef])} cmdk-list-sizer="">
          {props.children}
        </div>
      </div>
    );
  },
);
List.displayName = "Command.List";

const Empty = React.forwardRef<HTMLDivElement, EmptyProps>(
  (props, forwardedRef) => {
    const render = useCmdk((state) => state.filtered.count === 0);
    if (!render) return null;
    return (
      <div ref={forwardedRef} {...props} cmdk-empty="" role="presentation" />
    );
  },
);
Empty.displayName = "Command.Empty";

export const Command = Object.assign(Root, {
  List,
  Item,
  Input,
  Group: GroupComp,
  Separator,
  Empty,
});

export function useCommandState<T = unknown>(selector: (state: State) => T): T {
  return useCmdk(selector);
}

function findNextSibling(el: Element, selector: string): Element | null {
  let sibling = el.nextElementSibling;
  while (sibling) {
    if (sibling.matches(selector)) return sibling;
    sibling = sibling.nextElementSibling;
  }
  return null;
}

function findPreviousSibling(el: Element, selector: string): Element | null {
  let sibling = el.previousElementSibling;
  while (sibling) {
    if (sibling.matches(selector)) return sibling;
    sibling = sibling.previousElementSibling;
  }
  return null;
}

function useAsRef<T>(data: T): React.RefObject<T> {
  const ref = React.useRef<T>(data);
  useIsoLayoutEffect(() => {
    ref.current = data;
  });
  return ref;
}

function useLazyRef<T>(fn: () => T): React.RefObject<T> {
  const ref = React.useRef<T | null>(null);
  if (ref.current === null) ref.current = fn();
  return ref as React.RefObject<T>;
}

function useCmdk<T = unknown>(selector: (state: State) => T): T {
  const store = useStore();
  const cb = (): T => selector(store.snapshot());
  return React.useSyncExternalStore(store.subscribe, cb, cb);
}

function useValue(
  id: string,
  ref: React.RefObject<HTMLElement | null>,
  deps: (
    | string
    | React.ReactNode
    | React.RefObject<HTMLElement | null>
    | undefined
  )[],
  aliases: string[] = [],
): React.RefObject<string | undefined> {
  const valueRef = React.useRef<string | undefined>(undefined);
  const context = useCommand();

  useIsoLayoutEffect(() => {
    const value = (() => {
      for (const part of deps) {
        if (typeof part === "string") return part.trim();
        if (
          typeof part === "object" &&
          part !== null &&
          "current" in (part as object)
        ) {
          const r = part as React.RefObject<HTMLElement | null>;
          if (r.current) return r.current.textContent?.trim();
          return valueRef.current;
        }
      }
      return undefined;
    })();

    const keywords = aliases.map((a) => a.trim());

    if (value) {
      context.value(id, value, keywords);
      ref.current?.setAttribute(VALUE_ATTR, value);
      valueRef.current = value;
    }
  });

  return valueRef;
}

const useScheduleLayoutEffect = (): ((
  id: string | number,
  cb: () => void,
) => void) => {
  const [s, ss] = React.useState<object>();
  const fns = useLazyRef(() => new Map<string | number, () => void>());

  useIsoLayoutEffect(() => {
    fns.current.forEach((f) => f());
    fns.current = new Map();
  }, [s]);

  return (id: string | number, cb: () => void) => {
    fns.current.set(id, cb);
    ss({});
  };
};

function mergeRefs<T>(
  refs: Array<React.Ref<T> | undefined>,
): React.RefCallback<T> {
  return (value) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") ref(value);
      else if (ref != null) {
        (ref as React.RefObject<T | null>).current = value;
      }
    });
  };
}

const srOnlyStyles: React.CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  borderWidth: 0,
};
