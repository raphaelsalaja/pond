import { IconFolder, IconTag } from "@pond/icons";
import { Button } from "@pond/ui";
import { Message } from "@pond/ui/message";
import type { AssistantChange } from "@shared/assistant";
import { Fragment, type ReactNode, useState } from "react";
import { selectLibraryNav } from "@/features/library";
import { openSave } from "@/features/saves/navigation";
import { InlineReference, SaveReference } from "../../save-preview";
import {
  type ProposalClause,
  type ProposalPlace,
  type ProposalSegment,
  proposalList,
  reviewTitle,
  shortTitle,
} from "../lib";
import styles from "./styles.module.css";

/** Saves named in a clause before the rest fold into "and N more". */
const SHOWN = 3;

/** From this many changes the proposal reads better as separate messages than one long sentence. */
const SEPARATE_FROM = 3;

/** Joins items the way the sentence says them: "a", "a and b", "a, b and c". */
function spoken(items: readonly ReactNode[]): ReactNode {
  return items.map((item, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: the items never reorder within a render.
    <Fragment key={index}>
      {index === 0 ? null : index === items.length - 1 ? " and " : ", "}
      {item}
    </Fragment>
  ));
}

function Saves({ changes }: { changes: readonly AssistantChange[] }) {
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
  items: readonly ProposalPlace[];
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

function Clause({ clause }: { clause: ProposalClause }) {
  return clause.map((segment, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: a clause's segments are fixed once built.
    <Segment key={index} segment={segment} />
  ));
}

/**
 * What the fish wants to change, sent the way it sends its other messages: a short proposal as one
 * bubble, a longer one as a lead and then one bubble per change, each citing its Saves, tags and folders.
 */
export function Proposal({ clauses }: { clauses: readonly ProposalClause[] }) {
  if (clauses.length < SEPARATE_FROM)
    return (
      <Message.Bubble className={styles.proposal}>
        I'll{" "}
        {spoken(
          clauses.map((clause, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: clauses keep the order the fish proposed them in.
            <Clause key={index} clause={clause} />
          )),
        )}
        .
      </Message.Bubble>
    );
  const { lead, items } = proposalList(clauses);
  return (
    <>
      <Message.Bubble className={styles.proposal}>{lead}</Message.Bubble>
      {items.map((clause, index) => (
        <Message.Bubble
          // biome-ignore lint/suspicious/noArrayIndexKey: clauses keep the order the fish proposed them in.
          key={index}
          className={`${styles.proposal} ${styles.item}`}
        >
          <Clause clause={clause} />
        </Message.Bubble>
      ))}
    </>
  );
}
