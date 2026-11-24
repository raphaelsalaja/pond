import { Button, Changelog, Dialog, Tabs } from "@pond/ui";
import { formatDate, LATEST, openReleases, RELEASES } from "../fixture";
import { Frame } from "../frame";
import styles from "./styles.module.css";

export function VersionTabs() {
  return (
    <Frame.Stage>
      <Frame.Popup width={600} className={styles.popup}>
        <Frame.Close />
        <Tabs.Root defaultValue={LATEST.version} className={styles.tabs}>
          <Dialog.Header className={styles.header}>
            <Dialog.Title className={styles.title}>What's New</Dialog.Title>
            <Tabs.List variant="secondary" aria-label="Version">
              {RELEASES.map((entry) => (
                <Tabs.Tab key={entry.version} value={entry.version}>
                  {entry.version}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Dialog.Header>
          {RELEASES.map((entry) => (
            <Tabs.Panel
              key={entry.version}
              value={entry.version}
              className={styles.panel}
            >
              <Changelog.Entry>
                <Changelog.Body>
                  <Changelog.Date dateTime={entry.date}>
                    {formatDate(entry.date)}
                  </Changelog.Date>
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
            </Tabs.Panel>
          ))}
        </Tabs.Root>
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
