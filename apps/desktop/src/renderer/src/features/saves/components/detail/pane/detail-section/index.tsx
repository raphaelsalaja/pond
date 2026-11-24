import { clsx as cn } from "clsx";
import { useId } from "react";
import styles from "./styles.module.css";

interface DetailSectionProps
  extends Omit<React.ComponentPropsWithoutRef<"section">, "title"> {
  title: string;
  action?: React.ReactNode;
}

export function DetailSection({
  title,
  action,
  className,
  children,
  ...props
}: DetailSectionProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(styles.root, className)}
      data-action={action ? "" : undefined}
      {...props}
    >
      <div className={styles.header}>
        <h3 id={id} className={styles.title}>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}
