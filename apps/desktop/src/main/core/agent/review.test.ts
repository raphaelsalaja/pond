import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AssistantChange,
  AssistantMetadata,
} from "../../../shared/assistant";
import { reviewChanges as review, reviewDependencies } from "./review";

interface ReviewTestState {
  changes: Array<AssistantChange>;
  title: string;
  tags: Array<string>;
  deletedAt: Date | null;
  folderIds: Array<string>;
  fail: boolean;
}
const state: ReviewTestState = {
  changes: [],
  title: "Original",
  tags: ["design"],
  deletedAt: null,
  folderIds: ["folder"],
  fail: false,
};
type Dependencies = typeof reviewDependencies;
const mock = { ...state };
const deps: Dependencies = {
  ...reviewDependencies,
  message: async () => ({
    role: "assistant",
    metadata: { changes: mock.changes },
  }),
  save: async () => ({
    id: "save",
    title: mock.title,
    tags: mock.tags,
    deletedAt: mock.deletedAt,
    notes: null,
    rating: null,
  }),
  saveMetadata: async (_id: string, metadata: AssistantMetadata) => {
    mock.changes = structuredClone(metadata.changes ?? []);
  },
  executeTransaction: async (tx) => {
    if (mock.fail) {
      throw new Error("Disk unavailable");
    }
    if (
      tx.model === "save" &&
      tx.kind === "update" &&
      tx.patch.title !== null &&
      tx.patch.title !== undefined
    ) {
      mock.title = tx.patch.title;
    }
    return {
      id: 1,
      modelName: tx.model,
      modelId: tx.id,
      action: "U",
      batchId: null,
      data: null,
      prevData: null,
      actor: "agent",
      actorReason: null,
      createdAt: new Date(),
    };
  },
  folderIdsForSave: async () => mock.folderIds,
  listFolders: async () => [
    {
      id: "folder",
      name: "Folder",
      parentId: null,
      color: null,
      sortOrder: 0,
      createdAt: new Date(),
    },
  ],
  setSaveFolders: async () => ({ ok: true, undoId: null }),
  setSaveTags: async () => ({ ok: true }),
  createFolder: async () => ({
    id: "new-folder",
    name: "References",
    parentId: null,
    color: null,
    sortOrder: 0,
    createdAt: new Date(),
  }),
};
const spy = {
  write: vi.spyOn(deps, "executeTransaction"),
  setTags: vi.spyOn(deps, "setSaveTags"),
  createFolder: vi.spyOn(deps, "createFolder"),
};
const reviewChanges = (input: Parameters<typeof review>[0]) =>
  review(input, deps);

function recordedApply(
  outcome: () => ReturnType<Dependencies["applyPondOperation"]>,
) {
  const calls: Array<Parameters<Dependencies["applyPondOperation"]>> = [];
  const apply: Dependencies["applyPondOperation"] = (...args) => {
    calls.push(args);
    return outcome();
  };
  return { calls, apply };
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.title = "Original";
  mock.tags = ["design"];
  mock.deletedAt = null;
  mock.fail = false;
  mock.changes = [
    {
      id: "change",
      saveId: "save",
      title: "Original",
      reason: "Clearer title",
      field: "title",
      before: "Original",
      after: "Proposed",
      status: "pending",
    },
  ];
});
const input = {
  messageId: "message",
  changeIds: ["change"],
  action: "apply" as const,
};

describe("reviewed library edits", () => {
  it("applies only stored selected proposals and ignores replayed Apply", async () => {
    await reviewChanges({ ...input, changeIds: ["invented"] });
    expect(spy.write).not.toHaveBeenCalled();
    await reviewChanges(input);
    expect(mock.title).toBe("Proposed");
    await reviewChanges(input);
    expect(spy.write).toHaveBeenCalledTimes(1);
  });
  it("keeps newer edits when a proposal is stale", async () => {
    mock.title = "User edited";
    const result = await reviewChanges(input);
    expect(result.changes[0]?.error).toMatch(/newer edit was kept/);
    expect(spy.write).not.toHaveBeenCalled();
  });
  it("supports Undo but refuses to overwrite later edits", async () => {
    await reviewChanges(input);
    mock.title = "Later edit";
    await reviewChanges({ ...input, action: "undo" });
    expect(mock.title).toBe("Later edit");
    expect(mock.changes[0]?.status).toBe("applied");
    mock.title = "Proposed";
    await reviewChanges({ ...input, action: "undo" });
    expect(mock.title).toBe("Original");
    expect(mock.changes[0]?.status).toBe("undone");
  });
  it("retains failures for retry and dismisses without writing", async () => {
    mock.fail = true;
    await reviewChanges(input);
    expect(mock.changes[0]).toMatchObject({
      status: "pending",
      error: "Disk unavailable",
    });
    mock.fail = false;
    await reviewChanges(input);
    expect(mock.changes[0]).toMatchObject({ status: "applied" });
    expect(mock.changes[0]?.error).toBeUndefined();
  });
  it("dismisses pending changes without touching the library", async () => {
    await reviewChanges({ ...input, action: "dismiss" });
    expect(spy.write).not.toHaveBeenCalled();
    expect(mock.changes[0]?.status).toBe("dismissed");
    await reviewChanges(input);
    expect(spy.write).not.toHaveBeenCalled();
  });
  it("applies tag, folder create, and trash proposals", async () => {
    mock.changes = [
      {
        id: "tags",
        saveId: "save",
        title: "Original",
        reason: "Add poster",
        field: "tags",
        before: ["design"],
        after: ["design", "poster"],
        status: "pending",
      },
    ];
    await reviewChanges({ ...input, changeIds: ["tags"] });
    expect(spy.setTags).toHaveBeenCalledWith("save", ["design", "poster"]);
    mock.changes = [
      {
        id: "folder",
        saveId: "",
        title: "References",
        reason: "New folder",
        field: "action",
        action: "folderCreate",
        before: null,
        after: "References",
        payload: { name: "References" },
        status: "pending",
      },
    ];
    await reviewChanges({ ...input, changeIds: ["folder"] });
    expect(spy.createFolder).toHaveBeenCalledWith({
      name: "References",
      parentId: null,
    });
    mock.changes = [
      {
        id: "trash",
        saveId: "save",
        title: "Original",
        reason: "Remove",
        field: "trash",
        before: "active",
        after: "trashed",
        status: "pending",
      },
    ];
    await reviewChanges({ ...input, changeIds: ["trash"] });
    expect(spy.write).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "trash", id: "save" }),
    );
    mock.deletedAt = new Date();
    await reviewChanges({
      messageId: "message",
      changeIds: ["trash"],
      action: "undo",
    });
    expect(spy.write).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "untrash", id: "save" }),
    );
  });
});

function operationChange(): AssistantChange {
  return {
    id: "operation",
    saveId: "",
    title: "Create a Film Folder",
    reason: "Organize references",
    field: "action",
    action: "runOperation",
    before: null,
    after: "folders.create",
    status: "pending",
    undoable: false,
    payload: {
      operation: "folders.create",
      arguments: { name: "Film" },
      libraryId: "library",
    },
  };
}

describe("Pond operation reviews", () => {
  it("applies a persisted operation once and retains its result for follow-up", async () => {
    mock.changes = [operationChange()];
    const { calls, apply } = recordedApply(async () => ({
      id: "created-folder",
      name: "Film",
    }));
    const request = {
      messageId: "message",
      changeIds: ["operation"],
      action: "apply" as const,
    };
    await review(request, { ...deps, applyPondOperation: apply });
    await review(request, { ...deps, applyPondOperation: apply });
    expect(calls).toEqual([
      [
        {
          operation: "folders.create",
          arguments: { name: "Film" },
          libraryId: "library",
        },
      ],
    ]);
    expect(mock.changes[0]).toMatchObject({
      status: "applied",
      payload: { result: { id: "created-folder" } },
    });
  });

  it("reconnects MCP servers before applying a reviewed MCP tool call", async () => {
    const change = operationChange();
    if (change.field !== "action") {
      throw new Error("Expected action fixture");
    }
    const request = {
      operation: "mcp.github.create_issue",
      arguments: { title: "Bug" },
      libraryId: "library",
    };
    mock.changes = [{ ...change, after: request.operation, payload: request }];
    let prepared = 0;
    const prepareTools = async () => {
      prepared += 1;
    };
    const { calls, apply } = recordedApply(async () => ({
      text: "Created #12",
    }));
    await review(
      { messageId: "message", changeIds: ["operation"], action: "apply" },
      { ...deps, prepareTools, applyPondOperation: apply },
    );
    expect(prepared).toBe(1);
    expect(calls).toEqual([[request]]);
    expect(mock.changes[0]).toMatchObject({ status: "applied" });
  });

  it("preserves a failed operation as pending and supports dismissal without executing", async () => {
    mock.changes = [operationChange()];
    const { calls, apply } = recordedApply(async () => {
      throw new Error("The Library changed.");
    });
    await review(
      { messageId: "message", changeIds: ["operation"], action: "apply" },
      { ...deps, applyPondOperation: apply },
    );
    expect(mock.changes[0]).toMatchObject({
      status: "pending",
      error: "The Library changed.",
    });
    await review(
      { messageId: "message", changeIds: ["operation"], action: "dismiss" },
      { ...deps, applyPondOperation: apply },
    );
    expect(mock.changes[0]).toMatchObject({ status: "dismissed" });
    expect(calls).toHaveLength(1);
  });

  it("does not execute malformed stored operation requests", async () => {
    const change = operationChange();
    if (change.field !== "action") {
      throw new Error("Expected action fixture");
    }
    change.payload = { operation: "folders.create", arguments: {} };
    mock.changes = [change];
    const { calls, apply } = recordedApply(async () => null);
    await review(
      { messageId: "message", changeIds: ["operation"], action: "apply" },
      { ...deps, applyPondOperation: apply },
    );
    expect(calls).toEqual([]);
    expect(mock.changes[0]).toMatchObject({
      status: "pending",
      error: expect.any(String),
    });
  });
});
