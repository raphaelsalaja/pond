import { expect, it, vi } from "vitest";
import { selectAllInTextField } from "./select-all";

function contents(answer: () => Promise<boolean>) {
  return {
    executeJavaScript: answer,
    selectAll: vi.fn(),
  };
}

it("selects text when a text field has focus", async () => {
  const page = contents(async () => true);
  await selectAllInTextField(page);
  expect(page.selectAll).toHaveBeenCalledOnce();
});

it("leaves page text alone outside a text field", async () => {
  const page = contents(async () => false);
  await selectAllInTextField(page);
  expect(page.selectAll).not.toHaveBeenCalled();
});

it("leaves page text alone when the page can't answer", async () => {
  const page = contents(async () => {
    throw new Error("navigating");
  });
  await selectAllInTextField(page);
  expect(page.selectAll).not.toHaveBeenCalled();
});
