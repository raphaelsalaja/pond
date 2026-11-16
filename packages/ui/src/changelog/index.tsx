import {
  IconCircleArrowUp,
  IconCircleCheck,
  IconSparkle,
  IconTriangleWarning,
} from "@pond/icons";
import { clsx as cn } from "clsx";
import { createContext, use } from "react";
import styles from "./styles.module.css";

export type ChangelogCategory = "important" | "new" | "improved" | "fixed";

const CATEGORIES = {
  important: { label: "Important", Icon: IconTriangleWarning },
  new: { label: "New", Icon: IconSparkle },
  improved: { label: "Improved", Icon: IconCircleArrowUp },
  fixed: { label: "Fixed", Icon: IconCircleCheck },
} satisfies Record<
  ChangelogCategory,
  { label: string; Icon: typeof IconSparkle }
>;

const SectionContext = createContext<ChangelogCategory>("new");

interface RootProps extends React.ComponentPropsWithoutRef<"div"> {}

function Root({ className, ...props }: RootProps) {
  return <div className={cn(styles.root, className)} {...props} />;
}

interface EntryProps extends React.ComponentPropsWithoutRef<"article"> {}

function Entry({ className, ...props }: EntryProps) {
  return <article className={cn(styles.entry, className)} {...props} />;
}

interface MetaProps extends React.ComponentPropsWithoutRef<"div"> {}

function Meta({ className, ...props }: MetaProps) {
  return <div className={cn(styles.meta, className)} {...props} />;
}

interface VersionProps extends React.ComponentPropsWithoutRef<"p"> {}

function Version({ className, ...props }: VersionProps) {
  return <p className={cn(styles.version, className)} {...props} />;
}

interface DateProps extends React.ComponentPropsWithoutRef<"time"> {}

function EntryDate({ className, ...props }: DateProps) {
  return <time className={cn(styles.date, className)} {...props} />;
}

interface BodyProps extends React.ComponentPropsWithoutRef<"div"> {}

function Body({ className, ...props }: BodyProps) {
  return <div className={cn(styles.body, className)} {...props} />;
}

interface TitleProps extends React.ComponentPropsWithoutRef<"h3"> {}

function Title({ className, ...props }: TitleProps) {
  return <h3 className={cn(styles.title, className)} {...props} />;
}

interface SummaryProps extends React.ComponentPropsWithoutRef<"p"> {}

function Summary({ className, ...props }: SummaryProps) {
  return <p className={cn(styles.summary, className)} {...props} />;
}

interface SectionProps extends React.ComponentPropsWithoutRef<"section"> {
  category: ChangelogCategory;
}

function Section({ className, category, ...props }: SectionProps) {
  return (
    <SectionContext value={category}>
      <section
        className={cn(styles.section, className)}
        data-category={category}
        {...props}
      />
    </SectionContext>
  );
}

interface HeadingProps extends React.ComponentPropsWithoutRef<"h4"> {}

function Heading({ className, children, ...props }: HeadingProps) {
  const { label, Icon } = CATEGORIES[use(SectionContext)];
  return (
    <h4 className={cn(styles.heading, className)} {...props}>
      <Icon size={14} className={styles.icon} aria-hidden />
      {children ?? label}
    </h4>
  );
}

interface ListProps extends React.ComponentPropsWithoutRef<"ul"> {}

function List({ className, ...props }: ListProps) {
  return <ul className={cn(styles.list, className)} {...props} />;
}

interface ItemProps extends React.ComponentPropsWithoutRef<"li"> {}

function Item({ className, ...props }: ItemProps) {
  return <li className={cn(styles.item, className)} {...props} />;
}

export const Changelog = {
  Root,
  Entry,
  Meta,
  Version,
  Date: EntryDate,
  Body,
  Title,
  Summary,
  Section,
  Heading,
  List,
  Item,
};
