import { Separator as SeparatorBase } from "@base-ui/react/separator";
import { Toolbar } from "@base-ui/react/toolbar";
import { useRender } from "@base-ui/react/use-render";
import { clsx as cn } from "clsx";
import {
  createContext,
  use,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import styles from "./styles.module.css";

type Orientation = "horizontal" | "vertical";

interface PillContextValue {
  orientation: Orientation;
  register: () => () => void;
}

const PillContext = createContext<PillContextValue | null>(null);

interface PillProps
  extends Omit<Toolbar.Root.Props, "className" | "render" | "orientation"> {
  className?: string;
  orientation?: Orientation;
}

/**
 * Base UI's toolbar leaves Home and End off, so the pill moves to its first and last enabled item itself.
 * @remarks Ignores `defaultPrevented`: a focusable disabled item prevents every key but Tab.
 */
function focusEdgeItem(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Home" && event.key !== "End") return;
  const pill = event.currentTarget;
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.matches(`.${styles.item}`))
    return;
  const items = Array.from(
    pill.querySelectorAll<HTMLElement>(`.${styles.item}:not([disabled])`),
  ).filter((item) => item.parentElement?.closest(`.${styles.pill}`) === pill);
  const item = event.key === "Home" ? items[0] : items.at(-1);
  if (!item) return;
  event.preventDefault();
  item.focus();
}

type DivProps = React.ComponentPropsWithRef<"div">;

/** Drops the toolbar's role and key handling so an item-less pill is a plain surface with the caller's handlers. */
function surfaceProps(
  { role: _role, "aria-orientation": _orientation, ...merged }: DivProps,
  handlers: Pick<DivProps, "onFocus" | "onKeyDown">,
): DivProps {
  return { ...merged, ...handlers };
}

function Pill({
  className,
  orientation = "horizontal",
  onFocus,
  onKeyDown,
  ...props
}: PillProps) {
  const [items, setItems] = useState(0);
  const register = useCallback(() => {
    setItems((count) => count + 1);
    return () => setItems((count) => count - 1);
  }, []);
  const context = useMemo(
    () => ({ orientation, register }),
    [orientation, register],
  );
  /** A pill of plain controls is only a surface, so a host toolbar around it doesn't gain a nested one. */
  const toolbar = items > 0;
  return (
    <PillContext value={context}>
      <Toolbar.Root
        {...props}
        orientation={orientation}
        className={cn(styles.pill, className)}
        onFocus={onFocus}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          focusEdgeItem(event);
        }}
        render={(merged) =>
          toolbar ? (
            <div {...merged} />
          ) : (
            <div {...surfaceProps(merged, { onFocus, onKeyDown })} />
          )
        }
      />
    </PillContext>
  );
}

interface ItemProps extends Omit<Toolbar.Button.Props, "className"> {
  className?: string;
}

function Item({ className, ...props }: ItemProps) {
  const register = use(PillContext)?.register;
  useLayoutEffect(() => register?.(), [register]);
  return <Toolbar.Button {...props} className={cn(styles.item, className)} />;
}

function Indicator({
  className,
  render,
  ref,
  ...props
}: useRender.ComponentProps<"span">) {
  return useRender({
    render,
    ref,
    defaultTagName: "span",
    props: {
      "aria-hidden": true,
      ...props,
      className: cn(styles.indicator, className),
    },
  });
}

interface SeparatorProps
  extends Omit<SeparatorBase.Props, "className" | "orientation"> {
  className?: string;
}

function Separator({ className, ...props }: SeparatorProps) {
  const pill = use(PillContext)?.orientation ?? "horizontal";
  return (
    <SeparatorBase
      {...props}
      orientation={pill === "vertical" ? "horizontal" : "vertical"}
      className={cn(styles.separator, className)}
    />
  );
}

export const Tray = {
  Pill,
  Item,
  Indicator,
  Separator,
};
