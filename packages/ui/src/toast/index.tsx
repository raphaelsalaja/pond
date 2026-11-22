import { Toast as Base } from "@base-ui/react/toast";
import {
  IconCircleCheckFill,
  IconCircleXmarkFill,
  IconXmark,
} from "@pond/icons";
import { clsx as cn } from "clsx";
import type { ComponentPropsWithoutRef } from "react";
import { Button } from "../button";
import { Loader } from "../loader";
import { Swap } from "../swap";
import styles from "./styles.module.css";

function Provider(props: Base.Provider.Props) {
  return <Base.Provider {...props} />;
}

function Portal(props: Base.Portal.Props) {
  return <Base.Portal {...props} />;
}

function Viewport({ className, ...props }: Base.Viewport.Props) {
  return (
    <Base.Viewport
      className={cn(styles.viewport, className)}
      data-slot="toasts"
      {...props}
    />
  );
}

function Root({ className, toast, ...props }: Base.Root.Props) {
  const updateKey = toast.updateKey ?? 0;
  const hasProgress = Boolean(toast.data?.progress);
  const pulse = updateKey > 0 && !hasProgress;
  return (
    <Base.Root
      toast={toast}
      swipeDirection={["down", "left", "right"]}
      className={cn(styles.root, className)}
      data-pulse={pulse ? (updateKey % 2 === 0 ? "a" : "b") : undefined}
      data-progress={hasProgress || undefined}
      {...props}
    />
  );
}

interface IconProps extends ComponentPropsWithoutRef<"span"> {
  tone?: "neutral" | "accent" | "gold";
}

function Icon({ className, tone = "neutral", ...props }: IconProps) {
  return (
    <span
      className={cn(styles.icon, className)}
      data-tone={tone}
      aria-hidden="true"
      {...props}
    />
  );
}

interface StatusProps extends ComponentPropsWithoutRef<"span"> {
  status: "loading" | "success" | "error";
}

/** Sits in `Icon`; the spinner morphs into the result when the toast updates. */
function Status({ status, className, ...props }: StatusProps) {
  return (
    <Swap
      value={status}
      className={cn(styles.status, className)}
      data-status={status}
      {...props}
    >
      {status === "loading" ? (
        <Loader.Spinner />
      ) : status === "success" ? (
        <IconCircleCheckFill size={16} />
      ) : (
        <IconCircleXmarkFill size={16} />
      )}
    </Swap>
  );
}

function Actions({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn(styles.actions, className)} {...props} />;
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

function Progress({
  className,
  ...props
}: ComponentPropsWithoutRef<"progress">) {
  return <progress className={cn(styles.progress, className)} {...props} />;
}

function Meta({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return <span className={cn(styles.meta, className)} {...props} />;
}

function Action({ className, ...props }: Base.Action.Props) {
  return (
    <Base.Action
      className={className}
      render={<Button size="sm" variant="secondary" />}
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
          <IconXmark size={16} />
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
  Icon,
  Status,
  Header,
  Title,
  Description,
  Progress,
  Meta,
  Action,
  Actions,
  Close,
  createToastManager: Base.createToastManager,
  useToastManager: Base.useToastManager,
};
