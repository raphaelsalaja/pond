import type { Metadata } from "next";
import { Policy } from "../components/policy";

const GITHUB_ISSUES = "https://github.com/raphaelsalaja/pond/issues";
const ADD_A_SOURCE =
  "https://github.com/raphaelsalaja/pond/blob/main/.github/CONTRIBUTING.md#add-a-source";

export const metadata: Metadata = {
  title: "Responsible Use · Pond",
  description:
    "Pond keeps what you already saved. It isn't a scraper and it isn't a way around a platform's rules.",
};

export default function ResponsibleUse() {
  return (
    <Policy.Page>
      <Policy.Header>
        <Policy.Title>Responsible Use</Policy.Title>
        <p>
          Pond is a personal archive. Use it to keep what you've already saved,
          liked, or bookmarked. It isn't a scraper for other people's content,
          and it isn't a way around a platform's rules.
        </p>
        <Policy.Updated>November 23, 2026</Policy.Updated>
      </Policy.Header>

      <Policy.Section>
        <Policy.Heading>You're responsible for how you use it</Policy.Heading>
        <p>
          Pond runs on your computer and acts as you. Every request a source
          makes comes from your account, through your own browser session. That
          means:
        </p>
        <Policy.List>
          <li>
            Follow the terms of service of every platform you connect. Pond
            can't agree to them for you, and some platforms limit automated
            access.
          </li>
          <li>Connect only accounts you own.</li>
          <li>
            Treat what you save as a personal copy. Creators keep the rights to
            their work, so ask before you republish or share it.
          </li>
          <li>
            Keep watched public accounts for your own reference. Don't use Pond
            to monitor or harass people.
          </li>
        </Policy.List>
      </Policy.Section>

      <Policy.Section>
        <Policy.Heading>How Pond keeps sync gentle</Policy.Heading>
        <Policy.List>
          <li>A built-in rate governor paces every request.</li>
          <li>
            Pond respects rate-limit signals such as retry-after, and backs off
            instead of retrying harder.
          </li>
          <li>Cooldowns persist across restarts.</li>
          <li>
            A source stops when the platform shows a challenge or checkpoint.
          </li>
          <li>
            You can turn off automatic fetching at any time with Use a Schedule
            in Settings, Harvesting.
          </li>
        </Policy.List>
      </Policy.Section>

      <Policy.Section>
        <Policy.Heading>What Pond never does</Policy.Heading>
        <Policy.List>
          <li>
            Run scraping servers. Your sync traffic never passes through a Pond
            server.
          </li>
          <li>Ask for your platform passwords.</li>
          <li>Send your cookies or sessions off your computer.</li>
        </Policy.List>
      </Policy.Section>

      <Policy.Section>
        <Policy.Heading>If a platform pushes back</Policy.Heading>
        <p>
          If a platform warns you, limits your account, or asks you to verify,
          turn off Use a Schedule and wait before you sync again. If a source
          seems too aggressive,{" "}
          <Policy.Link href={GITHUB_ISSUES} target="_blank" rel="noreferrer">
            open an issue
          </Policy.Link>{" "}
          so it can be fixed.
        </p>
        <p>
          If you're writing a source adapter, read{" "}
          <Policy.Link href={ADD_A_SOURCE} target="_blank" rel="noreferrer">
            Add a Source
          </Policy.Link>{" "}
          in the contributing guide.
        </p>
      </Policy.Section>
    </Policy.Page>
  );
}
