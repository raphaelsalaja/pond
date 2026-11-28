import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@ui-sdk/react/navigation-menu";
import { clsx as cn } from "clsx";
import type { ComponentProps } from "react";
import styles from "./styles.module.css";

type RootProps = ComponentProps<typeof NavigationMenu> & {
  "aria-label": string;
};

function Root({ className, ...props }: RootProps) {
  return <NavigationMenu className={cn(styles.root, className)} {...props} />;
}

function Brand({ className, ...props }: ComponentProps<"a">) {
  return <a className={cn(styles.brand, className)} {...props} />;
}

function List({
  className,
  ...props
}: ComponentProps<typeof NavigationMenuList>) {
  return (
    <NavigationMenuList className={cn(styles.list, className)} {...props} />
  );
}

function Link({
  className,
  ...props
}: ComponentProps<typeof NavigationMenuLink>) {
  return (
    <NavigationMenuItem className={styles.item}>
      <NavigationMenuLink className={cn(styles.link, className)} {...props} />
    </NavigationMenuItem>
  );
}

function Actions({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(styles.actions, className)} {...props} />;
}

export const NavBar = { Root, Brand, List, Link, Actions };
export type { RootProps as NavBarProps };
