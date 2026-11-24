import { Chip } from "@pond/ui";
import { clsx as cn } from "clsx";
import type { ComponentProps, ReactNode } from "react";
import { libraryHeader } from "@/features/library/state/library-header";
import type { FilterLayout } from "../layout";
import styles from "./styles.module.css";

type FilterChipProps = Omit<
  ComponentProps<typeof Chip.Filter>,
  "onOpenChange"
> & { onOpen?: () => void };

export function FilterChip({ onOpen, ...props }: FilterChipProps) {
  return (
    <Chip.Filter
      onOpenChange={(open) => {
        if (!open) {
          return;
        }
        libraryHeader.closePopover();
        onOpen?.();
      }}
      {...props}
    />
  );
}

export function FilterIcons({
  icons,
  className,
  ...props
}: Omit<ComponentProps<"span">, "children"> & {
  icons: ReadonlyArray<{ key: string; icon: ReactNode }>;
}) {
  return (
    <span className={cn(styles.icons, className)} {...props}>
      {icons.map(({ key, icon }) => (
        <span key={key} className={styles.icon}>
          {icon}
        </span>
      ))}
    </span>
  );
}

export function FilterPopup({
  layout,
  className,
  ...props
}: ComponentProps<typeof Chip.Popup> & { layout?: FilterLayout }) {
  return (
    <Chip.Popup
      className={cn(styles.popup, className)}
      data-layout={layout}
      {...props}
    />
  );
}
