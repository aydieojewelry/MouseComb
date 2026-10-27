import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";

import { Button } from "@mousecomb/ui";

import { detectDelimiter, lineEndingOf, parseCsv, serializeCsv } from "../csv";

type Props = { text: string; onChange: (text: string) => void };

type Row = { index: number; cells: string[] };

// TanStack Table v9: features and the column helper are created once, at module scope.
const features = tableFeatures({});
const helper = createColumnHelper<typeof features, Row>();

const ROW_HEIGHT = 34;

/** A CSV/TSV grid (FEAT-030). The text is the source of truth: each edit writes the whole file back. */
export default function CsvView({ text, onChange }: Props) {
  const delimiter = useMemo(() => detectDelimiter(text), [text]);
  const rows = useMemo(() => parseCsv(text, delimiter), [text, delimiter]);
  const header = rows[0] ?? [];
  const body = useMemo<Row[]>(() => rows.slice(1).map((cells, index) => ({ index, cells })), [rows]);
  const columns = useMemo(
    () =>
      helper.columns(
        header.map((name, j) =>
          helper.accessor((row) => row.cells[j] ?? "", { id: `c${j}`, header: name || `Column ${j + 1}` }),
        ),
      ),
    [header],
  );
  const table = useTable({ features, columns, data: body });
  const modelRows = table.getRowModel().rows;

  const scroller = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: modelRows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const width = Math.max(header.length, 1);
  const template = `3.5rem repeat(${width}, minmax(8rem, 1fr))`;
  const eol = lineEndingOf(text);
  const trailingBreak = text.endsWith("\n");

  const commit = (rowIndex: number, column: number, value: string) => {
    const fileRow = rowIndex + 1;
    if ((rows[fileRow]?.[column] ?? "") === value) return;
    const next = rows.map((row) => row.slice());
    const target = next[fileRow];
    if (!target) return;
    while (target.length <= column) target.push("");
    target[column] = value;
    onChange(serializeCsv(next, delimiter, eol, trailingBreak));
  };

  const addRow = () => {
    const next = [...rows, Array.from({ length: width }, () => "")];
    onChange(serializeCsv(next, delimiter, eol, trailingBreak));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-2 text-xs text-muted">
        <span>
          {body.length} {body.length === 1 ? "row" : "rows"} · delimiter{" "}
          <code className="font-mono">{delimiter === "\t" ? "tab" : delimiter}</code>
        </span>
        <Button variant="ghost" className="h-7 px-2 text-xs" onClick={addRow}>
          Add row
        </Button>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto font-mono text-xs">
        <div
          className="sticky top-0 z-10 grid border-b border-line bg-surface font-semibold"
          style={{ gridTemplateColumns: template }}
        >
          <div className="px-2 py-2 text-right text-muted">#</div>
          {header.map((name, j) => (
            <div key={j} className="truncate px-2 py-2">
              {name || `Column ${j + 1}`}
            </div>
          ))}
        </div>
        <div className="relative" style={{ height: virtual.getTotalSize() }}>
          {virtual.getVirtualItems().map((item) => {
            const row = modelRows[item.index];
            if (!row) return null;
            return (
              <div
                key={row.id}
                data-index={item.index}
                ref={virtual.measureElement}
                className="absolute left-0 grid w-full border-b border-line/60"
                style={{ transform: `translateY(${item.start}px)`, gridTemplateColumns: template, height: ROW_HEIGHT }}
              >
                <div className="px-2 py-1.5 text-right text-muted">{item.index + 2}</div>
                {Array.from({ length: width }, (_, j) => {
                  const value = row.original.cells[j] ?? "";
                  return (
                    <input
                      // Remount when the saved value changes, so the field shows what is on disk.
                      key={`${j}:${value}`}
                      defaultValue={value}
                      aria-label={`Row ${item.index + 2}, column ${j + 1}`}
                      className="min-w-0 bg-transparent px-2 py-1.5 outline-none focus:bg-raised"
                      onBlur={(e) => commit(item.index, j, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
