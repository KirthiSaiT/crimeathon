// Quote-aware CSV reader that keeps the source line number of every record,
// so a finding can always point back to "file, line".
export interface CsvRecord {
  line: number;
  cols: Record<string, string>;
}

export function parseCSV(text: string): { header: string[]; records: CsvRecord[] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = (rows.shift() ?? []).map((h) => h.trim());
  const records: CsvRecord[] = [];
  rows.forEach((r, i) => {
    if (r.length < 2) return;
    const cols: Record<string, string> = {};
    header.forEach((h, j) => (cols[h] = r[j] ?? ""));
    records.push({ line: i + 2, cols });
  });
  return { header, records };
}
