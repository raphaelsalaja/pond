import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithoutRef<"ul"> {
  columns?: "2" | "3" | "4";
}

function Root({ className, columns = "3", ...props }: RootProps) {
  return (
    <ul
      className={cn(styles.root, className)}
      data-columns={columns}
      {...props}
    />
  );
}

interface ItemProps extends React.ComponentPropsWithoutRef<"li"> {}

function Item({ className, ...props }: ItemProps) {
  return <li className={cn(styles.item, className)} {...props} />;
}

interface TagProps extends React.ComponentPropsWithoutRef<"span"> {}

function Tag({ className, ...props }: TagProps) {
  return <span className={cn(styles.tag, className)} {...props} />;
}

interface TitleProps extends React.ComponentPropsWithoutRef<"h3"> {}

function Title({ className, ...props }: TitleProps) {
  return <h3 className={cn(styles.title, className)} {...props} />;
}

interface BodyProps extends React.ComponentPropsWithoutRef<"p"> {}

function Body({ className, ...props }: BodyProps) {
  return <p className={cn(styles.body, className)} {...props} />;
}

interface ActionsProps extends React.ComponentPropsWithoutRef<"div"> {}

function Actions({ className, ...props }: ActionsProps) {
  return <div className={cn(styles.actions, className)} {...props} />;
}

export const Cards = { Root, Item, Tag, Title, Body, Actions };
