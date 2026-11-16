import { cn } from "@pond/ui";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithoutRef<"article"> {}

function Root({ className, ...props }: RootProps) {
  return <article className={cn(styles.root, className)} {...props} />;
}

interface HeaderProps extends React.ComponentPropsWithoutRef<"header"> {}

function Header({ className, ...props }: HeaderProps) {
  return <header className={cn(styles.header, className)} {...props} />;
}

interface TitleProps extends React.ComponentPropsWithoutRef<"h1"> {}

function Title({ className, ...props }: TitleProps) {
  return <h1 className={cn(styles.title, className)} {...props} />;
}

interface SummaryProps extends React.ComponentPropsWithoutRef<"p"> {}

function Summary({ className, ...props }: SummaryProps) {
  return <p className={cn(styles.summary, className)} {...props} />;
}

interface SectionProps extends React.ComponentPropsWithoutRef<"section"> {}

function Section({ className, ...props }: SectionProps) {
  return <section className={cn(styles.section, className)} {...props} />;
}

interface HeadingProps extends React.ComponentPropsWithoutRef<"h2"> {}

function Heading({ className, ...props }: HeadingProps) {
  return <h2 className={cn(styles.heading, className)} {...props} />;
}

export const Doc = {
  Root,
  Header,
  Title,
  Summary,
  Section,
  Heading,
};
