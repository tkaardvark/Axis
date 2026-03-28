import { useAuth, SignInButton } from '@clerk/clerk-react';
import './RequireAuth.css';

export default function RequireAuth({ children }) {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <div className="auth-gate">
        <div className="auth-gate-card">
          <h2>Sign in to continue</h2>
          <p>Create a free account to access this feature.</p>
          <SignInButton mode="modal">
            <button className="auth-gate-button">Sign In</button>
          </SignInButton>
        </div>
      </div>
    );
  }

  return children;
}
