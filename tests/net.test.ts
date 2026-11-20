import { describe, expect, it } from "vitest";
import { isPrivateIp, resolveSource } from "../src/lib/net";

const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null;
const prod = { hops: 1, mayDeclare: false };

describe("which addresses are private", () => {
  it("knows the private, loopback and link-local ranges", () => {
    for (const ip of ["10.20.4.5", "172.16.0.1", "172.31.255.255", "192.168.1.9", "127.0.0.1", "169.254.1.1", "::1", "fd00::1", "fe80::1"]) expect(isPrivateIp(ip), ip).toBe(true);
  });
  it("treats public addresses as public", () => {
    for (const ip of ["8.8.8.8", "203.0.113.9", "172.32.0.1", "172.15.0.1", "2001:db8::1"]) expect(isPrivateIp(ip), ip).toBe(false);
  });
  it("is not fooled by text that is not an address", () => {
    expect(isPrivateIp("10.0.0.1.evil")).toBe(false);
    expect(isPrivateIp("")).toBe(false);
  });
});

describe("the source address a request really came from", () => {
  it("believes only what our own proxy appended, counted from the right", () => {
    const r = resolveSource(headers({ "x-forwarded-for": "10.20.4.5, 203.0.113.9" }), prod);
    expect(r.source).toBe("203.0.113.9");
  });
  it("calls a private address claimed from the public side a forgery", () => {
    const r = resolveSource(headers({ "x-forwarded-for": "10.20.4.5, 203.0.113.9" }), prod);
    expect(r.forged).toBe(true);
    expect(r.claimed).toEqual(["10.20.4.5"]);
  });
  it("ignores a declared X-Source-IP in production, and counts a private one as a forgery", () => {
    const r = resolveSource(headers({ "x-forwarded-for": "203.0.113.9", "x-source-ip": "10.20.4.5" }), prod);
    expect(r.source).toBe("203.0.113.9");
    expect(r.forged).toBe(true);
  });
  it("does not call a real public caller a forgery", () => {
    const r = resolveSource(headers({ "x-forwarded-for": "203.0.113.9" }), prod);
    expect(r).toEqual({ source: "203.0.113.9", forged: false, claimed: [] });
  });
  it("does not call a genuine internal caller a forgery", () => {
    const r = resolveSource(headers({ "x-forwarded-for": "10.20.4.5" }), prod);
    expect(r).toEqual({ source: "10.20.4.5", forged: false, claimed: [] });
  });
  it("has no trusted address when the proxy added none", () => {
    const r = resolveSource(headers({}), prod);
    expect(r.source).toBeNull();
    expect(r.forged).toBe(false);
  });
  it("cannot be fooled by junk in the header", () => {
    const r = resolveSource(headers({ "x-forwarded-for": "not-an-ip, 10.0.0.1, 203.0.113.9" }), prod);
    expect(r.source).toBe("203.0.113.9");
    expect(r.forged).toBe(true);
  });
  it("lets a demo declare an address outside production", () => {
    const r = resolveSource(headers({ "x-source-ip": "10.20.4.5" }), { hops: 0, mayDeclare: true });
    expect(r).toEqual({ source: "10.20.4.5", forged: false, claimed: [] });
  });
});
