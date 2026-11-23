import { act, type ComponentProps, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Navigator } from "./";

type Pose = ComponentProps<typeof Navigator>["pose"];

function Harness({
  initial,
  onPose,
}: {
  initial: Pose;
  onPose: (next: Pose) => void;
}) {
  const [pose, setPose] = useState(initial);
  return (
    <Navigator
      src="pond://fixture/image"
      pose={pose}
      stage={{ width: 1000, height: 500 }}
      bounds={{ width: 1000, height: 500 }}
      onPose={(next) => {
        onPose(next);
        setPose(next);
      }}
    />
  );
}

it("pans with arrows, clamps to the image, and centers with keyboard activation", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const globalKey = vi.fn();
  document.addEventListener("keydown", globalKey);
  let observed: Pose = { zoom: 2, x: 0, y: 0 };
  try {
    await act(async () =>
      root.render(
        <Harness
          initial={observed}
          onPose={(next) => {
            observed = next;
          }}
        />,
      ),
    );
    const button = host.querySelector("button");
    if (!button) throw new Error("Missing navigator");
    await act(async () =>
      button.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
    );
    expect(observed.x).toBeCloseTo(-40);
    expect(globalKey).not.toHaveBeenCalled();
    for (let index = 0; index < 10; index++)
      await act(async () =>
        button.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowDown",
            shiftKey: true,
            bubbles: true,
          }),
        ),
      );
    expect(observed.y).toBeCloseTo(-250);
    await act(async () => button.click());
    expect(observed).toEqual({ zoom: 2, x: 0, y: 0 });
  } finally {
    document.removeEventListener("keydown", globalKey);
    await act(async () => root.unmount());
    host.remove();
  }
});
