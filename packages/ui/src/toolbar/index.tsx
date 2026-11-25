import { Toolbar as Base } from "@base-ui/react/toolbar";
import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

function Root({ className, ...props }: Base.Root.Props) {
  return <Base.Root className={cn(styles.root, className)} {...props} />;
}

type RowProps = React.ComponentPropsWithoutRef<"div">;

function Row({ className, ...props }: RowProps) {
  return <div className={cn(styles.row, className)} {...props} />;
}

interface GroupProps extends Base.Group.Props {
  fill?: boolean;
  align?: "start" | "end";
}

function Group({ fill, className, align = "start", ...props }: GroupProps) {
  return (
    <Base.Group
      data-fill={fill || undefined}
      data-align={align}
      className={cn(styles.group, className)}
      {...props}
    />
  );
}

function Separator({ className, ...props }: Base.Separator.Props) {
  return (
    <Base.Separator className={cn(styles.separator, className)} {...props} />
  );
}

export const Toolbar = {
  Root,
  Row,
  Group,
  Separator,
  Button: Base.Button,
  Input: Base.Input,
  Link: Base.Link,
};
