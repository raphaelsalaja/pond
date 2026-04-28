import { Avatar as Base } from "@base-ui-components/react/avatar";
import type { ReactNode } from "react";
import styles from "./avatar.module.css";

interface AvatarProps {
  src?: string;
  alt?: string;
  /** Fallback content when the image fails / is missing (initials, icon). */
  fallback?: ReactNode;
  size?: number;
  className?: string;
}

/**
 * Round avatar with a graceful fallback. The fallback only paints
 * after the image fails to load (or when no `src` is provided).
 */
export function Avatar({
  src,
  alt = "",
  fallback,
  size = 40,
  className,
}: AvatarProps) {
  return (
    <Base.Root
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
    >
      {src ? <Base.Image src={src} alt={alt} className={styles.image} /> : null}
      <Base.Fallback className={styles.fallback}>{fallback}</Base.Fallback>
    </Base.Root>
  );
}
