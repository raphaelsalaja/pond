import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";

export function $readSearchString(): string {
  return $getRoot().getTextContent().replaceAll(/\s+/g, " ").trim();
}

export function $writeSearchString(text: string): void {
  const root = $getRoot();
  root.clear();
  const paragraph = $createParagraphNode();
  if (text.trim()) paragraph.append($createTextNode(`${text.trim()} `));
  root.append(paragraph);
  paragraph.selectEnd();
}
