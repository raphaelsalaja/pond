import type { Metadata } from "next";
import { Cards } from "../components/cards";
import { Code } from "../components/code";
import { Cta } from "../components/cta";
import { DownloadCta } from "../components/download-cta";
import { FishSchool } from "../components/fish-school";
import { Frame } from "../components/frame";
import { Heading } from "../components/heading";
import { PageHeader } from "../components/page-header";
import { Showcase } from "../components/showcase";
import styles from "./styles.module.css";

export const metadata: Metadata = {
  title: "Fish",
  description:
    "Fish are chat characters that search your Pond library and propose changes you review. They run on Apple Intelligence, your own key, or a local host you run.",
};

const MODELS = [
  {
    title: "Apple Intelligence",
    tag: "On your Mac",
    body: "The model built into macOS 26. No key and no host. Turn on Apple Intelligence in System Settings and pick it for your fish.",
  },
  {
    title: "Your Key",
    tag: "Your provider",
    body: "Paste a key from OpenAI, Anthropic, Google, Mistral, OpenRouter, or another provider. Requests go from your computer straight to that provider.",
  },
  {
    title: "A Local Host",
    tag: "Your network",
    body: "Point a fish at Ollama or LM Studio running on your computer or your network. Nothing leaves the machines you run.",
  },
  {
    title: "Your Subscription",
    tag: "Codex or Claude Code",
    body: "Sign in to Codex or Claude Code in a terminal, then connect it in Settings. Your plan covers the requests.",
  },
];

const REVIEW = [
  {
    title: "Search with sources",
    body: "A fish reads captions, text in images, transcripts, and notes, then cites the saves it used.",
  },
  {
    title: "Changes wait for you",
    body: "Tags, folders, titles, and notes come back as a list of proposed changes. Apply them all, pick a few, or dismiss them.",
  },
  {
    title: "Undo from the review",
    body: "Undo any applied change from the same review in the chat.",
  },
  {
    title: "Routines on a schedule",
    body: "Give a fish a weekly tidy or a daily tagging pass. Each run waits for your review like any other request.",
  },
];

const MCP_CONFIG = `{
  "mcpServers": {
    "pond": {
      "command": "/Applications/Pond.app/Contents/MacOS/Pond",
      "args": ["--mcp"]
    }
  }
}`;

export default function FishPage() {
  return (
    <main>
      <PageHeader.Root>
        <PageHeader.Label>Fish</PageHeader.Label>
        <PageHeader.Title>Fish that know your library.</PageHeader.Title>
        <PageHeader.Lede>
          A fish searches your saves, answers with the ones it used, and
          proposes changes you review before anything moves. Pond doesn't bundle
          a chat model. You choose what each fish runs on.
        </PageHeader.Lede>
        <PageHeader.Actions>
          <DownloadCta size="md" />
        </PageHeader.Actions>
      </PageHeader.Root>
      <Showcase.Root scene="fish" label="A fish filing saves in Pond" />
      <Frame.Section className={styles.section}>
        <Heading.Root>
          <Heading.Label>Models</Heading.Label>
          <Heading.Title>Run each fish on what you trust.</Heading.Title>
          <Heading.Lede>
            Pick a model per fish. Keys stay on your computer and never pass
            through a Pond server.
          </Heading.Lede>
        </Heading.Root>
        <Cards.Root columns="4">
          {MODELS.map((model) => (
            <Cards.Item key={model.title}>
              <Cards.Tag>{model.tag}</Cards.Tag>
              <Cards.Title>{model.title}</Cards.Title>
              <Cards.Body>{model.body}</Cards.Body>
            </Cards.Item>
          ))}
        </Cards.Root>
      </Frame.Section>
      <Frame.Section className={styles.section}>
        <Heading.Root>
          <Heading.Label>Review</Heading.Label>
          <Heading.Title>Nothing changes until you apply it.</Heading.Title>
        </Heading.Root>
        <ul className={styles.list}>
          {REVIEW.map((item, index) => (
            <li key={item.title} className={styles.row}>
              <span className={styles.index}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className={styles.title}>{item.title}</span>
              <span className={styles.body}>{item.body}</span>
            </li>
          ))}
        </ul>
      </Frame.Section>
      <Frame.Section className={styles.section}>
        <Heading.Root>
          <Heading.Label>Your fish</Heading.Label>
          <Heading.Title>Name it, color it, give it a job.</Heading.Title>
          <Heading.Lede>
            Each fish has its own species, color, instructions, model, and
            routines. Scope one to a few folders and tags, or let it roam the
            whole library.
          </Heading.Lede>
        </Heading.Root>
        <FishSchool />
      </Frame.Section>
      <Frame.Section className={styles.split}>
        <Heading.Root>
          <Heading.Label>MCP</Heading.Label>
          <Heading.Title>MCP in both directions.</Heading.Title>
          <Heading.Lede>
            Add MCP servers in Settings and your fish can call their tools.
            Every tool starts on Ask First, so a fish waits for your approval
            before it runs one.
          </Heading.Lede>
          <Heading.Lede>
            Pond also runs as a local MCP server, so Cursor, Claude, and other
            hosts can search your library. Switches in Settings decide which
            tools answer.
          </Heading.Lede>
          <div className={styles.actions}>
            <Cta href="/developers" variant="soft">
              Read the Developer Docs
            </Cta>
          </div>
        </Heading.Root>
        <Code code={MCP_CONFIG} language="mcp.json" className={styles.code} />
      </Frame.Section>
    </main>
  );
}
