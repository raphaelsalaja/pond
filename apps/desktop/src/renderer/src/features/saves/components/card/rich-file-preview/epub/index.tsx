import { useEffect, useState } from "react";
import type { LibraryCardView } from "@/features/saves/components/card/types";
import styles from "./styles.module.css";

const epubCache = new Map<
  string,
  Promise<{ bytes: Uint8Array; mimeType: string } | null>
>();

function loadEpubCover(url: string) {
  const existing = epubCache.get(url);
  if (existing) return existing;
  const request = Promise.all([
    fetch(url).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    }),
    import("../epub-cover"),
  ])
    .then(([buffer, module]) => module.extractEpubCover(buffer))
    .catch(() => null);
  epubCache.set(url, request);
  return request;
}

export function EpubCardPreview({
  url,
  title,
  view,
}: {
  url: string;
  title: string | null;
  view?: LibraryCardView;
}) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    void loadEpubCover(url).then((cover) => {
      if (!alive || !cover) return;
      const bytes = new Uint8Array(cover.bytes).buffer;
      objectUrl = URL.createObjectURL(
        new Blob([bytes], { type: cover.mimeType }),
      );
      setCoverUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return (
    <div
      className={styles.epub}
      data-view={view}
      data-loaded={loaded || undefined}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setCoverUrl(null)}
        />
      ) : null}
      {!loaded ? (
        <div className={styles.fallback}>
          <span>EPUB</span>
          <strong>{title || "eBook"}</strong>
          <i />
        </div>
      ) : null}
    </div>
  );
}
