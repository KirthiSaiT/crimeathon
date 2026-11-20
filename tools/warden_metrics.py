#!/usr/bin/env python3
"""
WARDEN evidence metrics: measures the real evidence files and the real response time of the running system,
then derives further metrics from those two. Everything printed is measured on this machine, now. Nothing is
typed in, estimated or taken from an earlier run. Standard library only (Python 3.8 or newer).

What it measures
  1. The evidence files: size in bytes, rows, SHA-256 (so anyone can check they are the same files).
  2. The system: it uploads exactly those files to the running Warden server (POST /api/analysis), several
     times, and times each request in four parts: connect, upload, server processing, download.
  3. The pages: it requests every app page and times the server's response.
  4. Scaling: it repeats the upload with the same evidence duplicated 2x, 4x, ... and fits a line through the
     measured points to find how the time grows with size.
Then it derives: throughput, events per second, latency per MB, where the time goes, jitter, warm-up cost,
detection yield, how well it scales, and what a linear fit predicts for larger inputs (a projection, labelled
as such).

How to run (Windows cmd), with the server already running (npm run dev, or npm run build then npm start):
    cd C:\\Users\\HP\\OneDrive\\Documents\\key-guard
    python tools\\warden_metrics.py --email you@example.com          (asks for the password, hidden)
    python tools\\warden_metrics.py --no-auth                        (server started with sign-in switched off)
Useful options:
    --base-url http://localhost:3000   --runs 7   --scale 1,2,4,8   --no-pages   --save report.txt
The sign-in is the same one the website uses (Supabase). The password is never put on the command line.
"""

import argparse
import base64
import getpass
import hashlib
import http.client
import json
import math
import os
import platform
import socket
import statistics
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

MB = 1024 * 1024  # 1 MB = 1,048,576 bytes everywhere in this report

# The files the detector reads, and the optional case-facts file. The other evidence (PDFs, spreadsheets) is
# listed and counted but is not an input to the detector.
ANALYSED = [
    "E01_ledgerone_api_access.csv",
    "E02_helpdeskr_audit_log.csv",
    "E03_sso_signin_log.csv",
    "E05_bluevault_access_log.csv",
    "E15_network_link_flow_log.csv",
    "E18_ledgerone_api_access_1_to_7_sep.csv",
    "E19_vendor_master_change_log.csv",
    "E04_connected_software_register.json",
]
PAGES = ["/login", "/overview", "/alerts", "/keys", "/vault", "/bank-gate", "/payment-run", "/claims", "/timeline", "/scorecard", "/simulation", "/upload", "/tickets", "/activity", "/team"]

LINES = []


def emit(text=""):
    print(text)
    sys.stdout.flush()
    LINES.append(text)


def table(headers, rows, align=None):
    """Print a plain-text table. align: string of 'l' or 'r' per column."""
    align = align or ("l" * len(headers))
    cells = [[str(c) for c in r] for r in rows]
    widths = [max(len(str(h)), *(len(r[i]) for r in cells)) if cells else len(str(h)) for i, h in enumerate(headers)]

    def fmt(vals):
        out = []
        for i, v in enumerate(vals):
            out.append(str(v).rjust(widths[i]) if align[i] == "r" else str(v).ljust(widths[i]))
        return "  ".join(out).rstrip()

    emit(fmt(headers))
    emit("  ".join("-" * w for w in widths))
    for r in cells:
        emit(fmt(r))


def heading(title):
    emit()
    emit("=" * 78)
    emit(title)
    emit("=" * 78)


# ----------------------------------------------------------------------------- maths


def pct(sorted_vals, p):
    """Nearest-rank percentile."""
    i = min(len(sorted_vals) - 1, max(0, math.ceil(p * len(sorted_vals)) - 1))
    return sorted_vals[i]


def summarize(values):
    s = sorted(values)
    return {
        "n": len(s),
        "min": s[0],
        "avg": sum(s) / len(s),
        "median": statistics.median(s),
        "p95": pct(s, 0.95),
        "max": s[-1],
        "stdev": statistics.pstdev(s) if len(s) > 1 else 0.0,
    }


def linreg(xs, ys):
    """Least-squares line y = intercept + slope * x. Returns (slope, intercept, r_squared) or None."""
    n = len(xs)
    if n < 2:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return None
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    intercept = my - slope * mx
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (intercept + slope * x)) ** 2 for x, y in zip(xs, ys))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 1.0
    return slope, intercept, r2


def f1(x):
    return "{:,.1f}".format(x)


def f2(x):
    return "{:,.2f}".format(x)


# ----------------------------------------------------------------------------- project and files


def project_root():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_env(root):
    values = {}
    path = os.path.join(root, ".env.local")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                values[k.strip()] = v.strip().strip('"').strip("'")
    return values


def sha256_of(data):
    return hashlib.sha256(data).hexdigest()


def count_rows(name, data):
    """Rows of data in a CSV (not counting the header line). None for other kinds."""
    if not name.lower().endswith(".csv"):
        return None
    lines = data.count(b"\n") + (0 if data.endswith(b"\n") or not data else 1)
    return max(0, lines - 1)


def scale_csv(data, factor):
    """The same CSV with its data rows repeated `factor` times (header kept once)."""
    if factor == 1:
        return data
    i = data.find(b"\n")
    if i < 0:
        return data
    header, rest = data[: i + 1], data[i + 1 :]
    if rest and not rest.endswith(b"\n"):
        rest += b"\n"
    return header + rest * factor


def multipart(files):
    """files: list of (filename, bytes). Returns (content_type, body)."""
    boundary = "----wardenmetrics" + uuid.uuid4().hex
    parts = []
    for name, data in files:
        ctype = "application/json" if name.lower().endswith(".json") else "text/csv"
        head = ('--%s\r\nContent-Disposition: form-data; name="logs"; filename="%s"\r\nContent-Type: %s\r\n\r\n' % (boundary, name, ctype)).encode("utf-8")
        parts.append(head + data + b"\r\n")
    parts.append(("--%s--\r\n" % boundary).encode("utf-8"))
    return "multipart/form-data; boundary=" + boundary, b"".join(parts)


# ----------------------------------------------------------------------------- HTTP


class Target:
    def __init__(self, base_url):
        u = urlparse(base_url)
        self.https = u.scheme == "https"
        self.host = u.hostname or "localhost"
        self.port = u.port or (443 if self.https else 80)
        self.base = base_url.rstrip("/")

    def connect(self, timeout):
        cls = http.client.HTTPSConnection if self.https else http.client.HTTPConnection
        return cls(self.host, self.port, timeout=timeout)


def timed_request(target, method, path, headers=None, body=None, timeout=900):
    """One request, timed in four parts. The body is sent in full before the wait for the answer starts."""
    c = target.connect(timeout)
    t0 = time.perf_counter()
    c.connect()
    t_conn = time.perf_counter()
    c.request(method, path, body=body, headers=headers or {})
    t_sent = time.perf_counter()
    resp = c.getresponse()
    t_head = time.perf_counter()
    data = resp.read()
    t_done = time.perf_counter()
    c.close()
    return {
        "status": resp.status,
        "connect_ms": (t_conn - t0) * 1000,
        "upload_ms": (t_sent - t_conn) * 1000,
        "server_ms": (t_head - t_sent) * 1000,
        "download_ms": (t_done - t_head) * 1000,
        "ttfb_ms": (t_head - t0) * 1000,
        "total_ms": (t_done - t0) * 1000,
        "bytes_out": len(body) if body else 0,
        "bytes_in": len(data),
        "body": data,
    }


def sign_in(supabase_url, key, email, password):
    """The same password sign-in the website uses. Returns the session, as the site's cookie holds it."""
    req = urllib.request.Request(
        supabase_url.rstrip("/") + "/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode("utf-8"),
        headers={"apikey": key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode("utf-8")).get("error_description") or e.reason
        except Exception:
            msg = e.reason
        raise SystemExit("Sign-in failed: %s" % msg)


def session_cookie(supabase_url, session):
    """Build the Cookie header the site's server reads: sb-<project>-auth-token, base64url JSON, in 3180-character chunks."""
    ref = urlparse(supabase_url).hostname.split(".")[0]
    name = "sb-%s-auth-token" % ref
    raw = json.dumps(session, separators=(",", ":")).encode("utf-8")
    value = "base64-" + base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    if len(value) <= 3180:
        return "%s=%s" % (name, value)
    chunks = [value[i : i + 3180] for i in range(0, len(value), 3180)]
    return "; ".join("%s.%d=%s" % (name, i, c) for i, c in enumerate(chunks))


# ----------------------------------------------------------------------------- the report


def main():
    ap = argparse.ArgumentParser(description="Measure the evidence files and the real response time of Warden, and derive further metrics.")
    ap.add_argument("--base-url", default=os.environ.get("WARDEN_URL", "http://localhost:3000"))
    ap.add_argument("--evidence-dir", default=None, help="folder with the evidence files (default: ../evidence)")
    ap.add_argument("--runs", type=int, default=7, help="timed uploads of the full evidence (default 7)")
    ap.add_argument("--scale", default="1,2,4", help="evidence multipliers for the scaling test, e.g. 1,2,4,8")
    ap.add_argument("--scale-runs", type=int, default=2, help="uploads per multiplier (default 2)")
    ap.add_argument("--page-runs", type=int, default=5, help="requests per page (default 5)")
    ap.add_argument("--no-pages", action="store_true", help="skip the page response times")
    ap.add_argument("--no-auth", action="store_true", help="do not sign in (the server must have sign-in switched off)")
    ap.add_argument("--email", default=os.environ.get("WARDEN_EMAIL"))
    ap.add_argument("--password", default=os.environ.get("WARDEN_PASSWORD"), help="better: leave out and type it when asked")
    ap.add_argument("--save", default=None, help="write the report to this file (default: warden_metrics_<time>.txt here)")
    args = ap.parse_args()

    try:
        sys.stdout.reconfigure(errors="replace")
    except Exception:
        pass

    root = project_root()
    env = read_env(root)
    evidence_dir = args.evidence_dir or os.path.join(root, "evidence")
    pack_path = os.path.join(root, "case-pack", "CR-26-047.json")
    target = Target(args.base_url)
    started = datetime.now(timezone.utc)

    heading("WARDEN EVIDENCE METRICS")
    emit("Run at          : %s UTC" % started.strftime("%Y-%m-%d %H:%M:%S"))
    emit("Machine         : %s, %s, %d logical CPUs" % (platform.node(), platform.platform(), os.cpu_count() or 0))
    emit("Python          : %s" % platform.python_version())
    emit("System under test: %s" % target.base)

    # ---- 1. The evidence files
    heading("1. THE EVIDENCE (measured from the files on disk)")
    if not os.path.isdir(evidence_dir):
        raise SystemExit("Evidence folder not found: %s" % evidence_dir)
    all_files = sorted(f for f in os.listdir(evidence_dir) if os.path.isfile(os.path.join(evidence_dir, f)))
    sizes_all = {f: os.path.getsize(os.path.join(evidence_dir, f)) for f in all_files}
    inputs = []  # (name, bytes)
    rows_out = []
    total_rows = 0
    for name in ANALYSED:
        path = os.path.join(evidence_dir, name)
        if not os.path.exists(path):
            emit("  (missing, skipped: %s)" % name)
            continue
        with open(path, "rb") as fh:
            data = fh.read()
        rows = count_rows(name, data)
        total_rows += rows or 0
        inputs.append((name, data))
        rows_out.append((name, "{:,}".format(len(data)), f2(len(data) / MB), "{:,}".format(rows) if rows is not None else "n/a", sha256_of(data)[:16]))
    pack_bytes = None
    if os.path.exists(pack_path):
        with open(pack_path, "rb") as fh:
            pack_bytes = fh.read()
        rows_out.append(("case-pack/CR-26-047.json", "{:,}".format(len(pack_bytes)), f2(len(pack_bytes) / MB), "n/a", sha256_of(pack_bytes)[:16]))
    if not inputs:
        raise SystemExit("None of the analysed evidence files were found in %s" % evidence_dir)
    table(["File", "Bytes", "MB", "Data rows", "SHA-256 (first 16)"], rows_out, "lrrrl")
    analysed_bytes = sum(len(d) for _, d in inputs) + (len(pack_bytes) if pack_bytes else 0)
    folder_bytes = sum(sizes_all.values())
    emit()
    emit("Files sent to the detector : %d, total %s bytes = %s MB" % (len(inputs) + (1 if pack_bytes else 0), "{:,}".format(analysed_bytes), f2(analysed_bytes / MB)))
    emit("Log rows in those files    : %s" % "{:,}".format(total_rows))
    emit("Whole evidence folder      : %d files, %s bytes = %s MB (the rest are PDFs and spreadsheets read by people)" % (len(all_files), "{:,}".format(folder_bytes), f2(folder_bytes / MB)))
    csv_bytes = sum(len(d) for n, d in inputs if n.endswith(".csv"))
    avg_row = csv_bytes / total_rows if total_rows else 0.0
    emit("Average bytes per log row  : %s" % f1(avg_row))

    # ---- sign in
    cookie = None
    if not args.no_auth:
        url, key = env.get("NEXT_PUBLIC_SUPABASE_URL"), env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        if args.email and url and key:
            password = args.password or getpass.getpass("Password for %s: " % args.email)
            cookie = session_cookie(url, sign_in(url, key, args.email, password))
            emit()
            emit("Signed in as %s (a real session, the same one the website uses)." % args.email)
        else:
            emit()
            emit("Not signed in. If the server requires sign-in the requests will be refused (401); use --email, or --no-auth.")
    headers = {"Cookie": cookie} if cookie else {}

    # ---- reachability
    try:
        probe = timed_request(target, "GET", "/login", headers, timeout=30)
    except (OSError, socket.timeout) as e:
        raise SystemExit("\nCannot reach %s (%s). Start the app first: npm run dev (or npm run build, then npm start)." % (target.base, e))
    emit("Server reachable: GET /login answered HTTP %d in %s ms." % (probe["status"], f1(probe["total_ms"])))

    # ---- 2. Response time of the real analysis
    heading("2. RESPONSE TIME OF THE SYSTEM (the real evidence, uploaded %d times)" % args.runs)
    ctype, body = multipart(inputs + ([("CR-26-047.json", pack_bytes)] if pack_bytes else []))
    h = dict(headers)
    h["Content-Type"] = ctype
    runs = []
    answer = None
    for i in range(args.runs):
        r = timed_request(target, "POST", "/api/analysis", h, body)
        if r["status"] == 401:
            raise SystemExit("\nThe server answered 401: sign-in is required. Run with --email you@example.com, or start the server with sign-in off and use --no-auth.")
        if r["status"] != 200:
            raise SystemExit("\nThe analysis answered HTTP %d: %s" % (r["status"], r["body"][:200].decode("utf-8", "replace")))
        runs.append(r)
        if answer is None:
            answer = json.loads(r["body"].decode("utf-8"))
    table(
        ["Run", "HTTP", "Connect ms", "Upload ms", "Server ms", "Download ms", "Total ms", "Reply KB"],
        [
            (("%d (cold)" % (i + 1)) if i == 0 else str(i + 1), r["status"], f1(r["connect_ms"]), f1(r["upload_ms"]), f1(r["server_ms"]), f1(r["download_ms"]), f1(r["total_ms"]), f1(r["bytes_in"] / 1024))
            for i, r in enumerate(runs)
        ],
        "lrrrrrrr",
    )
    tot = summarize([r["total_ms"] for r in runs])
    srv = summarize([r["server_ms"] for r in runs])
    emit()
    emit("Total response time : min %s | avg %s | median %s | p95 %s | max %s ms (n=%d)" % (f1(tot["min"]), f1(tot["avg"]), f1(tot["median"]), f1(tot["p95"]), f1(tot["max"]), tot["n"]))
    emit("Server processing  : min %s | avg %s | median %s | p95 %s | max %s ms" % (f1(srv["min"]), f1(srv["avg"]), f1(srv["median"]), f1(srv["p95"]), f1(srv["max"])))

    stats = (answer or {}).get("stats", {})
    events = int(stats.get("events", 0))
    flagged = int(stats.get("flagged", 0))
    ordinary = int(stats.get("ordinary", 0))
    all_groups = (answer or {}).get("alerts", [])
    groups_ordinary = len([a for a in all_groups if a.get("status") == "ordinary"])
    to_review = [a for a in all_groups if a.get("status") != "ordinary"]
    alerts = len(to_review)
    sev = {}
    for a in to_review:
        sev[a.get("severity", "?")] = sev.get(a.get("severity", "?"), 0) + 1
    sev_text = ", ".join("%d %s" % (sev[k], k) for k in ("critical", "high", "medium", "low") if k in sev) or "none"
    holds = len([b for b in (answer or {}).get("bank", []) if b.get("hold")])
    emit()
    emit("What the system found (reported by the server, same on every run):")
    emit("  events analysed %s | events flagged %s | events set aside as ordinary %s" % ("{:,}".format(events), "{:,}".format(flagged), "{:,}".format(ordinary)))
    emit("  alert groups to review %d (%s) | ordinary groups set aside %d | bank changes held %d" % (alerts, sev_text, groups_ordinary, holds))
    if total_rows > events:
        emit("  (%s of the %s log rows are not events: they are the vendor change log's bank-change records, checked by the bank gate)" % ("{:,}".format(total_rows - events), "{:,}".format(total_rows)))

    # ---- 3. Derived metrics
    heading("3. METRICS DERIVED FROM THE SIZE AND THE RESPONSE TIME")
    size_mb = analysed_bytes / MB
    med_s = tot["median"] / 1000.0
    med_srv = srv["median"]
    med_total = tot["median"]
    med_up = statistics.median([r["upload_ms"] for r in runs])
    med_down = statistics.median([r["download_ms"] for r in runs])
    med_conn = statistics.median([r["connect_ms"] for r in runs])
    reply_kb = statistics.median([r["bytes_in"] for r in runs]) / 1024
    warm = [r["total_ms"] for r in runs[1:]] or [runs[0]["total_ms"]]
    rows = [
        ("Throughput", f2(size_mb / med_s) + " MB/s", "evidence MB / median total seconds"),
        ("Event rate", "{:,.0f} events/s".format(events / med_s) if events else "n/a", "events analysed / median total seconds"),
        ("Capacity", "{:,.0f} events/min".format(events / med_s * 60) if events else "n/a", "event rate x 60"),
        ("Latency per MB", f1(med_total / size_mb) + " ms/MB", "median total ms / evidence MB"),
        ("Latency per 1,000 events", f2(med_total / (events / 1000.0)) + " ms" if events else "n/a", "median total ms / (events / 1000)"),
        ("Share: server processing", f1(100.0 * med_srv / med_total) + " %", "median server ms / median total ms"),
        ("Share: upload", f1(100.0 * med_up / med_total) + " %", "median upload ms / median total ms"),
        ("Share: connect + download", f1(100.0 * (med_conn + med_down) / med_total) + " %", "(connect + download) ms / total ms"),
        ("Reply size", f1(reply_kb) + " KB", "what the dashboard receives"),
        ("Reply / evidence size", f2(100.0 * reply_kb * 1024 / analysed_bytes) + " %", "reply bytes / evidence bytes"),
        ("Detection yield", f2(100.0 * flagged / events) + " % of events flagged" if events else "n/a", "flagged events / events analysed"),
        ("Funnel", "{:,} events -> {:,} flagged -> {:,} alert groups".format(events, flagged, alerts) if events else "n/a", "what a person has to read at each step"),
        ("Alert compression", "{:,.1f} flagged events per alert group".format(flagged / alerts) if flagged and alerts else "n/a", "events flagged / alert groups to review"),
        ("Noise reduction", "{:,.0f} events per alert group".format(events / alerts) if events and alerts else "n/a", "events analysed / alert groups to review"),
        ("Jitter (spread of runs)", "stdev %s ms, %s %% of the mean" % (f1(tot["stdev"]), f1(100.0 * tot["stdev"] / tot["avg"]) if tot["avg"] else "0"), "population stdev / mean of total ms"),
        ("Tail ratio", f2(tot["p95"] / tot["median"]) + " x", "p95 / median total ms"),
        ("Cold-start cost", f1(runs[0]["total_ms"] - statistics.median(warm)) + " ms", "first run minus median of the later runs"),
    ]
    table(["Metric", "Value", "How it is derived"], rows, "lll")

    # ---- 4. Scaling
    heading("4. SCALING (the same evidence repeated, measured, then a straight line fitted)")
    factors = [int(x) for x in args.scale.split(",") if x.strip()]
    points = []  # (mb, ms)
    srows = []
    for f in factors:
        # Only the CSV logs are repeated; the key register (JSON) is sent once, as it is.
        scaled = [(n, scale_csv(d, f) if n.lower().endswith(".csv") else d) for n, d in inputs]
        ct, bd = multipart(scaled + ([("CR-26-047.json", pack_bytes)] if pack_bytes else []))
        hh = dict(headers)
        hh["Content-Type"] = ct
        times = []
        ev = 0
        status = 0
        for _ in range(max(1, args.scale_runs)):
            r = timed_request(target, "POST", "/api/analysis", hh, bd)
            status = r["status"]
            if status == 200:
                times.append(r["total_ms"])
                ev = int(json.loads(r["body"].decode("utf-8")).get("stats", {}).get("events", 0))
        if not times:
            srows.append((str(f) + "x", f2(len(bd) / MB), "-", "-", "HTTP %d" % status))
            continue
        med = statistics.median(times)
        mb = len(bd) / MB
        points.append((mb, med))
        srows.append((str(f) + "x", f2(mb), "{:,}".format(ev), f1(med), "{:,.0f}".format(ev / (med / 1000.0)) if ev else "n/a"))
    table(["Size", "Request MB", "Events", "Median ms", "Events/s"], srows, "rrrrr")
    emit()
    if len(points) >= 2:
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        fit = linreg(xs, ys)
        if fit:
            slope, icpt, r2 = fit
            emit("Straight-line fit of time against size (least squares over the measured points):")
            emit("  time_ms = %s + %s x size_MB      R-squared = %s" % (f1(icpt), f1(slope), f2(r2)))
            emit("  Cost of each extra MB   : %s ms" % f1(slope))
            emit("  Fixed cost per request  : %s ms (what a tiny upload would still take)" % f1(max(icpt, 0.0)))
            lx = [math.log(x) for x in xs]
            ly = [math.log(y) for y in ys]
            lf = linreg(lx, ly)
            if lf:
                b = lf[0]
                if b < 0.85:
                    verdict = "better than linear: a fixed cost dominates, so a bigger input costs less per MB"
                elif b <= 1.15:
                    verdict = "close to linear: doubling the data about doubles the time"
                else:
                    verdict = "worse than linear: the time grows faster than the data"
                emit("  Growth exponent         : %s (time ~ size^%s): %s" % (f2(b), f2(b), verdict))
            emit()
            emit("PROJECTION (extends the fitted line beyond what was measured; not a measurement):")
            for label, mb in (("100 MB", 100.0), ("500 MB", 500.0), ("1 GB", 1024.0)):
                emit("  %-7s -> about %s seconds" % (label, f1((icpt + slope * mb) / 1000.0)))
    else:
        emit("Not enough points for a fit (use --scale with at least two sizes).")

    # ---- 5. Pages
    if not args.no_pages:
        heading("5. PAGE RESPONSE TIMES (server answer to a GET, %d requests each)" % args.page_runs)
        prow = []
        worst = None
        every = []
        for p in PAGES:
            ts, ttfbs, size, status = [], [], 0, 0
            for _ in range(args.page_runs):
                r = timed_request(target, "GET", p, headers, timeout=60)
                status = r["status"]
                ts.append(r["total_ms"])
                ttfbs.append(r["ttfb_ms"])
                size = r["bytes_in"]
            s = summarize(ts)
            every.extend(ts)
            prow.append((p, status, f1(summarize(ttfbs)["median"]), f1(s["median"]), f1(s["p95"]), f1(s["max"]), f1(size / 1024)))
            if worst is None or s["max"] > worst[1]:
                worst = (p, s["max"])
        table(["Page", "HTTP", "TTFB med ms", "Total med ms", "p95 ms", "Max ms", "HTML KB"], prow, "lrrrrrr")
        emit()
        emit("All %d page requests: median %s ms, p95 %s ms. Slowest single response: %s at %s ms." % (len(every), f1(statistics.median(every)), f1(pct(sorted(every), 0.95)), worst[0], f1(worst[1])))
        emit("These are server responses. The time a browser takes to draw each page is measured by the Selenium suite.")

    # ---- Notes and saving
    heading("NOTES")
    emit("* Everything above was measured in this run on this machine, against %s." % target.base)
    emit("* Times include the network path between this script and the server. On localhost that is negligible.")
    emit("* A development server (npm run dev) compiles pages on first use, so its numbers read slower than a")
    emit("  production build (npm run build, npm start). Say which one you used when you quote the figures.")
    emit("* The SHA-256 column lets anyone confirm they hold the same evidence files.")
    emit("* The projection in section 4 is an extrapolation of a fitted line, not a measurement.")

    out = args.save or "warden_metrics_%s.txt" % started.strftime("%Y%m%d_%H%M%S")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(LINES) + "\n")
    emit()
    emit("Report saved to: %s" % os.path.abspath(out))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\nStopped.")
