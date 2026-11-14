import { FIELD_DESCRIPTORS } from "@pond/schema/filters/fields";
import { expect, it } from "vitest";
import { normalise, SavePatchSchema } from "./reconcile";

it("keeps the sensitive content result on pool saves", () => {
  const save = normalise(
    SavePatchSchema.parse({
      id: "a",
      sensitiveScore: 0.91,
      sensitiveModel: "model@revision",
    }),
  );
  expect(save?.sensitiveScore).toBe(0.91);
  expect(save?.sensitiveModel).toBe("model@revision");
  expect(save && FIELD_DESCRIPTORS.sensitiveContent.project(save)).toBe(
    "likely-sensitive",
  );
});

it("keeps Inbox state on pool saves and drops unknown states", () => {
  const save = normalise(
    SavePatchSchema.parse({ id: "a", inboxState: "snoozed", inboxUntil: 5 }),
  );
  expect(save).toMatchObject({ inboxState: "snoozed", inboxUntil: 5 });
  expect(save && FIELD_DESCRIPTORS.inbox.project(save)).toBe("snoozed");
  expect(
    normalise(SavePatchSchema.parse({ id: "b", inboxState: "later" }))
      ?.inboxState,
  ).toBeNull();
});
