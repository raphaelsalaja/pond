import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

type RootProps = React.ComponentPropsWithoutRef<"div">;

function Root({ className, ...props }: RootProps) {
  return <div className={cn(styles.row, className)} {...props} />;
}

export const ViewMenuRow = {
  Root,
  Label: styles.label,
  Select: styles.select,
};
