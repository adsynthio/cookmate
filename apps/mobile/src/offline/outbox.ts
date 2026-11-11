// KIT-076: the write queue. Calls that failed for lack of network wait here, on the phone, and replay in order when
// it is back: every 20 seconds while anything waits, when the app comes to the front, and after any call that got
// through. The rules (folding step moves, stopping at the first network failure) are in domain/outbox.ts.
import "expo-sqlite/localStorage/install";

import { AppState } from "react-native";
import { create } from "zustand";

import { enqueue, flush, type Call, type Op } from "@/domain/outbox";

const KEY = "cookmate.outbox";
const RETRY_MS = 20_000;

function load(): Op[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as Op[]) : [];
  } catch {
    return [];
  }
}

function save(ops: Op[]) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(ops));
  } catch {
    // Storage unavailable: the queue still lives for this launch.
  }
}

type Runner = (op: Op) => Promise<void>;
let runner: Runner | null = null;
const tries = new Map<string, number>();

type OutboxState = {
  ops: Op[];
  /** True after a replay stopped because the network was still down; false once one gets through. */
  offline: boolean;
  add(call: Call, sessionId: string | null, args: unknown[]): void;
  flush(): Promise<void>;
  clear(): void;
};

let flushing: Promise<void> | null = null;

export const useOutbox = create<OutboxState>((set, get) => ({
  ops: load(),
  offline: false,
  add(call, sessionId, args) {
    const op: Op = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, call, sessionId, args, at: Date.now() };
    // While a replay runs, new ops go on the end unfolded, so a move can't fold into one already being sent.
    const ops = flushing ? [...get().ops, op] : enqueue(get().ops, op);
    save(ops);
    set({ ops, offline: true });
  },
  flush() {
    if (flushing) return flushing;
    if (!runner || get().ops.length === 0) return Promise.resolve();
    const run = runner;
    const sent = get().ops;
    const before = new Set(sent.map((o) => o.id));
    flushing = (async () => {
      try {
        const r = await flush(sent, run, tries);
        // Anything added while replaying goes after what is left.
        const ops = [...r.left, ...get().ops.filter((o) => !before.has(o.id))];
        save(ops);
        set({ ops, offline: r.offline });
      } finally {
        flushing = null;
      }
    })();
    return flushing;
  },
  clear() {
    save([]);
    set({ ops: [], offline: false });
  },
}));

/** True while a write for this session is still waiting for the network. */
export function hasPending(sessionId: string, call?: Call): boolean {
  return useOutbox.getState().ops.some((o) => o.sessionId === sessionId && (!call || o.call === call));
}

/** Starts the replay loop with the calls that actually reach the server. Called once, at launch. */
export function startOutbox(run: Runner) {
  runner = run;
  void useOutbox.getState().flush();
  setInterval(() => {
    if (useOutbox.getState().ops.length) void useOutbox.getState().flush();
  }, RETRY_MS);
  AppState.addEventListener("change", (s) => {
    if (s === "active") void useOutbox.getState().flush();
  });
}
