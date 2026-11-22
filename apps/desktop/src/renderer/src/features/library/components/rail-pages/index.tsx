import { Activity, Suspense, useEffect, useState } from "react";
import {
  lazyWithPreload,
  preloadWhenIdle,
} from "@/shared/lib/lazy-with-preload";

const PAGES = {
  "/tags": lazyWithPreload(() =>
    import("@/features/tags/page").then((module) => module.TagsPage),
  ),
  "/sources": lazyWithPreload(() =>
    import("@/features/sources/components/page").then(
      (module) => module.SourcesPage,
    ),
  ),
  "/downloads": lazyWithPreload(() =>
    import("@/features/downloads/page").then((module) => module.DownloadsPage),
  ),
};

type RailPagePath = keyof typeof PAGES;

function railPagePath(pathname: string): RailPagePath | null {
  return Object.hasOwn(PAGES, pathname) ? (pathname as RailPagePath) : null;
}

/** Rail pages stay mounted once visited, so switching back skips the remount and refetch; `Activity` pauses their effects while hidden. */
export function RailPages({ pathname }: { pathname: string }) {
  const active = railPagePath(pathname);
  const [visited, setVisited] = useState<readonly RailPagePath[]>(() =>
    active ? [active] : [],
  );
  if (active && !visited.includes(active)) setVisited([...visited, active]);

  useEffect(
    () => preloadWhenIdle(...Object.values(PAGES).map((page) => page.preload)),
    [],
  );

  return visited.map((path) => {
    const Page = PAGES[path];
    return (
      <Activity key={path} mode={path === active ? "visible" : "hidden"}>
        <Suspense fallback={null}>
          <Page />
        </Suspense>
      </Activity>
    );
  });
}
