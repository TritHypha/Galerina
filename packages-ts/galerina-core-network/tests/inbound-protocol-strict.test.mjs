// inbound-protocol-strict.test.mjs — zero-trust default, owner may revisit: an inbound request that does
// not state its protocol matches NO protocol-specific allow rule.
//
// Every inbound endpoint rule names a protocol, but a request with `protocol` omitted matched every rule's
// protocol: "allow udp:53" admitted an unidentified request on port 53 just as it would a UDP datagram.
// Now a protocol-less request can only be admitted by `defaultEffect: "allow"`; DENY rules still match it
// regardless of protocol (refusal stays the broad side). Existing Galerina_NETWORK_INBOUND_* codes reused.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guardInboundRequest } from "../dist/index.js";

const allowUdp53 = { defaultEffect: "deny", endpoints: [{ direction: "inbound", protocol: "udp", effect: "allow", ports: [53] }] };

describe("guardInboundRequest — protocol-less requests", () => {
  it("are not admitted by a protocol-specific allow rule", () => {
    const d = guardInboundRequest({ port: 53 }, allowUdp53);
    assert.equal(d.allowed, false);
    assert.equal(d.code, "Galerina_NETWORK_INBOUND_DENY_DEFAULT");
  });

  it("are not admitted by an unrestricted-port allow rule either", () => {
    const policy = { defaultEffect: "deny", endpoints: [{ direction: "inbound", protocol: "https", effect: "allow" }] };
    assert.equal(guardInboundRequest({ port: 443 }, policy).allowed, false);
  });

  it("still match a deny rule of any protocol (deny stays broad)", () => {
    const policy = { defaultEffect: "allow", endpoints: [{ direction: "inbound", protocol: "tcp", effect: "deny", ports: [22] }] };
    const d = guardInboundRequest({ port: 22 }, policy);
    assert.equal(d.allowed, false);
    assert.equal(d.code, "Galerina_NETWORK_INBOUND_DENIED");
  });

  it("fall through to defaultEffect: allow only when the operator chose it", () => {
    assert.equal(guardInboundRequest({ port: 53 }, { ...allowUdp53, defaultEffect: "allow" }).allowed, true);
  });

  it("control: a request that states the matching protocol is admitted", () => {
    assert.equal(guardInboundRequest({ port: 53, protocol: "udp" }, allowUdp53).allowed, true);
    assert.equal(guardInboundRequest({ port: 53, protocol: "tcp" }, allowUdp53).allowed, false);
  });
});
