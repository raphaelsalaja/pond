import type { SearchCardData } from "@shared/search-card";
import styles from "./styles.module.css";

export function SearchCard({
  data,
  scheme,
}: {
  data: SearchCardData;
  scheme: "light" | "dark";
}) {
  return (
    <div className={styles.card} data-scheme={scheme}>
      <div className={styles.engine}>
        {data.iconUrl ? (
          <img className={styles.icon} src={data.iconUrl} alt="" />
        ) : null}
        <span>{data.engine}</span>
      </div>
      <p className={styles.query}>{data.query}</p>
    </div>
  );
}
