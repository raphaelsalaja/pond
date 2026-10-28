import { clsx as cn } from "clsx";
import { Frame } from "../frame";
import { Prose } from "../prose";
import styles from "./styles.module.css";

interface ArticleSection {
  id: string;
  label: string;
}

interface RootProps extends React.ComponentPropsWithoutRef<"article"> {
  sections: ArticleSection[];
}

function Root({ sections, className, children, ...props }: RootProps) {
  return (
    <Frame.Section className={styles.layout}>
      <nav className={styles.contents} aria-label="On this page">
        <p className={styles.label}>On this page</p>
        <ul className={styles.links}>
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>{section.label}</a>
            </li>
          ))}
        </ul>
      </nav>
      <article className={cn(styles.article, className)} {...props}>
        <Prose>{children}</Prose>
      </article>
    </Frame.Section>
  );
}

interface SectionProps extends React.ComponentPropsWithoutRef<"section"> {
  id: string;
}

function Section({ className, ...props }: SectionProps) {
  return <section className={cn(styles.section, className)} {...props} />;
}

export const Article = { Root, Section };
