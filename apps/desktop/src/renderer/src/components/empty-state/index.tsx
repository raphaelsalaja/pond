import styles from "./styles.module.css";

type EmptyStateTone = "default" | "page" | "inline";

interface RootProps extends React.ComponentPropsWithoutRef<"div"> {
  "data-tone"?: EmptyStateTone;
}

function Root({ className, ...props }: RootProps) {
  return (
    <div
      role="status"
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface TitleProps extends React.ComponentPropsWithoutRef<"h2"> {}

function Title({ className, ...props }: TitleProps) {
  return (
    <h2
      className={[styles.title, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface DescriptionProps extends React.ComponentPropsWithoutRef<"p"> {}

function Description({ className, ...props }: DescriptionProps) {
  return (
    <p
      className={[styles.description, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

interface ActionsProps extends React.ComponentPropsWithoutRef<"div"> {}

function Actions({ className, ...props }: ActionsProps) {
  return (
    <div
      className={[styles.actions, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export const EmptyState = {
  Root,
  Title,
  Description,
  Actions,
};
