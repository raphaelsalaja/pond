import { clsx as cn } from "clsx";
import { Button } from "../button";
import type { ButtonProps } from "../button";
import styles from "./styles.module.css";

type RootProps = React.ComponentPropsWithoutRef<"article">;

function Root({ className, ...props }: RootProps) {
  return <article className={cn(styles.root, className)} {...props} />;
}

type TriggerProps = React.ComponentPropsWithoutRef<"button">;

function Trigger({ className, ...props }: TriggerProps) {
  return (
    <button
      type="button"
      className={cn(styles.trigger, className)}
      {...props}
    />
  );
}

interface MediaProps extends React.ComponentPropsWithoutRef<"span"> {
  size?: "icon" | "thumbnail";
}

function Media({ className, size = "icon", ...props }: MediaProps) {
  return (
    <span className={cn(styles.media, className)} data-size={size} {...props} />
  );
}

type ContentProps = React.ComponentPropsWithoutRef<"span">;

function Content({ className, ...props }: ContentProps) {
  return <span className={cn(styles.content, className)} {...props} />;
}

type TitleProps = React.ComponentPropsWithoutRef<"span">;

function Title({ className, ...props }: TitleProps) {
  return <span className={cn(styles.title, className)} {...props} />;
}

type DescriptionProps = React.ComponentPropsWithoutRef<"span">;

function Description({ className, ...props }: DescriptionProps) {
  return <span className={cn(styles.description, className)} {...props} />;
}

function Action({
  size = "xs",
  variant = "ghost",
  icon = true,
  ...props
}: ButtonProps) {
  return <Button size={size} variant={variant} icon={icon} {...props} />;
}

export const ContentRow = {
  Root,
  Trigger,
  Media,
  Content,
  Title,
  Description,
  Action,
};
