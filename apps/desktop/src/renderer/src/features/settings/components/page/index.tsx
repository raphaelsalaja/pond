import { Outlet, useParams } from "@tanstack/react-router";
import styles from "./styles.module.css";

export function SettingsPage() {
  const { section } = useParams({ strict: false });
  return (
    <div key={section} className={styles.page} data-scroll-fade="vertical">
      <Outlet />
    </div>
  );
}
