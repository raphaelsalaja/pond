import styles from "./styles.module.css";

interface PageProps extends React.ComponentPropsWithoutRef<"div"> {
  width?: "narrow" | "medium" | "wide";
}

function Page({ width = "medium", ...props }: PageProps) {
  return <div data-width={width} className={styles.page} {...props} />;
}

interface HeaderProps extends React.ComponentPropsWithoutRef<"header"> {}

function Header({ ...props }: HeaderProps) {
  return <header className={styles.header} {...props} />;
}

interface TitleProps extends React.ComponentPropsWithoutRef<"h1"> {}

function Title({ ...props }: TitleProps) {
  return <h1 className={styles.title} {...props} />;
}

interface DescriptionProps extends React.ComponentPropsWithoutRef<"p"> {}

function Description({ ...props }: DescriptionProps) {
  return <p className={styles.description} {...props} />;
}

interface SectionProps extends React.ComponentPropsWithoutRef<"div"> {}

function Section({ ...props }: SectionProps) {
  return <div className={styles.section} {...props} />;
}

interface SectionTitleProps extends React.ComponentPropsWithoutRef<"h2"> {}

function SectionTitle({ ...props }: SectionTitleProps) {
  return <h2 className={styles["section-title"]} {...props} />;
}

interface ListProps extends React.ComponentPropsWithoutRef<"div"> {}

function List({ ...props }: ListProps) {
  return <div className={styles.list} {...props} />;
}

interface ItemProps extends React.ComponentPropsWithoutRef<"div"> {}

function Item({ ...props }: ItemProps) {
  return <div className={styles.item} {...props} />;
}

interface ItemDetailsProps extends React.ComponentPropsWithoutRef<"div"> {}

function ItemDetails({ ...props }: ItemDetailsProps) {
  return <div className={styles.details} {...props} />;
}

interface ItemTitleProps extends React.ComponentPropsWithoutRef<"h3"> {}

function ItemTitle({ ...props }: ItemTitleProps) {
  return <h3 className={styles["item-title"]} {...props} />;
}

interface ItemDescriptionProps extends React.ComponentPropsWithoutRef<"p"> {}

function ItemDescription({ ...props }: ItemDescriptionProps) {
  return <p className={styles["item-description"]} {...props} />;
}

interface ItemControlProps extends React.ComponentPropsWithoutRef<"div"> {}

function ItemControl({ ...props }: ItemControlProps) {
  return <div className={styles.control} {...props} />;
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
