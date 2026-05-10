import { Separator as Base } from "@base-ui/react/separator";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentProps<typeof Base> {}

function Root({ className, ...props }: RootProps) {
  return (
    <Base
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export const Separator = {
  Root,
};
