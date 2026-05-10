import { Toolbar as Base } from "@base-ui/react/toolbar";
import { Button } from "../button";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentProps<typeof Base.Root> {}

function Root({ className, ...props }: RootProps) {
  return (
    <Base.Root
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface ButtonProps extends React.ComponentPropsWithoutRef<"button"> {
  "data-variant"?: "default" | "ghost" | "primary" | "danger";
  "data-size"?: "sm" | "md" | "lg";
}

function ToolbarButtonImpl({ ...props }: ButtonProps) {
  return <Base.Button render={<Button variant="ghost" {...props} />} />;
}

interface SeparatorProps extends React.ComponentProps<typeof Base.Separator> {}

function Separator({ className, ...props }: SeparatorProps) {
  return (
    <Base.Separator
      className={[styles.separator, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

type GroupAlign = "start" | "center" | "end";

interface GroupProps extends React.ComponentPropsWithoutRef<"div"> {
  "data-align"?: GroupAlign;
}

function Group({ className, ...props }: GroupProps) {
  return (
    <div
      className={[styles.group, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export const Toolbar = {
  Root,
  Button: ToolbarButtonImpl,
  Separator,
  Group,
};
