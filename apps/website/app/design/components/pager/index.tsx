"use client";

import { IconArrowLeft, IconArrowRight } from "@pond/icons";
import { cn } from "@pond/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { neighbors } from "../pages";
import styles from "./styles.module.css";

interface PagerProps extends React.ComponentPropsWithoutRef<"nav"> {}

export function Pager({ className, ...props }: PagerProps) {
  const { previous, next } = neighbors(usePathname());
  if (!previous && !next) return null;

  return (
    <nav aria-label="Pages" className={cn(styles.pager, className)} {...props}>
      {previous ? (
        <Link href={previous.href} scroll={false} className={styles.link}>
          <IconArrowLeft size={16} className={styles.arrow} />
          <span className={styles.text}>
            <span className={styles.direction}>Previous</span>
            <span className={styles.name}>{previous.name}</span>
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={next.href}
          scroll={false}
          className={styles.link}
          data-direction="next"
        >
          <span className={styles.text}>
            <span className={styles.direction}>Next</span>
            <span className={styles.name}>{next.name}</span>
          </span>
          <IconArrowRight size={16} className={styles.arrow} />
        </Link>
      ) : null}
    </nav>
  );
}
