/**
 * One open file: its content from the service (TanStack Query), the text being
 * edited, and the save state (the Zag machine in editorMachine.ts).
 */
import { useMachine } from "@zag-js/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { type Doc, type EditorApi, EditorError } from "./api";
import { type EditorPhase, editorMachine } from "./editorMachine";

const PHASES: EditorPhase[] = ["editing", "persisting", "synced", "error", "idle"];

export function docKey(workspace: string, path: string) {
  return ["editor", "doc", workspace, path] as const;
}

export function useDocument(api: EditorApi, workspace: string, path: string) {
  const queryClient = useQueryClient();
  const key = docKey(workspace, path);
  const doc = useQuery({
    queryKey: key,
    queryFn: () => api.read(workspace, path),
    staleTime: Infinity,
    retry: false,
  });
  const service = useMachine(editorMachine);

  // The text being edited; null means "the file as loaded". The ref is read by
  // the save callbacks, which run after the render they were created in.
  const [draft, setDraft] = useState<string | null>(null);
  const latest = useRef("");

  const loaded: Doc | undefined = doc.data;
  const text = draft ?? loaded?.content ?? "";
  const dirty = loaded !== undefined && text !== loaded.content;

  const setText = (next: string) => {
    if (next === latest.current) return;
    latest.current = next;
    setDraft(next);
    service.send({ type: "TYPE" });
  };

  const save = useMutation({
    mutationFn: (content: string) => api.save(workspace, path, content, loaded?.hash ?? ""),
    onMutate: () => {
      service.send({ type: "SAVE" });
    },
    onSuccess: (result, content) => {
      queryClient.setQueryData<Doc>(key, (old) =>
        old ? { ...old, content, hash: result.hash, size: result.size, mtime: result.mtime } : old,
      );
      setDraft((current) => (current === content ? null : current));
      service.send({ type: "SAVED" });
      if (latest.current !== content) service.send({ type: "TYPE" });
    },
    onError: () => {
      service.send({ type: "FAILED" });
    },
  });

  const reload = async () => {
    latest.current = "";
    setDraft(null);
    service.send({ type: "LOADED" });
    await queryClient.invalidateQueries({ queryKey: key });
  };

  const phase = PHASES.find((p) => service.state.matches(p)) ?? "idle";
  const saveError = save.error instanceof EditorError ? save.error : null;

  return {
    loading: doc.isPending,
    loadError: doc.error,
    binary: loaded?.binary ?? false,
    text,
    setText,
    dirty,
    phase,
    saving: save.isPending,
    saveError,
    save: () => {
      if (dirty && !save.isPending) save.mutate(text);
    },
    reload,
  };
}
