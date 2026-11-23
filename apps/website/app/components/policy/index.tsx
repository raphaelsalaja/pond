import { Wordmark } from "@pond/ui/wordmark";
import type { ComponentPropsWithoutRef, JSX } from "react";
import styles from "./styles.module.css";

type PartProps<Tag extends keyof JSX.IntrinsicElements> = Omit<
  ComponentPropsWithoutRef<Tag>,
  "className"
>;

function Page({ children, ...props }: PartProps<"main">) {
  return (
    <main className={styles.page} {...props}>
      <a className={styles.home} href="/" aria-label="Pond">
        <Wordmark size={24} />
      </a>
      <article className={styles.article}>{children}</article>
    </main>
  );
}

function Header(props: PartProps<"header">) {
  return <header className={styles.section} {...props} />;
}

function Title(props: PartProps<"h1">) {
  return <h1 className={styles.title} {...props} />;
}

function Updated({ children, ...props }: PartProps<"p">) {
  return (
    <p className={styles.muted} {...props}>
      Updated {children}
    </p>
  );
}

function Section(props: PartProps<"section">) {
  return <section className={styles.section} {...props} />;
}

function Heading(props: PartProps<"h2">) {
  return <h2 className={styles.heading} {...props} />;
}

function List(props: PartProps<"ul">) {
  return <ul className={styles.list} {...props} />;
}

function Link(props: PartProps<"a">) {
  return <a className={styles.link} {...props} />;
}

export const Policy = {
  Page,
  Header,
  Title,
  Updated,
  Section,
  Heading,
  List,
  Link,
};
