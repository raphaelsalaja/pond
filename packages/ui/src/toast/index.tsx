import { Toast as Base } from "@base-ui/react/toast";
import { IconXmarkOutline12 } from "@pond/icons/outline/12";
import { clsx as cn } from "clsx";
import type { ComponentPropsWithoutRef } from "react";
import { Button } from "../button";
import styles from "./styles.module.css";

function Provider(props: Base.Provider.Props) {
  return <Base.Provider {...props} />;
}

function Portal(props: Base.Portal.Props) {
  return <Base.Portal {...props} />;
}

function Viewport({ className, ...props }: Base.Viewport.Props) {
  return (
    <Base.Viewport className={cn(styles.viewport, className)} {...props} />
  );
}

function Root({ className, toast, ...props }: Base.Root.Props) {
  const updateKey = toast.updateKey ?? 0;
  return (
    <Base.Root
      toast={toast}
      swipeDirection={["down", "left", "right"]}
      className={cn(styles.root, className)}
      data-pulse={updateKey > 0 ? (updateKey % 2 === 0 ? "a" : "b") : undefined}
      {...props}
    />
  );
}

function Content({ className, ...props }: Base.Content.Props) {
  return <Base.Content className={cn(styles.content, className)} {...props} />;
}

function Header({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn(styles.header, className)} {...props} />;
}

function Title({ className, ...props }: Base.Title.Props) {
  return <Base.Title className={cn(styles.title, className)} {...props} />;
}

function Description({ className, ...props }: Base.Description.Props) {
  return (
    <Base.Description
      className={cn(styles.description, className)}
      {...props}
    />
  );
}

function Close({ className, ...props }: Base.Close.Props) {
  return (
    <Base.Close
      className={cn(styles.close, className)}
      render={
        <Button icon size="xs" variant="ghost" aria-label="Dismiss">
          <IconXmarkOutline12 />
        </Button>
      }
      {...props}
    />
  );
}

export const Toast = {
  Provider,
  Portal,
  Viewport,
  Root,
  Content,
  Header,
  Title,
  Description,
  Close,
  createToastManager: Base.createToastManager,
  useToastManager: Base.useToastManager,
};
