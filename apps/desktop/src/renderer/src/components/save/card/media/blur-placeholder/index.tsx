import { CARD_LQIP_WIDTH } from "@/components/save/card/media/lib/constants";
import { withThumbWidth } from "@/lib/media/url";
import styles from "./styles.module.css";

/** A pre-indexed local derivative that fills the decode gap without touching the final image. */
export function BlurPlaceholder({
  src,
  loaded,
}: {
  src: string;
  loaded: boolean;
}) {
  return (
    <div
      className={styles.frame}
      data-hidden={loaded ? "true" : undefined}
      aria-hidden
    >
      <img
        src={withThumbWidth(src, CARD_LQIP_WIDTH)}
        alt=""
        loading="eager"
        decoding="async"
        fetchPriority="auto"
        draggable={false}
        className={styles.media}
      />
    </div>
  );
}
