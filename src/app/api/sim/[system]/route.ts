import { connection, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// The simulated systems (LedgerOne, HelpDeskr, BlueVault) answer here. A caller presents a key as a bearer
// token and names an action; the database checks the key the way a real API gateway would.
// POST /api/sim/ledgerone   Authorization: Bearer wk_ledgerone_...   { "action": "vendors.read", "params": {} }
const SYSTEMS = ["ledgerone", "helpdeskr", "bluevault"];

export async function POST(request: Request, { params }: { params: Promise<{ system: string }> }) {
  await connection();
  const { system } = await params;
  if (!SYSTEMS.includes(system)) return NextResponse.json({ ok: false, reason: "unknown system" }, { status: 404 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, reason: "the database is not configured" }, { status: 503 });

  const header = request.headers.get("authorization") ?? "";
  const secret = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim().slice(0, 200) : "";
  const body = (await request.json().catch(() => ({}))) as { action?: unknown; params?: unknown };
  const action = typeof body.action === "string" ? body.action.slice(0, 60) : "";
  const callParams = body.params && typeof body.params === "object" && !Array.isArray(body.params) ? body.params : {};

  // No session: the key is the only credential, as with any API.
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("sim_api", { p_system: system, p_secret: secret, p_action: action, p_params: callParams });
  if (error || !data) return NextResponse.json({ ok: false, reason: "the gateway could not be reached" }, { status: 502 });
  return NextResponse.json(data, { status: typeof data.status === "number" ? data.status : 500 });
}
