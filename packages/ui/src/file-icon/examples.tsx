import type { ComponentDocs } from "../shared/docs";
import { FileIcon } from ".";

const FILES = [
  "brief.docx",
  "budget.xlsx",
  "pitch.pptx",
  "contract.pdf",
  "invite.ics",
  "assets.zip",
  "notes",
];

export const docs: ComponentDocs = {
  slug: "file-icon",
  name: "File Icon",
  tier: "content",
  summary: "A page that shows a file's type from its name.",
  parts: [
    {
      name: "name",
      description:
        "The file name. Its extension sets the color and the label on the page.",
    },
    { name: "size", description: "The page height in pixels. Default 18." },
  ],
  keyboard: [],
  accessibility: [
    "The icon is hidden from assistive tech. Show the file name beside it.",
  ],
  examples: [
    {
      name: "Types",
      render: () => (
        <>
          {FILES.map((name) => (
            <FileIcon key={name} name={name} size={42} />
          ))}
        </>
      ),
    },
    {
      name: "Small",
      render: () => (
        <>
          {FILES.map((name) => (
            <FileIcon key={name} name={name} />
          ))}
        </>
      ),
    },
  ],
};
