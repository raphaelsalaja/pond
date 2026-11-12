import { type Avatar, frameGap, type Pose } from "./face";

export interface Rig {
  element: Element;
  avatar: Avatar;
  write(pose: Pose): void;
  rest(): void;
}

interface State {
  rig: Rig;
  visible: boolean;
  near: boolean;
  box: DOMRect | null;
}

/** Fish within this many CSS pixels of the pointer notice it and follow it. */
const NOTICE = 240;
/** Milliseconds a pointer rests before a watching fish drops to the drift rate; outlasts the spin it plays on arrival. */
const REST = 1200;

const rigs = new Map<Element, State>();
let observer: IntersectionObserver | null = null;
let watcher: MutationObserver | null = null;
let frame = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let last = 0;
let pointer: { x: number; y: number } | null = null;
let movedAt = 0;

export const reducedMotion = () =>
  document.documentElement.hasAttribute("data-reduce-motion");
const motionHeld = () =>
  document.documentElement.hasAttribute("data-motion-paused");

function tick(now: number) {
  frame = 0;
  const dt = last ? (now - last) / 1000 : 0;
  last = now;
  const active = [...rigs.values()].filter((state) => state.visible);
  /** Measure every fish before writing any pose, so the frame lays out once. */
  const boxes = active.map(({ rig }) =>
    pointer ? rig.element.getBoundingClientRect() : null,
  );
  const resting = now - movedAt > REST;
  let gap = Number.POSITIVE_INFINITY;
  active.forEach((state, index) => {
    const { rig } = state;
    const box = boxes[index] ?? null;
    state.box = box;
    const x = box && pointer ? pointer.x - (box.left + box.width / 2) : 0;
    const y = box && pointer ? pointer.y - (box.top + box.height / 2) : 0;
    if (box && Math.hypot(x, y) < NOTICE) {
      if (!state.near) rig.avatar.enter();
      state.near = true;
      rig.avatar.move(x, y);
    } else if (state.near) {
      state.near = false;
      rig.avatar.leave();
    }
    rig.write(rig.avatar.step(dt));
    gap = Math.min(gap, frameGap(rig.avatar.mood, resting));
  });
  schedule(Number.isFinite(gap) ? gap : 0);
}

function schedule(gap: number) {
  if (gap === 0) {
    frame = requestAnimationFrame(tick);
    return;
  }
  timer = setTimeout(() => {
    timer = null;
    frame = requestAnimationFrame(tick);
  }, gap);
}

function cancel() {
  cancelAnimationFrame(frame);
  if (timer) clearTimeout(timer);
  frame = 0;
  timer = null;
}

function sync() {
  const run =
    !reducedMotion() &&
    !motionHeld() &&
    [...rigs.values()].some((state) => state.visible);
  const running = frame !== 0 || timer !== null;
  if (run && !running) {
    last = 0;
    schedule(0);
  } else if (!run && running) {
    cancel();
  }
}

function onMotionChange() {
  if (reducedMotion()) for (const { rig } of rigs.values()) rig.rest();
  sync();
}

function within(state: State, at: { x: number; y: number }): boolean {
  const { box } = state;
  if (!state.visible || !box) return false;
  const x = at.x - (box.left + box.width / 2);
  const y = at.y - (box.top + box.height / 2);
  return Math.hypot(x, y) < NOTICE;
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerType === "touch") return;
  const at = { x: event.clientX, y: event.clientY };
  pointer = at;
  movedAt = event.timeStamp;
  /** A fish between slow frames reacts to a pointer within reach on the next frame, not the next slow one. */
  if (timer && [...rigs.values()].some((state) => within(state, at))) {
    clearTimeout(timer);
    timer = null;
    frame = requestAnimationFrame(tick);
  }
}

function onPointerLeave() {
  pointer = null;
}

function start() {
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const state = rigs.get(entry.target);
        if (state) state.visible = entry.isIntersecting;
      }
      sync();
    },
    { rootMargin: "80px" },
  );
  watcher = new MutationObserver(onMotionChange);
  watcher.observe(document.documentElement, {
    attributeFilter: ["data-reduce-motion", "data-motion-paused"],
  });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave);
}

function stop() {
  observer?.disconnect();
  watcher?.disconnect();
  observer = null;
  watcher = null;
  window.removeEventListener("pointermove", onPointerMove);
  document.documentElement.removeEventListener("pointerleave", onPointerLeave);
  pointer = null;
}

/** One frame loop steps every fish on screen; it never runs while motion is reduced or the machine is resting. */
export function animate(rig: Rig): () => void {
  if (!("IntersectionObserver" in globalThis)) return () => {};
  if (!observer) start();
  rigs.set(rig.element, { rig, visible: false, near: false, box: null });
  observer?.observe(rig.element);
  return () => {
    observer?.unobserve(rig.element);
    rigs.delete(rig.element);
    if (rigs.size === 0) stop();
    sync();
  };
}
