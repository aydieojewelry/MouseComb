/**
 * Reads CHANGELOG.md for the What's New page (FEAT-022). The file is the one
 * the release workflow reads, so the page and the release notes never differ.
 * Sections look like `## 0.1.0+2 — 2026-10-21 — name`, with `### Group`
 * headings and `- ` bullets; anything else (`## Next`, the intro) is skipped.
 */

export type ChangelogGroup = { title: string; items: string[] };

export type ChangelogEntry = {
  version: string;
  date: string | null;
  name: string | null;
  /** Paragraphs before the first group. */
  intro: string[];
  groups: ChangelogGroup[];
};

const HEADING = /^##\s+v?(\d+\.\d+\.\d+\+\d+)(?:\s+[—–-]\s+(\d{4}-\d{2}-\d{2}))?(?:\s+[—–-]\s+(.+?))?\s*$/;

export function parseChangelog(text: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let entry: ChangelogEntry | null = null;
  let group: ChangelogGroup | null = null;
  let last: { list: string[] | null; at: number } = { list: null, at: -1 };
  let paragraphOpen = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith("## ")) {
      const m = HEADING.exec(line);
      entry = m ? { version: m[1]!, date: m[2] ?? null, name: m[3] ?? null, intro: [], groups: [] } : null;
      if (entry) entries.push(entry);
      group = null;
      last = { list: null, at: -1 };
      paragraphOpen = false;
      continue;
    }
    if (!entry) continue;
    if (line.startsWith("### ")) {
      group = { title: line.slice(4).trim(), items: [] };
      entry.groups.push(group);
      last = { list: null, at: -1 };
      continue;
    }
    if (line.trim() === "") {
      last = { list: null, at: -1 };
      paragraphOpen = false;
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet && group) {
      group.items.push(bullet[1]!);
      last = { list: group.items, at: group.items.length - 1 };
    } else if (last.list && /^\s+/.test(raw)) {
      // A wrapped bullet continues on the next, indented line.
      last.list[last.at] += " " + line.trim();
    } else if (!group) {
      // Lines of one paragraph are joined; a blank line starts the next.
      if (paragraphOpen) entry.intro[entry.intro.length - 1] += " " + line.trim();
      else entry.intro.push(line.trim());
      paragraphOpen = true;
    }
  }
  return entries;
}

export type InlinePart = { kind: "text" | "bold" | "code"; text: string };

/** Split `**bold**` and `` `code` `` out of a line, the only markup the changelog uses. */
export function inlineParts(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let rest = text;
  for (;;) {
    const m = /\*\*([^*]+)\*\*|`([^`]+)`/.exec(rest);
    if (!m) break;
    if (m.index > 0) parts.push({ kind: "text", text: rest.slice(0, m.index) });
    parts.push(m[1] !== undefined ? { kind: "bold", text: m[1] } : { kind: "code", text: m[2]! });
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) parts.push({ kind: "text", text: rest });
  return parts;
}
