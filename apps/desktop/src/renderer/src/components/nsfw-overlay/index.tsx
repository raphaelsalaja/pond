import type { MouseEventHandler } from "react";
import styles from "./styles.module.css";

export function NsfwOverlay({
  onReveal,
  size = "md",
  label = "Sensitive · Click to reveal",
}: {
  onReveal: () => void;
  size?: "sm" | "md";
  label?: string;
}) {
  const onClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation();
    e.preventDefault();
    onReveal();
  };
  return (
    <button
      type="button"
      className={styles.overlay}
      data-size={size}
      onClick={onClick}
      aria-label={label}
    >
      <span className={styles.pill}>
        <span className={styles.dot} aria-hidden />
        {label}
      </span>
    </button>
  );
}
