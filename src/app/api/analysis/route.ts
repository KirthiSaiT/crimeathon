import path from "node:path";
import { connection, NextResponse } from "next/server";
import { addFile, analyze, emptyParsed, type Analysis } from "@/engine";
import { loadEvidenceDir } from "@/engine/node";

const evidenceDir = () => process.env.EVIDENCE_DIR ?? path.join(process.cwd(), "evidence");
let supplied: Analysis | null = null;

// GET: run the detector on the supplied evidence folder.
export async function GET() {
  await connection();
  try {
    supplied ??= analyze(loadEvidenceDir(evidenceDir()));
    return NextResponse.json(supplied);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "The evidence folder could not be read." }, { status: 500 });
  }
}

// POST: run it on uploaded logs. Kinds of log that are not uploaded fall back to the supplied evidence.
export async function POST(request: Request) {
  await connection();
  try {
    const form = await request.formData();
    const uploaded = emptyParsed();
    for (const value of form.getAll("logs")) {
      if (typeof value === "string") continue;
      addFile(uploaded, value.name, await value.text());
    }
    if (uploaded.files.length === 0) {
      return NextResponse.json({ error: "None of the files had the columns of a known log." }, { status: 400 });
    }
    const replaced = new Set(uploaded.files.map((f) => f.kind as string));
    const base = loadEvidenceDir(evidenceDir(), replaced);
    const merged = {
      events: [...base.events, ...uploaded.events],
      changes: [...base.changes, ...uploaded.changes],
      register: uploaded.register ?? base.register,
      files: [...base.files, ...uploaded.files],
    };
    // Accuracy is measured against our own labels of the supplied logs, which do not apply to new data.
    return NextResponse.json(analyze(merged, undefined, {}, false));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "The logs could not be analysed." }, { status: 500 });
  }
}
