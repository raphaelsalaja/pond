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

type RootProps = React.ComponentPropsWithoutRef<"div">;

function Root({ className, ...props }: RootProps) {
  return <div className={cn(styles.root, className)} {...props} />;
}

type EntryProps = React.ComponentPropsWithoutRef<"article">;

function Entry({ className, ...props }: EntryProps) {
  return <article className={cn(styles.entry, className)} {...props} />;
}

type MetaProps = React.ComponentPropsWithoutRef<"div">;

function Meta({ className, ...props }: MetaProps) {
  return <div className={cn(styles.meta, className)} {...props} />;
}

type VersionProps = React.ComponentPropsWithoutRef<"p">;

function Version({ className, ...props }: VersionProps) {
  return <p className={cn(styles.version, className)} {...props} />;
}

type DateProps = React.ComponentPropsWithoutRef<"time">;

function EntryDate({ className, ...props }: DateProps) {
  return <time className={cn(styles.date, className)} {...props} />;
}

type BodyProps = React.ComponentPropsWithoutRef<"div">;

function Body({ className, ...props }: BodyProps) {
  return <div className={cn(styles.body, className)} {...props} />;
}

type TitleProps = React.ComponentPropsWithoutRef<"h3">;

function Title({ className, ...props }: TitleProps) {
  return <h3 className={cn(styles.title, className)} {...props} />;
}

type SummaryProps = React.ComponentPropsWithoutRef<"p">;

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

type HeadingProps = React.ComponentPropsWithoutRef<"h4">;

function Heading({ className, children, ...props }: HeadingProps) {
  const { label, Icon } = CATEGORIES[use(SectionContext)];
  return (
    <h4 className={cn(styles.heading, className)} {...props}>
      <Icon size={14} className={styles.icon} aria-hidden />
      {children ?? label}
    </h4>
  );
}

type ListProps = React.ComponentPropsWithoutRef<"ul">;

function List({ className, ...props }: ListProps) {
  return <ul className={cn(styles.list, className)} {...props} />;
}

type ItemProps = React.ComponentPropsWithoutRef<"li">;

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
