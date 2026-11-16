import { Button } from "@pond/ui";
import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithoutRef<"div"> {}

function Root({ className, ...props }: RootProps) {
  return <div className={cn(styles.root, className)} {...props} />;
}

interface FieldsProps extends React.ComponentPropsWithoutRef<"div"> {}

function Fields({ className, ...props }: FieldsProps) {
  return <div className={cn(styles.fields, className)} {...props} />;
}

interface ValueProps extends React.ComponentPropsWithoutRef<"span"> {}

function Value({ className, ...props }: ValueProps) {
  return <span className={cn(styles.value, className)} {...props} />;
}

interface FootProps extends React.ComponentPropsWithoutRef<"div"> {}

function Foot({ className, ...props }: FootProps) {
  return <div className={cn(styles.foot, className)} {...props} />;
}

interface DownloadProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Button>, "children"> {}

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
