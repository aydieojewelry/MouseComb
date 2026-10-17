import {
  commands,
  events,
  type Account,
  type HotkeyStatus,
  type Pomodoro,
  type SyncStatus,
  type UpdateStatus,
} from "@mousecomb/bindings";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { unwrap } from "./errors";

export const queryKeys = {
  account: ["account"] as const,
  syncStatus: ["sync-status"] as const,
  serverUrl: ["server-url"] as const,
  appInfo: ["app-info"] as const,
  pomodoro: ["pomodoro"] as const,
  updateStatus: ["update-status"] as const,
  hotkeyStatus: ["hotkey-status"] as const,
  commands: ["commands"] as const,
  apps: ["apps"] as const,
  localSettings: ["local-setting"] as const,
};

/**
 * Keep queries current from Rust events: account, sync status, the Pomodoro
 * timer, updates, the OmniBar hotkey, apps and device-only settings.
 * Call once per window; returns a cleanup function.
 */
export function connectBackendEvents(client: QueryClient): () => void {
  const stops = [
    events.accountChanged.listen((e) => client.setQueryData<Account | null>(queryKeys.account, e.payload.account)),
    events.syncStatusChanged.listen((e) => client.setQueryData<SyncStatus>(queryKeys.syncStatus, e.payload)),
    events.pomodoroChanged.listen((e) => client.setQueryData<Pomodoro>(queryKeys.pomodoro, e.payload)),
    events.updateStatus.listen((e) => client.setQueryData<UpdateStatus>(queryKeys.updateStatus, e.payload)),
    events.hotkeyStatus.listen((e) => client.setQueryData<HotkeyStatus>(queryKeys.hotkeyStatus, e.payload)),
    events.appsChanged.listen(() => void client.invalidateQueries({ queryKey: queryKeys.apps })),
    events.itemsChanged.listen((e) => {
      if (e.payload.kind === "local_setting") void client.invalidateQueries({ queryKey: queryKeys.localSettings });
    }),
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

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: (email: string) => unwrap(commands.accountRequestPasswordReset(email)) });
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
