import { IconChevronDown } from "@pond/icons";
import { Accordion } from "@pond/ui/accordion";
import { FAQ } from "../../content/home";
import styles from "./styles.module.css";

/** The questions people ask before they install, each opening in place. */
export function Faq() {
  return (
    <section className={styles.faq}>
      <h2 className={styles.title}>Questions</h2>
      <Accordion.Root className={styles.list} multiple>
        {FAQ.map((item) => (
          <Accordion.Item key={item.question} className={styles.item}>
            <Accordion.Header className={styles.header}>
              <Accordion.Trigger variant="bare" className={styles.trigger}>
                {item.question}
                <IconChevronDown size={16} aria-hidden />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel className={styles.panel}>
              <p className={styles.answer}>{item.answer}</p>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </section>
  );
}
