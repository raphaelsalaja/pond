import styles from "./styles.module.css";

interface InlineRowProps extends React.ComponentPropsWithoutRef<"div"> {}

export function InlineRow({ className, ...props }: InlineRowProps) {
  return (
    <div
      className={[styles["inline-row"], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
