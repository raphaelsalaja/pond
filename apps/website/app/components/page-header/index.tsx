import { clsx as cn } from "clsx";
import { Frame } from "../frame";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithoutRef<"section"> {}

function Root({ className, children, ...props }: RootProps) {
  return (
    <Frame.Section spacing="lg" className={className} {...props}>
      <div className={styles.inner}>{children}</div>
    </Frame.Section>
  );
}

function Label({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Frame.Label>) {
  return <Frame.Label className={cn(styles.label, className)} {...props} />;
}

interface TitleProps extends React.ComponentPropsWithoutRef<"h1"> {}

function Title({ className, ...props }: TitleProps) {
  return <h1 className={cn(styles.title, className)} {...props} />;
}

interface LedeProps extends React.ComponentPropsWithoutRef<"p"> {}

function Lede({ className, ...props }: LedeProps) {
  return <p className={cn(styles.lede, className)} {...props} />;
}

interface ActionsProps extends React.ComponentPropsWithoutRef<"div"> {}

function Actions({ className, ...props }: ActionsProps) {
  return <div className={cn(styles.actions, className)} {...props} />;
}

export const PageHeader = {
  Root,
  Label,
  Title,
  Lede,
  Actions,
};
