import { expect, it, vi } from "vitest";
import { selectAllInTextField } from "./select-all";

function contents(focused: unknown) {
  return {
    executeJavaScript: vi.fn(async () => focused),
    selectAll: vi.fn(),
  };
}

it("selects text when a text field has focus", async () => {
  const page = contents(true);
  await selectAllInTextField(page);
  expect(page.selectAll).toHaveBeenCalledOnce();
});

it("leaves page text alone outside a text field", async () => {
  const page = contents(false);
  await selectAllInTextField(page);
  expect(page.selectAll).not.toHaveBeenCalled();
});

it("leaves page text alone when the page can't answer", async () => {
  const page = contents(false);
  page.executeJavaScript.mockRejectedValueOnce(new Error("navigating"));
  await selectAllInTextField(page);
  expect(page.selectAll).not.toHaveBeenCalled();
});
