// Clerk auth — graceful fallback if keys not configured
let requireAuthFn;
try {
  if (process.env.CLERK_SECRET_KEY) {
    const { requireAuth } = require('@clerk/express');
    requireAuthFn = requireAuth;
  }
} catch (e) {
  // Clerk not available
}
if (!requireAuthFn) {
  requireAuthFn = () => (req, res, next) => next();
}

// Middleware to require authentication — returns 401 if not signed in
const requireSignIn = requireAuthFn();

// Middleware to require a specific role/plan tier
// Usage: requireTier('pro') or requireTier('coach')
function requireTier(tier) {
  return [
    requireAuthFn(),
    (req, res, next) => {
      const auth = req.auth || {};
      const sessionClaims = auth.sessionClaims || {};
      const userTier = sessionClaims?.metadata?.tier || 'free';
      const tierHierarchy = { free: 0, pro: 1, coach: 2, admin: 3 };
      if ((tierHierarchy[userTier] || 0) >= (tierHierarchy[tier] || 0)) {
        return next();
      }
      res.status(403).json({ error: 'Upgrade required', requiredTier: tier });
    },
  ];
}

module.exports = { requireSignIn, requireTier };
