import { Switch as Base } from "@base-ui/react/switch";
import { forwardRef } from "react";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentProps<typeof Base.Root> {}

const Root = forwardRef<HTMLButtonElement, RootProps>(function SwitchRoot(
  { className, children, ...props },
  ref,
) {
  return (
    <Base.Root
      ref={ref}
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    >
      {children ?? <Thumb />}
    </Base.Root>
  );
});

interface ThumbProps extends React.ComponentProps<typeof Base.Thumb> {}

function Thumb({ className, ...props }: ThumbProps) {
  return (
    <Base.Thumb
      className={[styles.thumb, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export const Switch = {
  Root,
  Thumb,
};
