import { Toolbar as Base } from "@base-ui/react/toolbar";
import { cn } from "../lib/cn";
import styles from "./styles.module.css";

type GroupAlign = "start" | "center" | "end";

interface GroupProps extends React.ComponentProps<"div"> {
  "data-align"?: GroupAlign;
}

function Root({ className, ...props }: Base.Root.Props) {
  return <Base.Root className={cn(styles.root, className)} {...props} />;
}

function Separator({ className, ...props }: Base.Separator.Props) {
  return (
    <Base.Separator className={cn(styles.separator, className)} {...props} />
  );
}

function Group({ className, ...props }: GroupProps) {
  return <div className={cn(styles.group, className)} {...props} />;
}

export const Toolbar = {
  Root,
  Separator,
  Group,
};
