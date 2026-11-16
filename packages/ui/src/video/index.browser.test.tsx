import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Video } from ".";

async function renderPlayer(name?: string) {
  const screen = await render(
    <Video.Root chrome aria-label={name}>
      <Video.Media aria-label={name} />
      <Video.Controls>
        <Video.Row>
          <Video.PlayButton />
          <Video.Scrubber />
          <Video.MuteButton />
          <Video.SpeedSelect />
        </Video.Row>
      </Video.Controls>
    </Video.Root>,
  );
  const video = screen.container.querySelector("video");
  if (!video) throw new Error("Missing video element");
  /** No source loads here, so report metadata the way a loaded file would or the scrubber stays disabled. */
  Object.defineProperty(video, "duration", { configurable: true, value: 12 });
  video.dispatchEvent(new Event("loadedmetadata"));
  return { screen, video };
}

describe("Video keyboard", () => {
  it("names the player, the media and every control", async () => {
    const { screen, video } = await renderPlayer();

    await expect
      .element(screen.getByRole("group", { name: "Video Player" }))
      .toBeInTheDocument();
    expect(video.getAttribute("aria-label")).toBe("Video");
    await expect
      .element(screen.getByRole("button", { name: "Play" }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("slider", { name: "Seek" }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Mute" }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("combobox", { name: "Playback Speed" }))
      .toBeInTheDocument();
  });

  it("lets the caller rename the player and the media", async () => {
    const { screen, video } = await renderPlayer("Kiladalen Roofline");

    await expect
      .element(screen.getByRole("group", { name: "Kiladalen Roofline" }))
      .toBeInTheDocument();
    expect(video.getAttribute("aria-label")).toBe("Kiladalen Roofline");
  });

  it("tabs through the controls in order", async () => {
    const { screen } = await renderPlayer();

    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "Play" }))
      .toHaveFocus();
    await userEvent.tab();
    await expect
      .element(screen.getByRole("slider", { name: "Seek" }))
      .toHaveFocus();
    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "Mute" }))
      .toHaveFocus();
    await userEvent.tab();
    await expect
      .element(screen.getByRole("combobox", { name: "Playback Speed" }))
      .toHaveFocus();
  });

  it("seeks with the arrow keys on the slider", async () => {
    const { screen, video } = await renderPlayer();
    const seek = screen.getByRole("slider", { name: "Seek" });

    await userEvent.tab();
    await userEvent.tab();
    await expect.element(seek).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => video.currentTime).toBeGreaterThan(0);
  });

  it("mutes with Enter and renames the button to the next action", async () => {
    const { screen, video } = await renderPlayer();

    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "Mute" }))
      .toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await expect.poll(() => video.muted).toBe(true);
    await expect
      .element(screen.getByRole("button", { name: "Unmute" }))
      .toHaveFocus();
  });
});
