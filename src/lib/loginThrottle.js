import { getClientIp } from './requestLog.js';

const DEFAULTS = {
  enabled:
    process.env.LOGIN_THROTTLE_ENABLED === 'true'
      ? true
      : process.env.LOGIN_THROTTLE_ENABLED === 'false'
        ? false
        : process.env.NODE_ENV === 'production',
  maxFailuresPerIp: 10,
  maxFailuresPerEmail: 5,
  lockMs: 15 * 60 * 1000,
  maxEntries: 10_000,
};

const ipFailures = new Map();
const emailFailures = new Map();

function nowMs() {
  return Date.now();
}

function pruneExpired(store) {
  const now = nowMs();
  for (const [k, v] of store.entries()) {
    if (!v || typeof v.lockedUntil !== 'number' || v.lockedUntil <= now) {
      store.delete(k);
    }
  }
}

function evictIfNeeded(store, maxEntries) {
  if (store.size <= maxEntries) return;
  // Map preserves insertion order; delete the oldest entry.
  const firstKey = store.keys().next().value;
  if (firstKey !== undefined) store.delete(firstKey);
}

function getFailureEntry(store, key) {
  const now = nowMs();
  const current = store.get(key);
  if (!current || current.lockedUntil < now) {
    const fresh = { count: 0, lockedUntil: 0 };
    store.set(key, fresh);
    return fresh;
  }
  return current;
}

function getLockInfo(ip, email) {
  const now = nowMs();
  const ipEntry = ipFailures.get(ip);
  const emailEntry = emailFailures.get(email);
  const ipRemaining = ipEntry && ipEntry.lockedUntil > now ? ipEntry.lockedUntil - now : 0;
  const emailRemaining =
    emailEntry && emailEntry.lockedUntil > now ? emailEntry.lockedUntil - now : 0;
  const remainingMs = Math.max(ipRemaining, emailRemaining);
  return { locked: remainingMs > 0, remainingMs };
}

function registerFailedLogin(ip, email, cfg) {
  const now = nowMs();

  const ipEntry = getFailureEntry(ipFailures, ip);
  ipEntry.count += 1;
  if (ipEntry.count >= cfg.maxFailuresPerIp) {
    ipEntry.lockedUntil = now + cfg.lockMs;
  }

  const emailEntry = getFailureEntry(emailFailures, email);
  emailEntry.count += 1;
  if (emailEntry.count >= cfg.maxFailuresPerEmail) {
    emailEntry.lockedUntil = now + cfg.lockMs;
  }

  evictIfNeeded(ipFailures, cfg.maxEntries);
  evictIfNeeded(emailFailures, cfg.maxEntries);
}

function clearLoginFailures(ip, email) {
  ipFailures.delete(ip);
  emailFailures.delete(email);
}

let sweeperStarted = false;
function ensureSweeper() {
  if (sweeperStarted) return;
  sweeperStarted = true;
  setInterval(() => {
    pruneExpired(ipFailures);
    pruneExpired(emailFailures);
  }, 30_000).unref?.();
}

/**
 * @param {{
 *   maxFailuresPerIp?: number;
 *   maxFailuresPerEmail?: number;
 *   lockMs?: number;
 *   maxEntries?: number;
 *   enabled?: boolean;
 * }} [overrides]
 */
export function createLoginThrottle(overrides) {
  ensureSweeper();
  const cfg = {
    ...DEFAULTS,
    ...(overrides || {}),
  };

  return {
    enabled: !!cfg.enabled,
    /**
     * @param {import('express').Request} req
     * @param {string} emailNorm
     */
    check(req, emailNorm) {
      if (!cfg.enabled) return { locked: false, remainingMs: 0 };
      const ip = getClientIp(req);
      return getLockInfo(ip, emailNorm);
    },
    /**
     * @param {import('express').Request} req
     * @param {string} emailNorm
     */
    onSuccess(req, emailNorm) {
      if (!cfg.enabled) return;
      const ip = getClientIp(req);
      clearLoginFailures(ip, emailNorm);
    },
    /**
     * @param {import('express').Request} req
     * @param {string} emailNorm
     */
    onFailure(req, emailNorm) {
      if (!cfg.enabled) return;
      const ip = getClientIp(req);
      registerFailedLogin(ip, emailNorm, cfg);
    },
  };
}

