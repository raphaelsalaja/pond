import type { Metadata } from "next";
import { ALFRED_URL, CLI_URL, RAYCAST_URL } from "@/lib/links";
import { Code } from "../components/code";
import { Cta } from "../components/cta";
import { Frame } from "../components/frame";
import { Heading } from "../components/heading";
import { PageHeader } from "../components/page-header";
import styles from "./styles.module.css";

export const metadata: Metadata = {
  title: "Shortcuts",
  description:
    "Save to Pond from Shortcuts, the Share menu, Raycast, Alfred, and the terminal with pond://save links and the local API.",
};

const SAVE_LINK = "pond://save?url=https%3A%2F%2Fexample.com&tags=posters,type";

const PARAMETERS = [
  {
    name: "url",
    value:
      "Required. The page to save, URL-encoded. Only http and https links.",
  },
  { name: "tags", value: "Optional. Comma-separated tag names." },
  {
    name: "folder",
    value:
      "Optional. A folder id. Right-click a folder, choose Copy Folder Link, and use the part between pond://folder/ and ?.",
  },
];

const SHARE_STEPS = [
  "Create a shortcut and turn on Show in Share Sheet. Set it to receive URLs.",
  "Add URL Encode with Shortcut Input.",
  "Add Text with pond://save?url= followed by the URL Encoded Text variable, then &tags= and your tags.",
  "Add Open URLs with that text.",
];

const SAFARI_STEPS = [
  "Add Get Current URL from Safari.",
  "Add URL Encode, Text, and Open URLs as above.",
  "Give the shortcut a keyboard shortcut in its details.",
];

const RAYCAST_COMMANDS = [
  {
    name: "Search Saves",
    value:
      "Search by keywords or by meaning, then filter by source, folder, or tag.",
  },
  {
    name: "Search Media",
    value: "Browse your images and videos as a grid, with Quick Look.",
  },
  {
    name: "Save URL",
    value: "Save a link with tags and a folder, then watch Pond capture it.",
  },
  {
    name: "Save Current Tab",
    value:
      "Save the page open in Safari, Chrome, Arc, Brave, Edge, or Vivaldi.",
  },
  {
    name: "Open Random Save",
    value: "Bring back something you saved a while ago.",
  },
  {
    name: "Switch Library",
    value: "Switch Pond to one of your recent libraries.",
  },
];

const RAYCAST_STEPS = [
  "Install Pond, open it, and pick a library.",
  "In Pond, open Settings, then choose Copy Token under Integrations, Raycast.",
  "Run any Pond command in Raycast and paste the token into Local API Token.",
];

const ALFRED_KEYWORDS = [
  {
    name: "pond <query>",
    value: "Search your saves. With no query, it shows what you saved last.",
  },
  {
    name: "psave <url>",
    value:
      "Save a link and show a notification. Also a Universal Action on URLs.",
  },
];

const ALFRED_STEPS = [
  "In Pond, open Settings, Local API, and create a token with Search Saves and Add and Edit Saves access.",
  "Double-click Pond.alfredworkflow to install it.",
  "Paste the token into Pond Token in the workflow's configuration.",
];

const CLI_SETUP = `npm install --global @pond/cli
pond auth authorize --token <token>
pond doctor`;

const CLI_EXAMPLES = `pond saves search typography --md
pond download https://example.com
pond folders list --table`;

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className={styles.steps}>
      {steps.map((step, index) => (
        <li key={step} className={styles.step}>
          <span className={styles.index}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

function Table({ rows }: { rows: { name: string; value: string }[] }) {
  return (
    <dl className={styles.table}>
      {rows.map((row) => (
        <div key={row.name} className={styles.row}>
          <dt>{row.name}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function IntegrationsPage() {
  return (
    <main>
      <PageHeader.Root>
        <PageHeader.Label>Shortcuts and integrations</PageHeader.Label>
        <PageHeader.Title>Save to Pond without opening it.</PageHeader.Title>
        <PageHeader.Lede>
          Every way in lands in the same library. Pond saves in the background
          and shows a notification, as long as it's running with a library open.
        </PageHeader.Lede>
      </PageHeader.Root>
      <Frame.Section id="shortcuts" className={styles.split}>
        <Heading.Root>
          <Heading.Label>Shortcuts</Heading.Label>
          <Heading.Title>One link saves a page.</Heading.Title>
          <Heading.Lede>
            Open a pond://save link from Shortcuts, a script, or another app.
            Pond accepts up to 20 saves a minute from links, so a site you
            allowed to open pond:// can't flood your library.
          </Heading.Lede>
        </Heading.Root>
        <div className={styles.stack}>
          <Code code={SAVE_LINK} language="Link" />
          <Table rows={PARAMETERS} />
        </div>
      </Frame.Section>
      <Frame.Section id="share-menu" className={styles.split}>
        <Heading.Root>
          <Heading.Label>Share menu</Heading.Label>
          <Heading.Title>Save from any app's Share menu.</Heading.Title>
          <Heading.Lede>
            Pond is in the Share menu of every Mac app. Share up to 20 links, or
            up to 50 images and files, and Pond saves them in the background.
          </Heading.Lede>
        </Heading.Root>
        <div className={styles.stack}>
          <h3 className={styles.subhead}>Share with tags from a shortcut</h3>
          <Steps steps={SHARE_STEPS} />
          <h3 className={styles.subhead}>Save the front Safari tab</h3>
          <Steps steps={SAFARI_STEPS} />
        </div>
      </Frame.Section>
      <Frame.Section id="raycast" className={styles.split}>
        <Heading.Root>
          <Heading.Label>Raycast</Heading.Label>
          <Heading.Title>Search and save from Raycast.</Heading.Title>
          <Heading.Lede>
            The extension talks to Pond over its local API, so nothing leaves
            your Mac. Mention @pond in Raycast AI to ask about your saves.
          </Heading.Lede>
          <div className={styles.actions}>
            <Cta href={RAYCAST_URL} variant="soft" external>
              Get the Extension
            </Cta>
          </div>
        </Heading.Root>
        <div className={styles.stack}>
          <Table rows={RAYCAST_COMMANDS} />
          <h3 className={styles.subhead}>Set up</h3>
          <Steps steps={RAYCAST_STEPS} />
        </div>
      </Frame.Section>
      <Frame.Section id="alfred" className={styles.split}>
        <Heading.Root>
          <Heading.Label>Alfred</Heading.Label>
          <Heading.Title>Two keywords in Alfred.</Heading.Title>
          <Heading.Lede>
            Needs Alfred 5 with the Powerpack. In results, Return opens the
            link, Command-Return opens the save in Pond, and Option-Return
            copies the link.
          </Heading.Lede>
          <div className={styles.actions}>
            <Cta href={ALFRED_URL} variant="soft" external>
              Get the Workflow
            </Cta>
          </div>
        </Heading.Root>
        <div className={styles.stack}>
          <Table rows={ALFRED_KEYWORDS} />
          <h3 className={styles.subhead}>Set up</h3>
          <Steps steps={ALFRED_STEPS} />
        </div>
      </Frame.Section>
      <Frame.Section id="cli" className={styles.split}>
        <Heading.Root>
          <Heading.Label>CLI</Heading.Label>
          <Heading.Title>Script your library from a terminal.</Heading.Title>
          <Heading.Lede>
            The CLI launches Pond when needed and sends every change through its
            local API. Destructive commands show a preview first, and scripts
            confirm with --yes.
          </Heading.Lede>
          <div className={styles.actions}>
            <Cta href={CLI_URL} variant="soft" external>
              CLI Reference
            </Cta>
            <Cta href="/developers" variant="ghost">
              Local API
            </Cta>
          </div>
        </Heading.Root>
        <div className={styles.stack}>
          <Code code={CLI_SETUP} language="Set up" />
          <Code code={CLI_EXAMPLES} language="Examples" />
        </div>
      </Frame.Section>
    </main>
  );
}
