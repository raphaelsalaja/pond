import { Button, type ButtonProps, Checkbox } from "@pond/ui";
import { clsx as cn } from "clsx";
import React, { memo, type ReactNode } from "react";
import type { SaveCardOverlayModel } from "@/features/saves/components/card/model";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithRef<"li"> {
  selected?: boolean;
  multi?: boolean;
  dimmed?: boolean;
  /** Native dragstart under a non-colliding name: Motion wrappers consume `onDragStart` as their pan-gesture prop. */
  onNativeDragStart?: React.DragEventHandler<HTMLLIElement>;
  onNativeDragEnd?: React.DragEventHandler<HTMLLIElement>;
}

function Root({
  selected,
  multi,
  dimmed,
  className,
  onNativeDragStart,
  onNativeDragEnd,
  ...props
}: RootProps) {
  return (
    <li
      className={cn(styles.item, className)}
      data-selected={selected ? "true" : undefined}
      data-multi={multi ? "true" : undefined}
      data-dimmed={dimmed ? "true" : undefined}
      onDragStart={onNativeDragStart}
      onDragEnd={onNativeDragEnd}
      {...props}
    />
  );
}

function Select({
  className,
  ...props
}: Omit<ButtonProps, "variant" | "width">) {
  return (
    <Button
      variant="bare"
      width="full"
      className={cn(styles.select, className)}
      {...props}
    />
  );
}

type PickProps = Omit<
  React.ComponentProps<typeof Checkbox.Root>,
  "variant" | "tabIndex" | "onPointerDown" | "onMouseDown" | "onDoubleClick"
>;

function stopPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}

/** Cancelling mousedown keeps the circle from starting a Save drag or taking focus from the listbox. */
function cancelPress(event: React.MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

/** Pointer-only: the keyboard selects through the listbox, so the circle never takes a tab stop. */
function Pick({ className, onClick, ...props }: PickProps) {
  return (
    <Checkbox.Root
      variant="media"
      tabIndex={-1}
      aria-hidden
      className={cn(styles.pick, className)}
      onPointerDown={stopPropagation}
      onMouseDown={cancelPress}
      onDoubleClick={stopPropagation}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      {...props}
    >
      <Checkbox.Indicator />
    </Checkbox.Root>
  );
}

function Media({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return <div className={cn(styles.media, className)} {...props} />;
}

function Frame({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return <div className={cn(styles.frame, className)} {...props} />;
}

interface MetaProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  title?: ReactNode;
  time?: ReactNode;
}

function Meta({ title, time, className, ...props }: MetaProps) {
  if (title == null && time == null) return null;
  return (
    <div className={cn(styles.meta, className)} {...props}>
      {title != null ? <span className={styles.title}>{title}</span> : null}
      {time != null ? <span className={styles.time}>{time}</span> : null}
    </div>
  );
}

function Type({ className, ...props }: React.ComponentPropsWithoutRef<"span">) {
  return <span className={cn(styles.type, className)} {...props} />;
}

function Source({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"span">) {
  return <span className={cn(styles.source, className)} {...props} />;
}

interface CountProps extends React.ComponentPropsWithoutRef<"span"> {}

function Count({ className, role, ...props }: CountProps) {
  return (
    <span
      role={role ?? "status"}
      className={cn(styles.count, className)}
      {...props}
    />
  );
}

const Overlay = memo(function Overlay({
  model,
}: {
  model: SaveCardOverlayModel;
}) {
  const SourceIcon = model.source?.icon ?? null;

  return (
    <div className={styles.overlay}>
      {model.type ? (
        <Type
          data-kind={model.type.kind}
          aria-label={`Type: ${model.type.label}`}
        >
          {model.type.label}
        </Type>
      ) : null}
      {model.source ? (
        <Source
          aria-label={`Saved from ${model.source.label}`}
          title={`Saved from ${model.source.label}`}
        >
          {model.source.logo ? (
            <img src={model.source.logo} alt="" width={18} height={18} />
          ) : SourceIcon ? (
            <SourceIcon width={18} height={18} />
          ) : (
            model.source.label
          )}
        </Source>
      ) : null}
      {model.fileCount ? (
        <Count aria-label={`${model.fileCount} media files`}>
          {model.fileCount}
        </Count>
      ) : null}
    </div>
  );
});

export const Card = Object.assign(Root, {
  Root,
  Select,
  Pick,
  Media,
  Frame,
  Meta,
  Type,
  Source,
  Count,
  Overlay,
});
