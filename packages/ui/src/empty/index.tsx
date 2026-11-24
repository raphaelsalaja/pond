import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

export { EmptyPreview } from "./preview";

interface RootProps extends React.ComponentPropsWithoutRef<"div"> {
  align?: "start";
  size?: "card" | "inline";
  variant?: "dashed";
}

function Root({
  className,
  align,
  size,
  variant,
  children,
  ...props
}: RootProps) {
  return (
    <div
      className={cn(styles.root, className)}
      data-align={align || undefined}
      data-size={size || undefined}
      data-variant={variant || undefined}
      {...props}
    >
      {variant === "dashed" ? (
        <svg aria-hidden="true" className={styles.frame}>
          <rect />
        </svg>
      ) : null}
      {children}
    </div>
  );
}

type MediaProps = React.ComponentPropsWithoutRef<"div">;

function Media({ className, ...props }: MediaProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(styles.media, className)}
      {...props}
    />
  );
}

type TitleProps = React.ComponentPropsWithoutRef<"h2">;

function Title({ className, ...props }: TitleProps) {
  return <h2 className={cn(styles.title, className)} {...props} />;
}

type DescriptionProps = React.ComponentPropsWithoutRef<"p">;

function Description({ className, ...props }: DescriptionProps) {
  return <p className={cn(styles.description, className)} {...props} />;
}

type ActionProps = React.ComponentPropsWithoutRef<"div">;

function Action({ className, ...props }: ActionProps) {
  return <div className={cn(styles.action, className)} {...props} />;
}

export const Empty = { Root, Media, Title, Description, Action };
