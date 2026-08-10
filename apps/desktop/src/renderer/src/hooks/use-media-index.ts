import type { MediaIndexStatus } from "@shared/media-index";
import { useCallback, useEffect, useState } from "react";

const initialStatus: MediaIndexStatus = {
  state: "idle",
  prepared: 0,
  remaining: 0,
  currentTitle: null,
  pauseReason: null,
  lastError: null,
};

type MediaIndexAction = "start" | "pause" | "resume";

export function useMediaIndex() {
  const [status, setStatus] = useState<MediaIndexStatus>(initialStatus);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = window.pond.onMediaIndexStatus((next) => {
      if (mounted) setStatus(next);
    });
    void window.pond
      .query("mediaIndex.status", {})
      .then((next) => {
        if (mounted) setStatus(next as MediaIndexStatus);
      })
      .catch(() => {
        if (mounted) {
          setStatus((current) => ({
            ...current,
            state: "error",
            lastError: "Pond couldn’t read the media index status.",
          }));
        }
      });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const run = useCallback(async (action: MediaIndexAction) => {
    setPending(true);
    try {
      const next = (await window.pond.query(`mediaIndex.${action}`, {})) as
        | MediaIndexStatus
        | undefined;
      if (next) setStatus(next);
    } finally {
      setPending(false);
    }
  }, []);

  return {
    status,
    pending,
    start: () => run("start"),
    pause: () => run("pause"),
    resume: () => run("resume"),
  };
}
