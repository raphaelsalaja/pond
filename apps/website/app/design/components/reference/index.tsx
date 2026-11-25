"use client";

import { IconMagnifier } from "@pond/icons";
import { Empty, Keyboard, Table } from "@pond/ui";
import { docsFor } from "@pond/ui/docs";
import { Code } from "../code";
import { Doc } from "../doc";
import { Preview } from "../preview";
import styles from "./styles.module.css";

function splitKeys(keys: string): Array<string> {
  const parts = keys.split(/\s*\+\s*/).filter(Boolean);
  return parts.length > 0 ? parts : [keys];
}

interface ReferenceProps {
  slug: string;
}

export function Reference({ slug }: ReferenceProps) {
  const docs = docsFor(slug);

  if (!docs) {
    return (
      <Empty.Root>
        <Empty.Media>
          <IconMagnifier size={14} />
        </Empty.Media>
        <Empty.Title>Component not found</Empty.Title>
        <Empty.Description>
          Nothing in <Code.Inline>@pond/ui/docs</Code.Inline> uses the slug{" "}
          <Code.Inline>{slug}</Code.Inline>. Pick a component from the sidebar.
        </Empty.Description>
      </Empty.Root>
    );
  }

  return (
    <Doc.Root>
      <Doc.Header>
        <Doc.Title>{docs.name}</Doc.Title>
        <Doc.Summary>
          <Code.Text>{docs.summary}</Code.Text>
        </Doc.Summary>
      </Doc.Header>

      {docs.examples.map((example) => (
        <Preview key={example.name} example={example} />
      ))}

      {docs.keyboard.length > 0 ? (
        <Doc.Section>
          <Doc.Heading>Keyboard</Doc.Heading>
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head scope="col">Keys</Table.Head>
                <Table.Head scope="col">Action</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {docs.keyboard.map((binding) => (
                <Table.Row key={`${binding.keys}-${binding.action}`}>
                  <Table.Cell>
                    <span className={styles.keys}>
                      {splitKeys(binding.keys).map((key, index) => (
                        // oxlint-disable-next-line react/no-array-index-key -- combos can repeat a key
                        <Keyboard.Key key={`${index}-${key}`}>
                          {key}
                        </Keyboard.Key>
                      ))}
                    </span>
                  </Table.Cell>
                  <Table.Cell>{binding.action}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Doc.Section>
      ) : null}

      {docs.accessibility.length > 0 ? (
        <Doc.Section>
          <Doc.Heading>Accessibility</Doc.Heading>
          <ul className={styles.notes}>
            {docs.accessibility.map((note) => (
              <li key={note}>
                <Code.Text>{note}</Code.Text>
              </li>
            ))}
          </ul>
        </Doc.Section>
      ) : null}

      {docs.parts.length > 0 ? (
        <Doc.Section>
          <Doc.Heading>Parts</Doc.Heading>
          <dl className={styles.parts}>
            {docs.parts.map((part) => (
              <div key={part.name} className={styles.part}>
                <dt>
                  <Code.Inline>{part.name}</Code.Inline>
                </dt>
                <dd className={styles.description}>
                  <Code.Text>{part.description}</Code.Text>
                </dd>
              </div>
            ))}
          </dl>
        </Doc.Section>
      ) : null}
    </Doc.Root>
  );
}
