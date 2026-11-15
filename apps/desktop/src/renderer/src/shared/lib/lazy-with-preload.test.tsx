import { act, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { lazyWithPreload } from "./lazy-with-preload";

let host: HTMLDivElement;
let root: Root;

function Greeting({ name }: { name: string }) {
  return <p>Hello {name}</p>;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("renders a preloaded module on the first commit without a fallback", async () => {
  const load = vi.fn(async () => Greeting);
  const Lazy = lazyWithPreload(load);
  await Lazy.preload();
  act(() =>
    root.render(
      <Suspense fallback={<p>Loading</p>}>
        <Lazy name="Koi" />
      </Suspense>,
    ),
  );
  expect(host.textContent).toBe("Hello Koi");
  expect(load).toHaveBeenCalledOnce();
});

it("suspends until the module loads when nothing preloaded it", async () => {
  let resolve: (component: typeof Greeting) => void = () => {};
  const Lazy = lazyWithPreload(
    () => new Promise<typeof Greeting>((done) => (resolve = done)),
  );
  act(() =>
    root.render(
      <Suspense fallback={<p>Loading</p>}>
        <Lazy name="Koi" />
      </Suspense>,
    ),
  );
  expect(host.textContent).toBe("Loading");
  await act(async () => resolve(Greeting));
  expect(host.textContent).toBe("Hello Koi");
});

it("loads the module once across preloads and renders", async () => {
  const load = vi.fn(async () => Greeting);
  const Lazy = lazyWithPreload(load);
  void Lazy.preload();
  await act(async () =>
    root.render(
      <Suspense fallback={null}>
        <Lazy name="Koi" />
      </Suspense>,
    ),
  );
  await Lazy.preload();
  expect(load).toHaveBeenCalledOnce();
});
