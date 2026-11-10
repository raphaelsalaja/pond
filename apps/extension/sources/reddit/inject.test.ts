/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import { isGraphqlSave, isSaveClick } from "./inject";

afterEach(() => {
  document.body.replaceChildren();
});

function clickIsSave(target: Element): boolean {
  let result = false;
  const read = (ev: Event) => {
    result = isSaveClick(ev);
  };
  document.addEventListener("click", read, true);
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, composed: true }),
  );
  document.removeEventListener("click", read, true);
  return result;
}

describe("isGraphqlSave", () => {
  it("captures UpdatePostSaveState when the post is being saved", () => {
    expect(
      isGraphqlSave(
        JSON.stringify({
          operation: "UpdatePostSaveState",
          variables: {
            input: { postId: "t3_abc123", saveState: "SAVED" },
          },
        }),
      ),
    ).toBe(true);
  });

  it("ignores UpdatePostSaveState when the post is being unsaved", () => {
    expect(
      isGraphqlSave(
        JSON.stringify({
          operation: "UpdatePostSaveState",
          variables: {
            input: { postId: "t3_abc123", saveState: "NONE" },
          },
        }),
      ),
    ).toBe(false);
  });

  it("ignores an unsave whose save state is nested off the input object", () => {
    expect(
      isGraphqlSave(
        '{"operation":"UpdatePostSaveState","variables":{"post":{"postId":"t3_abc123","saveState":"NONE"}}}',
      ),
    ).toBe(false);
  });

  it("still captures a save-only operation that has no state field", () => {
    expect(
      isGraphqlSave(
        JSON.stringify({
          operation: "SavePost",
          variables: { input: { postId: "t3_abc123" } },
        }),
      ),
    ).toBe(true);
  });

  it("ignores comment saves and explicit saved:false", () => {
    expect(
      isGraphqlSave(
        JSON.stringify({
          operation: "UpdateCommentSaveState",
          variables: {
            input: { commentId: "t1_abc123", saveState: "SAVED" },
          },
        }),
      ),
    ).toBe(false);
    expect(
      isGraphqlSave(
        JSON.stringify({
          operation: "UpdatePostSaveState",
          variables: { input: { postId: "t3_abc123", saved: false } },
        }),
      ),
    ).toBe(false);
  });
});

describe("isSaveClick", () => {
  it("captures an unsaved save control", () => {
    document.body.innerHTML =
      '<shreddit-post permalink="/r/test/comments/abc123/title/"><button aria-label="Save"><span>Save</span><svg icon-name="save-outline"></svg></button></shreddit-post>';
    const span = document.querySelector("span");
    if (!span) throw new Error("missing save label");
    expect(clickIsSave(span)).toBe(true);
  });

  it("ignores a click on the save label while the control is already saved", () => {
    document.body.innerHTML =
      '<shreddit-post permalink="/r/test/comments/abc123/title/"><button aria-label="Save"><span>Save</span><svg icon-name="save-fill"></svg></button></shreddit-post>';
    const span = document.querySelector("span");
    if (!span) throw new Error("missing save label");
    expect(clickIsSave(span)).toBe(false);
  });

  it("ignores the saved icon even when its name does not include fill", () => {
    document.body.innerHTML =
      '<button aria-label="Save"><svg icon-name="saved"></svg></button>';
    const icon = document.querySelector("svg");
    if (!icon) throw new Error("missing save icon");
    expect(clickIsSave(icon)).toBe(false);
  });

  it("ignores a save control inside a post that is already saved", () => {
    document.body.innerHTML =
      '<shreddit-post saved permalink="/r/test/comments/abc123/title/"><button aria-label="Save"><span>Save</span><svg icon-name="save-outline"></svg></button></shreddit-post>';
    const span = document.querySelector("span");
    if (!span) throw new Error("missing save label");
    expect(clickIsSave(span)).toBe(false);
  });

  it("ignores an unsave label and a pressed save toggle", () => {
    document.body.innerHTML =
      '<button aria-label="Save" aria-pressed="true"><span>Remove from saved</span></button>';
    const span = document.querySelector("span");
    if (!span) throw new Error("missing unsave label");
    expect(clickIsSave(span)).toBe(false);

    document.body.innerHTML =
      '<button aria-label="Save" aria-pressed="true">Save</button>';
    const pressed = document.querySelector("button");
    if (!pressed) throw new Error("missing pressed save button");
    expect(clickIsSave(pressed)).toBe(false);
  });

  it("ignores a filled save icon inside a shadow menu", () => {
    const host = document.createElement("shreddit-post-overflow-menu");
    const root = host.attachShadow({ mode: "open" });
    const item = document.createElement("div");
    item.innerHTML = '<span>Save</span><svg icon-name="save-fill"></svg>';
    root.append(item);
    document.body.append(host);
    const span = item.querySelector("span");
    if (!span) throw new Error("missing shadow save label");
    expect(clickIsSave(span)).toBe(false);
  });
});
