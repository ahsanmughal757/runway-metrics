/**
 * The provider. One `QueryClient` for the app's life.
 *
 * Created with `useState`'s lazy initialiser rather than a module-level constant
 * so a test that mounts the app gets its own cache. A shared client across tests
 * is a cache that survives the test that filled it, which is how a
 * demo-mode test passes alone and fails in the suite.
 */
import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient, setQueryClient } from './queryClient';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);

  // `AuthContext` clears the cache from an event handler rather than a render,
  // so it reaches the client here instead of through context. Set during render
  // rather than in an effect so the first sign-out cannot race the mount.
  setQueryClient(client);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
