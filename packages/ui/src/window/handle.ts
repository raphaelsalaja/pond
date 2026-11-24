import {
  createChange,
  createResize,
  definePrimitive,
  dragThreshold,
  isComposing,
  live,
} from "@ui-sdk/core";
import type {
  ChangeDetails,
  ResizeDraft,
  ResizeHandle,
  ResizeReason,
} from "@ui-sdk/core";

export type WindowSide = "left" | "right";

export interface WindowHandleOptions {
  edge: WindowSide;
  minWidth: number;
  maxWidth: number;
  width?: number;
  defaultWidth?: number;
  controls?: string;
  onWidthChange?: (width: number, details: ChangeDetails<ResizeReason>) => void;
  onCollapse?: () => void;
}

interface WindowHandleState {
  edge: WindowSide;
  minWidth: number;
  maxWidth: number;
  controls: string | undefined;
  width: number;
  draft: ResizeDraft | null;
}

interface Press {
  x: number;
  time: number;
  track: string;
  dragged: boolean;
  collapsed: boolean;
  committed: boolean;
}

const PANE = "pane";
const STEP = 10;
const LARGE_STEP = 40;
/** How far past the minimum a drag must travel before it collapses the column. */
const COLLAPSE_OVERSHOOT = 48;
/** A still press held longer than this is an aborted drag, not a click to collapse. */
const CLICK_MAX_MS = 300;
const KEYS = ["ArrowLeft", "ArrowRight", "Home", "End", "Enter"];

const startWidth = (options: WindowHandleOptions) =>
  options.width ?? options.defaultWidth ?? options.minWidth;

const collapseAt = (minWidth: number) =>
  Math.max(1, minWidth - COLLAPSE_OVERSHOOT);

const compassOf = (edge: WindowSide): ResizeHandle =>
  edge === "left" ? "e" : "w";

const trackOf = (edge: WindowSide) =>
  edge === "left" ? "--window-left-track" : "--window-right-track";

const clampWidth = (width: number, state: WindowHandleState) =>
  Math.round(Math.min(state.maxWidth, Math.max(state.minWidth, width)));

const shownWidth = (state: WindowHandleState) =>
  Math.round(
    state.draft ? clampWidth(state.draft.box.width, state) : state.width,
  );

function trackPointer(event: PointerEvent, handle: HTMLElement) {
  const y = event.clientY - handle.getBoundingClientRect().top;
  handle
    .closest<HTMLElement>('[data-slot="window"]')
    ?.style.setProperty("--window-handle-y", `${Math.round(y)}px`);
}

export const windowHandle = definePrimitive({
  name: "handle",
  label: "window-handle",
  options: {
    edge: "string",
    minWidth: "number",
    maxWidth: "number",
    width: "number",
    defaultWidth: "number",
    controls: "string",
    onWidthChange: "callback",
    onCollapse: "callback",
  },
  state: (options: WindowHandleOptions): WindowHandleState => ({
    edge: options.edge,
    minWidth: options.minWidth,
    maxWidth: options.maxWidth,
    controls: options.controls,
    width: startWidth(options),
    draft: null,
  }),
  sync: (options) => ({
    edge: options.edge,
    minWidth: options.minWidth,
    maxWidth: options.maxWidth,
    controls: options.controls,
  }),
  live: ["draft"],
  api: (context) => {
    const { store } = context;
    const change = createChange(context);
    let pointer = false;
    let press: Press | null = null;
    let release: (() => void) | undefined;
    let shown: ResizeDraft | null = null;
    let resolved = startWidth(context.options());

    context.onOptions((options) => {
      const next = startWidth(options);
      if (next === resolved) {
        return;
      }
      resolved = next;
      store.set({ width: next });
    });

    const collapsible = () => Boolean(context.options().onCollapse);

    const elements = () => {
      const handle = context.element("root");
      return {
        root: handle?.closest<HTMLElement>('[data-slot="window"]') ?? undefined,
        pane:
          handle?.closest<HTMLElement>(`[data-slot="${store.get().edge}"]`) ??
          undefined,
      };
    };

    const writeTrack = (value: string) => {
      const { root } = elements();
      const name = trackOf(store.get().edge);
      if (value) {
        root?.style.setProperty(name, value);
      } else {
        root?.style.removeProperty(name);
      }
    };

    const commit = (
      width: number,
      details: { reason: ResizeReason; event?: Event },
    ) => {
      if (press?.collapsed) {
        return false;
      }
      const next = clampWidth(width, store.get());
      if (!change("width", next, details)) {
        return false;
      }
      if (press) {
        press.committed = true;
      }
      writeTrack(`${next}px`);
      return true;
    };

    const startDrag = () => {
      const { root, pane } = elements();
      const body = root?.ownerDocument.body;
      if (!root || !pane || !body) {
        return;
      }
      const { cursor, userSelect } = body.style;
      pane.dataset.resizing = "";
      root.dataset.resizing = store.get().edge;
      body.style.cursor = "col-resize";
      body.style.userSelect = "none";
      release = () => {
        delete pane.dataset.resizing;
        delete root.dataset.resizing;
        body.style.cursor = cursor;
        body.style.userSelect = userSelect;
      };
    };

    const endDrag = () => {
      release?.();
      release = undefined;
    };

    const resize = createResize<WindowHandleState>(context, {
      boxes: (state) => ({
        [PANE]: { x: 0, y: 0, width: state.width, height: 1 },
      }),
      draft: "draft",
      set: (boxes, details) =>
        commit(boxes[PANE]?.width ?? store.get().width, details),
      min: () => {
        const { minWidth } = store.get();
        const floor =
          pointer && collapsible() ? collapseAt(minWidth) : minWidth;
        return { width: floor, height: 1 };
      },
      max: () => ({ width: store.get().maxWidth, height: 1 }),
      step: () => (pointer ? 1 : STEP),
      largeStep: () => LARGE_STEP,
      message: () => "",
    });

    const followDraft = () => {
      const { draft, minWidth } = store.get();
      if (draft === shown) {
        return;
      }
      const previous = shown;
      shown = draft;
      if (!draft) {
        if (!previous) {
          return;
        }
        endDrag();
        if (press && !press.committed && !press.collapsed) {
          writeTrack(press.track);
        }
        return;
      }
      if (!press || press.collapsed) {
        return;
      }
      if (!previous) {
        press.dragged = true;
        startDrag();
      }
      if (collapsible() && draft.box.width <= collapseAt(minWidth)) {
        endDrag();
        commit(minWidth, { reason: "drag" });
        press.collapsed = true;
        context.options().onCollapse?.();
        return;
      }
      writeTrack(`${clampWidth(draft.box.width, store.get())}px`);
    };

    context.onDestroy(store.subscribe(followDraft));
    context.onDestroy(endDrag);

    return {
      resize,
      setWidth: (width: number) => commit(width, { reason: "imperative" }),
      pointerdown(event: PointerEvent, el: HTMLElement) {
        if (event.button !== 0) {
          return;
        }
        const { root, pane } = elements();
        pointer = true;
        press = {
          x: event.clientX,
          time: event.timeStamp,
          track: root?.style.getPropertyValue(trackOf(store.get().edge)) ?? "",
          dragged: false,
          collapsed: false,
          committed: false,
        };
        const measured = pane?.getBoundingClientRect().width;
        if (measured) {
          store.set({ width: measured });
        }
        resize.pointerdown(event, PANE, compassOf(store.get().edge), el);
        event.preventDefault();
        event.stopPropagation();
      },
      pointerup(event: PointerEvent) {
        const current = press;
        if (event.button !== 0 || !current) {
          return;
        }
        if (current.dragged || current.collapsed) {
          return;
        }
        if (Math.abs(event.clientX - current.x) > dragThreshold) {
          return;
        }
        if (event.timeStamp - current.time >= CLICK_MAX_MS) {
          return;
        }
        current.collapsed = true;
        context.options().onCollapse?.();
      },
      keydown(event: KeyboardEvent) {
        const state = store.get();
        if (state.draft) {
          return;
        }
        pointer = false;
        press = null;
        if (
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          isComposing(event)
        ) {
          return;
        }
        const { onCollapse } = context.options();
        if (event.key === "Enter") {
          if (!onCollapse) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const center = elements().root?.querySelector<HTMLElement>(
            '[data-slot="center"]',
          );
          onCollapse();
          center?.focus({ preventScroll: true });
          return;
        }
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          event.stopPropagation();
          const width = event.key === "Home" ? state.minWidth : state.maxWidth;
          resize.resizeTo(
            PANE,
            { x: 0, y: 0, width, height: 1 },
            { reason: "resize-key", event },
          );
          return;
        }
        if (resize.keydown(event, PANE, compassOf(state.edge))) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "separator",
      focus: "tab-stop",
      keys: KEYS,
      attrs: (state) => ({
        tabindex: "0",
        "aria-orientation": "vertical",
        "aria-valuemin": String(state.minWidth),
        "aria-valuemax": String(state.maxWidth),
        "aria-controls": state.controls,
        "aria-keyshortcuts": KEYS.join(" "),
        "data-edge": state.edge,
      }),
      live: live((state) => {
        const width = shownWidth(state);
        return {
          "aria-valuenow": String(width),
          "aria-valuetext": `${width} pixels`,
        };
      }),
      on: {
        keydown: (event, { api }) => api.keydown(event),
        pointerdown: (event, { el, api }) => {
          if (el) {
            api.pointerdown(event, el);
          }
        },
        pointerup: (event, { api }) => api.pointerup(event),
        pointermove: (event, { el }) => {
          if (el) {
            trackPointer(event, el);
          }
        },
        /** UI SDK ends a drag on `pointercancel` only, so a capture lost mid-drag, like a window blur, cancels it the same way. */
        lostpointercapture: (event, { el }) => {
          el?.dispatchEvent(
            new PointerEvent("pointercancel", {
              bubbles: true,
              pointerId: event.pointerId,
            }),
          );
        },
      },
    }),
  }),
  agent: { actions: ["setWidth"] },
});
