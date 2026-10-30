import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { BrandTile } from "@/features/sources/components/sync-monitor-source-tile";
import { menuLabels as labels } from "@/shared/test/menu-labels";
import { buildSourceNewMenuItems } from "./create-menu";

describe("source create menu", () => {
  it("lists every connectable source under New Source", () => {
    const onConnect = vi.fn();
    const items = buildSourceNewMenuItems({
      onConnect,
      onWatch: vi.fn(),
      onFolder: vi.fn(),
    });
    expect(labels(items)).toEqual([
      "New Source",
      "Twitter",
      "Instagram",
      "Pinterest",
      "Are.na",
      "Cosmos",
      "TikTok",
      "YouTube",
      "Reddit",
      "Threads",
      "GitHub",
      "Substack",
      "Tumblr",
      "Savee",
      "Behance",
      "Vimeo",
      "Dribbble",
      "Unsplash",
      "Bluesky",
      "Marked",
      "New Watch",
      "Twitter",
      "Instagram",
      "Pinterest",
      "Are.na",
      "Cosmos",
      "TikTok",
      "YouTube",
      "New Folder",
    ]);
  });

  it("starts connect and watch from the chosen source", () => {
    const onConnect = vi.fn();
    const onWatch = vi.fn();
    const items = buildSourceNewMenuItems({
      onConnect,
      onWatch,
      onFolder: vi.fn(),
    });
    const connect = items.find(
      (item) => item.type === "submenu" && item.id === "new-source",
    );
    const watch = items.find(
      (item) => item.type === "submenu" && item.id === "new-watch",
    );
    if (connect?.type !== "submenu" || watch?.type !== "submenu") {
      throw new Error("Missing source submenus");
    }
    const instagram = connect.items.find(
      (item) => "id" in item && item.id === "connect-instagram",
    );
    const youtube = watch.items.find(
      (item) => "id" in item && item.id === "watch-youtube",
    );
    if (
      !instagram ||
      !("onClick" in instagram) ||
      !youtube ||
      !("onClick" in youtube)
    ) {
      throw new Error("Missing source items");
    }
    instagram.onClick?.();
    youtube.onClick?.();
    expect(onConnect).toHaveBeenCalledExactlyOnceWith("instagram");
    expect(onWatch).toHaveBeenCalledExactlyOnceWith("youtube");
  });

  it("uses source tiles so light logos stay visible on the menu", () => {
    const items = buildSourceNewMenuItems({
      onConnect: vi.fn(),
      onWatch: vi.fn(),
      onFolder: vi.fn(),
    });
    const connect = items.find(
      (item) => item.type === "submenu" && item.id === "new-source",
    );
    if (connect?.type !== "submenu") throw new Error("Missing New Source");
    const arena = connect.items.find(
      (item) => "id" in item && item.id === "connect-arena",
    );
    if (!arena || !("icon" in arena) || !isValidElement(arena.icon)) {
      throw new Error("Missing Are.na icon");
    }
    expect(arena.icon.type).toBe(BrandTile);
    expect(arena.icon.props).toMatchObject({ source: "arena", size: 16 });
  });
});
