import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithoutRef<"span"> {
  tone?: "accent" | "neutral";
}

function Root({ className, tone = "accent", ...props }: RootProps) {
  return (
    <span className={cn(styles.root, className)} data-tone={tone} {...props} />
  );
}

export const Shimmer = { Root };
