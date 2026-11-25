import { useEffect, useLayoutEffect, useRef, useState } from "react";

const SEEK_SECONDS = 10;

const ACTIONS = [
  "play",
  "pause",
  "seekbackward",
  "seekforward",
  "seekto",
] as const;

let sessionOwner = 0;

interface MediaSessionMeta {
  title?: string | null;
  artist?: string | null;
  artworkUrl?: string | null;
}

interface MediaSessionPlayback {
  active: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  rate: number;
}

interface MediaSessionActions {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  seekBy: (delta: number) => void;
}

interface ArtworkBlob {
  src: string;
  type: string;
}

/** Chromium only accepts http(s)/blob/data artwork; pond:// must be rehosted as a blob. */
function useArtworkBlob(
  url: string | null | undefined,
): ArtworkBlob | undefined {
  const [loaded, setLoaded] = useState<{
    url: string;
    artwork: ArtworkBlob | undefined;
  } | null>(null);

  useEffect(() => {
    if (!url) {
      return;
    }
    let cancelled = false;
    let objectUrl: string | undefined;
    void (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          return;
        }
        const blob = await res.blob();
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setLoaded({
          url,
          artwork: { src: objectUrl, type: blob.type || "image/jpeg" },
        });
      } catch {
        if (!cancelled) {
          setLoaded({ url, artwork: undefined });
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url]);

  return loaded && loaded.url === url ? loaded.artwork : undefined;
}

function bindAction(
  action: (typeof ACTIONS)[number],
  handler: MediaSessionActionHandler | null,
): void {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    /** Chromium throws for actions it doesn't support; those stay unbound. */
  }
}

function clearSession(): void {
  const session = navigator.mediaSession;
  session.metadata = null;
  session.playbackState = "none";
  for (const action of ACTIONS) {
    bindAction(action, null);
  }
}

export function useMediaSession(
  meta: MediaSessionMeta,
  playback: MediaSessionPlayback,
  actions: MediaSessionActions,
): void {
  const artwork = useArtworkBlob(
    playback.active ? (meta.artworkUrl ?? null) : null,
  );
  const actionsRef = useRef(actions);
  const playingRef = useRef(playback.playing);
  useLayoutEffect(() => {
    actionsRef.current = actions;
    playingRef.current = playback.playing;
  });

  useEffect(() => {
    if (!("mediaSession" in navigator) || !playback.active) {
      return;
    }

    const id = ++sessionOwner;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({
      title: meta.title?.trim() || "Untitled",
      artist: meta.artist?.trim() || "",
      artwork: artwork
        ? [{ src: artwork.src, sizes: "512x512", type: artwork.type }]
        : [],
    });
    session.playbackState = playingRef.current ? "playing" : "paused";

    bindAction("play", () => actionsRef.current.play());
    bindAction("pause", () => actionsRef.current.pause());
    bindAction("seekbackward", (details) => {
      actionsRef.current.seekBy(-(details.seekOffset ?? SEEK_SECONDS));
    });
    bindAction("seekforward", (details) => {
      actionsRef.current.seekBy(details.seekOffset ?? SEEK_SECONDS);
    });
    bindAction("seekto", (details) => {
      if (details.seekTime !== undefined && details.seekTime !== null) {
        actionsRef.current.seek(details.seekTime);
      }
    });

    return () => {
      queueMicrotask(() => {
        if (sessionOwner === id) {
          clearSession();
        }
      });
    };
  }, [playback.active, meta.title, meta.artist, artwork]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !playback.active) {
      return;
    }
    navigator.mediaSession.playbackState = playback.playing
      ? "playing"
      : "paused";
  }, [playback.active, playback.playing]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !playback.active) {
      return;
    }
    if (!(playback.duration > 0) || !Number.isFinite(playback.duration)) {
      return;
    }
    try {
      navigator.mediaSession.setPositionState({
        duration: playback.duration,
        playbackRate: playback.rate > 0 ? playback.rate : 1,
        position: Math.min(
          Math.max(0, playback.currentTime),
          playback.duration,
        ),
      });
    } catch {
      /** Chromium rejects position states it considers inconsistent; the next update retries. */
    }
  }, [playback.active, playback.currentTime, playback.duration, playback.rate]);
}
