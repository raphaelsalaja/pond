import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithoutRef<"span"> {}

function Root({ className, ...props }: RootProps) {
  return <span className={cn(styles.root, className)} {...props} />;
}

export const Shimmer = { Root };
