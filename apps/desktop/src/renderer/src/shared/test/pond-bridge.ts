/** The preload bridge for renderer tests: a test registers the calls it expects, and any other call fails. */
import type {
  QueryArguments,
  QueryName,
  QueryResult,
} from "@shared/query-contracts";
import { vi } from "vitest";
import type { PondApi } from "../../../../preload";

type Awaitable<T> = T | Promise<T>;
type Member = keyof PondApi;
type Subscription = Extract<Member, `on${string}`>;
/** Any function, since every return type is assignable to `void`. */
type Callable = (...args: Array<never>) => void;
type Method = Exclude<Member, Subscription | "query">;
type Command = {
  [K in Method]: PondApi[K] extends Callable ? K : never;
}[Method];
/** Plain values the preload exposes, such as `systemLocale`. */
type Value = Exclude<Method, Command>;
type Listener<K extends Subscription> = Parameters<PondApi[K]>[0];
type EventArgument = Parameters<Listener<Subscription>>[number];
type EventListener = (...args: Array<EventArgument>) => void;
type CommandResult = ReturnType<PondApi[Command]>;
type CommandHandler = (...args: Array<never>) => CommandResult;
type QueryResponse = Awaitable<QueryResult<QueryName>>;
type QueryHandler = (...args: Array<never>) => QueryResponse;
type Unsubscribe = () => void;
type Subscribe = (listener: EventListener) => Unsubscribe;
type QueryDispatcher = (
  name: string,
  ...args: Array<never>
) => Promise<QueryResponse>;
type Dispatcher = CommandHandler | Subscribe | QueryDispatcher;

export type QueryHandlers = {
  [Name in QueryName]?: (
    ...args: QueryArguments<Name>
  ) => Awaitable<QueryResult<Name>>;
};

export type BridgeHandlers = { [K in Command]?: PondApi[K] } & {
  query?: QueryHandlers;
  /** Plain value members, such as `systemLocale`, which the app reads instead of calling. */
  values?: { [K in Value]?: PondApi[K] };
};

const commands = new Map<string, CommandHandler>();
const values = new Map<string, PondApi[Value]>();
const queries = new Map<string, QueryHandler>();
const listeners = new Map<string, Set<EventListener>>();
let members: { [key: string]: Dispatcher } = {};

function unhandled(call: string): Error {
  return new Error(
    `${call} has no handler. Register one with bridge.use() in this test.`,
  );
}

function subscribe(key: string): Subscribe {
  return (listener) => {
    const set = listeners.get(key) ?? new Set<EventListener>();
    set.add(listener);
    listeners.set(key, set);
    return () => {
      set.delete(listener);
    };
  };
}

function command(key: string): CommandHandler {
  return (...args) => {
    const handler = commands.get(key);
    if (!handler) {
      throw unhandled(`pond.${key}()`);
    }
    return handler(...args);
  };
}

function query(name: string, ...args: Array<never>): Promise<QueryResponse> {
  const handler = queries.get(name);
  if (!handler) {
    return Promise.reject(unhandled(`pond.query("${name}")`));
  }
  return Promise.resolve(handler(...args));
}

/** Keys that promise resolution, React and Vitest's printer probe on any object; the bridge has none of them. */
const PROBES = new Set([
  "then",
  "toJSON",
  "$$typeof",
  "asymmetricMatch",
  "nodeType",
]);

function isMemberKey(key: string | symbol): key is string {
  return typeof key === "string" && !PROBES.has(key);
}

function dispatcher(key: string): Dispatcher {
  if (key === "query") {
    return query;
  }
  return key.startsWith("on") ? subscribe(key) : command(key);
}

function member(key: string): Dispatcher {
  const existing = members[key];
  if (existing) {
    return existing;
  }
  const created = dispatcher(key);
  members[key] = created;
  vi.spyOn(members, key);
  return members[key] ?? created;
}

/** SAFETY: every property read resolves to a registered value or to a dispatcher that routes to the handlers registered for that member. */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- PondApi's members exist only as a type, so no object literal can hold them; the Proxy answers each member read instead.
const api = new Proxy(
  {},
  {
    get: (_, key) => {
      if (!isMemberKey(key)) {
        return undefined;
      }
      return values.has(key) ? values.get(key) : member(key);
    },
  },
) as PondApi;

/** Registers handlers for this test; a later call replaces handlers for the same member or query. */
function use(handlers: BridgeHandlers): void {
  const {
    query: queryHandlers,
    values: valueHandlers,
    ...commandHandlers
  } = handlers;
  for (const [key, handler] of Object.entries(commandHandlers)) {
    if (handler) {
      commands.set(key, handler);
    }
  }
  for (const [key, value] of Object.entries(valueHandlers ?? {})) {
    if (value !== undefined) {
      values.set(key, value);
    }
  }
  for (const [name, handler] of Object.entries(queryHandlers ?? {})) {
    if (handler) {
      queries.set(name, handler);
    }
  }
}

/** Delivers an event to every listener the app registered through `pond.on*`. */
function emit<K extends Subscription>(
  key: K,
  ...args: Parameters<Listener<K>>
): void {
  for (const listener of listeners.get(key) ?? []) {
    listener(...args);
  }
}

/** Whether the app currently listens to a `pond.on*` subscription. */
function listening(key: Subscription): boolean {
  return (listeners.get(key)?.size ?? 0) > 0;
}

/** The spy that records every call the app makes to `pond[key]`. */
function spy(key: Command) {
  return vi.mocked(member(key));
}

function reset(): void {
  commands.clear();
  values.clear();
  queries.clear();
  listeners.clear();
  members = {};
}

export const bridge = { api, use, emit, listening, spy, reset };
