import { useEffect, useMemo, useState } from "react";
import type { LibraryCardView } from "@/features/saves/components/card/types";
import styles from "./styles.module.css";

export function FontCardPreview({
  url,
  saveId,
  view,
}: {
  url: string;
  saveId: string;
  view?: LibraryCardView;
}) {
  const family = useMemo(
    () => `pond-card-${saveId.replaceAll(/[^a-zA-Z0-9_-]/g, "")}`,
    [saveId],
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const face = new FontFace(family, `url(${JSON.stringify(url)})`);
    void face
      .load()
      .then((font) => {
        if (!alive) {
          return;
        }
        document.fonts.add(font);
        setLoaded(true);
      })
      .catch(() => setLoaded(false));
    return () => {
      alive = false;
      document.fonts.delete(face);
    };
  }, [family, url]);

  const style: React.CSSProperties & { "--card-font": string } = {
    "--card-font": loaded ? JSON.stringify(family) : "inherit",
  };
  return (
    <div
      className={styles.font}
      style={style}
      data-view={view}
      data-loaded={loaded || undefined}
    >
      <span>ABCDEFG</span>
      <span>abcdefg</span>
      <span>0123456</span>
    </div>
  );
}
