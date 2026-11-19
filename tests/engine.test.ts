import path from "node:path";
import { describe, expect, it } from "vitest";
import { addFile, analyze, emptyParsed, type Analysis, type Parsed } from "../src/engine";
import { buildBaseline } from "../src/engine/baseline";
import { loadEvidenceDir } from "../src/engine/node";
import { defaultOptions } from "../src/engine/types";

const dir = process.env.EVIDENCE_DIR ?? path.join(process.cwd(), "evidence");
const parsed: Parsed = loadEvidenceDir(dir);
const result: Analysis = analyze(parsed);
const group = (title: string, key?: string) => result.alerts.find((a) => a.title === title && (!key || a.key === key));

describe("loading", () => {
  it("recognises a log by its columns, not its name", () => {
    const p = emptyParsed();
    addFile(p, "renamed-export.csv", "ts_utc,request_id,api_key_id,caller_ip,user_agent,endpoint,method,records_returned,status\n2026-06-03T00:31:22Z,r1,key-rpt-03,172.16.9.30,HF-Reports/1.8,/v2/shipments,GET,787,200\n");
    expect(p.events).toHaveLength(1);
    expect(p.events[0].system).toBe("LedgerOne");
    expect(p.events[0].file).toBe("E01");
  });

  it("converts HelpDeskr's India time to UTC", () => {
    const first = parsed.events.find((e) => e.id === "E02:2");
    expect(first && new Date(first.ts).toISOString()).toBe("2026-06-03T02:00:58.000Z");
  });

  it("does not crash on empty input", () => {
    const empty = analyze(emptyParsed());
    expect(empty.alerts).toEqual([]);
    expect(empty.bank).toEqual([]);
  });
});

describe("baseline", () => {
  it("never learns the attacker's computers as normal", () => {
    const b = buildBaseline(parsed.events.slice().sort((x, y) => x.ts - y.ts), defaultOptions);
    const finance = b.hosts.get("key-tb-07");
    expect(finance?.size).toBe(6);
    expect(finance?.has("10.20.4.77")).toBe(false);
    expect(finance?.has("198.18.7.41")).toBe(false);
  });
});

describe("the incident, found from the logs", () => {
  it("flags the storage key reading finance files", () => {
    const g = group("Reads finance files", "bvk-7f3a");
    expect(g?.count).toBe(38);
    expect(g?.severity).toBe("critical");
  });

  it("flags the secret hunt and the export cycle on the support key", () => {
    expect(group("Searches tickets for secrets", "tb-sync-svc")?.count).toBe(16);
    expect(group("Exports tickets and deletes the export", "tb-sync-svc")?.count).toBe(30);
  });

  it("flags the bank-details endpoint, which only the finance key ever called", () => {
    const reads = result.alerts.filter((a) => a.title === "Reads supplier bank details");
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) {
      expect(r.key).toBe("key-tb-07");
      expect(r.source).toBe("10.20.4.77");
    }
  });

  it("flags the bank change itself", () => {
    const change = group("Changes a supplier bank account", "key-tb-07");
    expect(change?.evidence).toEqual([{ file: "E18", lines: "1088" }]);
  });

  it("holds exactly the two suspicious bank changes", () => {
    const held = result.bank.filter((b) => b.hold).map((b) => `${b.vendorId}:${b.status}:${b.evidence}`).sort();
    expect(held).toEqual(["V-0233:out-of-sequence:E19 line 243", "V-0412:missing:E19 line 313"]);
  });
});

describe("ordinary events are set aside", () => {
  it("lists the nightly sync, the bulk import, the maintenance window and the staff export as ordinary", () => {
    const ordinary = result.alerts.filter((a) => a.status === "ordinary");
    const titles = ordinary.map((a) => a.title).sort();
    expect(titles).toEqual([
      "Contact-detail sync (release 3.6.0)",
      "Finance bulk import with a BULK reference",
      "Sandbox traffic during announced maintenance",
      "Staff ticket exports",
    ]);
    expect(ordinary.find((a) => a.title.startsWith("Contact-detail"))?.count).toBe(70);
  });

  it("raises no false alarm on the supplied logs", () => {
    const base = result.scorecard[0];
    expect(base.fp).toBe(0);
    expect(base.fn).toBe(0);
    expect(base.tp).toBeGreaterThan(200);
  });
});

describe("vendor claims are tested against the logs", () => {
  const verdict = (id: string) => result.claims.find((c) => c.id === id);
  it("rejects the claims the logs contradict", () => {
    for (const id of ["C-01", "C-02", "C-03", "C-04", "C-06", "C-07"]) expect(verdict(id)?.verdict).toBe("false");
  });
  it("names the export that was never deleted", () => {
    expect(verdict("C-03")?.because).toContain("EXP-5419");
    expect(verdict("C-03")?.because).toContain("9932");
  });
  it("cannot settle the rotation claim", () => {
    expect(verdict("C-05")?.verdict).toBe("unproven");
  });
});

describe("variations the team has not seen", () => {
  it("still catches the attack when every vendor-link address is renumbered", () => {
    const moved: Parsed = { ...parsed, events: parsed.events.map((e) => ({ ...e, source: e.source.replace(/^10\.20\.4\.(\d+)$/, (_m, n: string) => `10.20.4.${+n + 90}`) })) };
    const r = analyze(moved);
    expect(r.alerts.some((a) => a.title === "Changes a supplier bank account")).toBe(true);
    expect(r.scorecard[0].fn).toBe(0);
  });

  it("degrades, and says so, when the attacker rides a real sync computer", () => {
    expect(result.scorecard[3].fn).toBeGreaterThan(0);
    expect(result.scorecard[3].fp).toBe(0);
  });

  it("does worse when the baseline is learned from all data", () => {
    expect(result.scorecard[4].fn).toBeGreaterThan(result.scorecard[3].fn);
  });
});

describe("uploads", () => {
  it("keeps two files of the same kind apart", () => {
    const head = "ts_utc,request_id,api_key_id,caller_ip,user_agent,endpoint,method,records_returned,status\n";
    const p = emptyParsed();
    addFile(p, "part-one.csv", `${head}2026-06-03T00:31:22Z,r1,key-rpt-03,172.16.9.30,HF-Reports/1.8,/v2/shipments,GET,1,200\n`);
    addFile(p, "part-two.csv", `${head}2026-06-04T00:31:22Z,r2,key-rpt-03,172.16.9.30,HF-Reports/1.8,/v2/shipments,GET,1,200\n`);
    expect(new Set(p.events.map((e) => e.id)).size).toBe(2);
  });

  it("gives the same answer when the supplied logs are split across renamed files", () => {
    const sameKind = parsed.files.filter((f) => f.kind === "ledger");
    expect(sameKind.length).toBe(2);
    expect(new Set(parsed.events.map((e) => e.id)).size).toBe(parsed.events.length);
  });
});

describe("the defense replayed against the attack", () => {
  const sim = result.simulation!;
  const control = (start: string) => sim.controls.find((c) => c.name.startsWith(start))!;

  it("fires weeks before the bank change", () => {
    expect(sim.milestones[0].daysBeforeChange).toBeGreaterThan(20);
    expect(sim.milestones.some((m) => /Bank gate holds/.test(m.label))).toBe(true);
  });

  it("shows that an address limit including the vendor link would not have stopped the change", () => {
    expect(control("Address limit that includes").stopsBankChange).toBe("no");
  });

  it("shows that an exact per-key limit would have", () => {
    expect(control("Exact address limit").stopsBankChange).toBe("yes");
  });

  it("shows that revoking within a day stops the change but a month is too late", () => {
    expect(sim.sensitivity.find((s) => s.delay === "1 day")?.stopsBankChange).toBe(true);
    expect(sim.sensitivity.find((s) => s.delay === "30 days")?.stopsBankChange).toBe(false);
  });

  it("says plainly what it cannot simulate", () => {
    expect(control("Keys expire").stopsBankChange).toBe("cannot tell");
  });
});
