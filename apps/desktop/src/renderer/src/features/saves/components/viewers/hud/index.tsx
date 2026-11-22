import { Button, Tooltip, Tray } from "@pond/ui";
import { clsx as cn } from "clsx";
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  type ReactNode,
  use,
  useState,
} from "react";
import { createPortal } from "react-dom";
import styles from "./styles.module.css";

export type ViewerHudAnchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

const HudTooltipSide = createContext<"top" | "bottom">("top");
/** `plain` once the bar sits in the window toolbar, where it no longer floats over the media. */
export const HudBarVariant = createContext<"raised" | "plain">("raised");
const HudOverlayContext = createContext<{
  enabled: boolean;
  overlay: HTMLElement | null;
} | null>(null);

export function HudHost({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const [overlay, setOverlay] = useState<HTMLElement | null>(null);
  return (
    <HudOverlayContext value={{ enabled, overlay }}>
      <div className={styles.host}>
        {children}
        <div className={styles.layer} ref={setOverlay} />
      </div>
    </HudOverlayContext>
  );
}

function Root({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const host = use(HudOverlayContext);
  if (host?.enabled === false) return null;
  const hud = <div className={cn(styles.hud, className)} {...props} />;
  if (host?.overlay) return createPortal(hud, host.overlay);
  return hud;
}

function Cluster({
  anchor,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { anchor: ViewerHudAnchor }) {
  const side = anchor.startsWith("top") ? "bottom" : "top";
  return (
    <HudTooltipSide value={side}>
      <div
        className={cn(styles.cluster, className)}
        data-anchor={anchor}
        {...props}
      >
        {children}
      </div>
    </HudTooltipSide>
  );
}

function Pill({ className, ...props }: ComponentProps<typeof Tray.Pill>) {
  return <Tray.Pill className={cn(styles.pill, className)} {...props} />;
}

function Scale({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn(styles.scale, className)} {...props} />;
}

function Bar({
  label,
  start,
  middle,
  center,
  end,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  label: string;
  start?: ReactNode;
  /** Centered in the bar, apart from the trailing `center` and `end` groups. */
  middle?: ReactNode;
  center?: ReactNode;
  end?: ReactNode;
}) {
  const variant = use(HudBarVariant);
  return (
    <Tools
      tooltipSide="bottom"
      className={cn(styles.bar, className)}
      role="toolbar"
      aria-label={label}
      {...props}
    >
      <Pill
        className={styles.start}
        variant={variant}
        data-viewer-bar-slot="start"
      >
        {start}
      </Pill>
      {middle ? (
        <Pill
          className={styles.middle}
          variant={variant}
          data-viewer-bar-slot="middle"
        >
          {middle}
        </Pill>
      ) : null}
      <Pill
        className={styles.center}
        variant={variant}
        data-viewer-bar-slot="center"
      >
        {center}
      </Pill>
      <Pill
        className={styles.end}
        variant={variant}
        data-viewer-bar-slot="end"
      >
        {end}
      </Pill>
    </Tools>
  );
}

function Tools({
  tooltipSide,
  layout = "inline",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tooltipSide: "top" | "bottom";
  layout?: "inline" | "contents";
}) {
  return (
    <HudTooltipSide value={tooltipSide}>
      <Tooltip.Group>
        <div
          className={cn(styles.tools, className)}
          data-layout={layout}
          {...props}
        />
      </Tooltip.Group>
    </HudTooltipSide>
  );
}

function Tool({
  className,
  demoState,
  icon = true,
  label,
  shortcut,
  pressed,
  disabled,
  onClick,
  children,
}: {
  className?: string;
  demoState?: "hover" | "focus";
  icon?: boolean;
  label: string;
  shortcut?: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const side = use(HudTooltipSide);
  return (
    <Tooltip label={label} shortcut={shortcut} side={side}>
      <Button
        className={className}
        data-demo-state={demoState}
        icon={icon}
        size="sm"
        variant="ghost"
        rounding="full"
        aria-label={label}
        aria-pressed={pressed || undefined}
        data-pressed={pressed || undefined}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

export const ViewerHud = {
  Root,
  Cluster,
  Pill,
  Scale,
  Bar,
  Tools,
  Tool,
};
