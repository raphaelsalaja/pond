import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function useDownloadActivity(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["downloads.activity"],
    queryFn: () => window.pond.query("downloads.activity", {}),
    refetchInterval: 1000,
    staleTime: 500,
  });
}

export function useDownloadClock(active = true): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) {
      return;
    }
    let live = true;
    queueMicrotask(() => {
      if (live) {
        setNow(Date.now());
      }
    });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [active]);
  return now;
}
