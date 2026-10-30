import {
  IconArrowsExpandY,
  IconArrowUpRight,
  IconBookmark,
  IconCamera,
  IconChevronRight,
  IconCoffee,
  IconCrop,
  IconGear3,
  IconImages,
  IconKeyboard,
} from "@pond/icons";
import {
  IconBrandArena,
  IconBrandBehance,
  IconBrandBluesky,
  IconBrandCosmos,
  IconBrandDribbble,
  IconBrandGithub,
  IconBrandMarked,
  IconBrandSavee,
  IconBrandSubstack,
  IconBrandThreads,
  IconBrandTumblr,
  IconBrandUnsplash,
  IconBrandVimeo,
  IconInstagram,
  IconPinterest,
  IconReddit,
  IconTikTok,
  IconXTwitter,
  IconYoutube,
} from "@pond/icons/social-media";
import { CHROME_WEB_STORE_URL, FIREFOX_ADDONS_URL } from "@pond/schema/native";
import type { ExternalSource } from "@pond/schema/sources";
import { BrandTile } from "@pond/ui/brand-tile";
import { Button } from "@pond/ui/button";
import { Empty } from "@pond/ui/empty";
import { Keyboard } from "@pond/ui/keyboard";
import { Loader } from "@pond/ui/loader";
import {
  type ComponentType,
  type ReactNode,
  type SVGProps,
  useState,
} from "react";
import { HOOK_SOURCES, harvestSourceForUrl } from "@/sources";
import {
  type CaptureTool,
  sendMessage,
  type ToolResult,
} from "@/utils/messaging";
import type { NativeUnreachable } from "@/utils/native";
import { useLibrary } from "@/utils/use-library";
import { useActiveTab, useShortcuts } from "../hooks";
import { ShortcutsPanel } from "./shortcuts";
import styles from "./styles.module.css";

const BUY_ME_A_COFFEE = "https://buymeacoffee.com/raphaelsalaja";

const STORE_URL = import.meta.env.FIREFOX
  ? FIREFOX_ADDONS_URL
  : CHROME_WEB_STORE_URL;

const UNREACHABLE_COPY = {
  offline: {
    title: "Pond isn't running",
    description: "Open Pond on your computer to save from the browser.",
  },
  host_missing: {
    title: "Pond isn't set up for this browser",
    description:
      "Open Pond so it can add its connection to this browser, then try again.",
  },
  host_forbidden: {
    title: "Pond doesn't recognize this extension",
    description:
      "This copy has a different ID than the one Pond trusts. Install the extension from the store, then remove this copy.",
  },
  host_failed: {
    title: "Pond's browser connection stopped",
    description:
      "Pond is installed but its connection to the browser failed. Update or reinstall Pond, then try again.",
  },
  incompatible: {
    title: "Pond needs an update",
    description:
      "This extension needs a newer version of Pond. Update Pond, then try again.",
  },
} satisfies Record<NativeUnreachable, { title: string; description: string }>;

interface Command {
  tool: CaptureTool;
  label: string;
  command: string;
  icon: ReactNode;
}

const GROUPS: readonly { label: string; commands: readonly Command[] }[] = [
  {
    label: "Save",
    commands: [
      {
        tool: "page",
        label: "Save Page",
        command: "save-page",
        icon: <IconBookmark size={16} />,
      },
      {
        tool: "images",
        label: "Save Images",
        command: "save-images",
        icon: <IconImages size={16} />,
      },
    ],
  },
  {
    label: "Capture",
    commands: [
      {
        tool: "region",
        label: "Capture Region",
        command: "screenshot-region",
        icon: <IconCrop size={16} />,
      },
      {
        tool: "visible",
        label: "Capture Visible Area",
        command: "screenshot-visible",
        icon: <IconCamera size={16} />,
      },
      {
        tool: "full",
        label: "Capture Full Page",
        command: "screenshot-full",
        icon: <IconArrowsExpandY size={16} />,
      },
    ],
  },
];

const LOGOS = {
  twitter: IconXTwitter,
  instagram: IconInstagram,
  pinterest: IconPinterest,
  arena: IconBrandArena,
  cosmos: IconBrandCosmos,
  tiktok: IconTikTok,
  youtube: IconYoutube,
  reddit: IconReddit,
  threads: IconBrandThreads,
  github: IconBrandGithub,
  substack: IconBrandSubstack,
  tumblr: IconBrandTumblr,
  savee: IconBrandSavee,
  behance: IconBrandBehance,
  vimeo: IconBrandVimeo,
  dribbble: IconBrandDribbble,
  unsplash: IconBrandUnsplash,
  bluesky: IconBrandBluesky,
  marked: IconBrandMarked,
} satisfies Record<ExternalSource, ComponentType<SVGProps<SVGSVGElement>>>;

function Harvest({
  source,
  disabled,
  onRun,
}: {
  source: ExternalSource;
  disabled: boolean;
  onRun: () => void;
}) {
  const Logo = LOGOS[source];
  return (
    <nav className={styles.group} aria-label="Harvest">
      <Button
        variant="ghost"
        width="full"
        className={styles.row}
        disabled={disabled}
        onClick={onRun}
      >
        <BrandTile size={16}>
          <Logo />
        </BrandTile>
        <span className={styles.label}>
          Harvest {HOOK_SOURCES[source].item}
        </span>
      </Button>
    </nav>
  );
}

function hostOf(url: string | undefined): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function Shell({
  children,
  returned,
}: {
  children: ReactNode;
  returned?: boolean;
}) {
  return (
    <div className={styles.page} data-returned={returned || undefined}>
      {children}
    </div>
  );
}

async function openPondSettings() {
  if (await sendMessage("openPond", "settings/extension")) window.close();
}

function MoreRows({ onShortcuts }: { onShortcuts: () => void }) {
  return (
    <div className={styles.group}>
      <Button
        variant="ghost"
        width="full"
        className={styles.row}
        onClick={onShortcuts}
      >
        <IconKeyboard size={16} />
        <span className={styles.label}>Shortcuts</span>
        <IconChevronRight size={12} className={styles.trailing} />
      </Button>
      <Button
        variant="ghost"
        width="full"
        className={styles.row}
        onClick={() => void openPondSettings()}
      >
        <IconGear3 size={16} />
        <span className={styles.label}>Settings</span>
        <IconArrowUpRight size={12} className={styles.trailing} />
      </Button>
      <Button
        variant="ghost"
        width="full"
        className={styles.row}
        onClick={() => void browser.tabs.create({ url: BUY_ME_A_COFFEE })}
      >
        <IconCoffee size={16} />
        <span className={styles.label}>Buy Me a Coffee</span>
        <IconArrowUpRight size={12} className={styles.trailing} />
      </Button>
    </div>
  );
}

export function App() {
  const library = useLibrary();
  const [view, setView] = useState<"commands" | "shortcuts" | "returned">(
    "commands",
  );

  if (view === "shortcuts")
    return <ShortcutsPanel onBack={() => setView("returned")} />;
  return (
    <Commands
      {...library}
      returned={view === "returned"}
      onShortcuts={() => setView("shortcuts")}
    />
  );
}

interface CommandsProps extends ReturnType<typeof useLibrary> {
  returned: boolean;
  onShortcuts: () => void;
}

function Commands({ result, refresh, returned, onShortcuts }: CommandsProps) {
  const tab = useActiveTab();
  const shortcuts = useShortcuts();
  const [error, setError] = useState<string | null>(null);

  if (!result || tab === undefined) {
    return (
      <Shell>
        <div className={styles.center}>
          <Loader.Root aria-label="Connecting to Pond">
            <Loader.Spinner />
          </Loader.Root>
        </div>
      </Shell>
    );
  }

  if (result.state === "offline") {
    const copy = UNREACHABLE_COPY[result.reason];
    return (
      <Shell returned={returned}>
        <Empty.Root className={styles.center}>
          <Empty.Title>{copy.title}</Empty.Title>
          <Empty.Description>{copy.description}</Empty.Description>
          <Empty.Action className={styles.actions}>
            {result.reason === "host_forbidden" ? (
              <Button
                variant="secondary"
                onClick={() => void browser.tabs.create({ url: STORE_URL })}
              >
                Get Extension
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => void sendMessage("openPond", undefined)}
              >
                Open Pond
              </Button>
            )}
            <Button variant="primary" onClick={() => void refresh()}>
              Try Again
            </Button>
          </Empty.Action>
        </Empty.Root>
        <MoreRows onShortcuts={onShortcuts} />
      </Shell>
    );
  }

  const host = hostOf(tab?.url);
  const tabId = host ? tab?.id : undefined;
  const harvest = host && tab?.url ? harvestSourceForUrl(tab.url) : null;

  const run = async (tool: CaptureTool) => {
    if (tabId === undefined) return;
    const outcome = await sendMessage("runTool", { tabId, tool }).catch(
      (): ToolResult => ({
        ok: false,
        message: "Pond couldn't start this capture. Try again.",
      }),
    );
    if (outcome.ok) window.close();
    else setError(outcome.message);
  };

  return (
    <Shell returned={returned}>
      {tabId === undefined ? (
        <p className={styles.notice} role="status">
          Pond can't capture this page. Open a regular web page to save it.
        </p>
      ) : null}
      {error ? (
        <p key={error} className={styles.notice} role="alert" data-error>
          {error}
        </p>
      ) : null}
      {harvest ? (
        <Harvest
          source={harvest}
          disabled={tabId === undefined}
          onRun={() => void run("page")}
        />
      ) : null}
      {GROUPS.map((group) => (
        <nav
          key={group.label}
          className={styles.group}
          aria-label={group.label}
        >
          {group.commands.map(({ tool, label, command, icon }) => {
            const keys = shortcuts.get(command);
            return (
              <Button
                key={tool}
                variant="ghost"
                width="full"
                className={styles.row}
                disabled={tabId === undefined}
                onClick={() => void run(tool)}
              >
                {icon}
                <span className={styles.label}>{label}</span>
                {keys ? (
                  <Keyboard.Cluster keys={keys} density="inline" />
                ) : null}
              </Button>
            );
          })}
        </nav>
      ))}
      <MoreRows onShortcuts={onShortcuts} />
    </Shell>
  );
}
