import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { connection, NextResponse } from "next/server";
import { authorizeCase } from "@/lib/supabase/server";

// Runs the Selenium suite (tests/e2e/run.mjs) from the Simulation page, against the server that is answering.
// It starts a browser and a child process on this machine, so it only works for a local visitor on a machine that
// has the project checked out. Anywhere else it says so and does nothing.

interface Job {
  child: ChildProcess | null;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  base: string | null;
}
const g = globalThis as unknown as { __wardenE2E?: Job };
const job = (): Job => (g.__wardenE2E ??= { child: null, startedAt: null, finishedAt: null, exitCode: null, base: null });

const root = () => /* turbopackIgnore: true */ process.cwd();
const logFile = () => path.join(root(), ".e2e", "run.log");
// Runs started here write to their own folder, so they never overwrite the reference results in docs/selenium.
const outDir = () => path.join(root(), ".e2e", "latest");
const resultsFile = () => path.join(outDir(), "results.json");
const runner = () => path.join(root(), "tests", "e2e", "run.mjs");
const reporter = () => path.join(root(), "tests", "e2e", "report.mjs");

function hostOf(request: Request) {
  return (request.headers.get("host") ?? "").trim();
}
function availability(request: Request): { enabled: true } | { enabled: false; reason: string } {
  const host = hostOf(request);
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(name)) return { enabled: false, reason: "The tests start a browser on this machine, so they only run when you open the app on localhost." };
  if (process.env.NODE_ENV === "production" && process.env.WARDEN_E2E !== "true") return { enabled: false, reason: "A production build does not start tests on its own. Set WARDEN_E2E=true to allow it, or run npm run e2e in a terminal." };
  if (!fs.existsSync(runner())) return { enabled: false, reason: "The test files (tests/e2e) are not in this copy of the project." };
  return { enabled: true };
}
// A page on another site must not be able to start a run.
const sameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  return !origin || origin.replace(/^https?:\/\//, "") === hostOf(request);
};

function tail(n: number): string[] {
  try {
    return fs
      .readFileSync(logFile(), "utf8")
      .replace(/\u001b\[[0-9;]*m/g, "")
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "")
      .slice(-n);
  } catch {
    return [];
  }
}

function lastResults() {
  try {
    const r = JSON.parse(fs.readFileSync(resultsFile(), "utf8"));
    return {
      startedAt: r.startedAt as string,
      finishedAt: r.finishedAt as string,
      base: r.base as string,
      summary: r.summary as { total: number; passed: number; failed: number },
      tests: (r.tests as { id: string; name: string; status: string; ms: number; error?: string }[]).map((t) => ({ id: t.id, name: t.name, status: t.status, ms: t.ms, error: t.error })),
      note: (r.note as string | undefined) ?? null,
      worst: r.timing?.worst ?? null,
      scaling: r.timing?.scaling ?? null,
    };
  } catch {
    return null;
  }
}

function status(request: Request) {
  const a = availability(request);
  const j = job();
  return {
    ...a,
    running: j.child !== null,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
    exitCode: j.exitCode,
    base: j.base,
    mode: process.env.NODE_ENV,
    log: a.enabled ? tail(40) : [],
    results: a.enabled ? lastResults() : null,
  };
}

export async function GET(request: Request) {
  await connection();
  const access = await authorizeCase();
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  return NextResponse.json(status(request));
}

// Start a run.
export async function POST(request: Request) {
  await connection();
  const access = await authorizeCase();
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  const a = availability(request);
  if (!a.enabled) return NextResponse.json({ error: a.reason }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request came from another site." }, { status: 403 });
  const j = job();
  if (j.child) return NextResponse.json({ error: "A run is already going." }, { status: 409 });

  try {
    fs.mkdirSync(path.dirname(logFile()), { recursive: true });
    const fd = fs.openSync(logFile(), "w");
    const base = `http://${hostOf(request)}`;
    const child = spawn(process.execPath, [runner()], { cwd: root(), env: { ...process.env, BASE_URL: base, E2E_OUT: outDir() }, stdio: ["ignore", fd, fd], windowsHide: true });
    j.child = child;
    j.startedAt = Date.now();
    j.finishedAt = null;
    j.exitCode = null;
    j.base = base;
    const done = (code: number | null) => {
      if (j.child !== child) return;
      j.child = null;
      j.finishedAt = Date.now();
      j.exitCode = code;
      try {
        fs.closeSync(fd);
      } catch {}
      // Rebuild the HTML report from the new results so the files in docs/selenium stay in step.
      if (code === 0) spawn(process.execPath, [reporter()], { cwd: root(), env: { ...process.env, E2E_OUT: outDir() }, stdio: "ignore", windowsHide: true }).on("error", () => {});
    };
    child.on("exit", done);
    child.on("error", () => done(1));
    return NextResponse.json(status(request), { status: 202 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "The tests could not be started." }, { status: 500 });
  }
}

// Stop a run that is going. The browser the test opened is closed with it.
export async function DELETE(request: Request) {
  await connection();
  const access = await authorizeCase();
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  const a = availability(request);
  if (!a.enabled) return NextResponse.json({ error: a.reason }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request came from another site." }, { status: 403 });
  const child = job().child;
  if (child?.pid) {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }).on("error", () => {});
    else child.kill("SIGTERM");
  }
  return NextResponse.json(status(request));
}
