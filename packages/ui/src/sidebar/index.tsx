import { Button } from "@base-ui/react/button";
import { IconCaretRightFill12 as CaretRight } from "@pond/icons/fill/12";
import { IconMagnifierOutline18 as Magnifier } from "@pond/icons/outline/18";
import { Link, type LinkProps } from "@tanstack/react-router";
import { clsx as cn } from "clsx";
import { type HTMLMotionProps, motion } from "motion/react";
import {
  type ComponentProps,
  createContext,
  use,
  useId,
  useState,
} from "react";
import { Input } from "../input";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithoutRef<"div"> {}

function Root({ className, ...props }: RootProps) {
  return <div className={cn(styles.root, className)} {...props} />;
}

interface ToolbarProps extends React.ComponentPropsWithoutRef<"div"> {}

function Toolbar({ ...props }: ToolbarProps) {
  return <div className={styles.toolbar} {...props} />;
}

interface HeaderProps extends React.ComponentPropsWithoutRef<"div"> {}

function Header({ ...props }: HeaderProps) {
  return <div className={styles.header} {...props} />;
}

interface ItemProps extends Button.Props {}

function Item({ ...props }: ItemProps) {
  return <Button className={styles.item} {...props} />;
}

interface AnchorProps extends LinkProps {}

function Anchor({ ...props }: AnchorProps) {
  return <Link className={styles.item} {...props} />;
}

interface ResultButtonProps extends Button.Props {}

function ResultButton({ ...props }: ResultButtonProps) {
  return <Button className={styles.result} {...props} />;
}

interface IconProps extends React.ComponentPropsWithoutRef<"span"> {
  source?: boolean | undefined;
}

function Icon({ ...props }: IconProps) {
  return <span data-source={props.source} className={styles.icon} {...props} />;
}

interface CountProps extends React.ComponentPropsWithoutRef<"span"> {}

function Count({ ...props }: CountProps) {
  return <span className={styles.count} {...props} />;
}

interface GroupProps extends React.ComponentPropsWithoutRef<"div"> {}

function Group({ ...props }: GroupProps) {
  return <div className={styles.group} {...props} />;
}

interface GroupLabelProps extends React.ComponentPropsWithoutRef<"div"> {}

function GroupLabel({ ...props }: GroupLabelProps) {
  return <div className={styles.label} {...props} />;
}

interface GroupContentProps extends React.ComponentPropsWithoutRef<"div"> {}

function GroupContent({ ...props }: GroupContentProps) {
  return <div className={styles.panel} {...props} />;
}

interface FooterProps extends React.ComponentPropsWithoutRef<"div"> {}

function Footer({ ...props }: FooterProps) {
  return <div className={styles.footer} {...props} />;
}

interface ScrollProps extends React.ComponentPropsWithoutRef<"div"> {}

function Scroll({ ...props }: ScrollProps) {
  return <div className={styles.scroll} {...props} />;
}

interface SearchProps extends ComponentProps<typeof Input.Field> {}

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

interface ResultProps extends LinkProps {}

function Result({ ...props }: ResultProps) {
  return <Link className={styles.result} {...props} />;
}

interface EmptyProps extends React.ComponentPropsWithoutRef<"p"> {}

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
      <div className={styles.group} {...props} />
    </CollapsibleContext>
  );
}

interface CollapsibleGroupLabelProps
  extends React.ComponentPropsWithoutRef<"button"> {}

function CollapsibleGroupLabel({
  children,
  onClick,
  ...props
}: CollapsibleGroupLabelProps) {
  const { open, toggle, id } = useCollapsibleGroup();

  return (
    <button
      type="button"
      className={styles.label}
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
      <CaretRight className={styles.caret} />
    </button>
  );
}

interface CollapsibleGroupContentProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
}

function CollapsibleGroupContent({
  children,
  ...props
}: CollapsibleGroupContentProps) {
  const { open, id } = useCollapsibleGroup();

  return (
    <motion.div
      id={id}
      className={styles.panel}
      transition={{
        duration: 0.18,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      animate={{
        height: open ? "auto" : 0,
        opacity: open ? 1 : 0,
        filter: open ? "blur(0px)" : "blur(2px)",
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
  Icon,
  Count,
  Anchor,
  Result,
  ResultButton,
  Empty,
  Footer,
  Group,
  GroupLabel,
  GroupContent,
  CollapsibleGroup,
  CollapsibleGroupLabel,
  CollapsibleGroupContent,
};
