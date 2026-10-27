/**
 * CSV and TSV for the editor's grid (FEAT-030). RFC 4180: quoted fields may
 * hold the delimiter, quotes (doubled) and line breaks.
 */

export type Delimiter = "," | ";" | "\t" | "|";

const DELIMITERS: readonly Delimiter[] = [",", ";", "\t", "|"];

/** Counts the delimiter on a line, ignoring any inside quotes. */
function countOutsideQuotes(line: string, delimiter: Delimiter): number {
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === delimiter) count++;
  }
  return count;
}

/**
 * The delimiter that splits the first lines most consistently. Ties and
 * single-column files fall back to a comma.
 */
export function detectDelimiter(text: string): Delimiter {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0).slice(0, 20);
  let best: Delimiter = ",";
  let bestScore = 0;
  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => countOutsideQuotes(line, delimiter));
    const first = counts[0] ?? 0;
    if (first === 0) continue;
    const consistent = counts.filter((count) => count === first).length;
    const score = consistent * 1000 + first;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

export function parseCsv(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  // A last line without a line break still counts; an empty file has no rows.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function quoteIfNeeded(value: string, delimiter: Delimiter): string {
  if (value === "" || !/["\r\n]/.test(value) && !value.includes(delimiter)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

/** Writes rows back with the file's own line ending and trailing line break. */
export function serializeCsv(rows: readonly string[][], delimiter: Delimiter, eol: "\n" | "\r\n", trailingNewline: boolean): string {
  const body = rows.map((row) => row.map((value) => quoteIfNeeded(value, delimiter)).join(delimiter)).join(eol);
  return trailingNewline && rows.length > 0 ? body + eol : body;
}

export function lineEndingOf(text: string): "\n" | "\r\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}
