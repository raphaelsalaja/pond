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

interface HeaderProps extends React.ComponentPropsWithoutRef<"thead"> {}

function Header({ className, ...props }: HeaderProps) {
  return <thead className={cn(styles.header, className)} {...props} />;
}

interface BodyProps extends React.ComponentPropsWithoutRef<"tbody"> {}

function Body({ className, ...props }: BodyProps) {
  return <tbody className={cn(styles.body, className)} {...props} />;
}

interface FooterProps extends React.ComponentPropsWithoutRef<"tfoot"> {}

function Footer({ className, ...props }: FooterProps) {
  return <tfoot className={cn(styles.footer, className)} {...props} />;
}

interface RowProps extends React.ComponentPropsWithoutRef<"tr"> {}

function Row({ className, ...props }: RowProps) {
  return <tr className={cn(styles.row, className)} {...props} />;
}

interface HeadProps extends React.ComponentPropsWithoutRef<"th"> {}

function Head({ className, ...props }: HeadProps) {
  return <th className={cn(styles.head, className)} {...props} />;
}

interface CellProps extends React.ComponentPropsWithoutRef<"td"> {}

function Cell({ className, ...props }: CellProps) {
  return <td className={cn(styles.cell, className)} {...props} />;
}

interface CaptionProps extends React.ComponentPropsWithoutRef<"caption"> {}

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
