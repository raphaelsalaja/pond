import { Link } from "react-router-dom";
import { Card } from "@/components/card-thumb";
import { useSimilarSaves } from "@/pool/search";
import type { Save } from "@/pool/types";
import styles from "./styles.module.css";

export function RelatedSaves({ save }: { save: Save }) {
  const related = useSimilarSaves(save.id);
  if (!related || related.length === 0) return null;
  const items = related.filter((r) => r.id !== save.id).slice(0, 6);
  if (items.length === 0) return null;
  return (
    <div className={styles.actions}>
      <h3 className={styles["timestamps-title"]}>Related</h3>
      <div className={styles["related-rail"]}>
        {items.map((r) => (
          <Link
            key={r.id}
            to={`/save/${r.id}`}
            className={styles["related-tile"]}
          >
            <span className={styles["related-thumb"]}>
              <Card.Root save={r}>
                <Card.Media />
                <Card.DownloadingBadge />
              </Card.Root>
            </span>
            <span className={styles["related-label"]}>{r.title ?? r.url}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
