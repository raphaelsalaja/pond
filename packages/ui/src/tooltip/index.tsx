import { Tooltip as Base } from "@base-ui/react/tooltip";
import { IconCircleInfo } from "@pond/icons";
import { clsx } from "clsx";
import {
  type ComponentPropsWithoutRef,
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useState,
} from "react";
import styles from "./styles.module.css";

function Root<Payload>(props: Base.Root.Props<Payload>) {
  return <Base.Root {...props} />;
}

function Provider(props: Base.Provider.Props) {
  return <Base.Provider {...props} />;
}

function Trigger<Payload>(props: Base.Trigger.Props<Payload>) {
  return <Base.Trigger {...props} />;
}

function Portal(props: Base.Portal.Props) {
  return <Base.Portal {...props} />;
}

function Viewport({ className, ...props }: Base.Viewport.Props) {
  return (
    <Base.Viewport className={clsx(styles.viewport, className)} {...props} />
  );
}

function Positioner({
  className,
  sideOffset = 8,
  ...props
}: Base.Positioner.Props) {
  return (
    <Base.Positioner
      sideOffset={sideOffset}
      className={clsx(styles.positioner, className)}
      {...props}
    />
  );
}

function Popup({ className, ...props }: Base.Popup.Props) {
  return <Base.Popup {...props} className={clsx(styles.popup, className)} />;
}

function Arrow(props: Base.Arrow.Props) {
  return <Base.Arrow {...props} />;
}

interface TooltipProps {
  label: ReactNode;
  shortcut?: ReactNode;
  children: ReactElement;
  side?: Base.Positioner.Props["side"];
  align?: Base.Positioner.Props["align"];
  sideOffset?: number;
  delay?: number;
  trackCursorAxis?: Base.Root.Props["trackCursorAxis"];
  container?: Base.Portal.Props["container"];
}

function tooltipContent(label: ReactNode, shortcut?: ReactNode): ReactNode {
  if (shortcut == null) return label;
  return (
    <span className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={styles.shortcut}>{shortcut}</span>
    </span>
  );
}

interface GroupPayload {
  label: ReactNode;
  shortcut?: ReactNode;
  side?: TooltipProps["side"];
  align?: TooltipProps["align"];
  sideOffset?: number;
}

const GroupContext = createContext<Base.Handle<GroupPayload> | null>(null);

/** Bridges the gap between neighbouring triggers so the popup travels instead of closing and reopening. */
const GROUP_CLOSE_DELAY = 100;

function TooltipWrapper({
  label,
  shortcut,
  children,
  side,
  align,
  sideOffset,
  delay,
  trackCursorAxis,
  container,
}: TooltipProps) {
  const group = useContext(GroupContext);
  if (group && !trackCursorAxis && !container) {
    return (
      <Trigger
        handle={group}
        payload={{ label, shortcut, side, align, sideOffset }}
        delay={delay}
        closeDelay={GROUP_CLOSE_DELAY}
        render={children}
      />
    );
  }
  return (
    <Root trackCursorAxis={trackCursorAxis}>
      <Trigger delay={delay} render={children} />
      <Portal container={container}>
        <Positioner side={side} align={align} sideOffset={sideOffset}>
          <Popup>
            <span className={styles.body}>
              {tooltipContent(label, shortcut)}
            </span>
          </Popup>
        </Positioner>
      </Portal>
    </Root>
  );
}

/** Tooltips inside share one popup, so moving between neighbouring controls travels instead of reopening. */
function Group({ children }: { children: ReactNode }) {
  const [handle] = useState(() => Base.createHandle<GroupPayload>());
  return (
    <GroupContext.Provider value={handle}>
      {children}
      <Root handle={handle}>
        {({ payload }) => (
          <Portal>
            <Positioner
              side={payload?.side}
              align={payload?.align}
              sideOffset={payload?.sideOffset ?? 12}
              className={styles.traveler}
            >
              <Popup className={styles.sized}>
                <Viewport>
                  {payload
                    ? tooltipContent(payload.label, payload.shortcut)
                    : null}
                </Viewport>
              </Popup>
            </Positioner>
          </Portal>
        )}
      </Root>
    </GroupContext.Provider>
  );
}

interface InfoProps
  extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
  label: ReactNode;
  side?: TooltipProps["side"];
}

/** A small "i" beside a title that explains it on hover or focus. */
function Info({
  label,
  side,
  className,
  "aria-label": ariaLabel = "More Information",
  ...props
}: InfoProps) {
  return (
    <Root>
      <Trigger
        render={
          <button
            type="button"
            className={clsx(styles.info, className)}
            aria-label={ariaLabel}
            {...props}
          />
        }
      >
        <IconCircleInfo size={12} strokeWidth={1.75} />
      </Trigger>
      <Portal>
        <Positioner side={side}>
          <Popup>
            <span className={clsx(styles.body, styles.note)}>{label}</span>
          </Popup>
        </Positioner>
      </Portal>
    </Root>
  );
}

export const Tooltip = Object.assign(TooltipWrapper, {
  Root,
  Group,
  Provider,
  Trigger,
  Portal,
  Viewport,
  Positioner,
  Popup,
  Arrow,
  Label: tooltipContent,
  Info,
});
