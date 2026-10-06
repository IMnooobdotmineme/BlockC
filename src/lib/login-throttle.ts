import "server-only";
import { createHash } from "node:crypto";

type Attempt = { count: number; expiresAt: number };
const globals = globalThis as unknown as { loginAttempts?: Map<string, Attempt> };
const attempts = globals.loginAttempts ??= new Map<string, Attempt>();
const keyFor = (email: string) => createHash("sha256").update(email).digest("hex");

// Single-process development protection; use a shared limiter when deploying multiple instances.
export function allowLoginAttempt(email: string) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.expiresAt <= now) attempts.delete(key);
  const key = keyFor(email);
  const entry = attempts.get(key);
  if (entry && entry.count >= 10) return false;
  if (!entry && attempts.size >= 5000) return false;
  attempts.set(key, { count: (entry?.count ?? 0) + 1, expiresAt: entry?.expiresAt ?? now + 15 * 60 * 1000 });
  return true;
}
export function resetLoginAttempts(email: string) { attempts.delete(keyFor(email)); }
