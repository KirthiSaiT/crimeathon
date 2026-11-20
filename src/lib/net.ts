import { isIP } from "node:net";

// Which address did a request really come from, and is anyone pretending?
// A caller can write anything into X-Forwarded-For or X-Source-IP. Only what OUR OWN proxy appended can be believed,
// and that is the entry counted from the right by the number of trusted proxies in front of the app.

// Private, loopback, link-local and other addresses that can never be the public side of a request.
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb");
  }
  return false;
}

export interface SourceOptions {
  // Proxies we run in front of the app that append to X-Forwarded-For (1 behind a typical host, 0 when called directly).
  hops: number;
  // May the caller declare its own address with X-Source-IP? Only for demos, never in production.
  mayDeclare: boolean;
}

export interface SourceResult {
  // The address to trust, or null when none can be.
  source: string | null;
  // A private address was claimed by a request that arrived from the public side.
  forged: boolean;
  // Addresses that were claimed but are not trusted, for the record.
  claimed: string[];
}

export function resolveSource(get: (name: string) => string | null, opt: SourceOptions): SourceResult {
  const chain = (get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => isIP(s) !== 0);
  const declared = (get("x-source-ip") ?? "").trim();
  const declaredOk = isIP(declared) !== 0;

  // Demos: a declared address is believed, so the address limits can be shown working.
  if (opt.mayDeclare && declaredOk) return { source: declared, forged: false, claimed: [] };

  let source: string | null = null;
  let untrusted: string[] = [];
  if (opt.hops > 0) {
    if (chain.length >= opt.hops) {
      source = chain[chain.length - opt.hops];
      untrusted = chain.slice(0, chain.length - opt.hops);
    }
  } else {
    // No proxy in front: there is nothing to count from, so take the first entry as the old behaviour did.
    source = chain[0] ?? null;
  }
  const claimed = [...untrusted, ...(declaredOk && !opt.mayDeclare ? [declared] : [])];
  const forged = source !== null && !isPrivateIp(source) && claimed.some(isPrivateIp);
  return { source, forged, claimed };
}
