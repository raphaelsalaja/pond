import { clsx as cn } from "clsx";
import { Frame } from "../frame";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithoutRef<"header"> {
  layout?: "stack" | "split" | "center";
}

function Root({ className, layout = "stack", ...props }: RootProps) {
  return (
    <header
      className={cn(styles.root, className)}
      data-layout={layout}
      {...props}
    />
  );
}

function Label({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Frame.Label>) {
  return <Frame.Label className={cn(styles.label, className)} {...props} />;
}

interface TitleProps extends React.ComponentPropsWithoutRef<"h2"> {}

function Title({ className, ...props }: TitleProps) {
  return <h2 className={cn(styles.title, className)} {...props} />;
}

interface LedeProps extends React.ComponentPropsWithoutRef<"p"> {}

function Lede({ className, ...props }: LedeProps) {
  return <p className={cn(styles.lede, className)} {...props} />;
}

export const Heading = { Root, Label, Title, Lede };
