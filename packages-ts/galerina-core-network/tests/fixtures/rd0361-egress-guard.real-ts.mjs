// rd0361-egress-guard.real-ts.mjs: RD-0361 S6b real-.ts adapters for the egress-guard frozen set. Drives
// the REAL classifyHost, guardOutboundHost, guardResolvedAddresses and guardOutboundUrl (package dist).
// Category codes are the twin's enum-as-Int table. NON_AUTHORIZING.
import { classifyHost, guardOutboundHost, guardOutboundUrl, guardResolvedAddresses } from "../../dist/index.js";

export const source = "packages-ts/galerina-core-network/src/egress-guard.ts";
const CODE = {
  metadata: 0, loopback: 1, private: 2, linkLocal: 3, uniqueLocal: 4, cgnat: 5,
  multicast: 6, unspecified: 7, reserved: 8, broadcast: 9, public: 10, invalid: 11,
};
// One real host per category code; each is re-classified before use (a mismatch is a realisation error).
const HOST_FOR = [
  "169.254.169.254", "127.0.0.1", "10.0.0.1", "169.254.1.1", "fc00::1", "100.64.0.1",
  "224.0.0.1", "0.0.0.0", "240.0.0.1", "255.255.255.255", "93.184.216.34", "bad host!",
];
const octet = (n) => Number.isInteger(n) && n >= 0 && n <= 255;
function hostFor(category) {
  const host = HOST_FOR[category];
  if (CODE[classifyHost(host).category] !== category) throw new Error(`realisation failed for category ${category}`);
  return host;
}
export const adapters = {
  classifyIpv4Category: {
    covers: (a, b, c, d) => octet(a) && octet(b) && octet(c) && octet(d),
    run: (a, b, c, d) => CODE[classifyHost(`${a}.${b}.${c}.${d}`).category],
  },
  egressVerdict: {
    covers: (category) => Number.isInteger(category) && category >= 0 && category <= 11,
    run: (category, np, md, lb, al) => {
      const host = hostFor(category);
      return guardOutboundHost(host, {
        allowNonPublicHosts: np, allowMetadataEndpoint: md, allowLoopback: lb, allowedHosts: al ? [host] : [],
      }).allowed ? 1 : -1;
    },
  },
  resolvedVerdict: {
    covers: (count) => Number.isInteger(count) && count >= 0 && count <= 64,
    run: (count, anyNonPublic, isAllowlisted) => {
      const host = "svc.example.com";
      const ips = Array.from({ length: count }, (_, i) => (anyNonPublic && i === count - 1 ? "10.0.0.1" : "93.184.216.34"));
      return guardResolvedAddresses(host, ips, { allowedHosts: isAllowlisted ? [host] : [] }).allowed ? 1 : -1;
    },
  },
  // hostVerdict is the real host decision, which is boolean: only -1 / +1 are realisable.
  urlVerdict: {
    covers: (sa, cb, hv) => hv === -1 || hv === 1,
    run: (sa, cb, hv, il, al, tls, po) => {
      const host = hv === -1 ? "10.0.0.1" : il ? "127.0.0.1" : "93.184.216.34";
      const scheme = sa ? (tls ? "https" : "http") : "ftp";
      const url = `${scheme}://${cb ? "u:p@" : ""}${host}${po ? "" : ":8443"}/x`;
      return guardOutboundUrl(url, {
        allowedSchemes: ["https", "http"], requireTls: true, allowedPorts: [443, 80],
        allowLoopback: hv === 1 && il, allowedHosts: hv === 1 && al ? [host] : [],
      }).allowed ? 1 : -1;
    },
  },
};
export const uncovered = {};
export const gaps = [
  "egressVerdict: category codes outside 0..11 have no real HostCategory",
  "resolvedVerdict: negative or very large resolved counts have no real resolution array",
  "urlVerdict: hostVerdict = 0 has no counterpart (the real host decision is boolean)",
];
