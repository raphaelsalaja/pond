import { type ComponentType, lazy, useState } from "react";

/** React holds a Suspense reveal for ~300ms after its fallback shows, so a preloaded module renders directly instead. */
export function lazyWithPreload<P extends object>(
  load: () => Promise<ComponentType<P>>,
) {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const preload = () => {
    pending ??= load().then((component) => {
      loaded = component;
      return component;
    });
    return pending;
  };
  const Lazy = lazy(() =>
    preload().then((component) => ({ default: component })),
  );

  function Preloadable(props: P) {
    const [Loaded] = useState(() => loaded);
    return Loaded ? <Loaded {...props} /> : <Lazy {...props} />;
  }

  return Object.assign(Preloadable, { preload });
}

/** Warms chunks after the current frame settles, without competing with input. */
export function preloadWhenIdle(...loaders: Array<() => Promise<unknown>>) {
  const run = () => {
    for (const load of loaders) void load().catch(() => {});
  };
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(run, { timeout: 2000 });
    return () => cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 200);
  return () => window.clearTimeout(id);
}
