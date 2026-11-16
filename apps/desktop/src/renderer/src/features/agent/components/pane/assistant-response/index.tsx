import type { AssistantSource } from "@shared/assistant";
import {
  Children,
  createContext,
  isValidElement,
  type ReactNode,
  useContext,
} from "react";
import {
  type AnimateOptions,
  type Components,
  defaultRemarkPlugins,
  Streamdown,
} from "streamdown";
import { CodeBlock } from "../../code-block";
import { parseSaveMentionHref, SaveMentionChip } from "../../composer/mention";
import { remarkSaveCitations } from "../remark-save-citations";
import { SaveCitation } from "../save-preview";
import styles from "./styles.module.css";

interface ResponseRenderContext {
  sources: AssistantSource[];
  onOpenSave: (id: string) => void;
}

const ResponseContext = createContext<ResponseRenderContext | null>(null);

function useResponseContext() {
  const value = useContext(ResponseContext);
  if (!value) throw new Error("Response renderers require ResponseContext");
  return value;
}

function textContent(children: ReactNode): string {
  const parts = Children.toArray(children);
  const value = parts.length === 1 ? parts[0] : null;
  return value != null && !isValidElement(value) ? String(value) : "";
}

function ResponseLink({
  href,
  children,
}: {
  href?: string;
  children?: ReactNode;
}) {
  const { sources, onOpenSave } = useResponseContext();
  const mentionId = parseSaveMentionHref(href ?? "");
  if (mentionId) {
    const save = sources.find((item) => item.id === mentionId);
    const title = save?.title || textContent(children) || "Untitled";
    return <SaveMentionChip id={mentionId} title={title} onOpen={onOpenSave} />;
  }
  const reference = /^#save-([1-9]\d*)$/.exec(href ?? "");
  if (reference) {
    const save = sources[Number(reference[1]) - 1];
    return save ? (
      <SaveCitation
        source={save}
        reference={Number(reference[1])}
        compact={children === String(Number(reference[1]))}
        onOpenSave={onOpenSave}
      />
    ) : (
      <span>{children}</span>
    );
  }
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <span>{children}</span>
  );
}

/** Streamdown's defaults carry Tailwind classes; Pond styles the bare elements instead. */
const responseComponents: Components = {
  ol: "ol",
  ul: "ul",
  li: "li",
  hr: "hr",
  strong: "strong",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
  thead: "thead",
  tbody: "tbody",
  tr: "tr",
  th: "th",
  td: "td",
  blockquote: "blockquote",
  code: "code",
  inlineCode: ({ node: _node, ...props }) => <code {...props} />,
  sup: "sup",
  sub: "sub",
  p: "p",
  section: "section",
  img: () => null,
  a: ({ href, children }) => (
    <ResponseLink href={href}>{children}</ResponseLink>
  ),
  pre: ({ node, children }) => {
    const code = node?.children.find(
      (child) => child.type === "element" && child.tagName === "code",
    );
    if (code?.type !== "element") return <pre>{children}</pre>;
    const value = code.children
      .flatMap((child) => (child.type === "text" ? child.value : []))
      .join("");
    const classes = code.properties.className;
    const language = Array.isArray(classes)
      ? String(
          classes.find((name) => String(name).startsWith("language-")) ?? "",
        ).replace(/^language-/, "")
      : "";
    return <CodeBlock.Root code={value} language={language} />;
  },
  table: ({ children }) => (
    <section
      className={styles.table}
      data-scroll-fade="horizontal"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll wide tables in the side pane.
      tabIndex={0}
      aria-label="Response table"
    >
      <table>{children}</table>
    </section>
  ),
};

interface MarkdownParent {
  type: string;
  children?: MarkdownParent[];
}

/** Model HTML is dropped outright; `safeResponseUrl` already gates every link. */
function remarkDropHtml() {
  const prune = (node: MarkdownParent) => {
    if (!node.children) return;
    node.children = node.children.filter((child) => child.type !== "html");
    for (const child of node.children) prune(child);
  };
  return prune;
}

/** Mirrors `--ds-duration-slow`; Streamdown zeroes it for words already on screen. */
const wordReveal: AnimateOptions = {
  duration: 350,
  easing: "var(--ds-easing-decelerate)",
};

export function safeResponseUrl(url: string): string {
  if (/^#save-[1-9]\d*$/.test(url)) return url;
  if (parseSaveMentionHref(url)) return url;
  try {
    const parsed = new URL(url);
    if (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      !parsed.username &&
      !parsed.password
    )
      return parsed.href;
  } catch {}
  return "";
}

export function AssistantResponse({
  content,
  sources = [],
  streaming = false,
  onOpenSave,
}: {
  content: string;
  sources?: AssistantSource[];
  streaming?: boolean;
  onOpenSave: (id: string) => void;
}) {
  return (
    <ResponseContext.Provider value={{ sources, onOpenSave }}>
      <Streamdown
        className={styles.response}
        mode={streaming ? "streaming" : "static"}
        isAnimating={streaming}
        animated={wordReveal}
        controls={false}
        linkSafety={{ enabled: false }}
        remarkPlugins={[
          ...Object.values(defaultRemarkPlugins),
          remarkDropHtml,
          [remarkSaveCitations, { count: sources.length, source: content }],
        ]}
        rehypePlugins={[]}
        urlTransform={safeResponseUrl}
        components={responseComponents}
      >
        {content}
      </Streamdown>
    </ResponseContext.Provider>
  );
}
