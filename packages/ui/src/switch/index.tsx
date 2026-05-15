import { Switch as Base } from "@base-ui/react/switch";
import { cn } from "../lib/cn";
import styles from "./styles.module.css";

function Root({ className, children, ...props }: Base.Root.Props) {
  return (
    <Base.Root className={cn(styles.root, className)} {...props}>
      {children ?? <Thumb />}
    </Base.Root>
  );
}

function Thumb({ className, ...props }: Base.Thumb.Props) {
  return <Base.Thumb className={cn(styles.thumb, className)} {...props} />;
}

export const Switch = {
  Root,
  Thumb,
};
