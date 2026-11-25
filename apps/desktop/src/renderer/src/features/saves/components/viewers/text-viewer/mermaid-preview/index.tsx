import { $isCodeNode, CodeNode } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $isElementNode } from "lexical";
import type { LexicalNode } from "lexical";
import { useEffect } from "react";
import styles from "./styles.module.css";

let diagram = 0;

export function MermaidPreview() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const hosts = new Map<string, HTMLElement>();

    const sync = () => {
      const seen = new Set<string>();
      const pending: Array<{ key: string; source: string }> = [];
      editor.getEditorState().read(() => {
        const visit = (node: LexicalNode) => {
          if ($isCodeNode(node) && node.getLanguage() === "mermaid") {
            pending.push({
              key: node.getKey(),
              source: node.getTextContent(),
            });
          }
          if ($isElementNode(node)) {
            for (const child of node.getChildren()) visit(child);
          }
        };
        visit($getRoot());
      });
      for (const item of pending) {
        seen.add(item.key);
        const block = editor.getElementByKey(item.key);
        if (!block) continue;
        let host = hosts.get(item.key);
        if (!host) {
          host = document.createElement("div");
          host.className = styles.diagram ?? "";
          host.dataset.scrollFade = "horizontal";
          block.insertAdjacentElement("afterend", host);
          hosts.set(item.key, host);
        }
        void renderDiagram(host, item.source);
      }
      for (const [key, host] of hosts) {
        if (seen.has(key)) continue;
        host.remove();
        hosts.delete(key);
      }
    };

    sync();
    return editor.registerMutationListener(CodeNode, sync);
  }, [editor]);

  return null;
}

async function renderDiagram(host: HTMLElement, source: string): Promise<void> {
  if (host.dataset.source === source) return;
  host.dataset.source = source;
  try {
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({ startOnLoad: false, theme: "neutral" });
    diagram += 1;
    const { svg } = await mermaid.render(`note-diagram-${diagram}`, source);
    host.innerHTML = svg;
  } catch {
    host.textContent = "Could not render diagram.";
  }
}
