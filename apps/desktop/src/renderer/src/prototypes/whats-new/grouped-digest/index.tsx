import type { ChangelogCategory } from "@pond/schema/changelog";
import { IconChevronDown } from "@pond/icons";
import { Accordion, Button, Changelog, Dialog } from "@pond/ui";
import {
  itemsOf,
  LAST_SEEN,
  LATEST,
  openReleases,
  RELEASES,
} from "../fixture";
import { Frame } from "../frame";
import styles from "./styles.module.css";

const LABELS: Record<ChangelogCategory, string> = {
  important: "Important",
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
};

function merged(category: ChangelogCategory) {
  return RELEASES.flatMap((entry) =>
    itemsOf(entry, category).map((text) => ({ version: entry.version, text })),
  );
}

function Items({ category }: { category: ChangelogCategory }) {
  return (
    <Changelog.List>
      {merged(category).map((item) => (
        <Changelog.Item key={item.text} className={styles.item}>
          <span>{item.text}</span>
          <span className={styles.version}>{item.version}</span>
        </Changelog.Item>
      ))}
    </Changelog.List>
  );
}

export function GroupedDigest() {
  return (
    <Frame.Stage>
      <Frame.Popup width={580} className={styles.popup}>
        <Frame.Close />
        <Dialog.Header className={styles.header}>
          <Dialog.Title>Since Pond {LAST_SEEN}</Dialog.Title>
          <Dialog.Description>
            Everything in {RELEASES.length} updates, up to Pond {LATEST.version}.
          </Dialog.Description>
        </Dialog.Header>
        <Dialog.Content className={styles.content}>
          {(["important", "new"] as const).map((category) => (
            <Changelog.Section key={category} category={category}>
              <Changelog.Heading />
              <Items category={category} />
            </Changelog.Section>
          ))}
          <Accordion.Root>
            {(["improved", "fixed"] as const).map((category) => (
              <Accordion.Item key={category} value={category}>
                <Accordion.Header>
                  <Accordion.Trigger>
                    {merged(category).length} {LABELS[category]}
                    <IconChevronDown size={12} />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Panel>
                  <Changelog.Section category={category}>
                    <Items category={category} />
                  </Changelog.Section>
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
