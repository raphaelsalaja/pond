import { IconFolder, IconTag } from "@pond/icons";
import { Button } from "@pond/ui";
import { Message } from "@pond/ui/message";
import type { AssistantChange } from "@shared/assistant";
import { Fragment, useState } from "react";
import type { ReactElement } from "react";
import { selectLibraryNav } from "@/features/library";
import { openSave } from "@/features/saves/navigation";
import { InlineReference, SaveReference } from "../../save-preview";
import { proposalList, reviewTitle, shortTitle } from "../lib";
import type { ProposalClause, ProposalPlace, ProposalSegment } from "../lib";
import styles from "./styles.module.css";

/** Saves named in a clause before the rest fold into "and N more". */
const SHOWN = 3;

/** From this many changes the proposal reads better as separate messages than one long sentence. */
const SEPARATE_FROM = 3;

/** Joins keyed items the way the sentence says them: "a", "a and b", "a, b and c". */
function spoken(items: ReadonlyArray<ReactElement>) {
  return items.map((item, index) => (
    <Fragment key={item.key}>
      {index === 0 ? null : index === items.length - 1 ? " and " : ", "}
      {item}
    </Fragment>
  ));
}

function Saves({ changes }: { changes: ReadonlyArray<AssistantChange> }) {
  const [open, setOpen] = useState(false);
  const shown = open ? changes : changes.slice(0, SHOWN);
  const hidden = changes.length - shown.length;
  const references = shown.map((change) => (
    <SaveReference
      key={change.id}
      id={change.saveId}
      title={shortTitle(change.title)}
      fullTitle={reviewTitle(change.title)}
      onOpenSave={openSave}
    />
  ));
  return spoken(
    hidden
      ? [
          ...references,
          <Button
            key="more"
            variant="bare"
            className={styles.more}
            onClick={() => setOpen(true)}
          >
            {hidden} more
          </Button>,
        ]
      : references,
  );
}

/** Tags and folders are cited like Saves, so each one opens its own page. */
function Places({
  place,
  items,
}: {
  place: "tag" | "folder";
  items: ReadonlyArray<ProposalPlace>;
}) {
  const Icon = place === "tag" ? IconTag : IconFolder;
  return spoken(
    items.map((item) => (
      <InlineReference
        key={item.id}
        media={<Icon size={14} />}
        label={item.name}
        aria-label={`Open ${place === "tag" ? "tag" : "folder"} ${item.name}`}
        onClick={() =>
          selectLibraryNav(
            place === "tag"
              ? { kind: "tag", name: item.id }
              : { kind: "folder", id: item.id },
          )
        }
      />
    )),
  );
}

function Segment({ segment }: { segment: ProposalSegment }) {
  switch (segment.kind) {
    case "text":
      return segment.text;
    case "value":
      return <strong className={styles.value}>{segment.text}</strong>;
    case "places":
      return <Places place={segment.place} items={segment.items} />;
    case "saves":
      return <Saves changes={segment.changes} />;
  }
}

function segmentKey(segment: ProposalSegment): string {
  switch (segment.kind) {
    case "text":
    case "value":
      return `${segment.kind}:${segment.text}`;
    case "places":
      return `${segment.place}:${segment.items.map((item) => item.id).join(",")}`;
    case "saves":
      return `saves:${segment.changes.map((change) => change.id).join(",")}`;
  }
}

function clauseKey(clause: ProposalClause): string {
  return clause.map(segmentKey).join("|");
}

/** Keys items by their content and numbers repeats, so keys follow the items rather than their positions. */
function byContent<T>(
  items: ReadonlyArray<T>,
  keyOf: (item: T) => string,
): Array<{ key: string; item: T }> {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = keyOf(item);
    const repeat = seen.get(base) ?? 0;
    seen.set(base, repeat + 1);
    return { key: repeat ? `${base}#${repeat}` : base, item };
  });
}

function Clause({ clause }: { clause: ProposalClause }) {
  return byContent(clause, segmentKey).map(({ key, item }) => (
    <Segment key={key} segment={item} />
  ));
}

/**
 * What the fish wants to change, sent the way it sends its other messages: a short proposal as one
 * bubble, a longer one as a lead and then one bubble per change, each citing its Saves, tags and folders.
 */
export function Proposal({
  clauses,
}: {
  clauses: ReadonlyArray<ProposalClause>;
}) {
  if (clauses.length < SEPARATE_FROM) {
    return (
      <Message.Bubble className={styles.proposal}>
        I&apos;ll{" "}
        {spoken(
          byContent(clauses, clauseKey).map(({ key, item }) => (
            <Clause key={key} clause={item} />
          )),
        )}
        .
      </Message.Bubble>
    );
  }
  const { lead, items } = proposalList(clauses);
  return (
    <>
      <Message.Bubble className={styles.proposal}>{lead}</Message.Bubble>
      {byContent(items, clauseKey).map(({ key, item }) => (
        <Message.Bubble
          key={key}
          className={`${styles.proposal} ${styles.item}`}
        >
          <Clause clause={item} />
        </Message.Bubble>
      ))}
    </>
  );
}
