import path from "node:path";
import { describe, expect, it } from "vitest";
import { addFile, analyze, emptyParsed, type Analysis, type Context, type Parsed } from "../src/engine";
import pack from "../case-pack/CR-26-047.json";
import { buildBaseline } from "../src/engine/baseline";
import { checkBank } from "../src/engine/bank";
import { coverCidr, inCidr } from "../src/engine/cidr";
import { loadEvidenceDir } from "../src/engine/node";
import { defaultOptions } from "../src/engine/types";

const dir = process.env.EVIDENCE_DIR ?? path.join(process.cwd(), "evidence");
const parsed: Parsed = loadEvidenceDir(dir);
// The facts the team typed in from the PDFs. The engine starts without them; these tests supply them on purpose.
const ctx = pack as unknown as Context;
const result: Analysis = analyze(parsed, ctx);
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
    const r = analyze(moved, ctx);
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

describe("address ranges", () => {
  it("covers a key's computers with the tightest block and leaves the build computer outside it", () => {
    const hosts = ["10.20.4.11", "10.20.4.12", "10.20.4.13", "10.20.4.14", "10.20.4.15", "10.20.4.16"];
    expect(coverCidr(hosts)).toBe("10.20.4.0/27");
    expect(inCidr("10.20.4.12", "10.20.4.0/27")).toBe(true);
    expect(inCidr("10.20.4.77", "10.20.4.0/27")).toBe(false);
    expect(inCidr("10.20.4.77", "10.20.4.0/24")).toBe(true); // the loose range the policy asks for lets it in
    expect(coverCidr(["172.16.9.40"])).toBe("172.16.9.40/32");
    expect(coverCidr([])).toBeNull();
  });
});

describe("narrower keys, advised from what each key did", () => {
  it("shows the finance key did four things from six computers, not everything in every module", () => {
    const k = result.keys.find((x) => x.credential_id === "key-tb-07");
    expect(k?.advice?.used).toContain("Read vendors");
    expect(k?.advice?.used.some((u) => /bank/i.test(u))).toBe(false);
    expect(k?.advice?.hosts).toHaveLength(6);
    expect(k?.advice?.recommendedRange).toBe("10.20.4.0/27");
  });

  it("gives the over-privileged help-desk and storage keys a one-thing scope", () => {
    expect(result.keys.find((x) => x.credential_id === "tb-sync-svc")?.advice?.used).toHaveLength(1);
    expect(result.keys.find((x) => x.credential_id === "bvk-7f3a")?.advice?.recommendedRange).toBe("172.16.9.40/32");
  });

  it("is simulated as two controls that each stop the bank change", () => {
    const controls = result.simulation!.controls;
    const block = controls.find((c) => /tightest block/.test(c.name));
    const narrow = controls.find((c) => /Narrow each key/.test(c.name));
    expect(block?.stopsBankChange).toBe("yes");
    expect(block?.share).toBeGreaterThan(95);
    expect(narrow?.stopsBankChange).toBe("yes");
    expect(controls.find((c) => /Layered/.test(c.name))?.stopsBankChange).toBe("yes");
  });
});

describe("guarding the money", () => {
  it("holds only the two suspicious changes on the supplied logs, with the extra rules on", () => {
    expect(result.bank.filter((b) => b.hold).map((b) => b.vendorId).sort()).toEqual(["V-0233", "V-0412"]);
  });

  it("tags the changes whose call-back contact changed first, without holding the ones that are well approved", () => {
    const tagged = result.bank.filter((b) => b.contactChangedDays !== undefined);
    expect(tagged.length).toBeGreaterThan(0);
    expect(tagged.every((b) => !b.hold)).toBe(true);
  });

  it("holds a change made through the API even when it carries an approval reference", () => {
    const changes = parsed.changes.map((c) => (c.vendorId === "V-0412" && c.field === "bank_account" ? { ...c, approvalRef: "APR-9999" } : c));
    const v = checkBank(changes).bank.find((b) => b.vendorId === "V-0412");
    expect(v?.status).toBe("api-channel");
    expect(v?.hold).toBe(true);
  });

  it("holds a weakly approved change when the supplier's contact was changed just before it", () => {
    const old = parsed.changes.find((c) => c.field === "bank_account" && c.approvalRef === "" && c.channel !== "API");
    expect(old).toBeDefined();
    const before = checkBank(parsed.changes).bank.find((b) => b.id === old!.id);
    expect(before?.hold).toBe(false);
    const contact = { ...old!, id: "synthetic-contact", field: "contact_phone", oldValue: "(previous)", newValue: "(updated)", approvalRef: "", ts: old!.ts - 3 * 86_400_000 };
    const after = checkBank([...parsed.changes, contact]).bank.find((b) => b.id === old!.id);
    expect(after?.hold).toBe(true);
    expect(after?.contactChangedDays).toBe(3);
  });
});

describe("starting with nothing", () => {
  it("shows an empty analysis, not preloaded output", () => {
    const empty = analyze(emptyParsed());
    expect(empty.alerts).toEqual([]);
    expect(empty.timeline).toEqual([]);
    expect(empty.keys).toEqual([]);
    expect(empty.claims).toEqual([]);
    expect(empty.scorecard).toEqual([]);
    expect(empty.simulation).toBeNull();
    expect(empty.files).toEqual([]);
    expect(empty.stats.source).toBe("empty");
    expect(empty.stats.from).toBeNull();
  });

  it("measures no accuracy when no attacker labels were given", () => {
    const noFacts = analyze(parsed);
    expect(noFacts.stats.labelled).toBe(false);
    expect(noFacts.scorecard).toEqual([]);
    expect(noFacts.simulation).toBeNull();
    expect(noFacts.claims).toEqual([]);
  });

  it("flags the ordinary activity it was never told about, then sets it aside once the facts arrive", () => {
    const noFacts = analyze(parsed);
    const ordinaryWith = result.alerts.filter((a) => a.status === "ordinary").map((a) => a.title);
    expect(ordinaryWith).toContain("Contact-detail sync (release 3.6.0)");
    expect(ordinaryWith).toContain("Sandbox traffic during announced maintenance");
    const ordinaryWithout = noFacts.alerts.filter((a) => a.status === "ordinary").map((a) => a.title);
    expect(ordinaryWithout).not.toContain("Contact-detail sync (release 3.6.0)");
    expect(ordinaryWithout).not.toContain("Sandbox traffic during announced maintenance");
    expect(noFacts.alerts.filter((a) => a.status !== "ordinary").length).toBeGreaterThan(result.alerts.filter((a) => a.status !== "ordinary").length);
  });

  it("still holds the two suspicious bank changes with no facts at all, because that check needs none", () => {
    expect(analyze(parsed).bank.filter((b) => b.hold).map((b) => b.vendorId).sort()).toEqual(["V-0233", "V-0412"]);
  });

  it("takes case facts from an uploaded JSON file", () => {
    const p = emptyParsed();
    const info = addFile(p, "my-facts.json", JSON.stringify(pack));
    expect(info?.kind).toBe("facts");
    expect(p.context?.claims.length).toBe(ctx.claims.length);
    expect(analyze(p).claims.length).toBe(ctx.claims.length);
    expect(addFile(emptyParsed(), "junk.json", JSON.stringify({ hello: "world" }))).toBeNull();
  });

  it("records the span the logs cover and when the register was exported", () => {
    expect(result.stats.from).toMatch(/^2026-06-0/);
    expect(result.stats.to).toMatch(/^2026-09-0/);
    expect(result.stats.registerExported).toMatch(/^2026-09-02/);
  });
});

describe("very large uploads", () => {
  it("analyses hundreds of thousands of events without failing", () => {
    // Math.max(...array) throws "Maximum call stack size exceeded" past roughly 120,000 elements.
    const big = { ...parsed, events: [...parsed.events, ...parsed.events, ...parsed.events], changes: [...parsed.changes] };
    expect(big.events.length).toBeGreaterThan(300_000);
    const r = analyze(big, ctx);
    expect(r.stats.events).toBe(big.events.length);
    expect(r.stats.from).toMatch(/^2026-06-0/);
  }, 120_000);
});
