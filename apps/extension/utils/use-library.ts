import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { sendMessage } from "./messaging";
import { paintTheme, resolveAppearance } from "./paint-theme";
import { OFFLINE } from "./probe";
import type { ProbeResult } from "./probe";
import { useSettings } from "./use-settings";

/** Probes Pond through the background and paints the theme the settings ask for. */
export function useLibrary() {
  const [result, setResult] = useState<ProbeResult | null>(null);
  const settings = useSettings();

  const refresh = useCallback(async () => {
    setResult(null);
    setResult(
      await sendMessage("probe", undefined).catch((): ProbeResult => OFFLINE),
    );
  }, []);

  useEffect(() => {
    void sendMessage("probe", undefined)
      .catch((): ProbeResult => OFFLINE)
      .then((next) => {
        setResult(next);
      });
  }, []);

  const theme =
    result?.state === "connected" ? (result.library.theme ?? null) : null;
  const preference = settings?.theme ?? "library";
  useLayoutEffect(
    () =>
      paintTheme(
        document.documentElement,
        resolveAppearance(preference, theme),
      ),
    [preference, theme],
  );

  return { result, refresh };
}
