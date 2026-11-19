import { maxOf, minOf } from "./num";

// IPv4 ranges: enough to say "these computers" as one tight block, and to test whether an address is inside it.

export function ipToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return parts[0] * 16_777_216 + parts[1] * 65_536 + parts[2] * 256 + parts[3];
}

export function intToIp(n: number): string {
  return [Math.floor(n / 16_777_216) % 256, Math.floor(n / 65_536) % 256, Math.floor(n / 256) % 256, n % 256].join(".");
}

export function inCidr(ip: string, cidr: string): boolean {
  const [base, bits] = cidr.split("/");
  const a = ipToInt(ip);
  const b = ipToInt(base);
  const prefix = bits === undefined ? 32 : Number(bits);
  if (a === null || b === null || !(prefix >= 0 && prefix <= 32)) return false;
  const size = 2 ** (32 - prefix);
  return Math.floor(a / size) === Math.floor(b / size);
}

// The smallest block that holds every address, or null when there are none (or one is not IPv4).
export function coverCidr(ips: string[]): string | null {
  const nums = ips.map(ipToInt);
  if (nums.length === 0 || nums.some((n) => n === null)) return null;
  const lo = minOf(nums as number[]);
  const hi = maxOf(nums as number[]);
  let prefix = 32;
  while (prefix > 0 && Math.floor(lo / 2 ** (32 - prefix)) !== Math.floor(hi / 2 ** (32 - prefix))) prefix -= 1;
  const size = 2 ** (32 - prefix);
  return `${intToIp(Math.floor(lo / size) * size)}/${prefix}`;
}
