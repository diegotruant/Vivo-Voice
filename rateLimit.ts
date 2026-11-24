/**
 * Rate limiting for the AI endpoints.
 *
 * Counters live in a pluggable store:
 *  - in memory (default): correct for a single server process;
 *  - Redis (set REDIS_URL): shared by every instance, for multi-instance deployments.
 *
 * Two limits:
 *  - per IP: AI_RATE_LIMIT_MAX requests every AI_RATE_LIMIT_WINDOW_SEC seconds;
 *  - daily budget for the SERVER key (SERVER_KEY_DAILY_LIMIT): requests made with the operator's own
 *    key cost the operator money, so they get a global daily cap. Requests with the user's own key
 *    are only subject to the per-IP limit.
 */
import type { Request, Response, NextFunction } from "express";

export interface RateLimitStore {
  /** Increments the counter for `key` in the current window and returns the new count and window end. */
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
  readonly kind: "memoria" | "redis";
}

class MemoryStore implements RateLimitStore {
  readonly kind = "memoria" as const;
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor() {
    const sweep = setInterval(() => {
      const now = Date.now();
      for (const [k, h] of this.hits) if (h.resetAt <= now) this.hits.delete(k);
    }, 60_000);
    sweep.unref();
  }
  async increment(key: string, windowMs: number) {
    const now = Date.now();
    let h = this.hits.get(key);
    if (!h || h.resetAt <= now) {
      h = { count: 0, resetAt: now + windowMs };
      this.hits.set(key, h);
    }
    h.count += 1;
    return { count: h.count, resetAt: h.resetAt };
  }
}

type RedisLike = {
  connect(): Promise<unknown>;
  on(event: "error", cb: (e: Error) => void): unknown;
  multi(): RedisMulti;
};
type RedisMulti = {
  incr(key: string): RedisMulti;
  pExpire(key: string, ms: number, mode: "NX"): RedisMulti;
  pTTL(key: string): RedisMulti;
  exec(): Promise<unknown[]>;
};

class RedisStore implements RateLimitStore {
  readonly kind = "redis" as const;
  constructor(private client: RedisLike, private prefix = "voceviva:rl:") {}
  async increment(key: string, windowMs: number) {
    const k = this.prefix + key;
    // Atomic: INCR, set the expiry only when the key is new, read the remaining TTL.
    const [count, , ttl] = (await this.client.multi().incr(k).pExpire(k, windowMs, "NX").pTTL(k).exec()) as [
      number,
      unknown,
      number,
    ];
    return { count: Number(count), resetAt: Date.now() + (Number(ttl) > 0 ? Number(ttl) : windowMs) };
  }
}

/** Fails open on store errors (e.g. Redis down): availability over strictness, with a log line. */
class FailOpenStore implements RateLimitStore {
  private lastLog = 0;
  constructor(private inner: RateLimitStore) {}
  get kind() {
    return this.inner.kind;
  }
  async increment(key: string, windowMs: number) {
    try {
      return await this.inner.increment(key, windowMs);
    } catch (e) {
      if (Date.now() - this.lastLog > 60_000) {
        this.lastLog = Date.now();
        console.error(`[rate-limit] archivio ${this.inner.kind} non disponibile, limite sospeso:`, (e as Error).message);
      }
      return { count: 0, resetAt: Date.now() + windowMs };
    }
  }
}

export async function createRateLimitStore(): Promise<RateLimitStore> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return new MemoryStore();
  const { createClient } = await import("redis");
  // disableOfflineQueue: while disconnected, commands fail at once (→ fail-open) instead of waiting.
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: 3000 },
  }) as unknown as RedisLike;
  client.on("error", (e) => console.error("[redis]", e.message));
  await client.connect(); // fail fast at startup if REDIS_URL is wrong
  return new FailOpenStore(new RedisStore(client));
}

/** Per-IP limiter middleware for POST requests. */
export function perIpLimiter(store: RateLimitStore, maxRequests: number, windowMs: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "POST") return next();
    try {
      const ip = req.ip || req.socket.remoteAddress || "sconosciuto";
      const { count, resetAt } = await store.increment(`ip:${ip}`, windowMs);
      res.setHeader("RateLimit-Limit", String(maxRequests));
      res.setHeader("RateLimit-Remaining", String(Math.max(0, maxRequests - count)));
      if (count > maxRequests) {
        const retryAfterSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
        res.setHeader("Retry-After", String(retryAfterSec));
        return res.status(429).json({ error: `Troppe richieste al Coach AI. Riprova tra ${retryAfterSec} secondi.` });
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

/** Thrown when the server key's daily budget is used up: the endpoint answers with its fallback. */
export class ServerKeyBudgetExceededError extends Error {}

/**
 * Counts one request against the server key's daily budget (UTC day). No-op when
 * SERVER_KEY_DAILY_LIMIT is unset or 0.
 */
export async function consumeServerKeyBudget(store: RateLimitStore, dailyLimit: number): Promise<void> {
  if (!dailyLimit) return;
  const day = new Date().toISOString().slice(0, 10);
  const { count } = await store.increment(`server-key:${day}`, 26 * 3600 * 1000);
  if (count > dailyLimit) {
    throw new ServerKeyBudgetExceededError(
      "Limite giornaliero del Coach AI del server raggiunto: inserisci la tua chiave nelle Impostazioni Coach AI."
    );
  }
}
