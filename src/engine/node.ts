import fs from "node:fs";
import path from "node:path";
import { addFile, detectKind, emptyParsed } from "./loaders";
import type { Parsed } from "./types";

// Server-side only: reads every CSV and JSON log in a folder, recognising each by its columns.
// `skip` leaves out kinds of log (for example "ledger") that an upload replaces.
export function loadEvidenceDir(dir: string, skip: Set<string> = new Set()): Parsed {
  const parsed = emptyParsed();
  for (const name of fs.readdirSync(dir).sort()) {
    if (!/\.(csv|json)$/i.test(name)) continue;
    const text = fs.readFileSync(path.join(dir, name), "utf8");
    if (skip.size > 0) {
      const kind = name.endsWith(".json") ? (/"integrations"/.test(text.slice(0, 600)) ? "register" : null) : detectKind(text.slice(0, text.indexOf("\n")).replace(/\r$/, "").split(",").map((h) => h.trim()));
      if (kind && skip.has(kind)) continue;
    }
    addFile(parsed, name, text);
  }
  return parsed;
}
