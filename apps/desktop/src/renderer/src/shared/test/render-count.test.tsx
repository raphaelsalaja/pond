import { act, createContext, memo, use, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { recordRenders } from "./render-count";

const Value = createContext(0);

function Leaf() {
  return <span />;
}

const MemoLeaf = memo(function MemoLeaf() {
  return <span />;
});

const CompareLeaf = memo(
  function CompareLeaf({ value }: { value: number }) {
    return <span>{value}</span>;
  },
  (a, b) => a.value === b.value,
);

const Consumer = memo(function Consumer() {
  return <span>{use(Value)}</span>;
});

const Row = memo(
  function Row({ id }: { id: string; active: boolean }) {
    return <li>{id}</li>;
  },
  (a, b) => a.id === b.id && a.active === b.active,
);

function List({ active }: { active: string }) {
  return (
    <ul>
      {["a", "b", "c"].map((id) => (
        <Row key={id} id={id} active={id === active} />
      ))}
    </ul>
  );
}

let bump = () => {};

function Parent() {
  const [value, setValue] = useState(0);
  bump = () => setValue((current) => current + 1);
  return (
    <Value value={value}>
      <Leaf />
      <MemoLeaf />
      <CompareLeaf value={0} />
      <Consumer />
    </Value>
  );
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("counts every component once on mount", () => {
  const renders = recordRenders();
  act(() => root.render(<Parent />));
  expect(renders.summary()).toEqual({
    Parent: 1,
    Leaf: 1,
    MemoLeaf: 1,
    CompareLeaf: 1,
    Consumer: 1,
  });
});

it("skips memoized children whose props held, but not context consumers", () => {
  act(() => root.render(<Parent />));
  const renders = recordRenders();
  act(() => bump());
  expect(renders.summary()).toEqual({ Parent: 1, Leaf: 1, Consumer: 1 });
});

it("tells keyed rows apart, including rows behind a custom-compare memo", () => {
  act(() => root.render(<List active="a" />));
  const renders = recordRenders();
  act(() => root.render(<List active="b" />));
  expect(renders.byKey("Row")).toEqual({ a: 1, b: 1 });
  expect(renders.count("List")).toBe(1);
});

it("ignores unmounts", () => {
  act(() => root.render(<Parent />));
  const renders = recordRenders();
  act(() => root.render(null));
  expect(renders.summary()).toEqual({});
});

it("stops counting after stop, while other recorders keep going", () => {
  act(() => root.render(<Parent />));
  const first = recordRenders();
  const second = recordRenders();
  act(() => bump());
  first.stop();
  act(() => bump());
  expect(first.count("Parent")).toBe(1);
  expect(second.count("Parent")).toBe(2);
  expect(second.count("MemoLeaf")).toBe(0);
});
