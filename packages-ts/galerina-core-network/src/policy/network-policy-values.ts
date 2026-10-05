// Declarative network policy values (moved out of index.ts in the 2026-10-05 dir split).
// Type-only imports: this module has no runtime dependency on index.ts, so there is no
// import cycle. Values are byte-for-byte the previous ones; productionNetworkPolicy stays frozen.

import type { AiProviderNetworkPolicy, NetworkPolicy, NetworkPrivacyPolicy, RateLimitRule, TlsPolicy } from "../index.js";

/**
 * Documented OpenAI provider policy. This is a declarative policy value only;
 * it does not perform network access, resolve credentials, or grant authority.
 */
export const OPENAI_POLICY: AiProviderNetworkPolicy = Object.freeze({
  provider: "openai",
  allowedEndpoints: Object.freeze(["api.openai.com"]),
  requireApiKeyCapability: "OpenAiApiKey",
  dataCategories: Object.freeze([] as string[]),
  auditRequired: true,
  allowSecretsInPrompt: false,
  allowPii: false,
  allowedRegions: Object.freeze(["eu-west"]),
  maxPromptBytes: 1024 * 1024,
  requireRedaction: true,
});

export const DEFAULT_TLS_POLICY: TlsPolicy = {
  requireTls: true,
  minVersion: "TLS1.3",
  verifyCertificates: true,
  verifyHostnames: true,
  denySelfSignedInProduction: true,
  allowPlaintextFallback: false,
  allowDowngrade: false,
};

export const DEFAULT_NETWORK_PRIVACY_POLICY: NetworkPrivacyPolicy = {
  minimiseMetadata: true,
  denyQueryStringSecrets: true,
  redactSensitiveHeaders: true,
  denySensitiveDataInUrls: true,
};

const PRODUCTION_SSRF_DENY_HOSTS = Object.freeze([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.azure.internal",
]);

/**
 * Current-schema production posture. This is declarative policy only: callers
 * must still pass its egress member to the runtime guard and perform the
 * connect-time DNS recheck before dialing a hostname.
 */
export const productionNetworkPolicy: NetworkPolicy = Object.freeze({
  name: "production",
  defaultEffect: "deny",
  tls: Object.freeze({ ...DEFAULT_TLS_POLICY }),
  endpoints: Object.freeze([
    Object.freeze({
      direction: "outbound",
      protocol: "https",
      effect: "deny",
      hosts: PRODUCTION_SSRF_DENY_HOSTS,
      reason: "SSRF and metadata destinations are never admitted by production policy.",
    }),
  ]),
  rateLimits: Object.freeze([] as RateLimitRule[]),
  privacy: Object.freeze({ ...DEFAULT_NETWORK_PRIVACY_POLICY }),
  denyRawSockets: true,
  requireTimeouts: true,
  requireBackpressure: true,
  egress: Object.freeze({
    allowedSchemes: Object.freeze(["https"]),
    allowedPorts: Object.freeze([443]),
    allowNonPublicHosts: false,
    allowMetadataEndpoint: false,
    allowUrlCredentials: false,
    requireTls: true,
    allowLoopback: false,
  }),
});
