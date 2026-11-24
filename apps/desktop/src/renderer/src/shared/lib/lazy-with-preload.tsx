import { lazy, useState } from "react";
import type { ComponentType } from "react";

type Preload = () => Promise<void>;

/** React holds a Suspense reveal for ~300ms after its fallback shows, so a preloaded module renders directly instead. */
export function lazyWithPreload<P extends object>(
  load: () => Promise<ComponentType<P>>,
) {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const loadOnce = () => {
    pending ??= load().then((component) => {
      loaded = component;
      return component;
    });
    return pending;
  };
  const preload: Preload = () => loadOnce().then(() => undefined);
  const Lazy = lazy(() =>
    loadOnce().then((component) => ({ default: component })),
  );

  function Preloadable(props: P) {
    const [Loaded] = useState(() => loaded);
    return Loaded ? <Loaded {...props} /> : <Lazy {...props} />;
  }

  return Object.assign(Preloadable, { preload });
}

/** Warms chunks after the current frame settles, without competing with input. */
export function preloadWhenIdle(...preloads: Array<Preload>) {
  const run = () => {
    for (const preload of preloads) {
      void preload().catch(() => {});
    }
  };
  if (globalThis.requestIdleCallback) {
    const id = globalThis.requestIdleCallback(run, { timeout: 2000 });
    return () => globalThis.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 200);
  return () => window.clearTimeout(id);
}
