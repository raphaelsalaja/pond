import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uniqueById } from "../src/lib/pages";

void describe("uniqueById", () => {
  void test("keeps the first copy of each id in order", () => {
    const pages = [{ id: "a" }, { id: "b" }, { id: "a" }, { id: "c" }, { id: "b" }];
    assert.deepEqual(uniqueById(pages), [{ id: "a" }, { id: "b" }, { id: "c" }]);
  });
});
