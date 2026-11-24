/** Folds Eagle region comments and timestamped video notes into a save's note. */
import { z } from "zod";

const optionalText = z.string().optional().catch(undefined);
const optionalNumber = z.number().optional().catch(undefined);

const CommentSchema = z.object({
  text: optionalText,
  annotation: optionalText,
  replies: z
    .array(z.object({ text: optionalText }).catch({}))
    .optional()
    .catch(undefined),
});

const VideoNoteSchema = z.object({
  text: optionalText,
  annotation: optionalText,
  timeSec: optionalNumber,
  time: optionalNumber,
  duration: optionalNumber,
});

export const EagleCommentsSchema = z
  .array(CommentSchema.nullable().catch(null))
  .catch([]);
export const EagleVideoNotesSchema = z
  .array(VideoNoteSchema.nullable().catch(null))
  .catch([]);

type EagleComments = z.infer<typeof EagleCommentsSchema>;
type EagleVideoNotes = z.infer<typeof EagleVideoNotesSchema>;

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function annotationLines(
  comments: EagleComments = [],
  videoNotes: EagleVideoNotes = [],
): Array<string> {
  const lines: Array<string> = [];
  for (const comment of comments) {
    if (!comment) {
      continue;
    }
    const texts = [
      comment.text ?? comment.annotation,
      ...(comment.replies ?? []).map((reply) => reply.text),
    ];
    for (const text of texts) {
      if (text?.trim()) {
        lines.push(text.trim());
      }
    }
  }
  const timed = videoNotes
    .flatMap((note) => {
      const text = (note?.text ?? note?.annotation)?.trim();
      if (!note || !text) {
        return [];
      }
      return [{ time: note.timeSec ?? note.time ?? note.duration ?? 0, text }];
    })
    .sort((a, b) => a.time - b.time);
  for (const note of timed) {
    lines.push(`${formatTimestamp(note.time)} ${note.text}`);
  }
  return lines;
}

export function foldAnnotationsIntoNotes(
  notes: string | null | undefined,
  comments: EagleComments | undefined,
  videoNotes: EagleVideoNotes | undefined,
): string | null {
  const lines = annotationLines(comments, videoNotes);
  if (lines.length === 0) {
    return notes ?? null;
  }
  const base = notes?.trim();
  return base ? `${base}\n\n${lines.join("\n")}` : lines.join("\n");
}
