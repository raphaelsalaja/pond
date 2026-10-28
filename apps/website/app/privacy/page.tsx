import type { Metadata } from "next";
import {
  GITHUB_ISSUES_URL,
  GITHUB_RELEASES_URL,
  RESPONSIBLE_USE_URL,
  SECURITY_URL,
} from "@/lib/links";
import { Article } from "../components/article";
import { PageHeader } from "../components/page-header";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Pond keeps your library on your computer. No accounts, no Pond servers, no analytics.",
};

const SECTIONS = [
  { id: "extension", label: "Browser extension" },
  { id: "app", label: "Pond app" },
  { id: "fish", label: "Fish" },
  { id: "security", label: "Security" },
  { id: "responsible-use", label: "Responsible use" },
  { id: "website", label: "This website" },
  { id: "questions", label: "Questions" },
];

export default function PrivacyPage() {
  return (
    <main>
      <PageHeader.Root>
        <PageHeader.Label>Privacy · Updated October 27, 2026</PageHeader.Label>
        <PageHeader.Title>
          Your library stays on your computer.
        </PageHeader.Title>
        <PageHeader.Lede>
          There are no Pond accounts, no Pond servers, and no analytics in the
          app, the browser extension, or this website.
        </PageHeader.Lede>
      </PageHeader.Root>
      <Article.Root sections={SECTIONS}>
        <Article.Section id="extension">
          <h2>Browser extension</h2>
          <p>
            The extension only talks to the Pond app on your computer, through
            your browser's native messaging. It never sends data to Pond or
            anyone else over the internet.
          </p>
          <p>When you save something, it hands Pond:</p>
          <ul>
            <li>The page's address and title</li>
            <li>
              The images or screenshots you picked, with the name, rating,
              notes, tags, and folders you set
            </li>
            <li>
              The site's cookies for that page, so Pond can open it signed in as
              you. Pond uses them in a temporary browser session and drops them
              after the save.
            </li>
          </ul>
          <p>
            On supported sites like X, Instagram, and Pinterest, the extension
            watches the site's own save and like requests. When you bookmark a
            post there, it sends that post's address to Pond. Turn this off for
            any site in Pond under Settings, Browser Extension, Sources.
          </p>
          <p>
            When you connect a source in Pond, the extension sends Pond the
            cookies for that site so Pond can sync your saves from it. Pond
            keeps them in a private browser session on your computer.
          </p>
          <p>
            The extension stores its settings and your recent folders and tags
            in your browser's extension storage.
          </p>
        </Article.Section>
        <Article.Section id="app">
          <h2>Pond app</h2>
          <p>
            Your library is a folder on your computer. Captions, text in images,
            and transcription run on your computer. Pond connects to:
          </p>
          <ul>
            <li>The sites you save from, to download posts and media</li>
            <li>GitHub, to check for updates</li>
            <li>The model you pick for your fish, only when a fish runs</li>
          </ul>
        </Article.Section>
        <Article.Section id="fish">
          <h2>Fish</h2>
          <p>
            A fish sends your message and the saves it reads to the model you
            pick, when you chat with it or when a routine you set up runs. Where
            that goes depends on the model:
          </p>
          <ul>
            <li>
              <strong>Apple Intelligence</strong> runs on your Mac.
            </li>
            <li>
              <strong>A local host</strong> like Ollama or LM Studio stays on
              the computers you run it on.
            </li>
            <li>
              <strong>A provider key</strong> sends requests from your computer
              straight to that provider, under its own privacy terms. Pond
              encrypts the keys you paste with your system's secure storage.
            </li>
            <li>
              <strong>A Codex or Claude Code subscription</strong> runs the
              official CLI on your computer, and requests go to OpenAI or
              Anthropic under your plan. Pond doesn't read or copy CLI tokens.
            </li>
          </ul>
          <p>
            Changes a fish proposes wait for your review. Nothing in your
            library moves until you apply it.
          </p>
        </Article.Section>
        <Article.Section id="security">
          <h2>Security</h2>
          <ul>
            <li>
              The browser extension reaches Pond through a native messaging host
              that only accepts the Pond extension.
            </li>
            <li>
              The Local API listens on loopback only, and the MCP server runs
              over stdio on your computer. Each API token gets only the access
              you pick, and Pond keeps a hash of it, not the token.
            </li>
            <li>
              Pond never runs imported HTML, web archives, or SWF files. HTML
              opens in a scriptless, offline viewer.
            </li>
            <li>
              Library files, thumbnails, backups, and the search index are not
              encrypted by Pond. Keep FileVault or BitLocker on to protect them
              at rest.
            </li>
            <li>
              Download Pond and the extension only from{" "}
              <a href={GITHUB_RELEASES_URL} target="_blank" rel="noreferrer">
                GitHub Releases
              </a>{" "}
              or the official browser stores.
            </li>
          </ul>
          <p>
            To report a vulnerability, follow the{" "}
            <a href={SECURITY_URL} target="_blank" rel="noreferrer">
              security policy
            </a>{" "}
            instead of opening a public issue.
          </p>
        </Article.Section>
        <Article.Section id="responsible-use">
          <h2>Responsible use</h2>
          <p>
            Pond acts as you, through your own browser session, to keep what
            you've already saved. Follow the terms of every platform you
            connect, connect only accounts you own, and ask creators before you
            republish their work.
          </p>
          <ul>
            <li>A rate governor paces every request and honors retry-after.</li>
            <li>A source stops when the platform shows a challenge.</li>
            <li>Pond never asks for your platform passwords.</li>
            <li>Your cookies and sessions never leave your computer.</li>
          </ul>
          <p>
            Read the full{" "}
            <a href={RESPONSIBLE_USE_URL} target="_blank" rel="noreferrer">
              responsible use guide
            </a>
            .
          </p>
        </Article.Section>
        <Article.Section id="website">
          <h2>This website</h2>
          <p>
            This site sets no cookies and runs no analytics. Vercel hosts it and
            keeps standard request logs.
          </p>
        </Article.Section>
        <Article.Section id="questions">
          <h2>Questions</h2>
          <p>
            Open an issue on{" "}
            <a href={GITHUB_ISSUES_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            .
          </p>
        </Article.Section>
      </Article.Root>
    </main>
  );
}
