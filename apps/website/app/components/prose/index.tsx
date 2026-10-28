import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

interface ProseProps extends React.ComponentPropsWithoutRef<"div"> {}

export function Prose({ className, ...props }: ProseProps) {
  return <div className={cn(styles.prose, className)} {...props} />;
}
