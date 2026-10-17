import { commands, events, type Account, type SyncStatus } from "@mousecomb/bindings";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { unwrap } from "./errors";

export const queryKeys = {
  account: ["account"] as const,
  syncStatus: ["sync-status"] as const,
  serverUrl: ["server-url"] as const,
  appInfo: ["app-info"] as const,
};

/**
 * Keep account and sync status queries current from Rust events.
 * Call once per window; returns a cleanup function.
 */
export function connectBackendEvents(client: QueryClient): () => void {
  const stops = [
    events.accountChanged.listen((e) => client.setQueryData<Account | null>(queryKeys.account, e.payload.account)),
    events.syncStatusChanged.listen((e) => client.setQueryData<SyncStatus>(queryKeys.syncStatus, e.payload)),
  ];
  return () => stops.forEach((p) => void p.then((stop) => stop()));
}

export function useAccount() {
  return useQuery({ queryKey: queryKeys.account, queryFn: () => commands.accountGet(), staleTime: Infinity });
}

export function useSyncStatus() {
  return useQuery({ queryKey: queryKeys.syncStatus, queryFn: () => commands.syncStatusGet(), staleTime: Infinity });
}

export function useServerUrl() {
  return useQuery({ queryKey: queryKeys.serverUrl, queryFn: () => commands.serverUrlGet(), staleTime: Infinity });
}

export function useAppInfo() {
  return useQuery({ queryKey: queryKeys.appInfo, queryFn: () => commands.appInfo(), staleTime: Infinity });
}

export function useSetServerUrl() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => unwrap(commands.serverUrlSet(url)),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.serverUrl }),
  });
}

type Credentials = { email: string; password: string };

export function useSignIn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: Credentials) => unwrap(commands.accountSignIn(email, password)),
    onSuccess: (account) => client.setQueryData(queryKeys.account, account),
  });
}

export function useSignUp() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: Credentials) => unwrap(commands.accountSignUp(email, password)),
    onSuccess: (account) => client.setQueryData(queryKeys.account, account),
  });
}

export function useSignOut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (keepData: boolean) => commands.accountSignOut(keepData),
    onSuccess: () => client.setQueryData(queryKeys.account, null),
  });
}

export function useSyncNow() {
  return useMutation({ mutationFn: () => unwrap(commands.syncNow()) });
}
