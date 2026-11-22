import { IconXmark } from "@pond/icons";
import { clsx as cn } from "clsx";
import { Button, type ButtonProps } from "../button";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithoutRef<"section"> {}

function Root({ className, ...props }: RootProps) {
  return <section className={cn(styles.root, className)} {...props} />;
}

interface HeaderProps extends React.ComponentPropsWithoutRef<"div"> {}

function Header({ className, ...props }: HeaderProps) {
  return <div className={cn(styles.header, className)} {...props} />;
}

interface TitleProps extends React.ComponentPropsWithoutRef<"h3"> {}

function Title({ className, ...props }: TitleProps) {
  return <h3 className={cn(styles.title, className)} {...props} />;
}

interface DescriptionProps extends React.ComponentPropsWithoutRef<"p"> {}

function Description({ className, ...props }: DescriptionProps) {
  return <p className={cn(styles.description, className)} {...props} />;
}

interface CloseProps extends Omit<ButtonProps, "children"> {
  "aria-label"?: string;
}

function Close({
  className,
  "aria-label": label = "Dismiss",
  ...props
}: CloseProps) {
  return (
    <Button
      icon
      size="xs"
      variant="ghost"
      aria-label={label}
      className={cn(styles.close, className)}
      {...props}
    >
      <IconXmark size={12} />
    </Button>
  );
}

function Action({ className, ...props }: ButtonProps) {
  return (
    <Button
      variant="secondary"
      width="full"
      className={cn(styles.action, className)}
      {...props}
    />
  );
}

export const Callout = { Root, Header, Title, Description, Close, Action };
