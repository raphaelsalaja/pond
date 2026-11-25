import { cn } from "@pond/ui";
import styles from "./styles.module.css";

type RootProps = React.ComponentPropsWithoutRef<"article">;

function Root({ className, ...props }: RootProps) {
  return <article className={cn(styles.root, className)} {...props} />;
}

type HeaderProps = React.ComponentPropsWithoutRef<"header">;

function Header({ className, ...props }: HeaderProps) {
  return <header className={cn(styles.header, className)} {...props} />;
}

type TitleProps = React.ComponentPropsWithoutRef<"h1">;

function Title({ className, ...props }: TitleProps) {
  return <h1 className={cn(styles.title, className)} {...props} />;
}

type SummaryProps = React.ComponentPropsWithoutRef<"p">;

function Summary({ className, ...props }: SummaryProps) {
  return <p className={cn(styles.summary, className)} {...props} />;
}

type SectionProps = React.ComponentPropsWithoutRef<"section">;

function Section({ className, ...props }: SectionProps) {
  return <section className={cn(styles.section, className)} {...props} />;
}

type HeadingProps = React.ComponentPropsWithoutRef<"h2">;

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
