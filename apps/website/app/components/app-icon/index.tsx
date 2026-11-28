import { Logo } from "@pond/ui/logo";
import styles from "./styles.module.css";

/** Pond's app icon: the logo on its green tile, as in the favicon. */
export function AppIcon({ size = 44 }: { size?: number }) {
  return (
    <span className={styles.root} style={{ width: size, height: size }}>
      <Logo size={size * 0.62} aria-hidden />
    </span>
  );
}
