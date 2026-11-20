import { connection, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveSource } from "@/lib/net";

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

  // The source address. A caller can write anything into X-Forwarded-For or X-Source-IP, so only the entry our own
  // proxy appended is believed (TRUSTED_PROXY_HOPS, default 1 in production). A caller-declared address (X-Source-IP)
  // is honoured only outside production or when ALLOW_DECLARED_SOURCE=true, so the address limits can be demonstrated.
  // A private address claimed by a request that came from the public side is reported as forged.
  const production = process.env.NODE_ENV === "production";
  const { source, forged } = resolveSource((name) => request.headers.get(name), {
    hops: Number(process.env.TRUSTED_PROXY_HOPS ?? (production ? 1 : 0)),
    mayDeclare: !production || process.env.ALLOW_DECLARED_SOURCE === "true",
  });

  // The database accepts a source address only from this route, which proves itself with GATEWAY_SECRET. Without
  // the secret every call counts as coming from an unknown address, so an address limit refuses it.
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("sim_api", {
    p_system: system,
    p_secret: secret,
    p_action: action,
    p_params: callParams,
    p_source: source,
    p_gateway: process.env.GATEWAY_SECRET ?? null,
    p_forged: forged,
  });
  if (error || !data) return NextResponse.json({ ok: false, reason: "the gateway could not be reached" }, { status: 502 });
  return NextResponse.json(data, { status: typeof data.status === "number" ? data.status : 500 });
}
