import { clsx as cn } from "clsx";
import { forwardRef } from "react";
import styles from "./styles.module.css";

type ListProps = React.ComponentPropsWithoutRef<"div">;

export const List = forwardRef<HTMLDivElement, ListProps>(function List(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn(styles.list, className)} {...props} />;
});

type CardProps = React.ComponentPropsWithoutRef<"div">;

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn(styles.card, className)} {...props} />;
});

type CardTitleProps = React.ComponentPropsWithoutRef<"h3">;

export function CardTitle({ className, ...props }: CardTitleProps) {
  return <h3 className={cn(styles["card-title"], className)} {...props} />;
}

type CardDescriptionProps = React.ComponentPropsWithoutRef<"p">;

export function CardDescription({ className, ...props }: CardDescriptionProps) {
  return <p className={cn(styles["card-description"], className)} {...props} />;
}

type CardActionProps = React.ComponentPropsWithoutRef<"div">;

export function CardAction({ className, ...props }: CardActionProps) {
  return <div className={cn(styles["card-action"], className)} {...props} />;
}

type CardContentProps = React.ComponentPropsWithoutRef<"div">;

export function CardContent({ className, ...props }: CardContentProps) {
  return <div className={cn(styles["card-content"], className)} {...props} />;
}

type CardFooterProps = React.ComponentPropsWithoutRef<"div">;

export function CardFooter({ className, ...props }: CardFooterProps) {
  return <div className={cn(styles["card-footer"], className)} {...props} />;
}
