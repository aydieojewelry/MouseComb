import { commands } from "@mousecomb/bindings";
import { z } from "zod";

import { createItemCollection } from "./items";

/** What a user edits. Mirrors `mc_core::SnippetInput`. */
export const snippetInputSchema = z.object({
  title: z.string().trim().min(1, "Give the snippet a name.").max(120, "Keep the name under 120 characters."),
  text: z.string().min(1, "Add the text to insert.").max(20_000, "Snippets can be up to 20,000 characters."),
  tags: z.array(z.string().trim().min(1).max(32)).max(12),
});

export type SnippetInput = z.infer<typeof snippetInputSchema>;

export type Snippet = SnippetInput & {
  id: string;
  /** Last change, milliseconds since the Unix epoch. */
  updated: number;
};

/** Text snippets, synced across devices (FEAT-005b). */
export const snippetsCollection = createItemCollection<Snippet>({
  id: "snippets",
  kind: "snippet",
  getKey: (s) => s.id,
  fromItem: (item) => {
    const parsed = snippetInputSchema.safeParse(item.data);
    return parsed.success ? { id: item.key, updated: item.mtime, ...parsed.data } : null;
  },
  toData: ({ title, text, tags }) => ({ title, text, tags }),
});

export async function newSnippetId(): Promise<string> {
  return commands.itemNewKey();
}

/** Tokens a snippet can contain, filled in when it is pasted (APP_SPEC FEAT-005). */
export const SNIPPET_TOKENS = [
  { token: "{DATE}", meaning: "today, as 2026-10-17" },
  { token: "{TIME}", meaning: "now, as 14:05:09" },
  { token: "{USER}", meaning: "your Windows user name" },
  { token: "{CLIPBOARD}", meaning: "what's on the clipboard" },
] as const;

/** Fill snippet tokens for a preview. The real paste happens in Rust. */
export function previewSnippet(text: string, now = new Date(), user = "you", clipboard = "…"): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return text
    .replaceAll("{DATE}", date)
    .replaceAll("{TIME}", time)
    .replaceAll("{USER}", user)
    .replaceAll("{CLIPBOARD}", clipboard)
    .replaceAll("\\n", "\n");
}
