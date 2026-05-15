import { cn } from "@/lib/cn";
import styles from "./styles.module.css";

interface PageProps extends React.ComponentPropsWithoutRef<"div"> {
  width?: "narrow" | "medium" | "wide";
}

function Page({ width = "medium", className, ...props }: PageProps) {
  return (
    <div data-width={width} className={cn(styles.page, className)} {...props} />
  );
}

interface HeaderProps extends React.ComponentPropsWithoutRef<"header"> {}

function Header({ className, ...props }: HeaderProps) {
  return <header className={cn(styles.header, className)} {...props} />;
}

interface TitleProps extends React.ComponentPropsWithoutRef<"h1"> {}

function Title({ className, ...props }: TitleProps) {
  return <h1 className={cn(styles.title, className)} {...props} />;
}

interface DescriptionProps extends React.ComponentPropsWithoutRef<"p"> {}

function Description({ className, ...props }: DescriptionProps) {
  return <p className={cn(styles.description, className)} {...props} />;
}

interface SectionProps extends React.ComponentPropsWithoutRef<"div"> {}

function Section({ className, ...props }: SectionProps) {
  return <div className={cn(styles.section, className)} {...props} />;
}

interface SectionTitleProps extends React.ComponentPropsWithoutRef<"h2"> {}

function SectionTitle({ className, ...props }: SectionTitleProps) {
  return <h2 className={cn(styles["section-title"], className)} {...props} />;
}

interface ListProps extends React.ComponentPropsWithoutRef<"div"> {}

function List({ className, ...props }: ListProps) {
  return <div className={cn(styles.list, className)} {...props} />;
}

interface ItemProps extends React.ComponentPropsWithoutRef<"div"> {}

function Item({ className, ...props }: ItemProps) {
  return <div className={cn(styles.item, className)} {...props} />;
}

interface ItemDetailsProps extends React.ComponentPropsWithoutRef<"div"> {}

function ItemDetails({ className, ...props }: ItemDetailsProps) {
  return <div className={cn(styles.details, className)} {...props} />;
}

interface ItemTitleProps extends React.ComponentPropsWithoutRef<"h3"> {}

function ItemTitle({ className, ...props }: ItemTitleProps) {
  return <h3 className={cn(styles["item-title"], className)} {...props} />;
}

interface ItemDescriptionProps extends React.ComponentPropsWithoutRef<"p"> {}

function ItemDescription({ className, ...props }: ItemDescriptionProps) {
  return <p className={cn(styles["item-description"], className)} {...props} />;
}

interface ItemControlProps extends React.ComponentPropsWithoutRef<"div"> {}

function ItemControl({ className, ...props }: ItemControlProps) {
  return <div className={cn(styles.control, className)} {...props} />;
}

export const Settings = {
  Page: Page,
  Header: Header,
  Title: Title,
  Description: Description,
  Section: Section,
  SectionTitle: SectionTitle,
  List: List,
  Item: Item,
  ItemDetails: ItemDetails,
  ItemTitle: ItemTitle,
  ItemDescription: ItemDescription,
  ItemControl: ItemControl,
};
