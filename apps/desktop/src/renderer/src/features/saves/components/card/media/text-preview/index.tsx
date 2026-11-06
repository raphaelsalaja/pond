import styles from "./styles.module.css";

export function TextPreview({ children }: { children: string }) {
  return (
    <div className={styles["text-preview"]} aria-hidden>
      <span className={styles.body}>{children}</span>
    </div>
  );
}
