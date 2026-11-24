import type {
  LibraryHealthCheck,
  MediaWarmSnapshot,
} from "@shared/library-health-contracts";
import type { QueryInput } from "@shared/query-contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { buildHealthCategories } from "./categories";
import type { HealthCategory } from "./categories";
import { HealthDrilldown } from "./drilldown";
import { HealthOverview } from "./overview";

const MEDIA: MediaWarmSnapshot = {
  state: "complete",
  prepared: 0,
  remaining: 0,
  currentTitle: null,
  pauseReason: null,
  lastError: null,
  pendingPosters: 0,
  activeSaveIds: [],
  discovering: false,
  failures: [],
};

const CHECK: LibraryHealthCheck = {
  checkedAt: Date.now() - 60_000,
  durationMs: 10,
  saves: 2,
  counts: {
    thumbnails: 0,
    "physical-file-names": 0,
    "invalid-content": 1,
    "save-metadata": 0,
    "eagle-previews": 0,
    posters: 0,
    unverified: 1,
  },
  issues: [
    {
      kind: "invalid-content",
      saveId: "gone",
      title: "Gone",
      summary: "Files are missing or damaged",
      detail: "Every original file is missing.",
      originals: "unusable",
      files: [
        {
          path: "gone.png",
          kind: "image",
          expectedSize: 2048,
          foundSize: null,
          finding: "missing",
        },
      ],
    },
  ],
  posters: [],
  unverified: [{ saveId: "locked", title: "Locked", reason: "EACCES" }],
  index: { orphans: [], missing: [], unreadable: [], backupError: null },
  indexError: null,
};

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let checks: number;
let rechecks: Array<QueryInput<"libraryHealth.recheck">>;

beforeEach(() => {
  checks = 0;
  rechecks = [];
  bridge.use({
    query: {
      "libraryHealth.overview": () => ({
        check: null,
        job: null,
        media: MEDIA,
      }),
      "libraryHealth.check": () => {
        checks += 1;
        return {
          id: "job",
          status: "running",
          processed: 0,
          total: 2,
          startedAt: 1,
          error: null,
        };
      },
      "libraryHealth.recheck": (input) => {
        rechecks.push(input);
        return CHECK;
      },
      "pipeline.status": () => ({ paused: false, inflight: 0 }),
      "pipeline.inflight": () => [],
      "downloads.ingestingOrFailed": () => [],
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

async function render(node: ReactNode) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MotionConfig reducedMotion="always">{node}</MotionConfig>
      </QueryClientProvider>,
    );
  });
  await settle();
}

function button(label: string) {
  const found = [...document.querySelectorAll("button")].find(
    (node) =>
      node.textContent === label || node.getAttribute("aria-label") === label,
  );
  if (!found) {
    throw new Error(`Missing button ${label}`);
  }
  return found;
}

async function click(label: string) {
  const node = button(label);
  await act(async () => node.click());
  await settle();
}

it("waits for you to check the library", async () => {
  await render(<HealthOverview />);

  expect(document.body.textContent).toContain("Not checked yet");
  expect(checks).toBe(0);

  await click("Check Library");

  expect(checks).toBe(1);
});

it("drills into a category and rechecks only the Saves you filter to", async () => {
  const categories = buildHealthCategories({
    overview: { check: CHECK, job: null, media: MEDIA },
    downloads: [],
    enrichment: { inflight: 0, failures: [], missingIds: new Set() },
    title: () => null,
    device: "this Mac",
  });
  const originals = categories.find((item) => item.id === "originals");
  if (!originals) {
    throw new Error("Missing originals");
  }

  await render(<Drilldown category={originals} />);

  expect(document.body.textContent).toContain("Gone");
  expect(document.body.textContent).toContain("Locked");

  await click("GoneFiles are missing or damaged");

  expect(document.body.textContent).toContain("Expected");
  expect(document.body.textContent).toContain(
    "Original files that match their saved size and checksum.",
  );
  expect(document.body.textContent).toContain("gone.png is missing.");
  expect(document.body.textContent).toContain("Missing or damaged.");
  expect(document.body.textContent).toContain("2 KiB");

  await click("Couldn't Verify 1");

  expect(document.body.textContent).not.toContain("Gone");
  await click("Recheck 1 Save");

  expect(rechecks).toEqual([{ saveIds: ["locked"] }]);
});

function Drilldown({ category }: { category: HealthCategory }) {
  return (
    <HealthDrilldown
      category={category}
      open
      onOpenChange={() => {}}
      downloads={[]}
    />
  );
}
