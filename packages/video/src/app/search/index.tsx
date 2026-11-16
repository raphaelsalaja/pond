import { IconBarsFilter, IconSliders } from "@pond/icons";
import { Button } from "@pond/ui/button";
import styles from "./styles.module.css";

/** The 2.0 library search bar that sits over the grid. */
export function Search({ query = "" }: { query?: string }) {
  return (
    <div className={styles.search}>
      <span className={styles.field} data-empty={!query || undefined}>
        {query || "Search…"}
      </span>
      <span className={styles.actions}>
        <Button icon size="sm" variant="ghost" aria-label="Filter">
          <IconBarsFilter />
        </Button>
        <Button icon size="sm" variant="ghost" aria-label="View">
          <IconSliders />
        </Button>
      </span>
    </div>
  );
}
