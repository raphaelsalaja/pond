import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PersonalizationForm } from "./personalization";
import type { AgentPrefs } from "./types";

function Harness({ onSave }: { onSave: (patch: Partial<AgentPrefs>) => void }) {
  const [value, setValue] = useState({
    userProfile: "Designer",
    responseInstructions: "Brief replies",
  });
  return (
    <PersonalizationForm
      value={value}
      onSave={async (patch) => {
        onSave(patch);
        setValue({
          userProfile: patch.userProfile ?? "",
          responseInstructions: patch.responseInstructions ?? "",
        });
      }}
    />
  );
}

it("saves on blur, retains edits after a failed save, and retries", async () => {
  let rejectSave = true;
  const saved: Partial<AgentPrefs>[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <Harness
          onSave={(patch) => {
            if (rejectSave) throw new Error("Disk unavailable");
            saved.push(patch);
          }}
        />,
      ),
    );
    const profile = host.querySelector<HTMLTextAreaElement>("#agent-profile");
    if (!profile) throw new Error("Missing profile field");
    expect(host.querySelector('button[type="submit"]')).toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set?.call(profile, "");
      profile.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      profile.focus();
      profile.blur();
    });
    await vi.waitFor(() => {
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        "Could not save",
      );
    });
    expect(saved).toEqual([]);
    expect(profile.value).toBe("");
    rejectSave = false;
    await act(async () => {
      profile.focus();
      profile.blur();
    });
    await vi.waitFor(() => {
      expect(saved).toEqual([
        { userProfile: "", responseInstructions: "Brief replies" },
      ]);
    });
    expect(host.querySelector('[role="alert"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
