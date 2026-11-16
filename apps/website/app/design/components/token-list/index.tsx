import { cn } from "@pond/ui";
import { Code } from "../code";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithoutRef<"ul"> {}

function Root({ className, ...props }: RootProps) {
  return <ul className={cn(styles.root, className)} {...props} />;
}

interface ItemProps extends Omit<React.ComponentPropsWithoutRef<"li">, "title"> {
  visual: React.ReactNode;
  title: string;
  token?: string;
  description: string;
  value?: string;
}

function Item({
  visual,
  title,
  token,
  description,
  value,
  className,
  ...props
}: ItemProps) {
  return (
    <li className={cn(styles.item, className)} {...props}>
      <span className={styles.visual}>{visual}</span>
      <span className={styles.text}>
        <span className={styles.title}>
          {title}
          {token && <Code.Inline>{token}</Code.Inline>}
        </span>
        <span className={styles.description}>{description}</span>
      </span>
      {value && <span className={styles.value}>{value}</span>}
    </li>
  );
}

export const TokenList = { Root, Item };
