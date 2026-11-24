import {
  Activity,
  type ComponentType,
  Suspense,
  useEffect,
  useState,
} from "react";
import {
  type RailPage,
  useRailPage,
} from "@/features/library/state/shell-layout";
import { useOpenSaveId } from "@/features/saves/navigation";
import {
  lazyWithPreload,
  preloadWhenIdle,
} from "@/shared/lib/lazy-with-preload";

const PAGES = {
  tags: lazyWithPreload(() =>
    import("@/features/tags/page").then((module) => module.TagsPage),
  ),
  sources: lazyWithPreload(() =>
    import("@/features/sources/components/page").then(
      (module) => module.SourcesPage,
    ),
  ),
  downloads: lazyWithPreload(() =>
    import("@/features/downloads/page").then((module) => module.DownloadsPage),
  ),
} satisfies Record<RailPage, ComponentType>;

/** Rail pages stay mounted once visited, so switching back skips the remount and refetch; `Activity` pauses their effects while hidden. */
export function RailPages() {
  const railPage = useRailPage();
  const active = useOpenSaveId() === null ? railPage : null;
  const [visited, setVisited] = useState<readonly RailPage[]>(() =>
    active ? [active] : [],
  );
  if (active && !visited.includes(active)) setVisited([...visited, active]);

  useEffect(
    () => preloadWhenIdle(...Object.values(PAGES).map((page) => page.preload)),
    [],
  );

  return visited.map((page) => {
    const Page = PAGES[page];
    return (
      <Activity key={page} mode={page === active ? "visible" : "hidden"}>
        <Suspense fallback={null}>
          <Page />
        </Suspense>
      </Activity>
    );
  });
}
