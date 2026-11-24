import { Button, Changelog, Dialog } from "@pond/ui";
import { Frame } from "../frame";
import { formatDate, LATEST, openReleases, RELEASES } from "../fixture";
import styles from "./styles.module.css";

export function FullChangelog() {
  return (
    <Frame.Stage>
      <Frame.Popup width={600} className={styles.popup}>
        <Dialog.Header className={styles.header}>
          <Dialog.Title className={styles.title}>
            What's New
            <span className={styles.version}>v{LATEST.version}</span>
          </Dialog.Title>
          <Frame.Close />
        </Dialog.Header>
        <Dialog.Content className={styles.content}>
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
                  <Changelog.Summary>{entry.summary}</Changelog.Summary>
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
        </Dialog.Content>
        <Dialog.Footer>
          <Button variant="secondary" onClick={openReleases}>
            All Releases
          </Button>
          <Dialog.Confirm>Done</Dialog.Confirm>
        </Dialog.Footer>
      </Frame.Popup>
    </Frame.Stage>
  );
}
