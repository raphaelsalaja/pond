"use client";

import type { ChangelogEntry } from "@pond/schema/changelog";
import { Changelog } from "@pond/ui/changelog";
import Link from "next/link";
import { formatDate } from "@/lib/date";
import { splitInlineCode } from "@/lib/inline-code";
import styles from "./styles.module.css";

interface ReleaseNotesProps {
  entry: ChangelogEntry;
  href?: string;
  video?: boolean;
}

function Text({ text }: { text: string }) {
  return splitInlineCode(text).map((segment, index) =>
    segment.code ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: segments are static text
      <code key={index}>{segment.text}</code>
    ) : (
      segment.text
    ),
  );
}

/** `@pond/ui/changelog` uses React context, so entries render behind a client boundary. */
export function ReleaseNotes({ entry, href, video }: ReleaseNotesProps) {
  const version = `Pond ${entry.version}`;
  return (
    <Changelog.Entry className={styles.entry} id={entry.version}>
      <Changelog.Meta className={styles.meta}>
        <Changelog.Version>
          {href ? <Link href={href}>{version}</Link> : version}
        </Changelog.Version>
        <Changelog.Date dateTime={entry.date}>
          {formatDate(entry.date)}
        </Changelog.Date>
      </Changelog.Meta>
      <Changelog.Body className={styles.body}>
        {video ? (
          <video
            className={styles.video}
            src="/video/pond.mp4"
            poster="/video/pond-poster.jpg"
            width={1600}
            height={900}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="Pond 2.0 launch video"
          />
        ) : null}
        <Changelog.Title className={styles.title}>
          {href ? <Link href={href}>{entry.title}</Link> : entry.title}
        </Changelog.Title>
        <Changelog.Summary>{entry.summary}</Changelog.Summary>
        {entry.sections.map((section) => (
          <Changelog.Section key={section.category} category={section.category}>
            <Changelog.Heading />
            <Changelog.List>
              {section.items.map((item) => (
                <Changelog.Item key={item}>
                  <Text text={item} />
                </Changelog.Item>
              ))}
            </Changelog.List>
          </Changelog.Section>
        ))}
      </Changelog.Body>
    </Changelog.Entry>
  );
}
