import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createHapticPlayer } from "./haptic-player";

class FakeHelper extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly lines: Array<string> = [];

  constructor() {
    super();
    this.stdin.on("data", (chunk: Buffer) => {
      this.lines.push(...chunk.toString().split("\n").filter(Boolean));
    });
  }

  crash() {
    this.stdin.destroy();
    this.emit("exit", 1, null);
  }

  failToSpawn() {
    this.stdin.destroy();
    this.emit("error", new Error("spawn EACCES"));
  }
}

function setup() {
  const helpers: Array<FakeHelper> = [];
  const player = createHapticPlayer(() => {
    const helper = new FakeHelper();
    helpers.push(helper);
    return helper;
  });
  return { helpers, player };
}

async function flush() {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}

describe("createHapticPlayer", () => {
  it("sends every pattern to one helper", async () => {
    const { helpers, player } = setup();
    player.play("generic");
    player.play("alignment");
    await flush();
    expect(helpers).toHaveLength(1);
    expect(helpers[0]?.lines).toEqual(["generic", "alignment"]);
  });

  it("relaunches the helper after it crashes", async () => {
    const { helpers, player } = setup();
    player.play("generic");
    helpers[0]?.crash();
    player.play("level-change");
    await flush();
    expect(helpers).toHaveLength(2);
    expect(helpers[1]?.lines).toEqual(["level-change"]);
  });

  it("stops launching after three crashes", () => {
    const { helpers, player } = setup();
    for (let i = 0; i < 5; i++) {
      player.play("generic");
      helpers.at(-1)?.crash();
    }
    expect(helpers).toHaveLength(3);
  });

  it("gives up when the helper cannot spawn", () => {
    const { helpers, player } = setup();
    player.play("generic");
    helpers[0]?.failToSpawn();
    player.play("generic");
    player.play("alignment");
    expect(helpers).toHaveLength(1);
  });

  it("stays silent when no helper exists", () => {
    let launches = 0;
    const player = createHapticPlayer(() => {
      launches += 1;
      return null;
    });
    player.play("generic");
    player.play("generic");
    expect(launches).toBe(1);
  });
});
