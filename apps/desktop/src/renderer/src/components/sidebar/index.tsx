import { IconChevronLeftFill18 } from "@pond/icons/fill/18";
import { NavLink, type NavLinkProps } from "react-router-dom";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithoutRef<"aside"> {}

function Root({ ...props }: RootProps) {
  return <aside className={styles.root} {...props} />;
}

interface BackProps extends React.ComponentPropsWithoutRef<"button"> {}

function Back({ type = "button", children, ...props }: BackProps) {
  return (
    <button type={type} className={styles.back} {...props}>
      <IconChevronLeftFill18 width={14} height={14} />
      <span>{children}</span>
    </button>
  );
}

interface ScrollProps extends React.ComponentPropsWithoutRef<"div"> {}

function Scroll({ ...props }: ScrollProps) {
  return <div className={styles.scroll} {...props} />;
}

interface ToolbarProps extends React.ComponentPropsWithoutRef<"div"> {}

function Toolbar({ ...props }: ToolbarProps) {
  return <div className={styles.toolbar} {...props} />;
}

interface HeaderProps extends React.ComponentPropsWithoutRef<"div"> {}

function Header({ ...props }: HeaderProps) {
  return <div className={styles.header} {...props} />;
}

interface HeaderActionsProps extends React.ComponentPropsWithoutRef<"div"> {}

function HeaderActions({ ...props }: HeaderActionsProps) {
  return <div className={styles["header-actions"]} {...props} />;
}

interface GroupProps extends React.ComponentPropsWithoutRef<"section"> {}

function Group({ ...props }: GroupProps) {
  return <section className={styles.group} {...props} />;
}

interface GroupLabelProps extends React.ComponentPropsWithoutRef<"h2"> {}

function GroupLabel({ ...props }: GroupLabelProps) {
  return <h2 className={styles["group-label"]} {...props} />;
}

interface ItemProps extends React.ComponentPropsWithoutRef<"div"> {}

function Item({ ...props }: ItemProps) {
  return <div className={styles.item} {...props} />;
}

interface LinkProps extends NavLinkProps {}

function Link({ to, ...props }: LinkProps) {
  return <NavLink className={styles.link} to={to} {...props} />;
}

interface AnchorProps extends React.ComponentPropsWithoutRef<"a"> {
  active?: boolean;
}

function Anchor({ active, ...props }: AnchorProps) {
  return (
    <a
      className={styles.link}
      data-active={active ? "true" : undefined}
      {...props}
    />
  );
}

interface LinkIconProps extends React.ComponentPropsWithoutRef<"span"> {}

function LinkIcon({ ...props }: LinkIconProps) {
  return <span aria-hidden className={styles["link-icon"]} {...props} />;
}

interface LinkLabelProps extends React.ComponentPropsWithoutRef<"span"> {}

function LinkLabel({ ...props }: LinkLabelProps) {
  return <span className={styles["link-label"]} {...props} />;
}

export const Sidebar = {
  Root: Root,
  Back: Back,
  Header: Header,
  HeaderActions: HeaderActions,
  Scroll: Scroll,
  Toolbar: Toolbar,
  Group: Group,
  GroupLabel: GroupLabel,
  Item: Item,
  Link: Link,
  Anchor: Anchor,
  LinkIcon: LinkIcon,
  LinkLabel: LinkLabel,
};
