import { openSettings } from "@/shared/lib/open-settings";
import { notify, TOAST_TIMEOUT_MS } from "@/shared/lib/toast";
import { type PromptChoice, readImportedFrom } from "@/shared/state/prompts";
import { supportDialog } from "@/shared/state/support";

const SITE = "https://pond.raphaelsalaja.com";
const GITHUB = "https://github.com/raphaelsalaja/pond";
const X = "https://x.com/raphaelsalaja";
const FEEDBACK = "mailto:raphaelsalaja@gmail.com?subject=Pond%20feedback";

export interface PromptSpec {
  title: string;
  description: string;
  confirm: string;
  run: (helpers: { openExtension: () => void }) => void | Promise<void>;
}

function visit(url: string): void {
  void window.pond.openExternal(url);
}

function shareMilestone(count: string): void {
  const text = `My Pond library passed ${count} saves. Pond is a free, open-source archiver for everything you save online. ${SITE}`;
  visit(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`);
}

function milestone(count: string): PromptSpec {
  return {
    title: `${count} Saves`,
    description: `Your library passed ${count} saves, all kept on this computer.`,
    confirm: "Share on X",
    run: () => shareMilestone(count),
  };
}

function importedName(): string {
  return readImportedFrom() === "mymind" ? "mymind" : "Eagle";
}

export function promptSpec(id: PromptChoice): PromptSpec {
  switch (id) {
    case "support":
      return {
        title: "Help Pond Keep Growing",
        description:
          "Pond is made by one person. If it helps you, a coffee funds its development.",
        confirm: "Support Pond",
        run: () => supportDialog.open(),
      };
    case "milestone-10000":
      return milestone("10,000");
    case "milestone-1000":
      return milestone("1,000");
    case "friend": {
      const name = importedName();
      return {
        title: "Bring a Friend Along",
        description: `Your ${name} library lives in Pond now. Send the link to someone else moving off ${name}.`,
        confirm: "Copy Link",
        run: async () => {
          await window.pond.query("clipboard.writeText", { text: SITE });
          notify({
            id: "prompt-link",
            title: "Link copied",
            timeout: TOAST_TIMEOUT_MS,
          });
        },
      };
    }
    case "github":
      return {
        title: "Star Pond on GitHub",
        description:
          "Pond updates from its GitHub releases. A star there helps more people find it.",
        confirm: "Star on GitHub",
        run: () => visit(GITHUB),
      };
    case "x":
      return {
        title: "Follow Along on X",
        description:
          "Your X saves are in Pond now. Follow Raphael for new features and fixes.",
        confirm: "Follow on X",
        run: () => visit(X),
      };
    case "extension":
      return {
        title: "Save From Your Browser",
        description:
          "The Pond extension saves pages and images from your browser into your library.",
        confirm: "Get the Extension",
        run: ({ openExtension }) => openExtension(),
      };
    case "mcp-cursor":
      return {
        title: "Search Pond From Cursor",
        description:
          "Connect Cursor so it can search your library. Everything stays on this computer.",
        confirm: "Add to Cursor",
        run: async () => {
          await window.pond.query("agent.openMcpInstall", { id: "cursor" });
        },
      };
    case "mcp-claude":
      return {
        title: "Search Pond From Claude",
        description:
          "Connect Claude Desktop so it can search your library. Everything stays on this computer.",
        confirm: "Set Up Claude",
        run: () => openSettings("mcp"),
      };
    case "feedback":
      return {
        title: "Share Your Feedback",
        description:
          "You've used Pond for two weeks. Tell Raphael what works and what gets in your way.",
        confirm: "Send Feedback",
        run: () => visit(FEEDBACK),
      };
  }
}
