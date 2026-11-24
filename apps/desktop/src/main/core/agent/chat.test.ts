import { DEFAULT_PREFS } from "@pond/schema/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type {
  AssistantMessage,
  AssistantQuestion,
  AssistantSend,
} from "../../../shared/assistant";
import { DEFAULT_FISH_ID } from "../../../shared/fish-contracts";
import type { Fish, FishPresence } from "../../../shared/fish-contracts";
import { routineTools } from "../fish/routine-tools";
import { sendMessage as send, stopMessage } from "./chat";
import type { ChatDependencies } from "./chat";
import type { ToolSpec } from "./complete";
import type { LibraryScope } from "./tools";

interface ChatTestState {
  prefs: typeof DEFAULT_PREFS;
  reply: ChatDependencies["completeWithTools"];
  key: string | null;
  files: Awaited<ReturnType<ChatDependencies["loadLocalAttachments"]>>;
  prepareError: Error | undefined;
  clock: number;
  history: Array<AssistantMessage>;
  question: AssistantQuestion | undefined;
  fish: Fish;
  presence: Array<[string, FishPresence]>;
  scopes: Array<LibraryScope>;
}
const replyWithText: ChatDependencies["completeWithTools"] = async (
  input,
) => {
  input.onText("Reply");
  return "Reply";
};
const readSave: ToolSpec["execute"] = async () => ({});
const koi: Fish = {
  id: DEFAULT_FISH_ID,
  name: "Koi",
  color: "orange",
  species: "koi",
  instructions: "",
  scope: { folderIds: [], tags: [] },
  model: null,
  routines: [],
  lastRun: null,
  createdAt: 0,
  updatedAt: 0,
};
const mock: ChatTestState = {
  fish: koi,
  presence: [],
  scopes: [],
  prefs: structuredClone(DEFAULT_PREFS),
  reply: replyWithText,
  key: "test-key",
  files: [],
  prepareError: undefined,
  clock: 0,
  history: [],
  question: undefined,
};
const dependencies: ChatDependencies = {
  conversationExists: async () => true,
  getPrefs: async () => mock.prefs,
  fishForChat: async () => mock.fish,
  setFishPresence: (fishId, activity) => {
    mock.presence.push([fishId, activity]);
  },
  listFolders: async () => [],
  imagesForSaves: async () => [],
  loadLocalAttachments: async () => mock.files,
  prepareTools: async () => {
    const error = mock.prepareError;
    mock.prepareError = undefined;
    if (error) {
      throw error;
    }
  },
  broadcast: () => {},
  keyFor: async () => mock.key,
  completeWithTools: (input) => mock.reply(input),
  appendMessage: async () => "persisted-user",
  now: () => mock.clock,
  listMessages: async () => mock.history,
  loadModelTranscript: async () => [],
  loadModelCatalog: async () => ({
    fetchedAt: 0,
    models: [
      ...["gpt-5.6-sol", "gpt-visible", "language-model"].map((id) => ({
        id: `openai/${id}`,
        name: id,
        type: "language",
        context_window: 256_000,
        tags: ["fast"],
        reasoning_options: [
          {
            type: "effort",
            values: ["low", "medium", "high"],
          },
        ],
      })),
      ...["vision-model", "saved-model"].map((id) => ({
        id: `openai/${id}`,
        name: id,
        type: "language",
        context_window: 256_000,
        tags: ["vision"],
        reasoning_options: [
          {
            type: "effort",
            values: ["low", "medium", "high"],
          },
        ],
      })),
    ],
  }),
  listProviderModels: async () => ({ ok: true, models: [] }),
  libraryContext: (input) => {
    mock.scopes.push(input.scope);
    return libraryContextFake();
  },
  routineTools: (input) =>
    routineTools(input, {
      createRoutine: (_fishId, fields) => {
        const routine = {
          ...fields,
          id: "ping",
          paused: false,
          lastRun: null,
          createdAt: 0,
          updatedAt: 0,
        };
        return { fish: { ...mock.fish, routines: [routine] }, routine };
      },
      updateRoutine: () => {
        throw new Error("Not used.");
      },
      deleteRoutine: () => {
        throw new Error("Not used.");
      },
      announce: () => {},
    }),
};
const libraryContextFake = (): ReturnType<
  ChatDependencies["libraryContext"]
> => ({
  onToolExecutionStart: () => {},
  onToolExecutionEnd: () => {},
  finishPending: () => {},
  tools: [
    {
      name: "readSave",
      description: "Read a Save",
      schema: z.object({ id: z.string() }),
      execute: readSave,
    },
  ],
  sources: () => [],
  changes: () => [],
  question: () => mock.question,
  suggestions: () => undefined,
  results: () => [{ title: "References", saveIds: ["film"] }],
  steps: () => [
    {
      id: "step-1",
      label: "Search library",
      status: "complete",
      elapsedMs: 10,
    },
  ],
});
const spy = {
  complete: vi.spyOn(dependencies, "completeWithTools"),
  append: vi.spyOn(dependencies, "appendMessage"),
  broadcast: vi.spyOn(dependencies, "broadcast"),
  loadFiles: vi.spyOn(dependencies, "loadLocalAttachments"),
  prepare: vi.spyOn(dependencies, "prepareTools"),
};
const sendMessage = (input: AssistantSend) => send(input, dependencies);
const request: AssistantSend = {
  chatId: "chat",
  requestId: "request",
  content: "Question",
  attachmentIds: [],
  fileAttachmentIds: [],
  scope: { kind: "library" },
  provider: "openai",
};

it("speaks as the chat's fish, follows its instructions, and searches only its scope", async () => {
  mock.fish = {
    ...koi,
    id: "librarian",
    name: "Librarian",
    instructions: "File new Saves by theme.",
    scope: { folderIds: [], tags: ["poster"] },
  };
  await sendMessage(request);
  const context = spy.complete.mock.calls.at(-1)?.[0].context;
  expect(context).toContain('"Librarian"');
  expect(context).toContain("File new Saves by theme.");
  expect(context).toContain('tags "poster"');
  expect(mock.scopes.at(-1)?.filter).toEqual({
    combinator: "or",
    rules: [{ field: "tags", operator: "some", value: ["poster"] }],
  });
  expect(mock.presence[0]).toEqual(["librarian", "thinking"]);
  expect(mock.presence.at(-1)).toEqual(["librarian", null]);
});

it("connects MCP servers before the model runs and replies even when that fails", async () => {
  mock.prepareError = new Error("spawn npx ENOENT");
  expect(await sendMessage(request)).toMatchObject({ accepted: true });
  expect(spy.append).toHaveBeenLastCalledWith(
    expect.objectContaining({ role: "assistant", content: "Reply" }),
  );
  const [prepared] = spy.prepare.mock.invocationCallOrder;
  const [completed] = spy.complete.mock.invocationCallOrder;
  expect(prepared).toBeLessThan(completed ?? 0);
});

it("leaves explicitly attached Saves outside the fish's scope filter", async () => {
  mock.fish = { ...koi, scope: { folderIds: [], tags: ["poster"] } };
  await sendMessage({
    ...request,
    scope: { kind: "attachments" },
    attachmentIds: ["film"],
  });
  expect(mock.scopes.at(-1)).toEqual({ saveIds: ["film"] });
});

it("includes saved personalization in each reply and stops including cleared fields", async () => {
  mock.prefs.agent.userProfile = "I design libraries.";
  mock.prefs.agent.responseInstructions = "Keep replies concise.";
  await sendMessage(request);
  expect(spy.complete.mock.calls.at(-1)?.[0].context).toContain(
    "I design libraries.",
  );
  expect(spy.complete.mock.calls.at(-1)?.[0].context).toContain(
    "Keep replies concise.",
  );
  mock.prefs.agent.userProfile = "";
  mock.prefs.agent.responseInstructions = "";
  await sendMessage({ ...request, requestId: "without-profile" });
  expect(spy.complete.mock.calls.at(-1)?.[0].context).not.toContain(
    "User-provided personalization",
  );
});

it.each([false, true])(
  "persists total run time, including a failed reply: %s",
  async (fails) => {
    mock.clock = 1000;
    mock.reply = async (input) => {
      mock.clock = 91_000;
      if (fails) {
        throw new Error("Provider unavailable");
      }
      input.onText("Reply");
      return "Reply";
    };
    await sendMessage(request);
    expect(spy.append).toHaveBeenLastCalledWith(
      expect.objectContaining({
        role: "assistant",
        metadata: expect.objectContaining({ elapsedMs: 90_000 }),
      }),
    );
  },
);

beforeEach(() => {
  vi.clearAllMocks();
  mock.history = [];
  mock.question = undefined;
  mock.fish = koi;
  mock.presence = [];
  mock.scopes = [];
  mock.prefs.agent = {
    ...DEFAULT_PREFS.agent,
    enabledKeys: {},
    languageModel: "openai",
    modelIds: {},
  };
  mock.key = "test-key";
  mock.files = [];
  mock.prepareError = undefined;
  mock.clock = 0;
  mock.reply = replyWithText;
});

describe("Assistant requests", () => {
  it("sends to the chosen provider without a cloud consent gate", async () => {
    expect(await sendMessage(request)).toMatchObject({ accepted: true });
    expect(spy.append).toHaveBeenCalledTimes(2);
    expect(spy.append).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          results: [{ title: "References", saveIds: ["film"] }],
          steps: [
            {
              id: "step-1",
              label: "Search library",
              status: "complete",
              elapsedMs: 10,
            },
          ],
        }),
      }),
    );
    expect(spy.complete).toHaveBeenCalledOnce();
    expect(spy.complete.mock.calls[0]?.[0].model).toBe("gpt-5.6-sol");
  });
  it("loads registered local files without adding them to the library", async () => {
    const file = {
      id: "file-1",
      name: "reference.pdf",
      mediaType: "application/pdf",
      size: 4,
      data: Buffer.from("test"),
    };
    mock.files = [file];

    await sendMessage({
      ...request,
      requestId: "local-files",
      fileAttachmentIds: [file.id],
    });

    expect(spy.loadFiles).toHaveBeenCalledExactlyOnceWith([file.id]);
    expect(spy.complete).toHaveBeenCalledWith(
      expect.objectContaining({ files: [file] }),
    );
    expect(spy.append).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        metadata: expect.objectContaining({
          files: [
            {
              id: file.id,
              name: file.name,
              mediaType: file.mediaType,
              size: file.size,
            },
          ],
        }),
      }),
    );
  });
  it("uses the saved model id for the chosen provider", async () => {
    mock.prefs.agent = {
      ...DEFAULT_PREFS.agent,
      enabledKeys: {},
      languageModel: "openai",
      modelIds: { openai: "gpt-5.4-mini" },
    };
    expect(await sendMessage(request)).toMatchObject({ accepted: true });
    expect(spy.complete.mock.calls[0]?.[0].model).toBe("gpt-5.4-mini");
  });
  it("uses the model and controls snapshotted by the composer", async () => {
    await sendMessage({
      ...request,
      modelId: "gpt-visible",
      controls: {
        fast: true,
        contextTokens: 256_000,
        reasoning: "high",
      },
    });
    expect(spy.complete.mock.calls[0]?.[0]).toMatchObject({
      model: "gpt-visible",
      controls: {
        fast: true,
        contextTokens: 256_000,
        reasoning: "high",
      },
    });
  });
  it("removes unverified controls for models without catalog metadata", async () => {
    await sendMessage({
      ...request,
      modelId: "custom-model",
      controls: {
        fast: true,
        contextTokens: 256_000,
        reasoning: "high",
      },
    });
    expect(spy.complete.mock.calls[0]?.[0].controls).toEqual({
      fast: false,
      contextTokens: 64_000,
      reasoning: "provider-default",
    });
  });
  it("checks provider keys before adding a user message", async () => {
    mock.key = null;
    expect(await sendMessage(request)).toHaveProperty("error");
    expect(spy.append).not.toHaveBeenCalled();
  });
  it("rejects empty attachment scope instead of searching the whole library", async () => {
    expect(
      await sendMessage({
        ...request,
        scope: { kind: "attachments" },
      }),
    ).toHaveProperty("error");
    expect(spy.complete).not.toHaveBeenCalled();
  });
  it("cancels only the matching request and preserves partial text", async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    mock.reply = async (input) => {
      input.onText("Partial reply");
      started();
      await new Promise((_, reject) => {
        input.abortController.signal.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      });
      return "";
    };
    const result = sendMessage(request);
    await ready;
    expect(stopMessage("chat", "different-request")).toEqual({
      ok: false,
      error: "This reply already finished.",
    });
    expect(
      await sendMessage({
        ...request,
        requestId: "duplicate",
      }),
    ).toHaveProperty("error");
    expect(stopMessage("chat", "request")).toEqual({ ok: true });
    expect(await result).toMatchObject({ stopped: true, accepted: true });
    expect(spy.append).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: "Partial reply",
        metadata: expect.objectContaining({ stopped: true }),
      }),
    );
    expect(
      spy.broadcast.mock.calls.some(
        ([, chunk]) =>
          z.object({ type: z.string() }).parse(chunk).type === "done",
      ),
    ).toBe(false);
    expect(stopMessage("chat", "request")).toEqual({
      ok: false,
      error: "This reply already finished.",
    });
  });
});

it("persists a question even when there is no duplicate prose answer", async () => {
  mock.question = {
    question: "Which topic?",
    options: ["Film", "Architecture"],
  };
  mock.reply = async () => "";
  expect(await sendMessage(request)).toMatchObject({
    accepted: true,
  });
  expect(spy.append).toHaveBeenLastCalledWith(
    expect.objectContaining({
      role: "assistant",
      content: "",
      metadata: expect.objectContaining({ question: mock.question }),
    }),
  );
});
it("links a freeform reply to the latest unanswered question", async () => {
  mock.history = [
    {
      id: "question",
      chatId: "chat",
      role: "assistant",
      content: "",
      metadata: {
        question: {
          question: "Which topic?",
          options: ["Film", "Architecture"],
        },
      },
    },
  ];
  await sendMessage({ ...request, content: "Typography" });
  expect(spy.append).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      content: "Typography",
      metadata: expect.objectContaining({ replyToQuestion: "question" }),
    }),
  );
  expect(spy.complete.mock.calls[0]?.[0].messages[0]?.content).toContain(
    "Which topic?",
  );
});
it("rejects stale or foreign question replies before appending", async () => {
  const result = await sendMessage({
    ...request,
    replyToQuestion: "foreign",
  });
  expect(result.error).toMatch(/no longer awaiting/);
  expect(spy.append).not.toHaveBeenCalled();
  expect(spy.complete).not.toHaveBeenCalled();
});

it("sends Save images to a selected local vision model", async () => {
  mock.prefs.agent = {
    ...mock.prefs.agent,
    enabledKeys: { ollama: true },
    languageModel: "ollama",
    modelIds: { ollama: "gemma4:e2b" },
  };
  const image = { mimeType: "image/png", data: "test-image" };
  const result = await send(
    {
      ...request,
      provider: "ollama",
      modelId: "gemma4:e2b",
      attachmentIds: ["image-save"],
    },
    {
      ...dependencies,
      imagesForSaves: async () => [image],
      listProviderModels: async () => ({
        ok: true,
        models: [
          {
            id: "gemma4:e2b",
            name: "Gemma 4 E2B",
            modelCapabilities: {
              text: true,
              vision: true,
              audio: false,
              tools: true,
            },
          },
        ],
      }),
    },
  );

  expect(result).toMatchObject({ accepted: true });
  expect(result.error).toBeUndefined();
  expect(spy.complete).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: "ollama",
      model: "gemma4:e2b",
      images: [image],
    }),
  );
});

it("rejects Save images before transport for a selected text-only local model", async () => {
  mock.prefs.agent = {
    ...mock.prefs.agent,
    enabledKeys: { ollama: true },
    languageModel: "ollama",
    modelIds: { ollama: "llama3.2" },
  };
  const result = await send(
    {
      ...request,
      provider: "ollama",
      modelId: "llama3.2",
      attachmentIds: ["image-save"],
    },
    {
      ...dependencies,
      imagesForSaves: async () => [
        { mimeType: "image/png", data: "test-image" },
      ],
      listProviderModels: async () => ({
        ok: true,
        models: [
          {
            id: "llama3.2",
            name: "Llama 3.2",
            modelCapabilities: {
              text: true,
              vision: false,
              audio: false,
              tools: true,
            },
          },
        ],
      }),
    },
  );

  expect(result.error).toBe("Choose a vision model in Settings Models.");
  expect(spy.complete).not.toHaveBeenCalled();
});

it("rejects local image files before transport for a selected text-only model", async () => {
  mock.prefs.agent = {
    ...mock.prefs.agent,
    enabledKeys: { ollama: true },
    languageModel: "ollama",
    modelIds: { ollama: "llama3.2" },
  };
  mock.files = [
    {
      id: "image-file",
      name: "reference.png",
      mediaType: "image/png",
      size: 4,
      data: Buffer.from("test"),
    },
  ];

  const result = await send(
    {
      ...request,
      provider: "ollama",
      modelId: "llama3.2",
      fileAttachmentIds: ["image-file"],
    },
    {
      ...dependencies,
      listProviderModels: async () => ({
        ok: true,
        models: [
          {
            id: "llama3.2",
            name: "Llama 3.2",
            modelCapabilities: {
              text: true,
              vision: false,
              audio: false,
              tools: true,
            },
          },
        ],
      }),
    },
  );

  expect(result.error).toBe("Choose a vision model in Settings Models.");
  expect(spy.complete).not.toHaveBeenCalled();
});

it("gives the next reply the current review outcome and created IDs", async () => {
  mock.history = [
    {
      id: "previous",
      chatId: "chat",
      role: "assistant",
      content: "Ready to create the Folder.",
      metadata: {
        changes: [
          {
            id: "change",
            saveId: "",
            title: "Create Film Folder",
            reason: "Organize",
            field: "action",
            action: "runOperation",
            before: null,
            after: "folders.create",
            status: "applied",
            payload: {
              operation: "folders.create",
              arguments: { name: "Film" },
              libraryId: "library",
              result: { id: "created-folder" },
            },
          },
        ],
      },
    },
  ];
  await sendMessage(request);
  expect(spy.complete).toHaveBeenCalledWith(
    expect.objectContaining({
      context: expect.stringContaining('"status":"applied"'),
    }),
  );
  expect(spy.complete).toHaveBeenCalledWith(
    expect.objectContaining({
      context: expect.stringContaining('"id":"created-folder"'),
    }),
  );
});

describe("separate messages", () => {
  const ask = { ...request, content: "send me 3 separate messages" };

  it("saves 'send me 3 separate messages' as exactly three ordered messages", async () => {
    mock.reply = async (input) => {
      const reply =
        "Hey!\n[[next]]\nHere's the second.\n[[next]]\nAnd the third.";
      input.onText(reply);
      return reply;
    };
    await sendMessage(ask);
    expect(spy.append).toHaveBeenLastCalledWith(
      expect.objectContaining({
        role: "assistant",
        content: "Hey!\n\nHere's the second.\n\nAnd the third.",
        metadata: expect.objectContaining({
          messages: ["Hey!", "Here's the second.", "And the third."],
        }),
      }),
    );
  });

  it("keeps a numbered reply as one message, exactly as written", async () => {
    const numbered = "1. Hey!\n2. Here's the second.\n3. And the third.";
    mock.reply = async (input) => {
      input.onText(numbered);
      return numbered;
    };
    await sendMessage(ask);
    const saved = spy.append.mock.calls.at(-1)?.[0];
    expect(saved?.content).toBe(numbered);
    expect(saved?.metadata?.messages).toBeUndefined();
  });

  it("gives the model its earlier separate messages back with their breaks", async () => {
    mock.history = [
      { id: "u", chatId: "chat", role: "user", content: "Hi", metadata: null },
      {
        id: "a",
        chatId: "chat",
        role: "assistant",
        content: "One\n\nTwo",
        metadata: { messages: ["One", "Two"] },
      },
    ];
    await sendMessage(request);
    expect(
      spy.complete.mock.calls.at(-1)?.[0].messages.map((row) => row.content),
    ).toContain("One\n[[next]]\nTwo");
  });
});

describe("routines", () => {
  it("sets up a routine from chat and records it on the reply", async () => {
    mock.reply = async (input) => {
      const create = input.tools.find((tool) => tool.name === "createRoutine");
      await create?.execute({
        name: "Weekday morning ping",
        instruction: "Say good morning.",
        when: { kind: "daily", time: "08:00", days: [1, 2, 3, 4, 5] },
      });
      input.onText("Done. Weekdays around 8:00 AM.");
      return "Done.";
    };
    await sendMessage({ ...request, content: "Ping me every weekday at 8" });
    expect(spy.complete.mock.calls.at(-1)?.[0].context).toContain(
      "You have no routines yet.",
    );
    expect(spy.append).toHaveBeenLastCalledWith(
      expect.objectContaining({
        role: "assistant",
        metadata: expect.objectContaining({
          routineEvents: [
            {
              kind: "created",
              fishId: DEFAULT_FISH_ID,
              routineId: "ping",
              name: "Weekday morning ping",
            },
          ],
        }),
      }),
    );
  });

  it("leaves routine tools out of a routine's own run", async () => {
    await sendMessage({
      ...request,
      routine: { trigger: "schedule", routineId: "ping", name: "Ping" },
    });
    const tools = spy.complete.mock.calls.at(-1)?.[0].tools ?? [];
    expect(tools.map((tool) => tool.name)).not.toContain("createRoutine");
  });
});
