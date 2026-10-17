import { commands, type ActionResult } from "@mousecomb/bindings";
import { useMutation, useQuery } from "@tanstack/react-query";

import { queryKeys } from "./account";
import { unwrap } from "./errors";

/** OmniBar commands from the Rust catalog (FEAT-004). They never change while running. */
export function useCommands() {
  return useQuery({ queryKey: queryKeys.commands, queryFn: () => commands.commandsList(), staleTime: Infinity });
}

/** Installed apps; refetched when Rust reports a new scan (`apps-changed`). */
export function useApps() {
  return useQuery({ queryKey: queryKeys.apps, queryFn: () => commands.appsList(), staleTime: Infinity });
}

export function useUpdateStatus() {
  return useQuery({ queryKey: queryKeys.updateStatus, queryFn: () => commands.updateStatusGet(), staleTime: Infinity });
}

export function useHotkeyStatus() {
  return useQuery({ queryKey: queryKeys.hotkeyStatus, queryFn: () => commands.hotkeyStatusGet(), staleTime: Infinity });
}

/** `args` is the action's `with` object (APP_SPEC FEAT-015). */
export type ActionRequest = { action: string; args?: unknown; confirmed?: boolean };

export function runAction({ action, args = null, confirmed = false }: ActionRequest): Promise<ActionResult> {
  return unwrap(commands.actionRun(action, args, confirmed));
}

/** Run any action by id (FEAT-013). */
export function useRunAction() {
  return useMutation({ mutationFn: runAction });
}
