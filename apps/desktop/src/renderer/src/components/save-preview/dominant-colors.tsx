import { Tooltip } from "@pond/ui";
import { Link } from "react-router-dom";
import type { Save } from "@/pool/types";
import styles from "./styles.module.css";

export function DominantColorSwatches({ save }: { save: Save }) {
  const colors = save.dominantColors ?? [];
  if (colors.length === 0) return null;
  return (
    <div className={styles.swatches}>
      {colors.slice(0, 6).map((c) => (
        <Tooltip.Root key={c.hex} content={`Browse other saves near ${c.hex}`}>
          <Link
            to={`/?color=${encodeURIComponent(c.hex.replace(/^#/, ""))}`}
            className={styles.swatch}
            style={{ background: c.hex }}
            aria-label={`Color ${c.hex}`}
          />
        </Tooltip.Root>
      ))}
    </div>
  );
}
