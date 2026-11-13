// Splitting a value across several SecureStore entries (security review finding 26). SecureStore is the phone's
// encrypted keychain / keystore, but warns above about 2 KB per entry and a Supabase session is larger. Pure
// functions over a tiny store interface, so they run in node tests without the native module.

export const CHUNK = 1800;

export type KV = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
};

/** SecureStore keys allow letters, digits, ".", "-" and "_" only. */
export function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function readChunked(kv: KV, key: string): Promise<string | null> {
  const k = safeKey(key);
  const n = Number(await kv.get(`${k}.n`));
  if (!Number.isInteger(n) || n <= 0) return null;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = await kv.get(`${k}.${i}`);
    if (p === null) return null; // half-written: treat as signed out rather than a broken session
    parts.push(p);
  }
  return parts.join("");
}

export async function writeChunked(kv: KV, key: string, value: string): Promise<void> {
  const k = safeKey(key);
  const old = Number(await kv.get(`${k}.n`)) || 0;
  const n = Math.max(1, Math.ceil(value.length / CHUNK));
  for (let i = 0; i < n; i++) await kv.set(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
  await kv.set(`${k}.n`, String(n));
  for (let i = n; i < old; i++) await kv.del(`${k}.${i}`);
}

export async function removeChunked(kv: KV, key: string): Promise<void> {
  const k = safeKey(key);
  const n = Number(await kv.get(`${k}.n`)) || 0;
  for (let i = 0; i < n; i++) await kv.del(`${k}.${i}`);
  await kv.del(`${k}.n`);
}

/**
 * Supabase's storage adapter over chunked secure storage. A session saved by an older build in plain storage is
 * moved over on first read, then removed from plain storage, so nobody is signed out by the update.
 */
export function secureSessionStorage(kv: KV, legacy?: { getItem(k: string): string | null; removeItem(k: string): void }) {
  return {
    async getItem(key: string): Promise<string | null> {
      const v = await readChunked(kv, key);
      if (v !== null || !legacy) return v;
      const old = legacy.getItem(key);
      if (old === null) return null;
      await writeChunked(kv, key, old);
      legacy.removeItem(key);
      return old;
    },
    setItem: (key: string, value: string) => writeChunked(kv, key, value),
    removeItem: (key: string) => removeChunked(kv, key),
  };
}
