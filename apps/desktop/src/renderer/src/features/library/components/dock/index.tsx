import { useEffect } from "react";
import { downloadsSelection } from "@/features/downloads";
import { selection } from "@/features/saves/navigation";
import { sourcesSelection } from "@/features/sources";
import { useRouteLocation } from "@/shared/hooks/use-route-location";

export function LibraryTray() {
  const pathname = useRouteLocation((location) => location.pathname);
  const isDownloads = pathname.startsWith("/downloads");
  const isSources = pathname.startsWith("/sources");

  useEffect(() => {
    if (isDownloads) {
      selection.clear();
      sourcesSelection.clear();
      return () => downloadsSelection.clear();
    }
    if (isSources) {
      selection.clear();
      downloadsSelection.clear();
      return () => sourcesSelection.clear();
    }
  }, [isDownloads, isSources]);

  return null;
}
