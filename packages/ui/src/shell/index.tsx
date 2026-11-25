import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

type BodyProps = React.ComponentPropsWithoutRef<"div">;

function Body({ className, ...props }: BodyProps) {
  return <div className={cn(styles.body, className)} {...props} />;
}

type MainProps = React.ComponentPropsWithRef<"main">;

function Main({ className, ...props }: MainProps) {
  return (
    <main
      className={cn(styles.main, className)}
      {...props}
      data-scroll-viewport=""
    />
  );
}

type HeaderProps = React.ComponentPropsWithoutRef<"header">;

function Header({ className, ...props }: HeaderProps) {
  return <header className={cn(styles.header, className)} {...props} />;
}

type AsideProps = React.ComponentPropsWithoutRef<"aside">;

function Aside({ className, ...props }: AsideProps) {
  return <aside className={cn(styles.aside, className)} {...props} />;
}

type DragProps = React.ComponentPropsWithoutRef<"div">;

function Drag({ ...props }: DragProps) {
  return <div className={styles.drag} {...props} />;
}

type EmptyProps = React.ComponentPropsWithoutRef<"p">;

function Empty({ className, ...props }: EmptyProps) {
  return <p className={cn(styles.empty, className)} {...props} />;
}

export const Shell = {
  Body,
  Main,
  Header,
  Aside,
  Drag,
  Empty,
};
