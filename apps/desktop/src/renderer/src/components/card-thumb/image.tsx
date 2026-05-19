import { useEffect, useRef, useState } from "react";
import { recordAspect } from "@/pages/saves-view/aspect";
import { useCardContext } from "./context";
import styles from "./styles.module.css";

export function Image() {
  const { state } = useCardContext();
  if (!state.unit || state.unit.isVideo || state.isBroken) return null;
  return <ImageInner key={state.unit.url} />;
}

function ImageInner() {
  const { state, actions } = useCardContext();
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  const url = state.unit?.url ?? "";
  const file = state.save.files.find((f) => f.path === state.unit?.key);
  const w = file?.width ?? state.save.width ?? undefined;
  const h = file?.height ?? state.save.height ?? undefined;

  useEffect(() => {
    const img = ref.current;
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) {
      recordAspect(state.save.id, img.naturalWidth, img.naturalHeight);
      setLoaded(true);
    }
  }, [state.save.id]);

  return (
    <img
      ref={ref}
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      // Grid thumbs are background work — never starve the foreground
      // detail image or first-paint hero by competing on the same
      // connection.
      fetchPriority="low"
      width={w}
      height={h}
      className={styles.media}
      data-loaded={loaded ? "true" : "false"}
      onLoad={(e) => {
        const img = e.currentTarget;
        recordAspect(state.save.id, img.naturalWidth, img.naturalHeight);
        setLoaded(true);
      }}
      onError={() => actions.setBroken(true)}
    />
  );
}
