import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "@/app/effects/save-library-bridge";
import { primarySelection } from "@/features/saves/state/selection";
import { ToastHost } from "@/shared/components/toast-host";
import { toastManager } from "@/shared/lib/toast";
import { bridge } from "@/shared/test/pond-bridge";
import { useCardActions } from "./use-card-actions";

beforeEach(() => {
  bridge.use({
    pathForFile: () => "/tmp/drop image.png",
    query: {
      "saves.reviewImportDuplicates": () => ({ candidates: [] }),
      "saves.importFiles": () => ({ ok: true, ids: ["new-save"] }),
      "saves.quickAdd": () => ({ ok: true, id: "new-save" }),
      "saves.stageClipboard": () => ({
        ok: true,
        paths: ["/tmp/pond-clip/clipboard.png"],
      }),
    },
  });
});

afterEach(() => {
  toastManager.close();
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

it.each([
  { kind: "native file", files: [new File(["image"], "drop image.png")] },
  { kind: "file URI", files: [] },
])(
  "imports a dropped $kind and confirms the save",
  async ({ files }) => {
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
          files,
          getData: (type: string) =>
            type === "text/uri-list" ? "file:///tmp/drop%20image.png" : "",
        },
      });
      await act(async () => {
        host.firstElementChild?.dispatchEvent(event);
      });
      expect(window.pond.query).toHaveBeenCalledWith("saves.importFiles", {
        paths: ["/tmp/drop image.png"],
      });
      expect(toastText()).toContain("Saved to Pond");
    } finally {
      await act(async () => root.unmount());
    }
  },
);

it("starts a dropped link immediately and does not claim it is saved", async () => {
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
    expect(window.pond.query).toHaveBeenCalledWith("saves.quickAdd", {
      url: "https://example.com/clip",
    });
    expect(toastText()).toContain("Downloading");
    expect(toastText()).not.toContain("Saved to Pond");
  } finally {
    await act(async () => root.unmount());
  }
});

it("starts a pasted link without selecting it", async () => {
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
    expect(window.pond.query).toHaveBeenCalledWith("saves.quickAdd", {
      url: "https://example.com/clip",
    });
    expect(toastText()).toContain("Downloading");
    expect(primarySelection.get()).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});

interface FakeTransfer {
  files: Array<File>;
  types?: Array<string>;
  getData: (type: string) => string;
}

describe("inside an open folder", () => {
  const folder = { id: "type", name: "Type" };

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
    const view = await mount();
    try {
      await view.paste({
        files: [],
        types: ["text/plain"],
        getData: (type: string) =>
          type === "text/plain" ? "https://example.com/clip" : "",
      });
      expect(window.pond.query).toHaveBeenCalledWith("saves.quickAdd", {
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
      const view = await mount();
      try {
        await view.paste({ files: [], types: [type], getData: () => "" });
        expect(window.pond.query).toHaveBeenCalledWith("saves.importFiles", {
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
    const view = await mount();
    try {
      await view.drop({
        files: [new File(["image"], "drop image.png")],
        getData: () => "",
      });
      expect(window.pond.query).toHaveBeenCalledWith("saves.importFiles", {
        paths: ["/tmp/drop image.png"],
        folderIds: ["type"],
      });
      expect(toastText()).toContain('Saved to "Type"');
    } finally {
      await view.unmount();
    }
  });

  it("files a dropped link into the folder", async () => {
    const view = await mount();
    try {
      await view.drop({
        files: [],
        getData: (type: string) =>
          type === "text/uri-list" ? "https://example.com/clip" : "",
      });
      expect(window.pond.query).toHaveBeenCalledWith("saves.quickAdd", {
        folderId: "type",
        url: "https://example.com/clip",
      });
      expect(toastText()).toContain('Downloading to "Type"');
    } finally {
      await view.unmount();
    }
  });
});
