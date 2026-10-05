// FUNGI-NETWORK-001..008 diagnostic codes (TODO pass, Grok 2026-10-05; README "Diagnostic Codes").

export const FUNGI_NETWORK_CODES = Object.freeze({
  /** Undeclared network destination (deny-by-default). */
  UNDECLARED_DESTINATION: "FUNGI-NETWORK-001",
  /** Capability missing for the network operation. */
  CAPABILITY_MISSING: "FUNGI-NETWORK-002",
  /** Insecure transport denied. */
  INSECURE_TRANSPORT: "FUNGI-NETWORK-003",
  /** Raw socket denied. */
  RAW_SOCKET_DENIED: "FUNGI-NETWORK-004",
  /** Destination not allowlisted (explicit deny rule, wildcard or SSRF target). */
  DESTINATION_NOT_ALLOWLISTED: "FUNGI-NETWORK-005",
  /** Secret flow to an unapproved destination (headers, query string or prompt). */
  SECRET_FLOW: "FUNGI-NETWORK-006",
  /** AI provider not approved, or the prompt breaks the provider policy. */
  AI_PROVIDER_NOT_APPROVED: "FUNGI-NETWORK-007",
  /** Runtime network policy unavailable, malformed request/response or governance metadata missing. */
  RUNTIME_POLICY_UNAVAILABLE: "FUNGI-NETWORK-008",
} as const);

export type FungiNetworkCode = (typeof FUNGI_NETWORK_CODES)[keyof typeof FUNGI_NETWORK_CODES];

export const FUNGI_NETWORK_CODE_LIST: readonly FungiNetworkCode[] = Object.freeze(Object.values(FUNGI_NETWORK_CODES));
