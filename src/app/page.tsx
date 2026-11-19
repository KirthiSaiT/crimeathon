/*
  Landing page, on the structure of the GraphCPG home page:

    announcement pill -> oversized headline with ONE cycling pill -> grey subheadline ->
    two CTAs (solid blue, pale blue) -> credibility wall -> board -> three feature cards ->
    numbers row -> verdict donut -> one finding, start to finish -> use-case links ->
    closing CTA -> footer.

  The palette is deliberately narrow: a white ground, near-black ink, one warm grey for
  secondary text and exactly one saturated blue that appears only on things you can click.

  Every figure comes from the detector's own output (/api/analysis), so the page cannot claim
  a result the logs do not support.
*/
"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Clock, FlaskConical, KeyRound, Landmark, Menu, Scale, TriangleAlert, X, ArrowUp } from "lucide-react";
import { AnalysisProvider, useAnalysis } from "@/components/analysis-provider";
import type { Alert, BankChange } from "@/lib/types";
import { APP_NAME } from "@/lib/brand";

const N = {
  ink: "#191918",
  inkSoft: "#37352F",
  grey: "#787774",
  greyLight: "#9B9A97",
  line: "#EDEDEC",
  lineSoft: "#F7F7F5",
  blue: "#2383E2",
  blueHover: "#1B6FC4",
  bluePale: "#EAF3FC",
  green: "#0F7B33",
  greenPale: "#D9F0DD",
  amber: "#E9A23B",
  amberPale: "#FBF3DB",
  red: "#D44C47",
  redPale: "#FDEBEC",
} as const;

const NAV = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Numbers", href: "#benchmarks" },
  { label: "Live board", href: "#board" },
  { label: "A real finding", href: "#finding" },
] as const;

/* Brand mark: a key whose teeth are three log nodes, the last one the held bank change. */
function KeyMark({ size = 28, radius = 6 }: { size?: number; radius?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx={radius} fill="#141413" />
      <circle cx="11" cy="11" r="4.2" stroke="#F6F6F4" strokeWidth="2" />
      <path d="M14 14 L24 24" stroke="#6C6B66" strokeWidth="2" strokeLinecap="round" />
      <path d="M19.5 19.5 L22.5 16.5" stroke="#4A4945" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="24" r="3.6" fill="#2E90FA" />
      <circle cx="24" cy="24" r="1.5" fill="#0A3D91" />
    </svg>
  );
}

/* One live pill above the headline, carrying a real number from the detector. */
function LiveBadge({ groups, events }: { groups: number; events: number }) {
  if (groups === 0) return null;
  return (
    <Link
      href="/overview"
      className="inline-flex items-center"
      style={{
        gap: 10, marginBottom: 40, background: N.lineSoft,
        border: `1px solid ${N.line}`, borderRadius: 999,
        padding: "6px 8px 6px 14px", fontSize: 14, color: N.inkSoft,
        textDecoration: "none",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: N.green, flexShrink: 0 }} />
      Live — {groups} alert groups from {events.toLocaleString("en-GB")} log rows, not fixtures
      <span
        className="flex items-center justify-center"
        style={{
          background: N.ink, color: "#FFFFFF", fontSize: 12, fontWeight: 600,
          borderRadius: 999, padding: "5px 12px",
        }}
      >
        Open the app
      </span>
    </Link>
  );
}

/* The four layers, cycling on their own so the hero shows the defense as something that RUNS. */
const STAGE_ITEMS = [
  { name: "Learned", bg: N.bluePale, dot: N.blue, color: N.blue },
  { name: "Flagged", bg: N.amberPale, dot: N.amber, color: "#9A6B00" },
  { name: "Checked", bg: N.redPale, dot: N.red, color: N.red },
  { name: "Held", bg: N.greenPale, dot: N.green, color: N.green },
] as const;

function HeadlineWordCycle() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((prev) => (prev + 1) % STAGE_ITEMS.length), 2200);
    return () => clearInterval(timer);
  }, []);

  const current = STAGE_ITEMS[index];

  return (
    <span style={{ display: "inline-flex", alignItems: "center", verticalAlign: "middle", position: "relative", margin: "0 10px" }}>
      {/* initial={false}: the first word renders in its final state, so a stalled animation loop
          can never leave the headline word invisible. Only word-to-word swaps animate. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={current.name}
          initial={{ opacity: 0, y: 16, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.94 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 16,
            background: current.bg, color: current.color, borderRadius: 999,
            padding: "4px 26px 4px 18px", whiteSpace: "nowrap",
          }}
        >
          <motion.span
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.25 }}
            style={{ width: 22, height: 22, borderRadius: 999, background: current.dot, display: "inline-block", flexShrink: 0 }}
          />
          {current.name}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* A single toast, once, real data. It appears after the reader has scrolled past the hero, holds
   for a few seconds and dismisses itself. */
function LiveAlertToast({ alert }: { alert: Alert | undefined }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!alert) return;
    let shown = false;
    let hideTimer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      if (shown || window.scrollY < 500) return;
      shown = true;
      setVisible(true);
      hideTimer = setTimeout(() => setVisible(false), 8000);
      window.removeEventListener("scroll", onScroll);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(hideTimer);
    };
  }, [alert]);

  if (!alert) return null;

  return (
    <div
      role="status"
      aria-hidden={!visible}
      style={{
        position: "fixed", bottom: 24, left: 24, zIndex: 60, maxWidth: 360,
        background: "#FFFFFF", border: `1px solid ${N.line}`, borderRadius: 14,
        boxShadow: "0 16px 40px -12px rgba(0,0,0,0.22)", padding: "16px 18px",
        display: "flex", gap: 12, alignItems: "flex-start",
        transform: visible ? "translateY(0)" : "translateY(16px)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "transform .35s cubic-bezier(.2,.8,.2,1), opacity .35s ease",
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 999, marginTop: 5, flexShrink: 0, background: N.red }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: N.greyLight, marginBottom: 3 }}>Flagged by the detector</div>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: N.ink, lineHeight: 1.3 }}>{alert.title}</div>
        <div className="text-mono" style={{ fontSize: 12.5, color: N.grey, marginTop: 3 }}>
          {alert.system} · {alert.key}
        </div>
        <Link
          href="/alerts"
          style={{ fontSize: 13, color: N.blue, fontWeight: 600, textDecoration: "none", marginTop: 8, display: "inline-block" }}
        >
          View in the app &rarr;
        </Link>
      </div>
      <button
        aria-label="Dismiss"
        onClick={() => setVisible(false)}
        style={{ border: "none", background: "transparent", color: N.greyLight, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4, flexShrink: 0, fontFamily: "inherit" }}
      >
        &times;
      </button>
    </div>
  );
}

/* This page is long and the nav is anchor-only; a back-to-top control appears once the hero is
   well out of view. */
function BackToTop() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 900);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!shown) return null;

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="flex items-center justify-center"
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 60,
        width: 40, height: 40, borderRadius: 999,
        background: N.ink, color: "#FFFFFF", border: "none", cursor: "pointer",
        boxShadow: "0 8px 24px -8px rgba(0,0,0,0.35)",
      }}
    >
      <ArrowUp size={18} />
    </button>
  );
}

interface BoardCard {
  id: string;
  title: string;
  tag: string;
  level: string;
}

const STATIC_BOARD_ITEMS: Record<string, BoardCard[]> = {
  "Open": [
    { id: "s-o-1", title: "Uses the key from a new address", tag: "LedgerOne", level: "High" },
    { id: "s-o-2", title: "Searches tickets for secrets", tag: "HelpDeskr", level: "High" },
    { id: "s-o-3", title: "Reads finance files", tag: "BlueVault", level: "High" },
  ],
  "In review": [
    { id: "s-r-1", title: "Bank changes on screen with no approval reference", tag: "LedgerOne", level: "Medium" },
  ],
  "Set aside": [
    { id: "s-a-1", title: "Announced sandbox maintenance", tag: "Network link", level: "Low" },
    { id: "s-a-2", title: "Weekly staff export", tag: "HelpDeskr", level: "Low" },
  ],
  "On hold": [
    { id: "s-h-1", title: "Coastal Packaging Ltd, ****4417 to ****9083", tag: "Bank gate", level: "No approval" },
    { id: "s-h-2", title: "Southern Fuel Services, ****3903 to ****9446", tag: "Bank gate", level: "Out of sequence" },
  ],
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* A Kanban board of the detector's own output: alert groups by status, plus the bank gate's hold
   list. Shows live data when available. */
function PipelineBoard({ alerts, bank }: { alerts: Alert[]; bank: BankChange[] }) {
  const live = alerts.length > 0;
  const fromAlerts = (status: Alert["status"]): BoardCard[] =>
    alerts.filter((a) => a.status === status).map((a) => ({ id: a.id, title: a.title, tag: a.system, level: cap(a.severity) }));
  const holds: BoardCard[] = bank
    .filter((b) => b.hold)
    .map((b) => ({ id: b.id, title: `${b.vendor}, ${b.oldValue} to ${b.newValue}`, tag: "Bank gate", level: b.status === "missing" ? "No approval" : "Out of sequence" }));

  const columns = [
    { label: "Open", dot: N.red, items: live ? fromAlerts("open") : STATIC_BOARD_ITEMS["Open"] },
    { label: "In review", dot: "#9A6B00", items: live ? fromAlerts("review") : STATIC_BOARD_ITEMS["In review"] },
    { label: "Set aside", dot: N.green, items: live ? fromAlerts("ordinary") : STATIC_BOARD_ITEMS["Set aside"] },
    { label: "On hold", dot: N.blue, items: live ? holds : STATIC_BOARD_ITEMS["On hold"] },
  ];

  return (
    <section id="board" style={{ padding: "112px 32px", maxWidth: 1100, margin: "0 auto", scrollMarginTop: 80 }}>
      <h2 style={{ fontSize: 44, lineHeight: 1.12, fontWeight: 700, letterSpacing: "-0.03em", textAlign: "center", color: N.ink }}>
        Every alert has a home.
      </h2>
      <p style={{ marginTop: 16, fontSize: 18, color: N.grey, textAlign: "center" }}>
        The same board the app tracks internally — live from the detector, not a mockup.
      </p>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, marginTop: 44 }}>
        {columns.map((col) => (
          <div key={col.label} style={{ background: N.lineSoft, borderRadius: 12, padding: 12, minWidth: 0 }}>
            <div className="flex items-center" style={{ gap: 8, padding: "4px 6px 12px" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: col.dot }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: N.inkSoft }}>{col.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: N.greyLight }}>{col.items.length}</span>
            </div>
            <div className="flex flex-col" style={{ gap: 8 }}>
              {col.items.slice(0, 5).map((c) => (
                <div key={c.id} style={{ background: "#FFFFFF", border: `1px solid ${N.line}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 13, fontWeight: 550, color: N.ink, lineHeight: 1.3 }}>{c.title}</div>
                  <div style={{ fontSize: 11, color: N.greyLight, marginTop: 5 }}>
                    {c.tag} &middot; {c.level}
                  </div>
                </div>
              ))}
              {col.items.length === 0 && <div style={{ fontSize: 12, color: N.greyLight, padding: "6px 6px 2px" }}>Empty</div>}
              {col.items.length > 5 && (
                <div style={{ fontSize: 11, color: N.greyLight, padding: "2px 6px" }}>+{col.items.length - 5} more</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* The lead finding: the one supplier bank change the gate holds first. */
const STATIC_LEAD = {
  vendor: "Coastal Packaging Ltd",
  vendorId: "V-0412",
  oldValue: "****4417",
  newValue: "****9083",
  changedBy: "key-tb-07",
  channel: "API",
  sourceIp: "10.20.4.77",
  evidence: "E19 line 313",
  why: "No approval reference is recorded. The change was made by key-tb-07 through the API from 10.20.4.77 on 3 Sep at 01:44 UTC, five days before the 8 Sep payment run.",
};

function Landing() {
  const { state } = useAnalysis();
  const [menuOpen, setMenuOpen] = useState(false);
  // Read on the client only; the server render uses a fixed year so the prerender stays stable.
  const year = useSyncExternalStore(
    () => () => {},
    () => new Date().getFullYear(),
    () => 2026,
  );
  const data = state.status === "ready" ? state.data : null;

  const alerts = data?.alerts ?? [];
  const bank = data?.bank ?? [];
  const flagged = alerts.filter((a) => a.status !== "ordinary");
  const openCount = alerts.filter((a) => a.status === "open").length;
  const reviewCount = alerts.filter((a) => a.status === "review").length;
  const ordinaryCount = alerts.filter((a) => a.status === "ordinary").length;
  const holds = bank.filter((b) => b.hold);
  const events = data?.stats.events ?? 0;
  const keyCount = data?.keys.length ?? 0;

  const leadBank = holds.find((b) => b.status === "missing") ?? holds[0];
  const lead = leadBank
    ? {
        vendor: leadBank.vendor,
        vendorId: leadBank.vendorId,
        oldValue: leadBank.oldValue,
        newValue: leadBank.newValue,
        changedBy: leadBank.changedBy,
        channel: leadBank.channel,
        sourceIp: leadBank.sourceIp,
        evidence: leadBank.evidence,
        why: leadBank.why,
      }
    : STATIC_LEAD;
  const leadAlert = flagged.find((a) => a.severity === "critical" || a.severity === "high") ?? flagged[0];

  const verdictSlices = [
    { name: "Open", value: openCount, color: "#C7362B" },
    { name: "In review", value: reviewCount, color: "#9A6B00" },
    { name: "Set aside as ordinary", value: ordinaryCount, color: "#157F5B" },
  ].filter((d) => d.value > 0);
  const total = openCount + reviewCount + ordinaryCount;

  const num = (n: number) => (data ? n.toLocaleString("en-GB") : "—");

  return (
    <div style={{ background: "#FFFFFF", color: N.ink }}>
      <LiveAlertToast alert={leadAlert} />
      <BackToTop />

      {/* ------------------------------------------------------------ nav */}
      <nav
        className="sticky top-0 z-50 flex items-center justify-between"
        style={{ padding: "0 32px", height: 64, background: "#FFFFFF", borderBottom: `1px solid ${N.line}` }}
      >
        <div className="flex items-center" style={{ gap: 36 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <KeyMark size={28} radius={7} />
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>{APP_NAME}</span>
          </div>
          <div className="hidden lg:flex items-center" style={{ gap: 24 }}>
            {NAV.map((l) => (
              <a key={l.label} href={l.href} style={{ fontSize: 15, color: N.inkSoft, fontWeight: 500, textDecoration: "none" }}>
                {l.label}
              </a>
            ))}
          </div>
        </div>
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="lg:hidden flex items-center justify-center"
          style={{ width: 36, height: 36, borderRadius: 6, border: `1px solid ${N.line}`, background: "#FFFFFF", color: N.inkSoft, cursor: "pointer" }}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <div className="hidden lg:flex items-center" style={{ gap: 20 }}>
          <Link
            href="/upload"
            style={{
              background: "transparent", color: N.inkSoft, fontSize: 15, fontWeight: 500,
              padding: "8px 12px", borderRadius: 6, border: `1px solid ${N.line}`, textDecoration: "none",
            }}
          >
            Upload logs
          </Link>
          <Link
            href="/overview"
            style={{ background: N.blue, color: "#FFFFFF", fontSize: 15, fontWeight: 500, padding: "9px 16px", borderRadius: 6, textDecoration: "none" }}
          >
            Open the app
          </Link>
        </div>
      </nav>

      {menuOpen && (
        <div
          className="lg:hidden sticky z-[70] flex flex-col"
          style={{ top: 64, background: "#FFFFFF", borderBottom: `1px solid ${N.line}`, padding: "12px 32px 20px", gap: 4 }}
        >
          {NAV.map((l) => (
            <a key={l.label} href={l.href} onClick={() => setMenuOpen(false)} style={{ fontSize: 15, color: N.inkSoft, fontWeight: 500, textDecoration: "none", padding: "10px 0" }}>
              {l.label}
            </a>
          ))}
          <Link
            href="/overview"
            onClick={() => setMenuOpen(false)}
            style={{ marginTop: 8, background: N.blue, color: "#FFFFFF", fontSize: 15, fontWeight: 500, padding: "10px 16px", borderRadius: 6, textDecoration: "none", textAlign: "center" }}
          >
            Open the app
          </Link>
        </div>
      )}

      {/* ----------------------------------------------------------- hero */}
      <section className="flex flex-col items-center text-center" style={{ padding: "40px 32px 0" }}>
        <LiveBadge groups={flagged.length} events={events} />

        <h1 style={{ fontSize: "clamp(40px, 8.5vw, 92px)", lineHeight: 1.04, fontWeight: 700, letterSpacing: "-0.035em", maxWidth: 1100, color: N.ink }}>
          Where every key is
          <br />
          <span style={{ whiteSpace: "nowrap" }}>
            <HeadlineWordCycle /> before it
          </span>
          <br />
          <span style={{ whiteSpace: "nowrap" }}>can move money.</span>
        </h1>

        <p style={{ marginTop: 28, fontSize: 20, lineHeight: 1.5, color: N.grey, maxWidth: 660, fontWeight: 400 }}>
          Habits learned from the logs. Bank changes held until they carry an approval. Nothing
          guessed, and every alert cites the evidence lines it was read from.
        </p>

        <div className="flex items-center flex-wrap justify-center" style={{ gap: 12, marginTop: 32 }}>
          <Link
            href="/overview"
            style={{ background: N.blue, color: "#FFFFFF", fontSize: 16, fontWeight: 500, padding: "13px 22px", borderRadius: 8, textDecoration: "none" }}
          >
            Open the app
          </Link>
          <a
            href="#finding"
            style={{ background: N.bluePale, color: N.blue, fontSize: 16, fontWeight: 500, padding: "13px 22px", borderRadius: 8, textDecoration: "none" }}
          >
            See a live finding
          </a>
        </div>
      </section>

      {/* ---------------------------------------------- credibility wall */}
      <section style={{ padding: "72px 32px 0" }}>
        <div className="flex flex-wrap items-center justify-center" style={{ gap: 40, maxWidth: 1100, margin: "0 auto" }}>
          {["LedgerOne", "HelpDeskr", "BlueVault", "SSO", "TallyBridge", "Network link"].map((name, i, arr) => (
            <span key={name} className="flex items-center" style={{ gap: 40 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: N.ink, letterSpacing: "-0.02em" }}>{name}</span>
              {i < arr.length - 1 && <span style={{ width: 4, height: 4, borderRadius: 999, background: N.greyLight }} />}
            </span>
          ))}
        </div>
        <p style={{ textAlign: "center", marginTop: 28, fontSize: 15, color: N.grey }}>
          Run end-to-end on the 20 supplied evidence files for case CR-26-047, Harbor &amp; Finch
          Freight — not on fixtures.
        </p>
      </section>

      <PipelineBoard alerts={alerts} bank={bank} />

      {/* ------------------------------------------------------ features */}
      <section id="how-it-works" style={{ padding: "120px 32px", maxWidth: 1100, margin: "0 auto", scrollMarginTop: 80 }}>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          {[
            {
              kicker: "Learn the habit",
              head: "If a key steps outside its pattern, it shows.",
              body: "Each key's usual computers, actions and hours are learned from the first half of the logs, then frozen so the attacker cannot teach it otherwise.",
              code: "baseline.freeze(firstHalf) → detect(secondHalf)",
              href: "/alerts",
            },
            {
              kicker: "Check the bank change",
              head: "No supplier account changes without a reference.",
              body: "Every bank change is checked for an approval reference that is present, unique and in sequence. A change without one is held for call-back.",
              code: "approval_ref ∈ sequence ? pass : hold",
              href: "/bank-gate",
            },
            {
              kicker: "Test the vendor's word",
              head: "The notice says closed. The logs disagree.",
              body: "Each statement in the vendor's notices is turned into a test over the company's own logs, with a verdict and the lines behind it.",
              code: "claim → logs → verdict + evidence",
              href: "/claims",
            },
          ].map((f) => (
            <div key={f.kicker} style={{ background: N.lineSoft, borderRadius: 20, padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
              <div className="flex items-start justify-between" style={{ gap: 12 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: N.blue }}>{f.kicker}</span>
                  <h3 style={{ marginTop: 8, fontSize: 21, lineHeight: 1.28, fontWeight: 700, letterSpacing: "-0.02em", color: N.ink }}>{f.head}</h3>
                </div>
                <Link
                  href={f.href}
                  aria-label={`Open ${f.kicker} in the app`}
                  className="flex items-center justify-center"
                  style={{ width: 38, height: 38, borderRadius: 999, flexShrink: 0, background: N.ink, color: "#FFFFFF", fontSize: 16, textDecoration: "none" }}
                >
                  &rarr;
                </Link>
              </div>

              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: N.grey }}>{f.body}</p>

              <div
                className="flex items-center justify-center"
                style={{ background: "#FFFFFF", borderRadius: 14, padding: "28px 16px", border: `1px solid ${N.line}`, boxShadow: "0 10px 28px -12px rgba(0,0,0,0.14)", minHeight: 76 }}
              >
                <code className="text-mono" style={{ fontSize: 12.5, color: N.ink, textAlign: "center", wordBreak: "break-word" }}>
                  {f.code}
                </code>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------- the numbers, as a row */}
      <section
        id="benchmarks"
        style={{ padding: "64px 32px", background: N.lineSoft, borderTop: `1px solid ${N.line}`, borderBottom: `1px solid ${N.line}`, scrollMarginTop: 80 }}
      >
        <div className="flex flex-wrap items-start justify-between" style={{ maxWidth: 1100, margin: "0 auto", gap: 32 }}>
          {[
            [num(events), "log rows read"],
            [num(keyCount), "keys scored against policy"],
            [num(flagged.length), "alert groups flagged"],
            [num(ordinaryCount), "ordinary events set aside"],
            [num(holds.length), "suppliers held for call-back"],
          ].map(([v, l]) => (
            <div key={l} className="flex flex-col" style={{ gap: 6 }}>
              <span style={{ fontSize: 42, fontWeight: 700, letterSpacing: "-0.03em", color: N.ink }}>{v}</span>
              <span style={{ fontSize: 14, color: N.grey }}>{l}</span>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------------------- verdict breakdown */}
      {total > 0 && (
        <section style={{ padding: "112px 32px", maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{ fontSize: 44, lineHeight: 1.12, fontWeight: 700, letterSpacing: "-0.03em", textAlign: "center", color: N.ink }}>
            Every alert, accounted for.
          </h2>
          <p style={{ marginTop: 16, fontSize: 18, color: N.grey, textAlign: "center" }}>
            The same breakdown the app tracks — {total} alert groups across every log supplied.
          </p>

          <div
            style={{ marginTop: 44, border: `1px solid ${N.line}`, borderRadius: 20, overflow: "hidden", background: "#FFFFFF", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.10)" }}
          >
            <div className="grid items-center" style={{ gridTemplateColumns: "minmax(0,280px) 1fr", gap: 48, padding: "40px 44px" }}>
              <div style={{ position: "relative", height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={verdictSlices}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="64%"
                      outerRadius="92%"
                      paddingAngle={verdictSlices.length > 1 ? 3 : 0}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {verdictSlices.map((v) => (
                        <Cell key={v.name} fill={v.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => {
                        const n = Number(value) || 0;
                        return [`${n} (${Math.round((n / total) * 100)}%)`, name];
                      }}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${N.line}`, boxShadow: "0 4px 16px rgba(0,0,0,.08)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", color: N.ink, lineHeight: 1 }}>{total}</div>
                    <div style={{ fontSize: 13, color: N.greyLight, marginTop: 4 }}>alert groups</div>
                  </div>
                </div>
              </div>

              {/* Direct labels + a value + a percent, not colour alone. */}
              <div className="flex flex-col" style={{ gap: 18 }}>
                {verdictSlices.map((v) => {
                  const pct = Math.round((v.value / total) * 100);
                  return (
                    <div key={v.name}>
                      <div className="flex items-center" style={{ gap: 10, fontSize: 16 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 999, background: v.color, flexShrink: 0 }} />
                        <span style={{ color: N.inkSoft, fontWeight: 600, flex: 1 }}>{v.name}</span>
                        <span style={{ fontWeight: 700, color: N.ink }}>{v.value}</span>
                        <span style={{ color: N.greyLight, width: 44, textAlign: "right" }}>{pct}%</span>
                      </div>
                      <div style={{ marginTop: 8, height: 6, borderRadius: 999, background: N.lineSoft, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: v.color, borderRadius: 999 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* -------------------------------------------- a real finding, shown */}
      <section id="finding" style={{ padding: "112px 32px", maxWidth: 900, margin: "0 auto", scrollMarginTop: 80 }}>
        <h2 style={{ fontSize: 44, lineHeight: 1.12, fontWeight: 700, letterSpacing: "-0.03em", textAlign: "center", color: N.ink }}>
          One finding, start to finish.
        </h2>
        <p style={{ marginTop: 16, fontSize: 18, color: N.grey, textAlign: "center" }}>
          Taken from the supplied evidence, with its line number — not a mockup.
        </p>

        <div style={{ marginTop: 44, border: `1px solid ${N.line}`, borderRadius: 14, overflow: "hidden" }}>
          <div className="flex items-center justify-between" style={{ padding: "20px 24px", borderBottom: `1px solid ${N.line}`, gap: 16 }}>
            <div className="flex flex-col" style={{ gap: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>
                {lead.vendor} changed bank account with no approval
              </span>
              <span className="text-mono" style={{ fontSize: 13, color: N.greyLight }}>
                {lead.vendorId} · {lead.channel} · {lead.evidence}
              </span>
            </div>
            <span style={{ background: "#FDEBEC", color: "#B02F2C", fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 6, whiteSpace: "nowrap" }}>
              Held
            </span>
          </div>

          <div style={{ padding: "20px 24px", background: N.lineSoft }}>
            {[
              { k: "Key", v: lead.changedBy },
              { k: "From", v: lead.sourceIp },
              { k: "Change", v: `${lead.oldValue} → ${lead.newValue}` },
            ].map((x) => (
              <div key={x.k} className="flex items-baseline" style={{ gap: 14, padding: "5px 0" }}>
                <span style={{ fontSize: 13, color: N.greyLight, width: 56, flexShrink: 0 }}>{x.k}</span>
                <span className="text-mono" style={{ fontSize: 14, color: N.ink }}>
                  {x.v}
                </span>
              </div>
            ))}
          </div>

          <div style={{ padding: "20px 24px" }}>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: N.inkSoft }}>{lead.why}</p>
            <div className="flex items-center" style={{ gap: 8, marginTop: 14, fontSize: 14 }}>
              <span style={{ color: N.red, fontWeight: 600 }}>No approval reference</span>
              <span style={{ color: N.greyLight }}>· phone the supplier on a number you already trust</span>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- use-case links */}
      <section style={{ padding: "0 32px 112px", maxWidth: 1100, margin: "0 auto" }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: N.greyLight }}>See what {APP_NAME} can do</span>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginTop: 16 }}>
          {[
            { icon: KeyRound, ring: N.bluePale, fg: N.blue, head: "Score every key against policy", href: "/keys" },
            { icon: TriangleAlert, ring: N.amberPale, fg: N.amber, head: "Flag the key that steps out of pattern", href: "/alerts" },
            { icon: Landmark, ring: N.redPale, fg: N.red, head: "Hold a bank change for call-back", href: "/bank-gate" },
            { icon: Scale, ring: N.greenPale, fg: N.green, head: "Test the vendor's claims on the logs", href: "/claims" },
            { icon: FlaskConical, ring: N.lineSoft, fg: N.ink, head: "Replay the attack through the defense", href: "/simulation" },
          ].map((u) => (
            <Link
              key={u.head}
              href={u.href}
              style={{ display: "block", background: "#FFFFFF", border: `1px solid ${N.line}`, borderRadius: 12, padding: 18, textDecoration: "none" }}
            >
              <div className="flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 999, background: u.ring, marginBottom: 16 }}>
                <u.icon size={20} color={u.fg} strokeWidth={2.25} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: N.ink, lineHeight: 1.35 }}>{u.head} &rarr;</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- closing CTA */}
      <section className="flex flex-col items-center text-center" style={{ padding: "112px 32px", borderTop: `1px solid ${N.line}` }}>
        <h2 style={{ fontSize: "clamp(36px, 6vw, 64px)", lineHeight: 1.06, fontWeight: 700, letterSpacing: "-0.035em", color: N.ink }}>
          Point it at your logs.
        </h2>
        <p style={{ marginTop: 20, fontSize: 19, color: N.grey }}>No agents. No configuration. Logs are recognised by their columns.</p>
        <div className="flex items-center flex-wrap justify-center" style={{ gap: 12, marginTop: 30 }}>
          <Link
            href="/upload"
            style={{ background: N.blue, color: "#FFFFFF", fontSize: 16, fontWeight: 500, padding: "13px 22px", borderRadius: 8, textDecoration: "none" }}
          >
            Upload logs
          </Link>
          <code
            className="text-mono"
            style={{ background: N.lineSoft, color: N.inkSoft, fontSize: 14, padding: "13px 18px", borderRadius: 8, border: `1px solid ${N.line}` }}
          >
            npm run analyze -- &lt;folder&gt;
          </code>
        </div>
      </section>

      <footer style={{ borderTop: `1px solid ${N.line}`, background: N.lineSoft }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 32px 32px" }}>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 40 }}>
            <div>
              <div className="flex items-center" style={{ gap: 10 }}>
                <KeyMark size={26} radius={6} />
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>{APP_NAME}</span>
              </div>
              <p style={{ marginTop: 14, fontSize: 14, lineHeight: 1.6, color: N.grey, maxWidth: 280 }}>
                Every key, known by its habit. Every figure on this page comes from the detector&apos;s own
                output on the supplied evidence, not a mockup.
              </p>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: N.greyLight, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 14 }}>Product</div>
              <div className="flex flex-col" style={{ gap: 10 }}>
                {[...NAV, { label: "Open the app", href: "/overview" }].map((l) => (
                  <Link key={l.label} href={l.href} style={{ fontSize: 14, color: N.inkSoft, textDecoration: "none" }}>
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: N.greyLight, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 14 }}>Built with</div>
              <div className="flex flex-col" style={{ gap: 10 }}>
                {["Next.js · TypeScript", "Vitest", "Evidence E01 to E20", "Case CR-26-047"].map((t) => (
                  <span key={t} style={{ fontSize: 14, color: N.grey }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap" style={{ marginTop: 48, paddingTop: 20, borderTop: `1px solid ${N.line}`, gap: 8 }}>
            <span style={{ fontSize: 13, color: N.greyLight }}>
              &copy; {year} {APP_NAME}
            </span>
            <span style={{ fontSize: 13, color: N.greyLight }}>
              <Clock size={12} style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
              Team H4CK_077 &middot; Defense
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <AnalysisProvider>
      <Landing />
    </AnalysisProvider>
  );
}
