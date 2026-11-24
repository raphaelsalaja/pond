import { Empty, Loader } from "@pond/ui";
import styles from "./styles.module.css";

export function SourcesLoading() {
  return (
    <Empty.Root
      className={styles.root}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Empty.Media>
        <Loader.Spinner />
      </Empty.Media>
      <Empty.Title>Loading Sources</Empty.Title>
    </Empty.Root>
  );
}
