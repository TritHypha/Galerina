// egress-trailing-dot.test.mjs — a trailing root dot must not launder an IP literal into "public".
//
// "127.0.0.1." / "169.254.169.254." are the same addresses as their dot-less forms: the system
// resolver (getaddrinfo) and the WHATWG URL host parser both strip the final root label. Before
// this fix classifyHost() split them into five parts, failed the IPv4 parse, and fell through to
// the hostname path, which reported them as a tentatively PUBLIC hostname — so guardOutboundHost()
// returned allowed:true (Galerina_NETWORK_EGRESS_ALLOWED) for the cloud metadata endpoint unless the
// caller remembered the DNS re-check.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyHost, guardOutboundHost, guardResolvedAddresses } from "../dist/index.js";

describe("classifyHost — trailing root dot on an IPv4 literal", () => {
  const cases = [
    ["127.0.0.1.", "loopback"],
    ["169.254.169.254.", "metadata"],
    ["10.0.0.1.", "private"],
    ["192.168.1.1.", "private"],
    ["0x7f000001.", "loopback"],
    ["2130706433.", "loopback"],
    ["8.8.8.8.", "public"],
  ];
  for (const [host, category] of cases) {
    it(`${host} classifies as ${category} (same as the dot-less literal)`, () => {
      const c = classifyHost(host);
      assert.equal(c.category, category);
      assert.equal(c.kind, "ipv4");
      assert.equal(c.requiresDnsRecheck, false);
    });
  }

  it("the input host string is preserved in the classification", () => {
    assert.equal(classifyHost("127.0.0.1.").host, "127.0.0.1.");
  });

  it("a double trailing dot is not an IPv4 literal and is not public", () => {
    const c = classifyHost("127.0.0.1..");
    assert.notEqual(c.kind, "ipv4");
  });
});

describe("guardOutboundHost — trailing-dot IP literals are denied fail-closed", () => {
  it("metadata endpoint with a trailing dot is denied", () => {
    const d = guardOutboundHost("169.254.169.254.");
    assert.equal(d.allowed, false);
    assert.equal(d.code, "Galerina_NETWORK_SSRF_METADATA_DENIED");
  });
  it("loopback with a trailing dot is denied", () => {
    const d = guardOutboundHost("127.0.0.1.");
    assert.equal(d.allowed, false);
    assert.equal(d.code, "Galerina_NETWORK_SSRF_NONPUBLIC_DENIED");
  });
  it("a resolved address with a trailing dot cannot pass the rebinding guard", () => {
    const d = guardResolvedAddresses("example.com", ["93.184.216.34", "10.0.0.1."]);
    assert.equal(d.allowed, false);
    assert.equal(d.code, "Galerina_NETWORK_SSRF_DNS_REBIND_DENIED");
  });
  it("a public IPv4 literal with a trailing dot stays allowed", () => {
    const d = guardOutboundHost("8.8.8.8.");
    assert.equal(d.allowed, true);
    assert.equal(d.category, "public");
  });
});
