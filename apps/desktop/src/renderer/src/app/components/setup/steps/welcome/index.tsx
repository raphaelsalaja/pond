import { IconAlbum2 } from "@pond/icons";
import { Logo } from "@pond/ui";
import { formatPlural } from "@/shared/lib/format";
import type { StepProps } from "../../model";
import styles from "./styles.module.css";

export function Mark() {
  return <Logo size={36} className={styles.mark} aria-hidden />;
}

export function Owner({ profile, library }: StepProps) {
  if (profile === "new") return null;
  return (
    <p className={styles.owner}>
      <IconAlbum2 size={14} aria-hidden />
      <span className={styles.name}>{library.name}</span>
      <span className={styles.meta}>
        {formatPlural(library.saves, { one: "Save", other: "Saves" })}
      </span>
    </p>
  );
}
