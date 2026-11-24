import { Button, Changelog, Dialog, Reveal } from "@pond/ui";
import { useState } from "react";
import { Clip } from "../clip";
import { formatDate, itemsOf, LATEST, RELEASES } from "../fixture";
import { Frame } from "../frame";
import styles from "./styles.module.css";

export function HeroCard() {
  const [expanded, setExpanded] = useState(false);
  const earlier = RELEASES.length - 1;

  return (
    <Frame.Stage>
      <Frame.Popup width={440} className={styles.popup}>
        <div className={styles.media}>
          <Clip />
        </div>
        <div className={styles.body}>
          <p className={styles.eyebrow}>
            Pond {LATEST.version} · {formatDate(LATEST.date)}
          </p>
          <Dialog.Title className={styles.title}>{LATEST.title}</Dialog.Title>
          <Dialog.Description>{LATEST.summary}</Dialog.Description>
          <Reveal visible={expanded} initial={false}>
            <div className={styles.more}>
              <Changelog.Root>
                {RELEASES.map((entry) => (
                  <Changelog.Section key={entry.version} category="new">
                    <Changelog.Heading>Pond {entry.version}</Changelog.Heading>
                    <Changelog.List>
                      {itemsOf(entry, "new").map((item) => (
                        <Changelog.Item key={item}>{item}</Changelog.Item>
                      ))}
                    </Changelog.List>
                  </Changelog.Section>
                ))}
              </Changelog.Root>
            </div>
          </Reveal>
        </div>
        <Dialog.Footer layout="fill">
          <Button variant="secondary" onClick={() => setExpanded(!expanded)}>
            {expanded
              ? "Show Less"
              : `See ${earlier} Earlier ${earlier === 1 ? "Update" : "Updates"}`}
          </Button>
          <Dialog.Confirm>Done</Dialog.Confirm>
        </Dialog.Footer>
        <Frame.Close />
      </Frame.Popup>
    </Frame.Stage>
  );
}
