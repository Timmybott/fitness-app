import * as SecureStore from 'expo-secure-store';
import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';

import { api, configureApi } from '@/lib/api';
import { type User } from '@/lib/types';

const TOKEN_KEY = 'session-token';
const USER_KEY = 'session-user';

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: User };

type AuthContextValue = {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const clear = async () => {
    configureApi(null, () => {});
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    setState({ status: 'signedOut' });
  };

  const start = async (token: string, user: User) => {
    configureApi(token, clear);
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    setState({ status: 'signedIn', user });
  };

  // Restore the saved session. The cached user lets the app open even if the server is unreachable.
  useEffect(() => {
    (async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const user = await SecureStore.getItemAsync(USER_KEY);
      if (!token || !user) return setState({ status: 'signedOut' });
      configureApi(token, clear);
      setState({ status: 'signedIn', user: JSON.parse(user) });
    })();
  }, []);

  const value: AuthContextValue = {
    state,
    signIn: async (email, password) => {
      const r = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
      await start(r.token, r.user);
    },
    signUp: async (name, email, password) => {
      const r = await api.post<{ token: string; user: User }>('/auth/register', { name, email, password });
      await start(r.token, r.user);
    },
    signOut: async () => {
      await api.post('/auth/logout', {}).catch(() => {});
      await clear();
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
