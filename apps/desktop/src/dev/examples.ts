import type { Item } from "@mousecomb/bindings";

/** Example data for the browser preview only. */
export function exampleItems(): Item[] {
  const now = Date.now();
  const snippet = (key: string, title: string, text: string, tags: string[], ago: number): Item => ({
    kind: "snippet",
    key,
    data: { title, text, tags },
    mtime: now - ago,
    deleted: false,
    device: "dev_example",
  });
  return [
    snippet("ex000000000date", "Today's date", "{DATE}", ["date"], 60_000),
    snippet("ex00000000stamp", "Timestamp", "{DATE} {TIME}", ["date", "log"], 3_600_000),
    snippet("ex0000000worklog", "Work log entry", "[{TIME}] - #dev - | @30m", ["log"], 86_400_000),
    snippet("ex0000000000sql", "SQL boilerplate", "SELECT * FROM table_name WHERE is_active = 1 ORDER BY created_at DESC LIMIT 50;", ["sql"], 172_800_000),
  ];
}
