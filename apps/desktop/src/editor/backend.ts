/**
 * Finds the editor's service for this run: the app starts it and returns the
 * port and token. Port 0 means there is no service (the browser preview, where
 * the mock backend answers), and the editor uses the in-memory API instead.
 */
import { commands } from "@mousecomb/bindings";
import { unwrap } from "@mousecomb/data";
import { queryOptions } from "@tanstack/react-query";

import { createHttpApi, type EditorApi } from "./api";
import { createMemoryApi, PREVIEW_SEED } from "./memoryApi";

export const editorBackendQuery = queryOptions({
  queryKey: ["editor", "backend"] as const,
  queryFn: async (): Promise<EditorApi> => {
    const backend = await unwrap(commands.editorBackendStart());
    if (backend.port === 0) return createMemoryApi(PREVIEW_SEED);
    return createHttpApi(backend.port, backend.token);
  },
  staleTime: Infinity,
  gcTime: Infinity,
  retry: false,
});
