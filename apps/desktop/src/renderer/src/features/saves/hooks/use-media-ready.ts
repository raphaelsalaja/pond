import { createContext, use, useEffect } from "react";

/** Set by the viewer stage, which keeps the outgoing media on screen until this fires. */
export const MediaReadyContext = createContext<(() => void) | null>(null);

export function useReportMediaReady(ready: boolean): void {
  const report = use(MediaReadyContext);
  useEffect(() => {
    if (ready) report?.();
  }, [ready, report]);
}
