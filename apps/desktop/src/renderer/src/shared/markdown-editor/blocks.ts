import { $createCodeNode } from "@lexical/code";
import { $createHorizontalRuleNode } from "@lexical/extension";
import { $insertList } from "@lexical/list";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $createTableNodeWithDimensions } from "@lexical/table";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $createParagraphNode,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
} from "lexical";

export type MarkdownBlock =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "bullet"
  | "number"
  | "check"
  | "quote"
  | "code"
  | "hr"
  | "table";

export function $applyMarkdownBlock(block: MarkdownBlock): void {
  if (block === "bullet" || block === "number" || block === "check") {
    $insertList(block);
    return;
  }
  if (block === "hr") {
    $insertNodeToNearestRoot($createHorizontalRuleNode());
    return;
  }
  if (block === "table") {
    const selection = $getSelection();
    const current = $isRangeSelection(selection)
      ? selection.anchor.getNode().getTopLevelElement()
      : null;
    const table = $createTableNodeWithDimensions(3, 2, {
      rows: true,
      columns: false,
    });
    $insertNodeToNearestRoot(table);
    if ($isParagraphNode(current) && current.isEmpty()) current.remove();
    table.getFirstDescendant()?.selectStart();
    return;
  }
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  $setBlocksType(selection, () => {
    if (block === "h1" || block === "h2" || block === "h3" || block === "h4") {
      return $createHeadingNode(block);
    }
    if (block === "quote") {
      return $createQuoteNode();
    }
    if (block === "code") {
      return $createCodeNode();
    }
    return $createParagraphNode();
  });
}
