import { Button, Changelog, Logo, Reveal } from "@pond/ui";
import { useState } from "react";
import { itemsOf, LATEST, openReleases } from "../fixture";
import { Frame } from "../frame";
import styles from "./styles.module.css";

export function CornerCard() {
  const [open, setOpen] = useState(false);

  return (
    <Frame.Stage backdrop="none">
      <aside className={styles.card} aria-label="What's New">
        <Frame.Close />
        <div className={styles.head}>
          <Logo size={28} className={styles.mark} aria-hidden />
          <div className={styles.heading}>
            <p className={styles.title}>Updated to Pond {LATEST.version}</p>
            <p className={styles.summary}>{LATEST.title}</p>
          </div>
        </div>
        <Reveal visible={open} initial={false}>
          <div className={styles.list}>
            <Changelog.Section category="new">
              <Changelog.Heading />
              <Changelog.List>
                {itemsOf(LATEST, "new").map((item) => (
                  <Changelog.Item key={item}>{item}</Changelog.Item>
                ))}
              </Changelog.List>
            </Changelog.Section>
          </div>
        </Reveal>
        <div className={styles.actions}>
          <Button size="sm" variant="secondary" onClick={openReleases}>
            All Releases
          </Button>
          <Button size="sm" onClick={() => setOpen(!open)}>
            {open ? "Show Less" : "See What's New"}
          </Button>
        </div>
      </aside>
    </Frame.Stage>
  );
}
