/**
 * What the OmniBar shows for what you type (FEAT-004, FEAT-023): commands,
 * apps and snippets ranked by a small fuzzy match, recents first, plus a
 * calculator result, a web address and a web search when they apply.
 * Pure functions: the page passes in the data and renders the list.
 */
import type { App, Command } from "@mousecomb/bindings";
import type { Snippet } from "@mousecomb/data";

import { calculate } from "./calc";

export type ResultKind = "command" | "app" | "snippet" | "calc" | "url" | "search";

export type Result = {
  /** Unique and stable, also the key recents remember. */
  key: string;
  kind: ResultKind;
  title: string;
  hint: string;
  action: string;
  args: unknown;
  confirm: boolean;
  /** Windows commands and power actions get their own icon. */
  group?: Command["group"];
};

export type Sources = {
  commands: Command[];
  apps: App[];
  snippets: Snippet[];
  recents: string[];
  searchUrl: string;
  /** Replaces the Pomodoro toggle's title with what it will do now. */
  pomodoroTitle?: string;
};

/**
 * How well `query` matches `text`, 0 for no match. Prefix beats word start
 * beats substring beats letters in order ("stg" → "Settings").
 */
export function matchScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t === q) return 100;
  if (t.startsWith(q)) return 90 - Math.min(20, t.length - q.length) / 4;
  const words = t.split(/[\s\-_.&/]+/);
  if (words.some((w) => w.startsWith(q))) return 75;
  // Initials: "vsc" → "Visual Studio Code".
  if (q.length >= 2 && words.map((w) => w[0] ?? "").join("").startsWith(q)) return 70;
  if (t.includes(q)) return 60;
  let at = 0;
  let gaps = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, at);
    if (found < 0) return 0;
    gaps += found - at;
    at = found + 1;
  }
  return Math.max(5, 40 - gaps * 2);
}

const KIND_WEIGHT: Record<ResultKind, number> = { command: 3, app: 2, snippet: 1, calc: 0, url: 0, search: 0 };

const WEB_ADDRESS = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i;

/** `github.com` → `https://github.com`; anything else → null. */
export function asUrl(input: string): string | null {
  const s = input.trim();
  if (/\s/.test(s) || !WEB_ADDRESS.test(s)) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export function searchUrlFor(template: string, query: string): string {
  return template.replace("{q}", encodeURIComponent(query.trim()));
}

function fromCommand(c: Command, pomodoroTitle?: string): Result {
  return {
    key: `cmd:${c.key}`,
    kind: "command",
    title: c.action === "ext.mc.pomodoro.toggle" && pomodoroTitle ? pomodoroTitle : c.title,
    hint: c.hint,
    action: c.action,
    args: c.with,
    confirm: c.confirm,
    group: c.group,
  };
}

function fromApp(a: App): Result {
  return { key: `app:${a.id}`, kind: "app", title: a.name, hint: "App", action: "core.os.apps.launch", args: { id: a.id }, confirm: false };
}

function fromSnippet(s: Snippet): Result {
  const preview = s.text.replace(/\s+/g, " ").slice(0, 60);
  return { key: `snippet:${s.id}`, kind: "snippet", title: s.title, hint: `Snippet · ${preview}`, action: "ext.mc.snippets.copy", args: { id: s.id }, confirm: false };
}

/** The same snippet, typed into the program that had focus instead of copied (Windows). */
function fromSnippetTyping(s: Snippet): Result {
  return { key: `snippet-type:${s.id}`, kind: "snippet", title: `Type “${s.title}”`, hint: "Types it into the app you were in", action: "ext.mc.snippets.type", args: { id: s.id }, confirm: false };
}

/** Everything to show for `query`, best first. */
export function search(query: string, src: Sources, limit = 60): Result[] {
  const q = query.trim();
  const recentRank = new Map(src.recents.map((key, i) => [key, i]));
  const candidates: Array<{ result: Result; words: string[] }> = [
    // The catalog title stays searchable when a live title replaces it.
    ...src.commands.map((c) => ({ result: fromCommand(c, src.pomodoroTitle), words: [...c.keywords, c.title] })),
    ...src.apps.map((a) => ({ result: fromApp(a), words: [] })),
    ...src.snippets.flatMap((s) => [
      { result: fromSnippet(s), words: s.tags },
      { result: fromSnippetTyping(s), words: [s.title, ...s.tags] },
    ]),
  ];

  if (!q) {
    // Recents first, then commands, then apps; snippets only when searched or recent.
    const recent = candidates
      .filter((c) => recentRank.has(c.result.key))
      .sort((a, b) => recentRank.get(a.result.key)! - recentRank.get(b.result.key)!)
      .map((c) => c.result);
    const rest = candidates.filter((c) => !recentRank.has(c.result.key) && c.result.kind !== "snippet").map((c) => c.result);
    return [...recent, ...rest].slice(0, limit);
  }

  const scored = candidates
    .map(({ result, words }, index) => {
      const title = matchScore(q, result.title);
      const keyword = Math.max(0, ...words.map((w) => matchScore(q, w))) * 0.7;
      const score = Math.max(title, keyword);
      const recentBoost = recentRank.has(result.key) ? 15 - Math.min(10, recentRank.get(result.key)!) : 0;
      return { result, index, score: score > 0 ? score + recentBoost + KIND_WEIGHT[result.kind] : 0 };
    })
    .filter((s) => s.score >= 20)
    // Ties keep source order: the catalog lists the likeliest command first.
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((s) => s.result);

  const out: Result[] = [];
  const sum = calculate(q);
  if (sum !== null) {
    out.push({ key: "calc", kind: "calc", title: sum, hint: `${q} =  ·  Enter copies the result`, action: "core.os.clipboard.set_text", args: { text: sum }, confirm: false });
  }
  const url = asUrl(q);
  if (url) {
    out.push({ key: `url:${url}`, kind: "url", title: `Open ${q}`, hint: url, action: "core.os.shell.open_url", args: { url }, confirm: false });
  }
  out.push(...scored.slice(0, limit));
  out.push({
    key: "search",
    kind: "search",
    title: `Search the web for “${q}”`,
    hint: new URL(src.searchUrl.replace("{q}", "")).hostname,
    action: "core.os.shell.open_url",
    args: { url: searchUrlFor(src.searchUrl, q) },
    confirm: false,
  });
  return out;
}

/** Remember a run: newest first, no repeats, capped. Typed-in results aren't kept. */
export function rememberRecent(recents: string[], key: string, max = 20): string[] {
  if (key === "calc" || key === "search" || key.startsWith("url:")) return recents;
  return [key, ...recents.filter((k) => k !== key)].slice(0, max);
}
