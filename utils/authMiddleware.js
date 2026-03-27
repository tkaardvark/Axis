const { requireAuth } = require('@clerk/express');

// Middleware to require authentication — returns 401 if not signed in
const requireSignIn = requireAuth();

// Middleware to require a specific role/plan tier
// Usage: requireTier('pro') or requireTier('coach')
function requireTier(tier) {
  return [
    requireAuth(),
    (req, res, next) => {
      const { sessionClaims } = req.auth;
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
