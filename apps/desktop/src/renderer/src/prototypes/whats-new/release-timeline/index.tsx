import { IconChevronDown } from "@pond/icons";
import { Accordion, Button, Changelog, Dialog } from "@pond/ui";
import {
  countItems,
  formatDate,
  itemsOf,
  LATEST,
  openReleases,
  RELEASES,
} from "../fixture";
import { Frame } from "../frame";
import styles from "./styles.module.css";

export function ReleaseTimeline() {
  return (
    <Frame.Stage>
      <Frame.Popup width={600} className={styles.popup}>
        <Frame.Close />
        <Dialog.Header className={styles.header}>
          <Dialog.Title>What's New</Dialog.Title>
        </Dialog.Header>
        <Dialog.Content className={styles.content}>
          <Accordion.Root defaultValue={[LATEST.version]} className={styles.rail}>
            {RELEASES.map((entry) => (
              <Accordion.Item
                key={entry.version}
                value={entry.version}
                className={styles.release}
              >
                <span className={styles.node} aria-hidden />
                <Accordion.Header>
                  <Accordion.Trigger variant="bare" className={styles.trigger}>
                    <span className={styles.meta}>
                      <span className={styles.version}>{entry.version}</span>
                      <span>{formatDate(entry.date)}</span>
                      <span>{countItems(entry)} changes</span>
                    </span>
                    <span className={styles.title}>{entry.title}</span>
                    <IconChevronDown size={12} className={styles.chevron} />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Panel className={styles.drawer}>
                  <div className={styles.panel}>
                    <Changelog.Summary>{entry.summary}</Changelog.Summary>
                    <Changelog.List className={styles.list}>
                      {itemsOf(entry, "new").map((item) => (
                        <Changelog.Item key={item}>{item}</Changelog.Item>
                      ))}
                    </Changelog.List>
                    <p className={styles.rest}>
                      {countItems(entry) - itemsOf(entry, "new").length} more
                      improvements and fixes
                    </p>
                  </div>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion.Root>
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
