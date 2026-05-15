import { Avatar as Base } from "@base-ui/react/avatar";
import { cn } from "../lib/cn";
import styles from "./styles.module.css";

function Root({ className, ...props }: Base.Root.Props) {
  return <Base.Root className={cn(styles.root, className)} {...props} />;
}

function Image({ className, alt = "", ...props }: Base.Image.Props) {
  return (
    <Base.Image alt={alt} className={cn(styles.image, className)} {...props} />
  );
}

function Fallback({ className, ...props }: Base.Fallback.Props) {
  return (
    <Base.Fallback className={cn(styles.fallback, className)} {...props} />
  );
}

export const Avatar = {
  Root,
  Image,
  Fallback,
};
