import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

type DivProps = React.ComponentPropsWithoutRef<"div">;

function Root({ className, children, ...props }: DivProps) {
  return (
    <div className={cn(styles.root, className)} {...props}>
      <div className={styles.layout}>{children}</div>
    </div>
  );
}

function Main({ className, ...props }: DivProps) {
  return <div className={cn(styles.main, className)} {...props} />;
}

function Side({ className, ...props }: DivProps) {
  return <div className={cn(styles.side, className)} {...props} />;
}

/** The single-link pages: the link and preview on the left, options and Download on the right. */
export const Columns = { Root, Main, Side };
