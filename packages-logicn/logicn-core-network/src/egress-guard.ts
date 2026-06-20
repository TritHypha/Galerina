// egress-guard.ts — outbound SSRF / egress protection (runtime host classification + guard).
//
// The policy layer (index.ts) validates a DECLARED NetworkPolicy. This module is the RUNTIME
// counterpart: given an actual outbound target (a URL or a host), is it safe to dial? It is the
// defence against Server-Side Request Forgery (SSRF) — the attack where a user-supplied URL (a
// webhook, an image-fetch, a redirect target) is pointed at the deployment's own private network
// or the cloud metadata endpoint (169.254.169.254) to exfiltrate credentials.
//
// Design: deny-by-default, fail-closed. Anything that is not a provably-PUBLIC destination is denied
// unless the policy explicitly allow-lists it. Numeric-IP obfuscations that bypass naive string
// checks (decimal 2130706433, hex 0x7f000001, octal 0177.0.0.1, IPv4-mapped IPv6 ::ffff:127.0.0.1)
// are normalized before classification. No node:/DOM dependency — parsing uses the WHATWG URL global,
// declared minimally below.
//
// IMPORTANT (DNS rebinding): a HOSTNAME cannot be proven safe without resolution. classifyHost()
// flags hostnames with `requiresDnsRecheck` — the caller MUST re-run classifyHost() on EACH resolved
// IP address at connect time (and pin it), or a TOCTOU/rebinding attack defeats a name-only check.

/** Minimal structural type for the runtime URL parser (avoids a @types/node dependency). */
declare const URL: {
  new (input: string): {
    readonly protocol: string;
    readonly hostname: string;
    readonly port: string;
    readonly username: string;
    readonly password: string;
  };
};

export type HostCategory =
  | "loopback"      // 127.0.0.0/8, ::1, localhost
  | "private"       // 10/8, 172.16/12, 192.168/16, *.internal
  | "linkLocal"     // 169.254/16, fe80::/10, *.local (mDNS)
  | "uniqueLocal"   // fc00::/7 (IPv6 ULA)
  | "cgnat"         // 100.64/10 (carrier-grade NAT)
  | "metadata"      // 169.254.169.254 / fd00:ec2::254 / metadata.google.internal — the SSRF prize
  | "multicast"     // 224/4, ff00::/8
  | "unspecified"   // 0.0.0.0/8, ::
  | "reserved"      // 192.0.0/24, 240/4, TEST-NET, benchmarking, documentation
  | "broadcast"     // 255.255.255.255
  | "public"        // a globally-routable address — the only category dialled by default
  | "invalid";      // unparseable

export type HostKind = "ipv4" | "ipv6" | "hostname";

export interface HostClassification {
  readonly host: string;            // the input, trimmed/lowercased
  readonly category: HostCategory;
  readonly kind: HostKind;
  readonly isPublic: boolean;       // category === "public"
  /** true for hostnames: the caller MUST re-classify each resolved IP (DNS-rebinding defence). */
  readonly requiresDnsRecheck: boolean;
  readonly reason: string;
}

const cls = (host: string, category: HostCategory, kind: HostKind, reason: string, requiresDnsRecheck = false): HostClassification =>
  ({ host, category, kind, isPublic: category === "public", requiresDnsRecheck, reason });

// ── IPv4 parsing (handles the numeric SSRF bypasses) ─────────────────────────────────────────────
// Accepts: dotted (1–4 parts, each dec/hex/octal), and a single integer (dec/hex/octal) → 32-bit IP.
// Returns [a,b,c,d] octets or null. Mirrors inet_aton's permissive forms attackers exploit.
function parseOctet(part: string): number | null {
  let n: number;
  if (/^0x[0-9a-f]+$/i.test(part)) n = parseInt(part, 16);
  else if (/^0[0-7]+$/.test(part)) n = parseInt(part, 8);
  else if (/^(0|[1-9]\d*)$/.test(part)) n = parseInt(part, 10);
  else return null;
  return Number.isInteger(n) ? n : null;
}

function ipv4ToOctets(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  // Single integer form (e.g. 2130706433, 0x7f000001) → 32-bit big-endian.
  if (parts.length === 1) {
    const n = parseOctet(host);
    if (n === null || n < 0 || n > 0xffffffff) return null;
    return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  }
  if (parts.length < 2 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    const n = parseOctet(p);
    if (n === null) return null;
    nums.push(n);
  }
  // inet_aton: the LAST part absorbs the remaining low-order bytes (a.b.c.d / a.b.c / a.b / a).
  const last = nums[nums.length - 1]!;
  const lead = nums.slice(0, -1);
  for (const x of lead) if (x < 0 || x > 0xff) return null;
  const lastMax = 0xffffffff >>> (8 * lead.length);
  if (last < 0 || last > lastMax) return null;
  const octets = [...lead];
  // expand the final part across the remaining octets
  const remaining = 4 - lead.length;
  for (let i = remaining - 1; i >= 0; i--) octets.push((last >>> (8 * i)) & 0xff);
  return [octets[0]!, octets[1]!, octets[2]!, octets[3]!];
}

function classifyIpv4(host: string, oct: [number, number, number, number]): HostClassification {
  const [a, b, c, d] = oct;
  const dotted = `${a}.${b}.${c}.${d}`;
  const note = host === dotted ? "" : ` (normalized from "${host}")`;
  // metadata FIRST — the single most important SSRF target, inside link-local.
  if (a === 169 && b === 254 && c === 169 && d === 254) return cls(host, "metadata", "ipv4", `cloud metadata endpoint ${dotted}${note}`);
  if (a === 0) return cls(host, "unspecified", "ipv4", `unspecified ${dotted}${note}`);
  if (a === 127) return cls(host, "loopback", "ipv4", `loopback ${dotted}${note}`);
  if (a === 10) return cls(host, "private", "ipv4", `private 10/8 ${dotted}${note}`);
  if (a === 172 && b >= 16 && b <= 31) return cls(host, "private", "ipv4", `private 172.16/12 ${dotted}${note}`);
  if (a === 192 && b === 168) return cls(host, "private", "ipv4", `private 192.168/16 ${dotted}${note}`);
  if (a === 169 && b === 254) return cls(host, "linkLocal", "ipv4", `link-local 169.254/16 ${dotted}${note}`);
  if (a === 100 && b >= 64 && b <= 127) return cls(host, "cgnat", "ipv4", `CGNAT 100.64/10 ${dotted}${note}`);
  if (a === 192 && b === 0 && c === 0) return cls(host, "reserved", "ipv4", `IETF protocol 192.0.0/24 ${dotted}${note}`);
  if (a === 198 && (b === 18 || b === 19)) return cls(host, "reserved", "ipv4", `benchmarking 198.18/15 ${dotted}${note}`);
  if ((a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) return cls(host, "reserved", "ipv4", `documentation TEST-NET ${dotted}${note}`);
  if (a >= 224 && a <= 239) return cls(host, "multicast", "ipv4", `multicast 224/4 ${dotted}${note}`);
  if (a >= 240) return cls(host, a === 255 && b === 255 && c === 255 && d === 255 ? "broadcast" : "reserved", "ipv4", `reserved/broadcast ${dotted}${note}`);
  return cls(host, "public", "ipv4", `public ${dotted}${note}`);
}

// ── IPv6 ─────────────────────────────────────────────────────────────────────────────────────────
function classifyIpv6(host: string): HostClassification {
  let h = host.toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  // IPv4-mapped / -embedded (::ffff:127.0.0.1, ::127.0.0.1) — classify the embedded v4.
  const v4Tail = h.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (v4Tail && v4Tail[1]) {
    const oct = ipv4ToOctets(v4Tail[1]);
    if (oct) { const v4 = classifyIpv4(host, oct); return cls(host, v4.category, "ipv6", `IPv4-in-IPv6 → ${v4.reason}`); }
  }
  const groups = h.split(":");
  if (h === "::" || (h.includes(":") && groups.every((g) => g === "" || /^0+$/.test(g)))) return cls(host, "unspecified", "ipv6", "unspecified ::");
  if (h === "::1" || (groups.every((g, i) => g === "" || (i === groups.length - 1 ? g === "1" : /^0+$/.test(g))) && groups[groups.length - 1] === "1")) return cls(host, "loopback", "ipv6", "loopback ::1");
  if (h === "fd00:ec2::254") return cls(host, "metadata", "ipv6", "AWS IPv6 metadata fd00:ec2::254");
  const first = h.split(":")[0] ?? "";
  const hextet = parseInt(first || "0", 16);
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return cls(host, "linkLocal", "ipv6", "link-local fe80::/10");
  if (!Number.isNaN(hextet) && hextet >= 0xfc00 && hextet <= 0xfdff) return cls(host, "uniqueLocal", "ipv6", "unique-local fc00::/7");
  if (h.startsWith("ff")) return cls(host, "multicast", "ipv6", "multicast ff00::/8");
  if (h.startsWith("2001:db8")) return cls(host, "reserved", "ipv6", "documentation 2001:db8::/32");
  return cls(host, "public", "ipv6", `public ${h}`);
}

// ── hostnames ──────────────────────────────────────────────────────────────────────────────────
const METADATA_NAMES = new Set(["metadata", "metadata.google.internal", "instance-data", "metadata.goog"]);

function classifyHostname(host: string): HostClassification {
  const h = host.replace(/\.$/, ""); // drop a trailing root dot
  if (h === "localhost" || h.endsWith(".localhost")) return cls(host, "loopback", "hostname", "localhost");
  if (METADATA_NAMES.has(h)) return cls(host, "metadata", "hostname", "cloud metadata hostname");
  if (h.endsWith(".local")) return cls(host, "linkLocal", "hostname", "mDNS .local", true);
  if (h.endsWith(".internal") || h.endsWith(".intranet") || h.endsWith(".corp") || h.endsWith(".home.arpa")) return cls(host, "private", "hostname", "internal TLD", true);
  if (!h.includes(".")) return cls(host, "private", "hostname", "bare hostname (no dot) — likely internal", true);
  // A dotted FQDN: cannot be proven safe without DNS. Tentatively public, but flag the recheck.
  return cls(host, "public", "hostname", "FQDN — re-classify each resolved IP (DNS-rebinding defence)", true);
}

/** Classify a host string (IPv4 incl. numeric bypasses / IPv6 / hostname) into an egress category. */
export function classifyHost(rawHost: string): HostClassification {
  const host = rawHost.trim().toLowerCase();
  if (host.length === 0) return cls(rawHost, "invalid", "hostname", "empty host");
  // A host (no port — the URL parser strips it) containing ':' or brackets is IPv6.
  if (host.startsWith("[") || host.includes(":")) return classifyIpv6(host);
  // IPv4 (dotted or numeric)
  if (/^[0-9a-fx.]+$/i.test(host)) {
    const oct = ipv4ToOctets(host);
    if (oct) return classifyIpv4(host, oct);
  }
  // hostname
  if (/^[a-z0-9._-]+$/.test(host)) return classifyHostname(host);
  return cls(rawHost, "invalid", "hostname", "host contains illegal characters");
}

// ── the egress policy + guard ────────────────────────────────────────────────────────────────────
export interface EgressPolicy {
  /** Allow dialling private/loopback/linkLocal/etc. Default false (deny-by-default). */
  readonly allowNonPublicHosts?: boolean;
  /** Allow the cloud metadata endpoint. Default false — and you almost never want this true. */
  readonly allowMetadataEndpoint?: boolean;
  /** Exact host allow-list (case-insensitive). An allow-listed host is permitted regardless of category. */
  readonly allowedHosts?: readonly string[];
  /** Permitted URL schemes. Default ["https"]. */
  readonly allowedSchemes?: readonly string[];
  /** Permit credentials (userinfo) in the URL. Default false — userinfo enables parser-confusion SSRF. */
  readonly allowUrlCredentials?: boolean;
}

export interface EgressDecision {
  readonly allowed: boolean;
  readonly code: string;
  readonly category: HostCategory;
  readonly host: string;
  readonly reason: string;
  /** true ⇒ the caller MUST re-run guardOutboundHost on each resolved IP before connecting. */
  readonly requiresDnsRecheck: boolean;
}

const DENY_CATEGORIES: ReadonlySet<HostCategory> = new Set<HostCategory>([
  "loopback", "private", "linkLocal", "uniqueLocal", "cgnat", "multicast", "unspecified", "reserved", "broadcast", "invalid",
]);

/** Guard a resolved host (no scheme check). Fail-closed: only a public host (or allow-listed) passes. */
export function guardOutboundHost(rawHost: string, policy: EgressPolicy = {}): EgressDecision {
  const c = classifyHost(rawHost);
  const host = c.host;
  const allowList = new Set((policy.allowedHosts ?? []).map((h) => h.trim().toLowerCase()));
  if (allowList.has(host)) {
    return { allowed: true, code: "LogicN_NETWORK_EGRESS_ALLOWLISTED", category: c.category, host, reason: "host is explicitly allow-listed", requiresDnsRecheck: c.requiresDnsRecheck };
  }
  if (c.category === "metadata") {
    const allowed = policy.allowMetadataEndpoint === true;
    return { allowed, code: allowed ? "LogicN_NETWORK_EGRESS_METADATA_ALLOWED" : "LogicN_NETWORK_SSRF_METADATA_DENIED", category: c.category, host, reason: allowed ? "metadata endpoint explicitly allowed (dangerous)" : `SSRF: ${c.reason} denied`, requiresDnsRecheck: c.requiresDnsRecheck };
  }
  if (DENY_CATEGORIES.has(c.category)) {
    const allowed = policy.allowNonPublicHosts === true && c.category !== "invalid";
    return { allowed, code: allowed ? "LogicN_NETWORK_EGRESS_NONPUBLIC_ALLOWED" : "LogicN_NETWORK_SSRF_NONPUBLIC_DENIED", category: c.category, host, reason: allowed ? `non-public ${c.reason} explicitly allowed` : `SSRF: ${c.reason} denied (deny-by-default)`, requiresDnsRecheck: c.requiresDnsRecheck };
  }
  // public (or an FQDN tentatively public)
  return { allowed: true, code: "LogicN_NETWORK_EGRESS_ALLOWED", category: c.category, host, reason: c.reason, requiresDnsRecheck: c.requiresDnsRecheck };
}

/** Guard an outbound URL: scheme + credentials + host, fail-closed on any parse/category failure. */
export function guardOutboundUrl(url: string, policy: EgressPolicy = {}): EgressDecision {
  const schemes = new Set((policy.allowedSchemes ?? ["https"]).map((s) => s.toLowerCase().replace(/:$/, "")));
  let parsed: { protocol: string; hostname: string; username: string; password: string };
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, code: "LogicN_NETWORK_EGRESS_URL_INVALID", category: "invalid", host: "", reason: "URL could not be parsed (fail-closed)", requiresDnsRecheck: false };
  }
  const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
  if (!schemes.has(scheme)) {
    return { allowed: false, code: "LogicN_NETWORK_EGRESS_SCHEME_DENIED", category: "invalid", host: parsed.hostname, reason: `scheme "${scheme}" not in allow-list [${[...schemes].join(",")}]`, requiresDnsRecheck: false };
  }
  if ((parsed.username !== "" || parsed.password !== "") && policy.allowUrlCredentials !== true) {
    return { allowed: false, code: "LogicN_NETWORK_SSRF_URL_CREDENTIALS_DENIED", category: "invalid", host: parsed.hostname, reason: "URL carries embedded credentials (userinfo) — parser-confusion SSRF vector, denied", requiresDnsRecheck: false };
  }
  return guardOutboundHost(parsed.hostname, policy);
}

/** Validate a user-supplied WEBHOOK target — the prime SSRF vector. https + public-only, no overrides. */
export function validateWebhookTarget(url: string, policy: EgressPolicy = {}): EgressDecision {
  // Webhooks force the strict posture regardless of caller policy: https only, no metadata, no
  // non-public, no credentials. An allow-list is still honoured (a known internal webhook receiver).
  const strict: EgressPolicy = {
    allowedSchemes: ["https"],
    allowMetadataEndpoint: false,
    allowNonPublicHosts: false,
    allowUrlCredentials: false,
    ...(policy.allowedHosts !== undefined ? { allowedHosts: policy.allowedHosts } : {}),
  };
  return guardOutboundUrl(url, strict);
}

/**
 * Connect-time DNS-rebinding defence. A hostname guard alone is TOCTOU-vulnerable: a name that
 * looked public at check time can resolve to a private IP at connect time (DNS rebinding), or
 * resolve to a MIX of public + private addresses. Re-classify EVERY resolved address and deny if
 * ANY is non-public — unless the host is explicitly allow-listed (a trusted internal receiver) or
 * the policy opts into non-public hosts. The caller passes the addresses its resolver returned and
 * MUST connect ONLY to a verified address (pin it; do not re-resolve). Fail-closed: no addresses
 * resolved ⇒ deny.
 */
export function guardResolvedAddresses(host: string, resolvedIps: readonly string[], policy: EgressPolicy = {}): EgressDecision {
  const h = host.trim().toLowerCase();
  if (resolvedIps.length === 0) {
    return { allowed: false, code: "LogicN_NETWORK_SSRF_NO_RESOLUTION", category: "invalid", host: h, reason: "no resolved addresses (fail-closed)", requiresDnsRecheck: false };
  }
  // An explicitly allow-listed host is trusted to reach its addresses (e.g. a known internal receiver).
  const allowList = new Set((policy.allowedHosts ?? []).map((x) => x.trim().toLowerCase()));
  if (allowList.has(h)) {
    return { allowed: true, code: "LogicN_NETWORK_EGRESS_ALLOWLISTED", category: "public", host: h, reason: "host is explicitly allow-listed", requiresDnsRecheck: false };
  }
  // Re-classify EVERY resolved address; deny on the FIRST non-public one (mixed resolution is an attack).
  for (const ip of resolvedIps) {
    const d = guardOutboundHost(ip, policy);
    if (!d.allowed) {
      return { allowed: false, code: "LogicN_NETWORK_SSRF_DNS_REBIND_DENIED", category: d.category, host: h, reason: `DNS-rebinding guard: resolved address ${ip} → ${d.reason}`, requiresDnsRecheck: false };
    }
  }
  return { allowed: true, code: "LogicN_NETWORK_EGRESS_ALLOWED", category: "public", host: h, reason: `all ${resolvedIps.length} resolved address(es) are public`, requiresDnsRecheck: false };
}
