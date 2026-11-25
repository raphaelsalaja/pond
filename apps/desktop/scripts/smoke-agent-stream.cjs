const { app, BrowserWindow, ipcMain } = require("electron");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const sandbox = mkdtempSync(path.join(tmpdir(), "pond-agent-stream-"));
app.setPath("userData", sandbox);
app.on("quit", () => rmSync(sandbox, { recursive: true, force: true }));
const timeout = setTimeout(() => {
  console.error("AGENT_STREAM_FAILED: reply did not finish");
  app.exit(1);
}, 30_000);

void app.whenReady().then(async () => {
  try {
    const { build } = await import("vite");
    const bundle = await build({
      configFile: false,
      logLevel: "error",
      build: {
        write: false,
        minify: false,
        lib: {
          entry: path.resolve(
            __dirname,
            "../src/renderer/src/features/agent/state/chat-transport.ts",
          ),
          name: "PondChatTransport",
          formats: ["iife"],
        },
      },
    });
    const output = (Array.isArray(bundle) ? bundle[0] : bundle).output.find(
      (part) => part.type === "chunk",
    );
    assert.ok(output);
    let cancelPortClosed;
    const cancelled = new Promise((resolve) => {
      cancelPortClosed = resolve;
    });
    ipcMain.on("pond:agent-stream", (event, body) => {
      const port = event.ports[0];
      port.start();
      if (body.mode === "cancel") {
        port.on("close", cancelPortClosed);
        return;
      }
      const chunks = [
        { type: "start", messageId: "reply" },
        { type: "text-start", id: "text" },
        { type: "text-delta", id: "text", delta: "Hello 🌊" },
        { type: "text-end", id: "text" },
        { type: "finish", finishReason: "stop" },
      ];
      const bytes = new TextEncoder().encode(
        chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
          "data: [DONE]\n\n",
      );
      for (let offset = 0; offset < bytes.length; offset += 7) {
        port.postMessage(bytes.slice(offset, offset + 7));
      }
      port.close();
    });
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.resolve(__dirname, "../out/preload/index.cjs"),
        contextIsolation: true,
        sandbox: true,
      },
    });
    await window.loadURL("about:blank");
    await window.webContents.executeJavaScript(output.code);
    const result = await window.webContents.executeJavaScript(`(async () => {
      try {
        const transport = PondChatTransport.pondChatTransport();
        const stream = await transport.sendMessages({
          trigger: 'submit-message', chatId: 'fixture', body: { requestId: 'fixture-request' },
          messages: [{ id: 'user', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
          abortSignal: new AbortController().signal,
        });
        let text = '';
        for await (const chunk of stream) {
          if (chunk.type === 'text-delta') text += chunk.delta;
        }
        const abort = new AbortController();
        const response = await PondChatTransport.ipcChatFetch('pond://agent', {
          body: JSON.stringify({ mode: 'cancel' }), signal: abort.signal,
        });
        const read = response.body.getReader().read().catch((error) => error.name);
        abort.abort();
        return { text, cancelled: await read };
      } catch (error) { return { error: error.message }; }
    })()`);
    assert.equal(result.error, undefined);
    assert.equal(result.text, "Hello 🌊");
    assert.equal(result.cancelled, "AbortError");
    await cancelled;
    clearTimeout(timeout);
    console.log(
      "AGENT_STREAM_PASSED: real Electron bridge streams replies, completes, and cancels",
    );
    app.quit();
  } catch (error) {
    clearTimeout(timeout);
    console.error("AGENT_STREAM_FAILED", error);
    app.exit(1);
  }
});
