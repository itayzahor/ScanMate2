import React, {createContext, useContext, useEffect, useState, useCallback} from 'react';
import type {ReactNode} from 'react';
import {
  configureGoogleSignIn,
  signInWithGoogle,
  signOut as authSignOut,
  fetchCurrentUser,
  getToken,
  clearToken,
} from '../../services/auth';
import type {AuthUser} from '../../services/auth';

const WEB_CLIENT_ID = '369670082111-f72lv0u503k7hvb6vmuqje2ca3nmv7ca.apps.googleusercontent.com';

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  token: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({children}: {children: ReactNode}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Configure Google Sign-In once on mount
  useEffect(() => {
    configureGoogleSignIn(WEB_CLIENT_ID);
  }, []);

  // Try to restore session from stored token on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getToken();
        if (!stored) {
          return;
        }
        const me = await fetchCurrentUser(stored);
        if (!cancelled) {
          setUser(me);
          setToken(stored);
        }
      } catch {
        // Token expired or invalid — clear it
        await clearToken();
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async () => {
    const result = await signInWithGoogle();
    setUser(result.user);
    setToken(result.token);
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
    setUser(null);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{user, token, loading, signIn, signOut}}>
      {children}
    </AuthContext.Provider>
  );
}
