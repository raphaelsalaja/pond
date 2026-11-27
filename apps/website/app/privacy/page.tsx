import type { Metadata } from "next";
import { Policy } from "../components/policy";

const GITHUB_ISSUES = "https://github.com/raphaelsalaja/pond/issues";

export const metadata: Metadata = {
  title: "Privacy · Pond",
  description:
    "Pond keeps your library on your computer. No accounts, no Pond servers, no analytics.",
};

export default function Privacy() {
  return (
    <Policy.Page>
      <Policy.Header>
        <Policy.Title>Privacy</Policy.Title>
        <p>
          Pond keeps your library on your computer. There are no Pond accounts,
          no Pond servers, and no analytics in the app, the browser extension,
          or this website.
        </p>
        <Policy.Updated>November 27, 2026</Policy.Updated>
      </Policy.Header>

      <Policy.Section>
        <Policy.Heading>Browser extension</Policy.Heading>
        <p>
          The extension only talks to the Pond app on your computer, through
          your browser&apos;s native messaging. It never sends data to Pond or
          anyone else over the internet.
        </p>
        <p>When you save something, it hands Pond:</p>
        <Policy.List>
          <li>The page&apos;s address and title</li>
          <li>
            The images or screenshots you picked, with the name, rating, notes,
            tags, and folders you set
          </li>
          <li>
            The site&apos;s cookies for that page, so Pond can open it signed in
            as you. Pond uses them in a temporary browser session and drops them
            after the save.
          </li>
        </Policy.List>
        <p>
          On supported sites like X, Instagram, and Pinterest, the extension
          watches the site&apos;s own save and like requests. When you bookmark
          a post there, it sends that post&apos;s address to Pond. Turn this off
          for any site in Pond under Settings, Browser Extension, Sources.
        </p>
        <p>
          When you connect a source in Pond, the extension sends Pond the
          cookies for that site so Pond can sync your saves from it. Pond keeps
          them in a private browser session on your computer.
        </p>
        <p>
          The extension stores its settings and your recent folders and tags in
          your browser&apos;s extension storage.
        </p>
      </Policy.Section>

      <Policy.Section>
        <Policy.Heading>Pond app</Policy.Heading>
        <p>
          Your library is a folder on your computer, and it&apos;s the source of
          truth for your saves. Preferences, logs, and the search index stay on
          your computer too. Pond keeps API keys in your operating system&apos;s
          secure storage. Pond connects to:
        </p>
        <Policy.List>
          <li>The sites you save from, to download posts and media</li>
          <li>GitHub, to check for updates</li>
          <li>Hugging Face, once per model, to download on-device models</li>
          <li>
            The AI provider you set up for Fish, with your own key, and only
            when you use it. A local host you run works too.
          </li>
          <li>
            The storage you set up as a Share Host, with your own key, only when
            you create, update, or stop a Share Link
          </li>
        </Policy.List>
      </Policy.Section>

      <Policy.Section>
        <Policy.Heading>Platform sync</Policy.Heading>
        <p>
          When you sync a source like X, Instagram, or Pinterest, Pond uses your
          own signed-in browser session on your computer. Pond never asks for
          your platform passwords or stores them anywhere. Requests come from
          your account, so each platform&apos;s terms apply.
        </p>
      </Policy.Section>

      <Policy.Section>
        <Policy.Heading>Fish and enrichments</Policy.Heading>
        <p>
          Captions, text in images, transcription, and search run on your
          computer. Once Pond downloads a model, it runs without a network call.
        </p>
        <p>
          Fish use a key you add or a local host you run. Pond sends your
          prompts and the saves a fish reads only to the provider you choose.
        </p>
      </Policy.Section>

      <Policy.Section>
        <Policy.Heading>Share Pages and Share Links</Policy.Heading>
        <p>
          Export Share Page writes a read-only page of the Saves you pick to a
          folder on your computer. A Share Link uploads the same page to storage
          you own, such as a Cloudflare R2 bucket, and gives you its address.
          Pond has no server in between, and anyone with the address can open
          the page.
        </p>
        <p>
          A page holds titles, links, post text, authors, and copies of the
          media. Pond removes location and camera data from images and videos
          first. Notes, tags, ratings, and your folders stay out. Stop Sharing
          deletes the page from your storage, but anyone who opened it may have
          kept a copy.
        </p>
      </Policy.Section>

      <Policy.Section>
        <Policy.Heading>This website</Policy.Heading>
        <p>
          This site sets no cookies and runs no analytics. Vercel hosts it and
          keeps standard request logs.
        </p>
      </Policy.Section>

      <Policy.Section>
        <Policy.Heading>Changes</Policy.Heading>
        <p>
          This page changes when Pond does. The date at the top shows the last
          update.
        </p>
      </Policy.Section>

      <Policy.Section>
        <Policy.Heading>Questions</Policy.Heading>
        <p>
          Open an issue on{" "}
          <Policy.Link href={GITHUB_ISSUES} target="_blank" rel="noreferrer">
            GitHub
          </Policy.Link>
          .
        </p>
      </Policy.Section>
    </Policy.Page>
  );
}
