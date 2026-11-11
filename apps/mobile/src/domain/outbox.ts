// KIT-076: writes made while the network is down wait here and replay in order when it is back. Last write wins;
// the server's event log is the audit trail. Pure logic: storage and the actual calls are passed in.

/** The service calls that may wait for the network. Each replays exactly as it was made. */
export type Call =
  | "cooking.advanceStep"
  | "cooking.reportChange"
  | "cooking.finish"
  | "cooking.applyDeduction"
  | "cooking.submitFeedback"
  | "cooking.abandonSession"
  | "preference.saveMemory"
  | "kitchen.addItems";

export type Op = { id: string; call: Call; sessionId: string | null; args: unknown[]; at: number };

/** An op whose call failed for any reason other than the network is dropped after this many tries. */
export const MAX_TRIES = 3;

/**
 * True when a call failed because the phone could not reach the server: no connection, DNS, a timeout, or the
 * platform's own fetch failure. A reply from the server, even an error, is not a network failure.
 */
export function isNetworkError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; message?: string; status?: number; code?: string; context?: unknown };
  if (err.name === "FunctionsFetchError" || err.name === "AbortError" || err.name === "TimeoutError") return true;
  if (typeof err.status === "number" && err.status > 0) return false;
  if (err.code && /^[0-9A-Z]{5}$/.test(err.code)) return false;
  return /network request failed|failed to fetch|fetch failed|networkerror|load failed|network is unreachable|timed? ?out|internet connection appears to be offline/i.test(
    String(err.message ?? ""),
  );
}

/** Adds an op, folding step moves into the one before when nothing else came between them. */
export function enqueue(ops: Op[], op: Op): Op[] {
  const last = ops[ops.length - 1];
  if (op.call === "cooking.advanceStep" && last?.call === "cooking.advanceStep" && last.sessionId === op.sessionId) {
    const delta = Number(last.args[1]) + Number(op.args[1]);
    const rest = ops.slice(0, -1);
    return delta === 0 ? rest : [...rest, { ...last, args: [last.args[0], delta, ...last.args.slice(2)] }];
  }
  return [...ops, op];
}

export function pendingFor(ops: Op[], sessionId: string): Op[] {
  return ops.filter((o) => o.sessionId === sessionId);
}

export type FlushResult = { left: Op[]; done: number; dropped: Op[]; offline: boolean };

/**
 * Replays ops oldest first. Stops at the first network failure and keeps that op and everything after it, so the
 * order is never broken. Any other failure is retried on later flushes, then dropped after MAX_TRIES so one bad
 * write can't block the queue for ever.
 */
export async function flush(ops: Op[], run: (op: Op) => Promise<void>, tries: Map<string, number> = new Map()): Promise<FlushResult> {
  const dropped: Op[] = [];
  let done = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    try {
      await run(op);
      done++;
      tries.delete(op.id);
    } catch (e) {
      if (isNetworkError(e)) return { left: ops.slice(i), done, dropped, offline: true };
      const n = (tries.get(op.id) ?? 0) + 1;
      if (n >= MAX_TRIES) {
        tries.delete(op.id);
        dropped.push(op);
        continue;
      }
      tries.set(op.id, n);
      return { left: ops.slice(i), done, dropped, offline: false };
    }
  }
  return { left: [], done, dropped, offline: false };
}
