import { Button } from "@base-ui/react/button";
import {
  IconCaretRight as CaretRight,
  IconMagnifier as Magnifier,
} from "@pond/icons";
import { clsx as cn } from "clsx";
import { motion } from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import {
  createContext,
  use,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ComponentProps } from "react";
import { HoverHighlight } from "../hover-highlight";
import { Input } from "../input";
import { pop } from "../shared/pop";
import { useEasedScrollClamp } from "./scroll-clamp";
import { Tree, TreeGroup, TreeIndicator, TreeItem, TreeRow } from "./tree";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithoutRef<"div"> {
  width?: "default" | "full";
}

function Root({ className, width = "default", ...props }: RootProps) {
  return (
    <div className={cn(styles.root, className)} data-width={width} {...props} />
  );
}

type ToolbarProps = React.ComponentPropsWithoutRef<"div">;

function Toolbar({ ...props }: ToolbarProps) {
  return <div className={styles.toolbar} {...props} />;
}

type HeaderProps = React.ComponentPropsWithoutRef<"div">;

function Header({ className, ...props }: HeaderProps) {
  return <div className={cn(styles.header, className)} {...props} />;
}

interface ItemProps extends Button.Props {
  size?: "md" | "lg";
}

function Item({ className, size = "md", onClick, ...props }: ItemProps) {
  return (
    <Button
      className={cn(styles.item, className)}
      data-size={size}
      data-hover-row=""
      onClick={(event) => {
        pop(event.currentTarget.querySelector(`.${styles.icon}`));
        onClick?.(event);
      }}
      {...props}
    />
  );
}

type ItemLabelProps = React.ComponentPropsWithoutRef<"span">;

function ItemLabel({
  className,
  title,
  onPointerEnter,
  ...props
}: ItemLabelProps) {
  return (
    <span
      className={cn(styles.text, className)}
      title={title}
      onPointerEnter={(event) => {
        if (title === undefined) {
          const label = event.currentTarget;
          if (label.scrollWidth > label.clientWidth) {
            label.title = label.textContent ?? "";
          } else {
            label.removeAttribute("title");
          }
        }
        onPointerEnter?.(event);
      }}
      {...props}
    />
  );
}

type ItemDetailProps = React.ComponentPropsWithoutRef<"span">;

function ItemDetail({ className, ...props }: ItemDetailProps) {
  return <span className={cn(styles.detail, className)} {...props} />;
}

type ItemTextProps = React.ComponentPropsWithoutRef<"span">;

function ItemText({ className, ...props }: ItemTextProps) {
  return <span className={cn(styles.stack, className)} {...props} />;
}

type TilesProps = React.ComponentPropsWithoutRef<"div">;

function Tiles({ className, ...props }: TilesProps) {
  return <div className={cn(styles.tiles, className)} {...props} />;
}

type TileProps = Button.Props;

function Tile({ className, onClick, ...props }: TileProps) {
  return (
    <Button
      className={cn(styles.tile, className)}
      onClick={(event) => {
        pop(event.currentTarget.querySelector(`.${styles.icon}`));
        onClick?.(event);
      }}
      {...props}
    />
  );
}

type ResultButtonProps = Button.Props;

function ResultButton({ ...props }: ResultButtonProps) {
  return <Button className={styles.result} data-hover-row="" {...props} />;
}

interface IconProps extends React.ComponentPropsWithoutRef<"span"> {
  source?: boolean | undefined;
}

function Icon({ className, source, ...props }: IconProps) {
  return (
    <span
      data-source={source || undefined}
      className={cn(styles.icon, className)}
      {...props}
    />
  );
}

type CountProps = React.ComponentPropsWithoutRef<"span">;

function Count({ className, ...props }: CountProps) {
  return <span className={cn(styles.count, className)} {...props} />;
}

type GroupProps = React.ComponentPropsWithRef<"div">;

function Group({ className, ...props }: GroupProps) {
  return <div className={cn(styles.group, className)} {...props} />;
}

type GroupLabelProps = React.ComponentPropsWithoutRef<"div">;

function GroupLabel({ className, ...props }: GroupLabelProps) {
  return <div className={cn(styles.label, className)} {...props} />;
}

type GroupHeaderProps = React.ComponentPropsWithoutRef<"div">;

function GroupHeader({ className, ...props }: GroupHeaderProps) {
  return (
    <div
      className={cn(styles.heading, className)}
      data-slot="group-header"
      {...props}
    />
  );
}

type GroupContentProps = React.ComponentPropsWithoutRef<"div">;

function GroupContent({ ...props }: GroupContentProps) {
  return <div className={styles.panel} {...props} />;
}

type FooterProps = React.ComponentPropsWithoutRef<"div">;

function Footer({ className, ...props }: FooterProps) {
  return <div className={cn(styles.footer, className)} {...props} />;
}

type ScrollProps = React.ComponentPropsWithoutRef<"div">;

function Scroll({ className, children, ...props }: ScrollProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef<HTMLDivElement>(null);
  useEasedScrollClamp(scrollRef, spaceRef);
  return (
    <div
      ref={scrollRef}
      className={cn(styles.scroll, className)}
      data-scroll-fade="vertical"
      {...props}
    >
      {children}
      <HoverHighlight />
      <div ref={spaceRef} aria-hidden className={styles.clamp} />
    </div>
  );
}

type SearchProps = ComponentProps<typeof Input.Field>;

function Search({ ...props }: SearchProps) {
  return (
    <Input.Root className={styles.search}>
      <Input.Icon>
        <Magnifier />
      </Input.Icon>
      <Input.Field {...props} />
    </Input.Root>
  );
}

type EmptyProps = React.ComponentPropsWithoutRef<"p">;

function Empty({ ...props }: EmptyProps) {
  return <p className={styles.empty} {...props} />;
}

interface CollapsibleContextValue {
  id: string;
  open: boolean;
  toggle: () => void;
}

const CollapsibleContext = createContext<CollapsibleContextValue | null>(null);

function useCollapsibleGroup() {
  const context = use(CollapsibleContext);
  if (!context) {
    throw new Error(
      "Sidebar.CollapsibleGroup* must be used within <Sidebar.CollapsibleGroup>",
    );
  }
  return context;
}

interface CollapsibleGroupProps extends React.ComponentPropsWithoutRef<"div"> {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function CollapsibleGroup({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className,
  ...props
}: CollapsibleGroupProps) {
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const id = useId();

  const toggle = () => {
    const next = !open;
    setOpenState(next);
    onOpenChange?.(next);
  };

  return (
    <CollapsibleContext value={{ id, open, toggle }}>
      <div className={cn(styles.group, className)} {...props} />
    </CollapsibleContext>
  );
}

type CollapsibleGroupLabelProps = React.ComponentPropsWithoutRef<"button">;

function CollapsibleGroupLabel({
  children,
  className,
  onClick,
  ...props
}: CollapsibleGroupLabelProps) {
  const { open, toggle, id } = useCollapsibleGroup();

  return (
    <button
      type="button"
      className={cn(styles.label, className)}
      data-panel-open={open || undefined}
      aria-expanded={open}
      aria-controls={id}
      onClick={(event) => {
        onClick?.(event);
        toggle();
      }}
      {...props}
    >
      {children}
      <CaretRight size={12} className={styles.caret} />
    </button>
  );
}

interface CollapsibleGroupContentProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
}

function CollapsibleGroupContent({
  children,
  className,
  ...props
}: CollapsibleGroupContentProps) {
  const { open, id } = useCollapsibleGroup();
  const contentId = props.id ?? id;
  useLayoutEffect(() => {
    const content = document.getElementById(contentId);
    if (open || !content?.contains(document.activeElement)) {
      return;
    }
    const parent = content.parentElement;
    const controller = parent?.querySelector<HTMLElement>(
      '[role="treeitem"], button[aria-expanded]',
    );
    controller?.focus();
  }, [open, contentId]);

  return (
    <motion.div
      inert={!open}
      aria-hidden={!open}
      id={id}
      className={cn(styles.panel, className)}
      transition={{
        duration: 0.18,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      animate={{
        height: open ? "auto" : 0,
        opacity: open ? 1 : 0,
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export const Sidebar = {
  Root,
  Toolbar,
  Header,
  Scroll,
  Search,
  Item,
  ItemLabel,
  ItemDetail,
  ItemText,
  Tiles,
  Tile,
  Icon,
  Count,
  ResultButton,
  Empty,
  Footer,
  Group,
  GroupHeader,
  GroupLabel,
  GroupContent,
  CollapsibleGroup,
  CollapsibleGroupLabel,
  CollapsibleGroupContent,
  Tree,
  TreeItem,
  TreeRow,
  TreeIndicator,
  TreeGroup,
};
