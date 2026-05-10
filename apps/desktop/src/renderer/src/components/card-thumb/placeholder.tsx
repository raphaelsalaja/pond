import { useCardContext } from "./context";
import styles from "./styles.module.css";
import { isTextOnlyTweet } from "./tweet";

export function Placeholder() {
  const { state } = useCardContext();
  if (state.unit && !state.isBroken) return null;
  if (isTextOnlyTweet(state.save)) return null;
  const blur = state.save.blurDataUrl ?? null;
  const tint = state.save.dominantColors?.[0]?.hex;
  if (blur) {
    return (
      <span className={styles["backdrop-blur"]} aria-hidden>
        <img src={blur} alt="" decoding="sync" />
      </span>
    );
  }
  return (
    <div
      className={styles.placeholder}
      style={tint ? { background: tint } : undefined}
      aria-hidden
    />
  );
}
