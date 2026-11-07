import { DEFAULT_SOURCE_SYNC_PREFS } from "@pond/schema/db";
import { Dialog } from "@pond/ui";
import type { QueryResult } from "@shared/query-contracts";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startConnect } from "@/features/sources/lib/create";
import { mymindConnectFlow } from "@/features/sources/state/mymind-connect-flow";
import { sourceFlow } from "@/features/sources/state/source-flow";
import { MymindConnectForm } from ".";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  sourceFlow.close();
  mymindConnectFlow.clear();
  vi.unstubAllGlobals();
});

type FormProps = ComponentProps<typeof MymindConnectForm>;

function props(overrides: Partial<FormProps> = {}): FormProps {
  return {
    connect: vi.fn(
      async (): Promise<QueryResult<"accounts.connectMymind">> => ({
        ok: true,
        account: {
          id: "mymind-account",
          source: "mymind",
          identityKey: null,
          label: null,
          handle: null,
          addedAt: "2026-11-06T12:00:00.000Z",
          sync: DEFAULT_SOURCE_SYNC_PREFS,
        },
      }),
    ),
    onConnected: vi.fn(),
    importOlder: vi.fn(async () => {}),
    openExtensions: vi.fn(),
    ...overrides,
  };
}

async function render(input: FormProps) {
  await act(async () => {
    root.render(
      <Dialog.Root open>
        <Dialog.Portal>
          <Dialog.Popup pageId="connect-mymind" depth={1}>
            <MymindConnectForm {...input} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>,
    );
  });
}

function button(label: string) {
  const result = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label,
  );
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}

async function enterCredentials() {
  const fields = document.querySelectorAll("input");
  const values = [" test-key ", " test-secret "];
  await act(async () => {
    fields.forEach((field, index) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(field, values[index]);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
}

it("connects with a key and preserves the Account when reconnecting", async () => {
  const input = props({ accountId: "mymind-account" });
  await render(input);
  expect(document.body.textContent).toContain("after you connect");
  expect(document.querySelector('input[type="password"]')).not.toBeNull();
  expect(button("Reconnect").disabled).toBe(true);
  await enterCredentials();
  await act(async () => button("Reconnect").click());
  expect(input.connect).toHaveBeenCalledWith({
    accountId: "mymind-account",
    kid: "test-key",
    secret: "test-secret",
  });
  expect(input.onConnected).toHaveBeenCalledWith("mymind-account");
  expect(
    Array.from(document.querySelectorAll("input"), (field) => field.value),
  ).toEqual(["", ""]);
});

it("shows a connection error and permits a retry", async () => {
  const input = props({
    connect: vi.fn(
      async (): Promise<QueryResult<"accounts.connectMymind">> => ({
        ok: false,
        error: "The key was rejected.",
      }),
    ),
  });
  await render(input);
  await enterCredentials();
  await act(async () => button("Connect").click());
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    "The key was rejected.",
  );
  expect(button("Connect").disabled).toBe(false);
  expect(input.onConnected).not.toHaveBeenCalled();
});

it("uses the export flow for older items and opens key setup", async () => {
  const input = props();
  await render(input);
  await act(async () => button("Import mymind Export").click());
  await act(async () => button("Open mymind Extensions").click());
  expect(input.importOlder).toHaveBeenCalledOnce();
  expect(input.openExtensions).toHaveBeenCalledOnce();
  expect(input.connect).not.toHaveBeenCalled();
});

it("clears credentials on close and ignores a late connection reply", async () => {
  let resolve:
    | ((result: QueryResult<"accounts.connectMymind">) => void)
    | undefined;
  const pending = new Promise<QueryResult<"accounts.connectMymind">>((done) => {
    resolve = done;
  });
  const input = props({ connect: () => pending });
  await render(input);
  await enterCredentials();
  await act(async () => button("Connect").click());
  await render({ ...input, active: false });
  expect(
    Array.from(document.querySelectorAll("input"), (field) => field.value),
  ).toEqual(["", ""]);
  await act(async () =>
    resolve?.({ ok: false, error: "The key was rejected." }),
  );
  expect(input.onConnected).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')).toBeNull();
});

it("opens key setup without a browser connection request", async () => {
  const query = vi.fn();
  const connectSource = vi.fn();
  vi.stubGlobal("pond", { query, connectSource });
  await startConnect("mymind");
  expect(sourceFlow.current()).toBe("connect-mymind");
  expect(query).not.toHaveBeenCalled();
  expect(connectSource).not.toHaveBeenCalled();
});
