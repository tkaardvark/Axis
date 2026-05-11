// In production, API is served from same origin (empty string)
// In development, use localhost:3001
export const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:3001');

// Wrapper around fetch that attaches the Clerk session token (if signed in).
// Required for any endpoint protected by `requireSignIn` on the server.
// Falls back to an unauthenticated fetch when Clerk is not loaded or user is
// not signed in (server still returns 401 in that case, which callers handle).
export async function apiFetch(input, init = {}) {
  let token = null;
  try {
    const clerk = typeof window !== 'undefined' ? window.Clerk : null;
    if (clerk) {
      // Wait until Clerk has finished loading so we don't race past a valid
      // session that hasn't hydrated yet.
      if (!clerk.loaded && typeof clerk.load === 'function') {
        try {
          await clerk.load();
        } catch {
          // ignore — will fall through and attempt without token
        }
      }
      if (clerk.session?.getToken) {
        token = await clerk.session.getToken();
      }
    }
  } catch {
    // ignore — fall through with no token
  }

  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}

// ---------------------------------------------------------------------------
// In-memory JSON cache with stale-while-revalidate semantics.
//
// The single biggest UX win when toggling between Mens/Womens (or Season A vs
// Season B) is returning previously-loaded data *immediately* without a
// network round-trip. The server already sets ETag + Cache-Control, but the
// browser still has to issue a conditional request and wait for a 304.
//
// Behavior:
//   - Fresh hit (< freshMs): return cached value synchronously, no network.
//   - Stale hit (< staleMs): return cached value immediately AND kick off a
//     background revalidation that updates the cache for the next call.
//   - Miss / expired: fetch over the network.
//
// In-flight requests are deduplicated, so two concurrent callers for the same
// URL will share a single network request.
// ---------------------------------------------------------------------------

const FRESH_MS = 60 * 1000;          // 1 min — return cached without revalidating
const STALE_MS = 10 * 60 * 1000;     // 10 min — return cached but revalidate in background
const MAX_CACHE_ENTRIES = 100;       // simple LRU-ish bound

const cache = new Map();   // key -> { data, time }
const inflight = new Map(); // key -> Promise

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  // Move to most-recently-used position
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

function cacheSet(key, data) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { data, time: Date.now() });
  // Evict oldest if over the bound
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

async function fetchAndCacheJson(url, init) {
  const res = await apiFetch(url, init);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    err.response = res;
    throw err;
  }
  const data = await res.json();
  cacheSet(url, data);
  return data;
}

/**
 * Cached JSON fetch with stale-while-revalidate.
 *
 * Use this for read-only GET endpoints whose response is cacheable for a few
 * minutes (e.g. /api/teams, /api/seasons, /api/conferences). For one-shot
 * mutations or anything that must be fresh, use `apiFetch` directly.
 *
 * Returns the parsed JSON body. Throws on network or non-2xx HTTP errors.
 */
export async function apiFetchJson(url, init = {}) {
  const key = url;
  const now = Date.now();
  const entry = cacheGet(key);

  if (entry) {
    const age = now - entry.time;
    if (age < FRESH_MS) {
      return entry.data;
    }
    if (age < STALE_MS) {
      // Serve stale, revalidate in background (only one revalidation per key)
      if (!inflight.has(key)) {
        const p = fetchAndCacheJson(url, init).catch(() => {
          // Silently swallow — caller already received stale data.
        }).finally(() => {
          inflight.delete(key);
        });
        inflight.set(key, p);
      }
      return entry.data;
    }
  }

  // Miss or expired — coalesce concurrent callers onto a single network req.
  if (inflight.has(key)) {
    return inflight.get(key);
  }
  const p = fetchAndCacheJson(url, init).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

/**
 * Manually invalidate cached entries. Pass a string for an exact match or a
 * RegExp / predicate for a pattern. Useful after a known data refresh.
 */
export function invalidateApiCache(matcher) {
  if (!matcher) {
    cache.clear();
    return;
  }
  for (const key of Array.from(cache.keys())) {
    let hit;
    if (typeof matcher === 'string') hit = key === matcher;
    else if (matcher instanceof RegExp) hit = matcher.test(key);
    else if (typeof matcher === 'function') hit = matcher(key);
    if (hit) cache.delete(key);
  }
}
