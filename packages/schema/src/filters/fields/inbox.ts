import { sql } from "drizzle-orm";
import { saves } from "../../db";
import { INBOX_STATE_LABELS, INBOX_STATES } from "../../inbox";
import { defineField } from "./descriptor";

const INBOX_PRESETS = INBOX_STATES.map((id) => ({
  id,
  label: INBOX_STATE_LABELS[id],
  value: id,
}));

export const inbox = defineField({
  id: "inbox",
  type: "enum",
  label: "Inbox",
  group: "content",
  presets: INBOX_PRESETS,
  project: (s) => s.inboxState ?? "",
  sqlProjection: () => sql`coalesce(${saves.inboxState}, '')`,
});
