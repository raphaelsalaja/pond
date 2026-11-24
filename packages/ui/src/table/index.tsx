import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithoutRef<"table"> {
  containerClassName?: string;
}

function Root({ className, containerClassName, ...props }: RootProps) {
  return (
    <div
      className={cn(styles.container, containerClassName)}
      data-scroll-fade="horizontal"
    >
      <table className={cn(styles.table, className)} {...props} />
    </div>
  );
}

type HeaderProps = React.ComponentPropsWithoutRef<"thead">;

function Header({ className, ...props }: HeaderProps) {
  return <thead className={cn(styles.header, className)} {...props} />;
}

type BodyProps = React.ComponentPropsWithoutRef<"tbody">;

function Body({ className, ...props }: BodyProps) {
  return <tbody className={cn(styles.body, className)} {...props} />;
}

type FooterProps = React.ComponentPropsWithoutRef<"tfoot">;

function Footer({ className, ...props }: FooterProps) {
  return <tfoot className={cn(styles.footer, className)} {...props} />;
}

type RowProps = React.ComponentPropsWithoutRef<"tr">;

function Row({ className, ...props }: RowProps) {
  return <tr className={cn(styles.row, className)} {...props} />;
}

type HeadProps = React.ComponentPropsWithoutRef<"th">;

function Head({ className, ...props }: HeadProps) {
  return <th className={cn(styles.head, className)} {...props} />;
}

type CellProps = React.ComponentPropsWithoutRef<"td">;

function Cell({ className, ...props }: CellProps) {
  return <td className={cn(styles.cell, className)} {...props} />;
}

type CaptionProps = React.ComponentPropsWithoutRef<"caption">;

function Caption({ className, ...props }: CaptionProps) {
  return <caption className={cn(styles.caption, className)} {...props} />;
}

export const Table = {
  Root,
  Header,
  Body,
  Footer,
  Row,
  Head,
  Cell,
  Caption,
};
