import type {
  FolderTemplate,
  FolderTemplateNode,
} from "@pond/schema/folder-templates";

function tree(
  root: Omit<FolderTemplateNode, "key" | "parentKey">,
  children: Array<Omit<FolderTemplateNode, "key" | "parentKey">>,
): FolderTemplateNode[] {
  return [
    { ...root, key: "root", parentKey: null },
    ...children.map((child, index) => ({
      ...child,
      key: `child-${index}`,
      parentKey: "root",
    })),
  ];
}

export const BUILT_IN_FOLDER_TEMPLATES: readonly FolderTemplate[] = [
  {
    id: "built-in:research",
    name: "Research",
    description: "Collect sources, take notes, and keep a reading queue.",
    nodes: tree({ name: "Research", icon: "flask", color: "blue" }, [
      { name: "Sources", icon: "link", view: { layout: "list" } },
      { name: "Notes", icon: "note" },
      { name: "Reading List", icon: "book", view: { sortDir: "asc" } },
      { name: "Archive", icon: "album" },
    ]),
  },
  {
    id: "built-in:design-project",
    name: "Design Project",
    description: "Gather references from moodboard to final work.",
    nodes: tree({ name: "Design Project", icon: "palette", color: "purple" }, [
      { name: "Moodboard", icon: "image", view: { layout: "waterfall" } },
      { name: "References", icon: "layers" },
      { name: "Typography", icon: "typography" },
      { name: "Color", icon: "brush" },
      { name: "Final", icon: "star" },
    ]),
  },
  {
    id: "built-in:content-creation",
    name: "Content Creation",
    description: "Move pieces from idea to published.",
    nodes: tree({ name: "Content Creation", icon: "video", color: "orange" }, [
      { name: "Ideas", icon: "lightbulb" },
      { name: "Drafts", icon: "pencil" },
      { name: "Assets", icon: "camera", view: { layout: "grid" } },
      { name: "Published", icon: "rocket" },
    ]),
  },
  {
    id: "built-in:client-workspace",
    name: "Client Workspace",
    description:
      "Keep a client's brief, references, and deliverables together.",
    nodes: tree(
      { name: "Client Workspace", icon: "briefcase", color: "teal" },
      [
        { name: "Brief", icon: "clipboard" },
        { name: "References", icon: "bookmark" },
        { name: "Deliverables", icon: "checklist" },
        { name: "Feedback", icon: "chat" },
      ],
    ),
  },
];
