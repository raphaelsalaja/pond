import { ActivityList } from "@/components/activity-list";
import { LibraryChrome, Shell } from "@/components/shell";
import styles from "./styles.module.css";

export function ActivityPage() {
  return (
    <Shell.Main>
      <LibraryChrome />
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Activity</h1>
          <p className={styles.subtitle}>
            Recent changes across the library — saves you've made, tags you've
            renamed, AI suggestions that were applied.
          </p>
        </header>
        <ActivityList.Root saveId={null} limit={200} />
      </div>
    </Shell.Main>
  );
}
