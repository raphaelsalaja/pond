import type { Metadata } from "next";
import { GITHUB_RELEASES_URL } from "@/lib/links";
import {
  CHROME_WEB_STORE_URL,
  dmgUrl,
  FIREFOX_ADDONS_URL,
  HOMEBREW_COMMAND,
  POND_VERSION,
  REQUIREMENTS,
  windowsInstallerUrl,
} from "@/lib/release";
import { Cards } from "../components/cards";
import { Code } from "../components/code";
import { Cta } from "../components/cta";
import { DownloadCta } from "../components/download-cta";
import { Frame } from "../components/frame";
import { Heading } from "../components/heading";
import { PageHeader } from "../components/page-header";
import styles from "./styles.module.css";

export const metadata: Metadata = {
  title: "Download",
  description: `Download Pond ${POND_VERSION} for Mac or Windows, install it with Homebrew, and add the browser extension.`,
};

const BUILDS = [
  {
    title: "Mac with Apple Silicon",
    file: `Pond-${POND_VERSION}-arm64.dmg`,
    href: dmgUrl("arm64"),
    note: "For M-series Macs. Open the disk image and drag Pond to Applications.",
  },
  {
    title: "Mac with Intel",
    file: `Pond-${POND_VERSION}-x64.dmg`,
    href: dmgUrl("x64"),
    note: "For Macs with an Intel processor. Install it the same way.",
  },
  {
    title: "Windows",
    file: `Pond-${POND_VERSION}-x64.exe`,
    href: windowsInstallerUrl(),
    note: "The installer isn't signed yet. If SmartScreen stops it, choose More info, then Run anyway.",
  },
];

const EXTENSIONS = [
  {
    title: "Chrome Web Store",
    browsers: "Chrome, Arc, Brave, and Edge",
    href: CHROME_WEB_STORE_URL,
  },
  {
    title: "Firefox Add-ons",
    browsers: "Firefox and Zen",
    href: FIREFOX_ADDONS_URL,
  },
];

const COMPANIONS = [
  {
    title: "Raycast",
    body: "Search your library, save links, and switch libraries from Raycast.",
    href: "/integrations#raycast",
  },
  {
    title: "Alfred",
    body: "Search with pond and save with psave in Alfred 5 with the Powerpack.",
    href: "/integrations#alfred",
  },
  {
    title: "CLI",
    body: "Search, save, and script your library from a terminal.",
    href: "/integrations#cli",
  },
];

const SYSTEM = [
  { label: "Mac", value: REQUIREMENTS.mac },
  { label: "Windows", value: REQUIREMENTS.windows },
  { label: "Apple Intelligence", value: "macOS 26 or later" },
  { label: "Windows on Arm", value: "Not built yet" },
  { label: "Linux", value: "On the roadmap" },
];

export default function DownloadPage() {
  return (
    <main>
      <PageHeader.Root>
        <PageHeader.Label>Download</PageHeader.Label>
        <PageHeader.Title>Download Pond {POND_VERSION}.</PageHeader.Title>
        <PageHeader.Lede>
          Free and open source. Pond keeps your library in a folder on your
          computer, so there's no account to make.
        </PageHeader.Lede>
        <PageHeader.Actions>
          <DownloadCta size="md" />
          <Cta href={`/changelog/${POND_VERSION}`} variant="soft">
            Release Notes
          </Cta>
        </PageHeader.Actions>
      </PageHeader.Root>
      <Frame.Section className={styles.section}>
        <Heading.Root>
          <Heading.Label>Builds</Heading.Label>
          <Heading.Title>Pick your computer.</Heading.Title>
        </Heading.Root>
        <Cards.Root columns="3">
          {BUILDS.map((build) => (
            <Cards.Item key={build.title}>
              <Cards.Tag>{build.file}</Cards.Tag>
              <Cards.Title>{build.title}</Cards.Title>
              <Cards.Body>{build.note}</Cards.Body>
              <Cards.Actions>
                <Cta href={build.href} variant="soft">
                  Download
                </Cta>
              </Cards.Actions>
            </Cards.Item>
          ))}
        </Cards.Root>
        <p className={styles.note}>
          Pond installs updates for you. Older versions are on{" "}
          <a href={GITHUB_RELEASES_URL} target="_blank" rel="noreferrer">
            GitHub Releases
          </a>
          .
        </p>
      </Frame.Section>
      <Frame.Section className={styles.split}>
        <Heading.Root>
          <Heading.Label>Homebrew</Heading.Label>
          <Heading.Title>Install from a terminal.</Heading.Title>
          <Heading.Lede>
            The cask lives in the Pond repository, so tap it once, then install.
          </Heading.Lede>
        </Heading.Root>
        <Code code={HOMEBREW_COMMAND} language="Terminal" />
      </Frame.Section>
      <Frame.Section id="extensions" className={styles.section}>
        <Heading.Root>
          <Heading.Label>Browser extension</Heading.Label>
          <Heading.Title>Save from any page.</Heading.Title>
          <Heading.Lede>
            The extension saves the page you're on and connects your accounts in
            Sources. Open Pond once so the extension can reach it.
          </Heading.Lede>
        </Heading.Root>
        <Cards.Root columns="2">
          {EXTENSIONS.map((extension) => (
            <Cards.Item key={extension.title}>
              <Cards.Title>{extension.title}</Cards.Title>
              <Cards.Body>For {extension.browsers}.</Cards.Body>
              <Cards.Actions>
                <Cta href={extension.href} variant="soft" external>
                  Add to Browser
                </Cta>
              </Cards.Actions>
            </Cards.Item>
          ))}
        </Cards.Root>
      </Frame.Section>
      <Frame.Section className={styles.section}>
        <Heading.Root>
          <Heading.Label>Companions</Heading.Label>
          <Heading.Title>
            Reach your library from anywhere on your Mac.
          </Heading.Title>
        </Heading.Root>
        <Cards.Root columns="3">
          {COMPANIONS.map((companion) => (
            <Cards.Item key={companion.title}>
              <Cards.Title>{companion.title}</Cards.Title>
              <Cards.Body>{companion.body}</Cards.Body>
              <Cards.Actions>
                <Cta href={companion.href} variant="ghost">
                  Set Up {companion.title}
                </Cta>
              </Cards.Actions>
            </Cards.Item>
          ))}
        </Cards.Root>
      </Frame.Section>
      <Frame.Section className={styles.section}>
        <Heading.Root>
          <Heading.Label>Requirements</Heading.Label>
          <Heading.Title>What Pond runs on.</Heading.Title>
        </Heading.Root>
        <dl className={styles.specs}>
          {SYSTEM.map((row) => (
            <div key={row.label} className={styles.spec}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </Frame.Section>
    </main>
  );
}
