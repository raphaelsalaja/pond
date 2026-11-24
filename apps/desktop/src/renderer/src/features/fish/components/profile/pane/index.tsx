import { IconXmark } from "@pond/icons";
import { Button, Pane } from "@pond/ui";
import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

interface HeaderProps
  extends Omit<React.ComponentPropsWithoutRef<"header">, "title"> {
  title?: React.ReactNode;
  onClose: () => void;
}

function Header({ title = null, onClose, className, ...props }: HeaderProps) {
  return (
    <Pane.Header
      className={cn(styles.header, className)}
      title={title}
      {...props}
    >
      <Button
        icon
        size="sm"
        variant="ghost"
        aria-label="Close Details"
        onClick={onClose}
      >
        <IconXmark />
      </Button>
    </Pane.Header>
  );
}

interface BodyProps extends React.ComponentPropsWithoutRef<"div"> {}

function Body({ className, ...props }: BodyProps) {
  return (
    <Pane.Body
      className={cn(styles.body, className)}
      data-scroll-fade="vertical"
      {...props}
    />
  );
}

export const FishPane = { Header, Body };
