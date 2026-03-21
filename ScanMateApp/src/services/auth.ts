import AsyncStorage from '@react-native-async-storage/async-storage';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {API_BASE_URL as USER_API_URL} from './config';

const TOKEN_KEY = 'auth_token';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  picture: string | null;
};

type AuthResponse = {
  ok: boolean;
  token: string;
  user: AuthUser;
  error?: string;
};

type MeResponse = {
  ok: boolean;
  user: AuthUser;
  error?: string;
};

/**
 * Configure Google Sign-In. Call once at app startup.
 */
export function configureGoogleSignIn(webClientId: string) {
  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
  });
}

/**
 * Get the stored JWT token.
 */
export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

/**
 * Save token to persistent storage.
 */
async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

/**
 * Clear the stored token.
 */
export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

/**
 * Sign in with Google, send idToken to the JS server, return user + token.
 */
export async function signInWithGoogle(): Promise<{user: AuthUser; token: string}> {
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();

  const idToken = response.data?.idToken;
  if (!idToken) {
    throw new Error('Google Sign-In did not return an idToken');
  }

  const endpoint = `${USER_API_URL}/api/auth/google`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Accept: 'application/json'},
    body: JSON.stringify({idToken}),
  });

  const json: AuthResponse = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `Auth failed with status ${res.status}`);
  }

  await saveToken(json.token);
  return {user: json.user, token: json.token};
}

/**
 * Fetch the current user from the JS server using a stored JWT.
 */
export async function fetchCurrentUser(token: string): Promise<AuthUser> {
  const endpoint = `${USER_API_URL}/api/auth/me`;
  const res = await fetch(endpoint, {
    headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'},
  });

  const json: MeResponse = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `Failed to fetch user (${res.status})`);
  }

  return json.user;
}

/**
 * Sign out — clear Google session and stored token.
 */
export async function signOut(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Google session may already be cleared
  }
  await clearToken();
}
