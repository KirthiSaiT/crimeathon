import { readFileSync } from "node:fs";
import path from "node:path";
import { connection, NextResponse } from "next/server";
import { addFile, analyze, emptyParsed, parseFacts, type Analysis, type Context } from "@/engine";
import { loadEvidenceDir } from "@/engine/node";
import { authorizeCase } from "@/lib/supabase/server";

// The app starts empty. It reads the supplied evidence folder by itself only when LOAD_SUPPLIED_EVIDENCE=true,
// and only then does it also read the case facts file (CASE_PACK, default case-pack/CR-26-047.json).
const supplyEnabled = () => process.env.LOAD_SUPPLIED_EVIDENCE === "true";
const evidenceDir = () => process.env.EVIDENCE_DIR ?? path.join(process.cwd(), "evidence");
const packPath = () => process.env.CASE_PACK ?? path.join(process.cwd(), "case-pack", "CR-26-047.json");

function loadPack(): Context | undefined {
  try {
    return parseFacts(JSON.parse(readFileSync(packPath(), "utf8"))) ?? undefined;
  } catch {
    return undefined;
  }
}

let supplied: Analysis | null = null;

// GET: nothing loaded yet, or the supplied evidence when the server is set up to read it.
export async function GET() {
  await connection();
  const access = await authorizeCase();
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  try {
    if (!supplyEnabled()) return NextResponse.json(analyze(emptyParsed()));
    if (!supplied) {
      const a = analyze(loadEvidenceDir(evidenceDir()), loadPack());
      supplied = { ...a, stats: { ...a.stats, source: "supplied" } };
    }
    return NextResponse.json(supplied);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "The evidence folder could not be read." }, { status: 500 });
  }
}

// POST: run the detector on what was uploaded, and on nothing else (unless the server is set up to add the supplied evidence).
export async function POST(request: Request) {
  await connection();
  const access = await authorizeCase();
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  try {
    const form = await request.formData();
    const uploaded = emptyParsed();
    for (const value of form.getAll("logs")) {
      if (typeof value === "string") continue;
      addFile(uploaded, value.name, await value.text());
    }
    if (uploaded.files.length === 0) {
      return NextResponse.json({ error: "None of the files could be read: they are not a known log, a key register or a case-facts file." }, { status: 400 });
    }
    let merged = uploaded;
    let facts = uploaded.context;
    if (supplyEnabled()) {
      const replaced = new Set(uploaded.files.map((f) => f.kind as string));
      const base = loadEvidenceDir(evidenceDir(), replaced);
      merged = {
        events: [...base.events, ...uploaded.events],
        changes: [...base.changes, ...uploaded.changes],
        register: uploaded.register ?? base.register,
        files: [...base.files, ...uploaded.files],
        context: uploaded.context,
      };
      facts = uploaded.context ?? loadPack();
    }
    return NextResponse.json(analyze(merged, facts));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "The logs could not be analysed." }, { status: 500 });
  }
}
