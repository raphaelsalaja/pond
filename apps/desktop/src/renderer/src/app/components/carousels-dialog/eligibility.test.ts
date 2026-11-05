import { describe, expect, it } from "vitest";
import { withNoticeSeen } from "@/shared/state/notices";
import { SETUP_VERSION } from "../setup/model";
import {
  SPLIT_CAROUSELS_NOTICE,
  splitCarouselsNoticeStep,
} from "./eligibility";

const done = SETUP_VERSION;

describe("splitCarouselsNoticeStep", () => {
  it("shows the notice when saves have several images or videos", () => {
    expect(
      splitCarouselsNoticeStep({
        seen: [],
        setupVersion: done,
        splittable: 12,
      }),
    ).toBe("show");
  });

  it("records the notice without showing it when nothing can split", () => {
    expect(
      splitCarouselsNoticeStep({ seen: [], setupVersion: done, splittable: 0 }),
    ).toBe("mark-seen");
  });

  it("waits for guided setup on a new install", () => {
    expect(
      splitCarouselsNoticeStep({ seen: [], setupVersion: 0, splittable: 12 }),
    ).toBe("wait");
    expect(
      splitCarouselsNoticeStep({ seen: [], setupVersion: 0, splittable: 0 }),
    ).toBe("wait");
  });

  it("never shows again once this library has seen it", () => {
    const seen = withNoticeSeen(
      ["arena-links-web-pages"],
      SPLIT_CAROUSELS_NOTICE,
    );
    expect(
      splitCarouselsNoticeStep({ seen, setupVersion: done, splittable: 12 }),
    ).toBe("skip");
    expect(
      splitCarouselsNoticeStep({ seen, setupVersion: 0, splittable: 0 }),
    ).toBe("skip");
  });
});
