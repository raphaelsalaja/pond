import { cn } from "@pond/ui";
import styles from "./styles.module.css";

type EmptyStateTone = "default" | "page" | "inline";

interface RootProps extends React.ComponentPropsWithoutRef<"div"> {
  "data-tone"?: EmptyStateTone;
}

function Root({ className, ...props }: RootProps) {
  return (
    <div role="status" className={cn(styles.root, className)} {...props} />
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

interface ActionsProps extends React.ComponentPropsWithoutRef<"div"> {}

function Actions({ className, ...props }: ActionsProps) {
  return <div className={cn(styles.actions, className)} {...props} />;
}

export const EmptyState = {
  Root,
  Title,
  Description,
  Actions,
};
