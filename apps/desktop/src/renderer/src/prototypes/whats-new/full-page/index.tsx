import { Button, Changelog, Dialog } from "@pond/ui";
import { Clip } from "../clip";
import { formatDate, LATEST, openReleases, RELEASES } from "../fixture";
import { Frame } from "../frame";
import styles from "./styles.module.css";

export function FullPage() {
  return (
    <Frame.Stage backdrop="none">
      <Dialog.Preview data-size="full" className={styles.page}>
        <div className={styles.scroll}>
          <div className={styles.column}>
            <header className={styles.hero}>
              <p className={styles.eyebrow}>What's New</p>
              <Dialog.Title className={styles.title}>{LATEST.title}</Dialog.Title>
              <Dialog.Description className={styles.lede}>
                {LATEST.summary}
              </Dialog.Description>
              <div className={styles.media}>
                <Clip />
              </div>
            </header>
            <Changelog.Root>
              {RELEASES.map((entry) => (
                <Changelog.Entry key={entry.version}>
                  <Changelog.Meta>
                    <Changelog.Version>v{entry.version}</Changelog.Version>
                    <Changelog.Date dateTime={entry.date}>
                      {formatDate(entry.date)}
                    </Changelog.Date>
                  </Changelog.Meta>
                  <Changelog.Body>
                    <Changelog.Title>{entry.title}</Changelog.Title>
                    {entry.sections.map((section) => (
                      <Changelog.Section
                        key={section.category}
                        category={section.category}
                      >
                        <Changelog.Heading />
                        <Changelog.List>
                          {section.items.map((item) => (
                            <Changelog.Item key={item}>{item}</Changelog.Item>
                          ))}
                        </Changelog.List>
                      </Changelog.Section>
                    ))}
                  </Changelog.Body>
                </Changelog.Entry>
              ))}
            </Changelog.Root>
          </div>
        </div>
        <footer className={styles.bar}>
          <Button variant="secondary" onClick={openReleases}>
            All Releases
          </Button>
          <Dialog.Confirm>Back to Library</Dialog.Confirm>
        </footer>
      </Dialog.Preview>
    </Frame.Stage>
  );
}
