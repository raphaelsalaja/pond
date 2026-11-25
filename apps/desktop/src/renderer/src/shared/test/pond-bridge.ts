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
type Call = (...args: Array<never>) => unknown;
type Method = Exclude<Member, Subscription | "query">;
type Command = {
  [K in Method]: PondApi[K] extends Call ? K : never;
}[Method];
/** Plain values the preload exposes, such as `systemLocale`. */
type Value = Exclude<Method, Command>;
type Listener<K extends Subscription> = Parameters<PondApi[K]>[0];

export type QueryHandlers = {
  [Name in QueryName]?: (
    ...args: QueryArguments<Name>
  ) => Awaitable<QueryResult<Name>>;
};

export type BridgeHandlers = { [K in Command]?: PondApi[K] } & {
  [K in Value]?: PondApi[K];
} & {
  query?: QueryHandlers;
};

const commands = new Map<string, Call>();
const values = new Map<string, unknown>();
const queries = new Map<string, Call>();
const listeners = new Map<string, Set<Call>>();
let members: { [key: string]: Call } = {};

function unhandled(call: string): Error {
  return new Error(
    `${call} has no handler. Register one with bridge.use() in this test.`,
  );
}

function subscribe(key: string): Call {
  return (listener: Call) => {
    const set = listeners.get(key) ?? new Set<Call>();
    set.add(listener);
    listeners.set(key, set);
    return () => set.delete(listener);
  };
}

function command(key: string): Call {
  return (...args) => {
    const handler = commands.get(key);
    if (!handler) {
      throw unhandled(`pond.${key}()`);
    }
    return handler(...args);
  };
}

function query(name: string, ...args: Array<never>): Promise<unknown> {
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

function dispatcher(key: string): Call {
  if (key === "query") {
    return query;
  }
  return key.startsWith("on") ? subscribe(key) : command(key);
}

function member(key: string): Call {
  const existing = members[key];
  if (existing) {
    return existing;
  }
  const created = dispatcher(key);
  members[key] = created;
  vi.spyOn(members, key);
  return members[key] ?? created;
}

/** SAFETY: every property read resolves to a dispatcher that routes to the handlers registered for that member. */
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

export const bridge = {
  api,

  /** Registers handlers for this test; a later call replaces handlers for the same member or query. */
  use(handlers: BridgeHandlers): void {
    const { query: queryHandlers, ...rest } = handlers;
    for (const [key, handler] of Object.entries(rest)) {
      if (typeof handler === "function") {
        commands.set(key, handler);
      } else if (handler !== undefined) {
        values.set(key, handler);
      }
    }
    for (const [name, handler] of Object.entries(queryHandlers ?? {})) {
      if (handler) {
        queries.set(name, handler);
      }
    }
  },

  /** Delivers an event to every listener the app registered through `pond.on*`. */
  emit<K extends Subscription>(key: K, ...args: Parameters<Listener<K>>): void {
    for (const listener of listeners.get(key) ?? []) {
      /** SAFETY: listeners for `key` were registered through `PondApi[key]`, so they accept its event arguments. */
      (listener as (...values: Parameters<Listener<K>>) => void)(...args);
    }
  },

  /** Whether the app currently listens to a `pond.on*` subscription. */
  listening(key: Subscription): boolean {
    return (listeners.get(key)?.size ?? 0) > 0;
  },

  reset(): void {
    commands.clear();
    values.clear();
    queries.clear();
    listeners.clear();
    members = {};
  },
};
