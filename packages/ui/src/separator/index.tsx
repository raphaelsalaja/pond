import { Separator as Base } from "@base-ui/react/separator";
import { cn } from "../lib/cn";
import styles from "./styles.module.css";

function Root({ className, ...props }: Base.Props) {
  return <Base className={cn(styles.root, className)} {...props} />;
}

export const Separator = {
  Root,
};
