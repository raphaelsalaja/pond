import { Button } from "@pond/ui";
import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

type RootProps = React.ComponentPropsWithoutRef<"div">;

function Root({ className, ...props }: RootProps) {
  return <div className={cn(styles.root, className)} {...props} />;
}

type FieldsProps = React.ComponentPropsWithoutRef<"div">;

function Fields({ className, ...props }: FieldsProps) {
  return <div className={cn(styles.fields, className)} {...props} />;
}

type ValueProps = React.ComponentPropsWithoutRef<"span">;

function Value({ className, ...props }: ValueProps) {
  return <span className={cn(styles.value, className)} {...props} />;
}

type FootProps = React.ComponentPropsWithoutRef<"div">;

function Foot({ className, ...props }: FootProps) {
  return <div className={cn(styles.foot, className)} {...props} />;
}

type DownloadProps = Omit<
  React.ComponentPropsWithoutRef<typeof Button>,
  "children"
>;

function Download({ className, ...props }: DownloadProps) {
  return (
    <Button
      type="button"
      size="md"
      variant="primary"
      className={cn(styles.download, className)}
      {...props}
    >
      Download
    </Button>
  );
}

/** The column beside a preview: what's being saved, where it goes, and Download at the foot. */
export const Summary = { Root, Fields, Value, Foot, Download };
