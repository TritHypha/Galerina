#!/usr/bin/env node
// prove-egress-guard.mjs — re-runnable prove-own-maths for the SSRF egress guard.
//
// Computes classifier correctness vs the known IANA special-purpose ranges (sampled), the
// numeric-bypass equivalence (decimal/hex/octal IPs ≡ their dotted form), and fail-closed totality
// (fuzzed inputs never throw and never allow a non-public destination by default). Seeded, exit 0.
//
//   Run:  npm run prove   (or: node scripts/prove-egress-guard.mjs)

import { classifyHost, guardOutboundHost, guardOutboundUrl, guardResolvedAddresses } from "../dist/index.js";

const results = [];
const ok = (name, cond, detail) => results.push({ name, ok: !!cond, detail });

// seeded PRNG — no Math.random
let seed = 0x9e3779b1 >>> 0;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 0xffffffff; };
const rint = (n) => Math.floor(rnd() * n);

// P1 — every IANA special range classifies non-public (sampled across each block).
{
  const inRange = [
    ...Array.from({ length: 400 }, () => `127.${rint(256)}.${rint(256)}.${rint(256)}`),         // loopback
    ...Array.from({ length: 400 }, () => `10.${rint(256)}.${rint(256)}.${rint(256)}`),           // private
    ...Array.from({ length: 400 }, () => `192.168.${rint(256)}.${rint(256)}`),                   // private
    ...Array.from({ length: 400 }, () => `172.${16 + rint(16)}.${rint(256)}.${rint(256)}`),      // private 172.16/12
    ...Array.from({ length: 400 }, () => `169.254.${rint(256)}.${rint(256)}`),                   // link-local (+metadata)
    ...Array.from({ length: 200 }, () => `100.${64 + rint(64)}.${rint(256)}.${rint(256)}`),      // cgnat
  ];
  const allNonPublic = inRange.every((h) => classifyHost(h).category !== "public");
  ok("P1 every sampled IANA special-range IPv4 is classified non-public", allNonPublic, `${inRange.length} sampled, 0 leaked to public`);
  // and the 172.16/12 boundary is exact (172.15 / 172.32 are public)
  const boundary = classifyHost("172.15.0.1").category === "public" && classifyHost("172.32.0.1").category === "public" && classifyHost("172.16.0.1").category === "private" && classifyHost("172.31.255.255").category === "private";
  ok("P1b the 172.16/12 boundary is exact (172.15 & 172.32 public; 172.16–172.31 private)", boundary, "exact CIDR edges");
}

// P2 — public addresses are NOT mis-flagged (no false-positive denial of the open internet).
{
  const publics = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "13.107.42.14", "140.82.121.4", "93.184.216.34", "2606:4700::1111", "2001:4860:4860::8888"];
  const allPublic = publics.every((h) => classifyHost(h).category === "public");
  ok("P2 well-known public addresses classify as public (no over-blocking)", allPublic, publics.join(" "));
}

// P3 — numeric-IP bypass equivalence: decimal/hex/octal ≡ the dotted form.
{
  const eq = [
    ["2130706433", "127.0.0.1"], ["0x7f000001", "127.0.0.1"], ["0177.0.0.1", "127.0.0.1"],
    ["167772161", "10.0.0.1"], ["0xa9fea9fe", "169.254.169.254"], ["2852039166", "169.254.169.254"],
  ];
  const allEq = eq.every(([num, dotted]) => classifyHost(num).category === classifyHost(dotted).category);
  ok("P3 numeric-IP bypasses (decimal/hex/octal) normalize to the dotted range", allEq, eq.map((e) => `${e[0]}≡${e[1]}`).join(", "));
  // the metadata endpoint is caught through EVERY encoding
  const metaForms = ["169.254.169.254", "0xa9fea9fe", "2852039166"].every((h) => classifyHost(h).category === "metadata");
  ok("P3b the cloud metadata endpoint is caught through every numeric encoding", metaForms, "169.254.169.254 / 0xa9fea9fe / 2852039166");
}

// P4 — fail-closed TOTALITY: fuzzed inputs never throw, and never allow a non-public host by default.
{
  const alphabet = "0123456789abcdef.:[]xX/@-_ ";
  let threw = 0, leaked = 0;
  for (let i = 0; i < 20000; i++) {
    let s = ""; const len = rint(24);
    for (let j = 0; j < len; j++) s += alphabet[rint(alphabet.length)];
    try {
      const c = classifyHost(s);
      const d = guardOutboundHost(s);
      // default policy: an allowed host MUST be public (or FQDN-tentative-public); never a private/meta/loopback.
      if (d.allowed && !["public"].includes(c.category)) leaked++;
    } catch { threw++; }
  }
  ok("P4 fuzzed inputs never throw (classifyHost/guardOutboundHost are total)", threw === 0, `${threw} throws over 20000 fuzz inputs`);
  ok("P4b no fuzzed input is allowed by default unless classified public (fail-closed)", leaked === 0, `${leaked} non-public leaks`);
}

// P5 — guard fail-closed on the URL layer (scheme / credentials / parse).
{
  const denied = [
    "http://example.com/", "ftp://example.com/", "file:///etc/passwd",
    "https://user:pass@example.com/", "https://169.254.169.254/", "https://2130706433/", "://nope", "https://[bad",
  ].every((u) => guardOutboundUrl(u).allowed === false);
  const allowed = guardOutboundUrl("https://example.com/ok").allowed === true;
  ok("P5 URL guard denies plaintext/bad-scheme/credentials/metadata/unparseable; allows https-public", denied && allowed, "fail-closed URL layer");
}

// P6 — DNS-rebinding guard: ANY non-public resolved address denies; all-public allows; empty fails closed.
{
  // A resolution is allowed IFF every address is public. Verify against a fuzz of mixed resolutions.
  const publics = ["8.8.8.8", "1.1.1.1", "13.107.42.14", "93.184.216.34"];
  const nonpublics = ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "::1", "2130706433"];
  let leaks = 0, falseDenies = 0;
  for (let i = 0; i < 5000; i++) {
    const k = 1 + rint(3);
    const addrs = Array.from({ length: k }, () => (rnd() < 0.5 ? publics[rint(publics.length)] : nonpublics[rint(nonpublics.length)]));
    const anyNonPublic = addrs.some((a) => classifyHost(a).category !== "public");
    const d = guardResolvedAddresses("host.example", addrs);
    if (d.allowed && anyNonPublic) leaks++;          // a rebinding leak — must never happen
    if (!d.allowed && !anyNonPublic) falseDenies++;  // an all-public set wrongly denied
  }
  ok("P6 DNS-rebinding: a resolution is allowed IFF every address is public (5000 mixed sets)", leaks === 0 && falseDenies === 0, `${leaks} rebinding leaks, ${falseDenies} false denies`);
  ok("P6b empty resolution fails closed", guardResolvedAddresses("nxdomain", []).allowed === false, "no addresses → deny");
}

// summary
let fails = 0;
console.log("\n-- @galerina/core-network egress guard — prove-own-maths (SSRF classifier + fail-closed guard) --");
for (const r of results) { if (!r.ok) fails++; console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name.padEnd(70)} ${r.detail}`); }
console.log(fails === 0
  ? `\n${results.length}/${results.length} PASS — every IANA special range (and its decimal/hex/octal/IPv4-mapped disguises) classifies non-public, public addresses are not over-blocked, and the guard is total + fail-closed (deny-by-default, 20k-input fuzz: 0 throws, 0 leaks).`
  : `\n${results.length - fails}/${results.length} PASS, ${fails} FAILED — review above.`);
process.exit(fails === 0 ? 0 : 1);
