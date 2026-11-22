import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithoutRef<"div"> {
  align?: "start";
  size?: "card" | "inline";
}

function Root({ className, align, size, ...props }: RootProps) {
  return (
    <div
      className={cn(styles.root, className)}
      data-align={align || undefined}
      data-size={size || undefined}
      {...props}
    />
  );
}

interface MediaProps extends React.ComponentPropsWithoutRef<"div"> {}

function Media({ className, ...props }: MediaProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(styles.media, className)}
      {...props}
    />
  );
}

interface TitleProps extends React.ComponentPropsWithoutRef<"h2"> {}

function Title({ className, ...props }: TitleProps) {
  return <h2 className={cn(styles.title, className)} {...props} />;
}

interface DescriptionProps extends React.ComponentPropsWithoutRef<"p"> {}

function Description({ className, ...props }: DescriptionProps) {
  return <p className={cn(styles.description, className)} {...props} />;
}

interface ActionProps extends React.ComponentPropsWithoutRef<"div"> {}

function Action({ className, ...props }: ActionProps) {
  return <div className={cn(styles.action, className)} {...props} />;
}

export const Empty = { Root, Media, Title, Description, Action };
