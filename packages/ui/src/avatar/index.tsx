import { Avatar as Base } from "@base-ui/react/avatar";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithoutRef<"span"> {}

function Root({ className, ...props }: RootProps) {
  return (
    <Base.Root
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface ImageProps extends React.ComponentPropsWithoutRef<"img"> {}

function Image({ className, alt = "", ...props }: ImageProps) {
  return (
    <Base.Image
      alt={alt}
      className={[styles.image, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface FallbackProps extends React.ComponentPropsWithoutRef<"span"> {}

function Fallback({ className, ...props }: FallbackProps) {
  return (
    <Base.Fallback
      className={[styles.fallback, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export const Avatar = {
  Root,
  Image,
  Fallback,
};
