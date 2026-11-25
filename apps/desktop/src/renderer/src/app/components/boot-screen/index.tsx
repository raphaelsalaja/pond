import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useFoldersLoaded } from "@/features/library/state/folders";
import { useBootReady } from "@/features/saves/hooks/use-saves";
import { dismissBootCover } from "@/shared/lib/boot-cover";
import { usePrefs } from "@/shared/state/prefs";

export function BootScreen() {
  const savesReady = useBootReady();
  const foldersReady = useFoldersLoaded();
  const [, , prefsReady] = usePrefs("window");
  const { isPending: libraryPending } = useQuery({
    queryKey: ["library-info"],
    queryFn: () => window.pond.query("library.info", {}),
  });
  const ready = savesReady && foldersReady && prefsReady && !libraryPending;

  useEffect(() => {
    if (!ready) return;
    dismissBootCover();
  }, [ready]);

  return null;
}
