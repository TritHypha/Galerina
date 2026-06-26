// =============================================================================
// SSRF egress-guard wiring regression (self-audit finding 61-9)
//
// The live interpreter http.* path (stdlib.ts networkAsync) previously used a
// bypassable inline private-range regex that MISSED: IPv4-in-IPv6 metadata
// ([::ffff:169.254.169.254]), *.internal/*.corp/*.local internal TLDs,
// CGNAT 100.64/10, decimal/hex numeric IPs, and embedded-credential URLs.
// It now delegates to the hardened @galerina/core-network guardOutboundUrl, which
// normalizes + denies all of these fail-closed BEFORE any fetch.
//
// Each case below denies at the guard (no network call is made). We assert the
// result is a Galerina Err carrying the SSRF / SPORE-NET-001 marker.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { callStdlib } from "../../dist/index.js";

const ctx = {
  recordEffect: () => {},
  resolveIdentifier: () => undefined,
  callFlow: async () => { throw new Error("unused"); },
  applyFn: async () => { throw new Error("unused"); },
};

const str = (value) => ({ __tag: "string", value });

async function httpGet(url) {
  return callStdlib("http.get", undefined, [str(url)], ctx);
}

function assertSsrfDenied(result, label) {
  assert.equal(result.__tag, "err", `${label}: expected an Err (SSRF denial), got ${result?.__tag}`);
  const msg = result.error?.value ?? "";
  assert.match(msg, /SSRF/, `${label}: Err must name SSRF — got: ${msg}`);
  assert.match(msg, /SPORE-NET-001/, `${label}: Err must carry SPORE-NET-001 — got: ${msg}`);
}

describe("SSRF egress-guard wiring (61-9)", () => {
  // ── bypasses the OLD inline regex MISSED (the actual exploitable finding) ──
  const missedBypasses = [
    ["IPv4-in-IPv6 metadata", "http://[::ffff:169.254.169.254]/latest/meta-data/"],
    ["internal TLD (.internal)", "http://metadata.internal/"],
    ["corp TLD (.corp)", "http://db.corp/secrets"],
    ["mDNS (.local)", "http://service.local/"],
    ["decimal numeric IP (127.0.0.1)", "http://2130706433/"],
    ["hex numeric IP (127.0.0.1)", "http://0x7f000001/"],
    ["CGNAT 100.64/10", "http://100.64.0.1/"],
    ["embedded credentials (userinfo SSRF)", "http://user:pass@example.com/"],
  ];
  for (const [label, url] of missedBypasses) {
    it(`denies ${label}`, async () => assertSsrfDenied(await httpGet(url), label));
  }

  // ── cases the OLD regex already caught — must STAY denied (no regression) ──
  const stillDenied = [
    ["loopback 127.0.0.1", "http://127.0.0.1/"],
    ["metadata literal 169.254.169.254", "http://169.254.169.254/latest/meta-data/"],
    ["private 10/8", "http://10.0.0.5/"],
    ["disallowed scheme (file)", "file:///etc/passwd"],
    ["disallowed scheme (ftp)", "ftp://example.com/"],
  ];
  for (const [label, url] of stillDenied) {
    it(`still denies ${label}`, async () => assertSsrfDenied(await httpGet(url), label));
  }
});
