import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  addSavesToCanvas,
  createCanvas,
  deleteCanvas,
  listCanvases,
  readCanvas,
  renameCanvas,
  updateCanvas,
} from "./canvases";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function library(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pond-canvases-"));
  roots.push(root);
  return root;
}

it("stores each Canvas as a plain file in the Library and lists them in creation order", async () => {
  const root = await library();
  const first = createCanvas({ name: "App idea" }, root, 1);
  const second = createCanvas({}, root, 2);
  const third = createCanvas({}, root, 3);

  expect(listCanvases(root).map((canvas) => canvas.name)).toEqual([
    "App idea",
    "Untitled",
    "Untitled 2",
  ]);
  const stored = JSON.parse(
    await readFile(join(root, "canvases", `${first.id}.json`), "utf8"),
  );
  expect(stored.data).toMatchObject({ id: first.id, name: "App idea" });
  expect(readCanvas(second.id, root)?.name).toBe("Untitled");
  expect(third.items).toEqual([]);
});

it("places added Saves to the right of existing content and skips Saves already on the Canvas", async () => {
  const root = await library();
  const canvas = createCanvas({ saveIds: ["a", "b"] }, root, 1);
  expect(canvas.items.map((item) => item.kind)).toEqual(["save", "save"]);

  const right = Math.max(...canvas.items.map((item) => item.x + item.width));
  const next = addSavesToCanvas(canvas.id, ["b", "c"], root, 2);
  const added = next.items.filter(
    (item) => item.kind === "save" && item.saveId === "c",
  );
  expect(next.items).toHaveLength(3);
  expect(added[0]?.x).toBeGreaterThan(right);
  expect(listCanvases(root)[0]?.saveIds).toEqual(["a", "b", "c"]);
});

it("lays a large set of Saves out in a roughly square grid", async () => {
  const root = await library();
  const ids = Array.from({ length: 100 }, (_, index) => `save-${index}`);
  const canvas = createCanvas({ name: "Inspiration", saveIds: ids }, root, 1);

  const columns = new Set(canvas.items.map((item) => item.x));
  const rows = new Set(canvas.items.map((item) => item.y));
  expect(canvas.name).toBe("Inspiration");
  expect(columns.size).toBe(10);
  expect(rows.size).toBe(10);
});

it("stops adding Saves once the Canvas is full instead of writing an unreadable file", async () => {
  const root = await library();
  const ids = Array.from({ length: 5_003 }, (_, index) => `save-${index}`);
  const canvas = createCanvas({ saveIds: ids.slice(0, 4_999) }, root, 1);

  const full = addSavesToCanvas(canvas.id, ids, root, 2);
  expect(full.items).toHaveLength(5_000);
  expect(readCanvas(canvas.id, root)?.items).toHaveLength(5_000);
  expect(addSavesToCanvas(canvas.id, ["another"], root, 3).updatedAt).toBe(2);
});

it("keeps the stored name when content is updated and rejects connectors to missing items", async () => {
  const root = await library();
  const canvas = createCanvas({ name: "Typography" }, root, 1);
  renameCanvas(canvas.id, "  Type study  ", root, 2);
  const note = {
    kind: "note" as const,
    id: "note-1",
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    text: "Why this font",
    color: "yellow" as const,
  };
  updateCanvas(
    canvas.id,
    { viewport: { x: 10, y: 20, zoom: 1.5 }, items: [note], connectors: [] },
    root,
    3,
  );
  expect(readCanvas(canvas.id, root)).toMatchObject({
    name: "Type study",
    updatedAt: 3,
    viewport: { x: 10, y: 20, zoom: 1.5 },
    items: [note],
  });

  expect(() =>
    updateCanvas(
      canvas.id,
      {
        viewport: { x: 0, y: 0, zoom: 1 },
        items: [note],
        connectors: [
          {
            id: "line",
            from: "note-1",
            to: "gone",
            fromSide: "right",
            toSide: "left",
          },
        ],
      },
      root,
    ),
  ).toThrow();
  expect(readCanvas(canvas.id, root)?.items).toEqual([note]);
});

it("reads connectors saved before they had a style", async () => {
  const root = await library();
  const canvas = createCanvas({}, root, 1);
  const note = (id: string) => ({
    kind: "note",
    id,
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    text: "",
    color: "yellow",
  });
  await writeFile(
    join(root, "canvases", `${canvas.id}.json`),
    JSON.stringify({
      schemaVersion: 1,
      updatedAt: 1,
      data: {
        ...canvas,
        items: [note("a"), note("b")],
        connectors: [
          { id: "line", from: "a", to: "b", fromSide: "right", toSide: "left" },
        ],
      },
    }),
  );
  expect(readCanvas(canvas.id, root)?.connectors).toEqual([
    {
      id: "line",
      from: "a",
      to: "b",
      fromSide: "right",
      toSide: "left",
      line: "curved",
      startArrow: false,
      endArrow: true,
      dashed: false,
      color: "gray",
      label: "",
    },
  ]);
});

it("refuses IDs that could escape the canvases folder and reports damaged files", async () => {
  const root = await library();
  expect(() => readCanvas("../metadata", root)).toThrow();

  const canvas = createCanvas({}, root, 1);
  await writeFile(join(root, "canvases", `${canvas.id}.json`), "{not json");
  expect(() => readCanvas(canvas.id, root)).toThrow(
    "This canvas could not be read.",
  );
  expect(listCanvases(root)).toEqual([]);

  deleteCanvas(canvas.id, root);
  expect(readCanvas(canvas.id, root)).toBeNull();
  expect(() => renameCanvas(canvas.id, "Gone", root)).toThrow(
    "This canvas no longer exists.",
  );
});
