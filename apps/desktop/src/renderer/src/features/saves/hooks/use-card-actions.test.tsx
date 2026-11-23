import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/app/effects/save-library-bridge";
import { primarySelection } from "@/features/saves/state/selection";
import { ToastHost } from "@/shared/components/toast-host";
import { toastManager } from "@/shared/lib/toast";
import { useCardActions } from "./use-card-actions";

afterEach(() => {
  toastManager.close();
  vi.unstubAllGlobals();
});

function toastText(): string {
  return document.body.querySelector("[data-slot='toasts']")?.textContent ?? "";
}

function DropTarget({
  folder,
}: {
  folder?: Parameters<typeof useCardActions>[3];
}) {
  const actions = useCardActions([], "library", "", folder);
  return (
    <button type="button" onDrop={actions.onDrop}>
      Drop
    </button>
  );
}

function PasteTarget() {
  useCardActions([], "library", "");
  return null;
}

it.each(["native file", "file URI"])(
  "imports a dropped %s and confirms the save",
  async (kind) => {
    const query = vi.fn(async (operation: string) =>
      operation === "saves.reviewImportDuplicates"
        ? { candidates: [] }
        : { ok: true, ids: ["new-save"] },
    );
    vi.stubGlobal("pond", { query, pathForFile: () => "/tmp/drop image.png" });
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <>
            <DropTarget />
            <ToastHost />
          </>,
        ),
      );
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", {
        value: {
          files:
            kind === "native file"
              ? [new File(["image"], "drop image.png")]
              : [],
          getData: (type: string) =>
            type === "text/uri-list" ? "file:///tmp/drop%20image.png" : "",
        },
      });
      await act(async () => {
        host.firstElementChild?.dispatchEvent(event);
      });
      expect(query).toHaveBeenCalledWith("saves.importFiles", {
        paths: ["/tmp/drop image.png"],
      });
      expect(toastText()).toContain("Saved to Pond");
    } finally {
      await act(async () => root.unmount());
    }
  },
);

it("starts a dropped link immediately and does not claim it is saved", async () => {
  const query = vi.fn().mockResolvedValue({ ok: true, id: "pasted-save" });
  vi.stubGlobal("pond", { query });
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <>
          <DropTarget />
          <ToastHost />
        </>,
      ),
    );
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [],
        getData: (type: string) =>
          type === "text/uri-list" ? "https://example.com/clip" : "",
      },
    });
    await act(async () => {
      host.firstElementChild?.dispatchEvent(event);
    });
    expect(query).toHaveBeenCalledWith("saves.quickAdd", {
      url: "https://example.com/clip",
    });
    expect(toastText()).toContain("Downloading");
    expect(toastText()).not.toContain("Saved to Pond");
  } finally {
    await act(async () => root.unmount());
  }
});

it("starts a pasted link without selecting it", async () => {
  const query = vi.fn(async (operation: string) =>
    operation === "saves.quickAdd" ? { ok: true, id: "pasted-save" } : {},
  );
  vi.stubGlobal("pond", { query });
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <>
          <PasteTarget />
          <ToastHost />
        </>,
      ),
    );
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [],
        types: ["text/plain"],
        getData: (type: string) =>
          type === "text/plain" ? "https://example.com/clip" : "",
      },
    });
    await act(async () => {
      document.dispatchEvent(event);
    });
    expect(query).toHaveBeenCalledWith("saves.quickAdd", {
      url: "https://example.com/clip",
    });
    expect(toastText()).toContain("Downloading");
    expect(primarySelection.get()).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});

interface FakeTransfer {
  files: File[];
  types?: string[];
  getData: (type: string) => string;
}

describe("inside an open folder", () => {
  const folder = { id: "type", name: "Type" };

  function stubPond() {
    const query = vi.fn(async (operation: string) => {
      if (operation === "saves.reviewImportDuplicates")
        return { candidates: [] };
      if (operation === "saves.quickAdd") return { ok: true, id: "new-save" };
      if (operation === "saves.stageClipboard")
        return { ok: true, paths: ["/tmp/pond-clip/clipboard.png"] };
      return { ok: true, ids: ["new-save"] };
    });
    vi.stubGlobal("pond", { query, pathForFile: () => "/tmp/drop image.png" });
    return query;
  }

  async function mount() {
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <>
          <DropTarget folder={folder} />
          <ToastHost />
        </>,
      ),
    );
    return {
      async drop(dataTransfer: FakeTransfer) {
        const event = new Event("drop", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
        await act(async () => {
          host.firstElementChild?.dispatchEvent(event);
        });
      },
      async paste(clipboardData: FakeTransfer) {
        const event = new Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clipboardData", {
          value: clipboardData,
        });
        await act(async () => {
          document.dispatchEvent(event);
        });
      },
      unmount: () => act(async () => root.unmount()),
    };
  }

  it("files a pasted link into the folder", async () => {
    const query = stubPond();
    const view = await mount();
    try {
      await view.paste({
        files: [],
        types: ["text/plain"],
        getData: (type: string) =>
          type === "text/plain" ? "https://example.com/clip" : "",
      });
      expect(query).toHaveBeenCalledWith("saves.quickAdd", {
        folderId: "type",
        url: "https://example.com/clip",
      });
      expect(toastText()).toContain('Downloading to "Type"');
    } finally {
      await view.unmount();
    }
  });

  it.each(["image/png", "Files"])(
    "files a pasted %s clipboard item into the folder",
    async (type) => {
      const query = stubPond();
      const view = await mount();
      try {
        await view.paste({ files: [], types: [type], getData: () => "" });
        expect(query).toHaveBeenCalledWith("saves.importFiles", {
          paths: ["/tmp/pond-clip/clipboard.png"],
          folderIds: ["type"],
          origin: "clipboard",
        });
        expect(toastText()).toContain('Saved to "Type"');
      } finally {
        await view.unmount();
      }
    },
  );

  it("files a dropped file into the folder", async () => {
    const query = stubPond();
    const view = await mount();
    try {
      await view.drop({
        files: [new File(["image"], "drop image.png")],
        getData: () => "",
      });
      expect(query).toHaveBeenCalledWith("saves.importFiles", {
        paths: ["/tmp/drop image.png"],
        folderIds: ["type"],
      });
      expect(toastText()).toContain('Saved to "Type"');
    } finally {
      await view.unmount();
    }
  });

  it("files a dropped link into the folder", async () => {
    const query = stubPond();
    const view = await mount();
    try {
      await view.drop({
        files: [],
        getData: (type: string) =>
          type === "text/uri-list" ? "https://example.com/clip" : "",
      });
      expect(query).toHaveBeenCalledWith("saves.quickAdd", {
        folderId: "type",
        url: "https://example.com/clip",
      });
      expect(toastText()).toContain('Downloading to "Type"');
    } finally {
      await view.unmount();
    }
  });
});
