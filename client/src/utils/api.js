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
    if (clerk?.session?.getToken) {
      token = await clerk.session.getToken();
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
