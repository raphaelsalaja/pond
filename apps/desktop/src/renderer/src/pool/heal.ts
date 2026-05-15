const STORAGE_KEY = "pond-heal-attempted";
const RETRY_DELAY_MS = 500;

function loadAttempted(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* corrupted entry; start fresh */
  }
  return new Set<string>();
}

function persistAttempted(set: Set<string>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* storage full or unavailable; non-critical */
  }
}

const attempted = loadAttempted();

export function requestVideoHeal(saveId: string, videoSrc?: string): void {
  // #region agent log
  fetch("http://127.0.0.1:7359/ingest/cec9d836-64a0-42f6-913f-8582c9879b82", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "7b119d",
    },
    body: JSON.stringify({
      sessionId: "7b119d",
      hypothesisId: "H2",
      location: "heal.ts:requestVideoHeal",
      message: "requestVideoHeal called",
      data: {
        saveId,
        alreadyAttempted: attempted.has(saveId),
        attemptedSize: attempted.size,
        hasVideoSrc: !!videoSrc,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (!saveId) return;
  if (attempted.has(saveId)) return;
  attempted.add(saveId);
  persistAttempted(attempted);

  if (videoSrc) {
    setTimeout(() => retryThenHeal(saveId, videoSrc), RETRY_DELAY_MS);
  } else {
    dispatchHeal(saveId);
  }
}

async function retryThenHeal(saveId: string, videoSrc: string): Promise<void> {
  try {
    const res = await fetch(videoSrc, { method: "HEAD" });
    if (res.ok) {
      console.debug("[pond heal] retry succeeded, skipping heal", saveId);
      return;
    }
  } catch {
    /* network / protocol error — fall through to heal */
  }
  dispatchHeal(saveId);
}

function dispatchHeal(saveId: string): void {
  const fn = (
    window.pond as unknown as {
      redownloadVideo?: (id: string) => Promise<unknown>;
    }
  ).redownloadVideo;
  if (typeof fn !== "function") {
    console.debug("[pond heal] redownloadVideo IPC not available", saveId);
    return;
  }

  fn(saveId)
    .then((res) => {
      // #region agent log
      fetch(
        "http://127.0.0.1:7359/ingest/cec9d836-64a0-42f6-913f-8582c9879b82",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "7b119d",
          },
          body: JSON.stringify({
            sessionId: "7b119d",
            hypothesisId: "H1",
            location: "heal.ts:dispatchHeal",
            message: "redownloadVideo IPC resolved",
            data: { saveId, res },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
      // #endregion
      console.debug("[pond heal] redownload response", saveId, res);
    })
    .catch((err: unknown) => {
      console.debug("[pond heal] redownload threw", saveId, err);
    });
}
