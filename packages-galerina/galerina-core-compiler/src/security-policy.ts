// =============================================================================
// Galerina — Security Policy Constants and Anti-Abuse Architecture
//
// Implements the anti-abuse protections from:
//   docs/Knowledge-Bases/galerina-security-anti-abuse.md
//
// Key protections:
//   process.spawn as a declared effect (ungoverned background workers → blocked)
//   network destination policy (allowlist + deny private_ranges)
//   SPORE-NET-001/002 (destination denied, SSRF/private-range access)
//
// Phase 25D: constants and types.
// Phase 26: wiring enforcement into capability host + interpreter.
// =============================================================================

// ---------------------------------------------------------------------------
// New effect names for anti-abuse
// ---------------------------------------------------------------------------

/**
 * Effects that must be explicitly declared to prevent covert abuse.
 *
 * process.spawn — any background worker, cron task, child process, or worker thread.
 *   Without this effect declared, the compiler blocks spawn attempts.
 *   This prevents covert background execution that bypasses governance.
 *
 * network.destination — used with contract.network { allow host ... deny wildcard ... }
 *   Signals that this flow enforces destination-level network policy.
 *   Without network.destination declared, only allow/deny at outbound level.
 */
export const ANTI_ABUSE_EFFECTS = {
  ProcessSpawn:       "process.spawn",
  NetworkDestination: "network.destination",
  EventSchedule:      "event.schedule",    // scheduled/cron-style background tasks
  WorkerSpawn:        "worker.spawn",       // WebWorker / thread pool spawn
} as const;

// ---------------------------------------------------------------------------
// RFC 1918 private ranges — deny these to prevent SSRF
//
// These ranges are denied when contract.network { deny private_ranges } is set.
// Applies to RESOLVED IP ADDRESS, not just the hostname string (DNS rebinding defence).
// ---------------------------------------------------------------------------

export const PRIVATE_IP_RANGES = [
  "10.0.0.0/8",       // RFC 1918 class A
  "172.16.0.0/12",    // RFC 1918 class B
  "192.168.0.0/16",   // RFC 1918 class C
  "127.0.0.0/8",      // Loopback
  "169.254.0.0/16",   // Link-local (APIPA)
  "::1/128",          // IPv6 loopback
  "fc00::/7",         // IPv6 unique local
] as const;

// ---------------------------------------------------------------------------
// SPORE-NET-001: Network destination not in declared allowlist
// ---------------------------------------------------------------------------

/**
 * SPORE-NET-001: A network call was made to a host not in the flow's declared
 * network allowlist (contract.network { allow host "..." }).
 *
 * Fired at compile time when the destination can be statically determined.
 * Fired at runtime (as a governance violation) when dynamic.
 */
export const SPORE_NET_001 = {
  code: "SPORE-NET-001",
  name: "NetworkDestinationDenied",
  severity: "error" as const,
  message: "Network call target is not in the flow's declared network allowlist.",
  why: "Unrestricted network.outbound allows any internet endpoint to be called, enabling data exfiltration, C2 communication, and fan-out DDoS. Explicit allowlists make abuse detectable and blockable.",
  suggestedFix: "Add the destination to the contract: contract { network { allow host \"api.example.com\" } }",
} as const;

// ---------------------------------------------------------------------------
// SPORE-NET-002: Network call resolved to a private/reserved IP range (SSRF)
// ---------------------------------------------------------------------------

/**
 * SPORE-NET-002: A network call resolved to a private or reserved IP address.
 *
 * This indicates a Server-Side Request Forgery (SSRF) attempt or misconfiguration.
 * The deny private_ranges rule applies to the RESOLVED IP, not just the hostname
 * (defence against DNS rebinding attacks).
 *
 * Fired at runtime by the capability host when IP resolution is checked.
 */
export const SPORE_NET_002 = {
  code: "SPORE-NET-002",
  name: "PrivateRangeAccess",
  severity: "error" as const,
  message: "Network call resolved to a private or reserved IP address. This is blocked to prevent SSRF attacks.",
  why: "DNS rebinding can make an allowed hostname resolve to an internal IP. Checking the resolved IP (not just the hostname) prevents attackers from using DNS manipulation to reach internal services.",
  suggestedFix: "Remove the deny private_ranges restriction if internal network access is intentionally required, or add explicit internal service capabilities.",
} as const;

// ---------------------------------------------------------------------------
// SPORE-RUNTIME-006: Rate limit exceeded at runtime
// ---------------------------------------------------------------------------

/**
 * SPORE-RUNTIME-006: A declared contract limit was exceeded during execution.
 *
 * Fired at runtime by the capability host / limit policy.
 * Phase 11C wiring: timeoutPolicy.ts, retryPolicy.ts, limitPolicy.ts are the
 * enforcement points. Phase 25D defines the diagnostic; Phase 26 wires it.
 *
 * Example triggers:
 *   - network_requests > declared limit
 *   - request_time > declared limit
 *   - memory > hard_limit
 *   - concurrent_tasks > declared limit
 */
export const SPORE_RUNTIME_006 = {
  code: "SPORE-RUNTIME-006",
  name: "RateLimitExceeded",
  severity: "error" as const,
  message: "A declared contract limit was exceeded. The flow has been aborted.",
  why: "Contract limits exist to prevent accidental and deliberate abuse. A flow that exceeds its declared limits is operating outside its governance contract.",
  suggestedFix: "Either increase the limit in the contract (if the limit is wrong) or fix the code to operate within bounds.",
} as const;

// ---------------------------------------------------------------------------
// NetworkDestinationPolicy — parsed from contract.network { }
//
// Populated by the contract parser from:
//   contract {
//     network {
//       allow host "api.stripe.com"
//       deny wildcard
//       deny private_ranges
//     }
//   }
// ---------------------------------------------------------------------------

export interface NetworkDestinationPolicy {
  /** Exact hostnames that are explicitly allowed. Empty = no allowlist (all blocked if deny wildcard). */
  readonly allowedHosts: readonly string[];
  /** Wildcard hostname patterns are denied. */
  readonly denyWildcard: boolean;
  /** RFC 1918 + loopback ranges denied (SSRF protection). */
  readonly denyPrivateRanges: boolean;
}

// ---------------------------------------------------------------------------
// SPORE-ANTI-ABUSE-001: Ungoverned background execution attempt
// ---------------------------------------------------------------------------

/**
 * SPORE-ANTI-ABUSE-001: A flow attempted to spawn a background process, worker,
 * or scheduled task without declaring the required effect.
 *
 * process.spawn, worker.spawn, and event.schedule must be declared in the
 * flow's contract. Without the declaration, the compiler blocks the attempt.
 * This prevents covert background execution that bypasses governance and audit.
 */
export const SPORE_ANTI_ABUSE_001 = {
  code: "SPORE-ANTI-ABUSE-001",
  name: "UngovernesBackgroundExecution",
  severity: "error" as const,
  message: "Background execution (process.spawn, worker.spawn, event.schedule) requires an explicit effect declaration. Undeclared background execution bypasses governance.",
  why: "Covert background workers can exfiltrate data, communicate with C2 servers, or spawn unbounded compute — all outside the governance contract. Requiring an explicit declaration makes spawn attempts detectable and blockable.",
  suggestedFix: "Declare the required effect in the contract: contract { effects { process.spawn } }",
} as const;

/**
 * Parse network destination policy from contract sub-block children.
 * Sub-block identifiers follow the pattern "decl:allow host api.stripe.com",
 * "decl:deny wildcard", "decl:deny private_ranges".
 */
export function parseNetworkDestinationPolicy(
  networkBlockChildren: readonly { value?: string }[],
): NetworkDestinationPolicy {
  const allowedHosts: string[] = [];
  let denyWildcard = false;
  let denyPrivateRanges = false;

  for (const child of networkBlockChildren) {
    const v = child.value ?? "";
    if (v.startsWith("decl:allow host ")) {
      allowedHosts.push(v.slice("decl:allow host ".length).trim());
    } else if (v === "decl:deny wildcard") {
      denyWildcard = true;
    } else if (v === "decl:deny private_ranges") {
      denyPrivateRanges = true;
    }
  }

  return { allowedHosts, denyWildcard, denyPrivateRanges };
}

/**
 * Checks whether a given hostname is permitted by the policy.
 * Returns true (allowed) or false (denied).
 */
export function isHostAllowed(hostname: string, policy: NetworkDestinationPolicy): boolean {
  // Explicit allowlist takes priority
  if (policy.allowedHosts.length > 0) {
    return policy.allowedHosts.includes(hostname);
  }
  // No allowlist + denyWildcard = deny all
  if (policy.denyWildcard) return false;
  // No policy constraints = allowed
  return true;
}
