// NetworkPolicyReport v1 (TODO pass, Grok 2026-10-05). Schema id follows the TODO wording
// ("galerina.network.report.v1"); the README draft says "galerina.network.policy.report.v1".
// No clock is chosen here (generatedAt is passed in) and webhook secrets never enter the report.

import { validateDestination, validateTlsRequirement, type NetworkDestinationReference } from "../runtime/governed-network.js";
import type { NetworkDiagnostic, NetworkPolicy } from "../index.js";
import type { WebhookVerificationConfig } from "../webhook/webhook-verification.js";

export const NETWORK_POLICY_REPORT_SCHEMA = "galerina.network.report.v1";

export type ReportedWebhookPolicy = Omit<WebhookVerificationConfig, "secret">;

export interface NetworkPolicyReport {
  readonly schemaVersion: typeof NETWORK_POLICY_REPORT_SCHEMA;
  readonly generatedAt: string;
  readonly policy: NetworkPolicy;
  readonly validatedDestinations: readonly NetworkDestinationReference[];
  readonly deniedDestinations: readonly string[];
  readonly diagnostics: readonly NetworkDiagnostic[];
  readonly webhookPolicies: readonly ReportedWebhookPolicy[];
}

export function createNetworkPolicyReport(input: {
  readonly policy: NetworkPolicy;
  readonly generatedAt: string;
  readonly destinations: readonly NetworkDestinationReference[];
  readonly webhookPolicies?: readonly WebhookVerificationConfig[];
}): NetworkPolicyReport {
  const validated: NetworkDestinationReference[] = [];
  const denied: string[] = [];
  const diagnostics: NetworkDiagnostic[] = [];
  input.destinations.forEach((destination, index) => {
    const found = [...validateDestination(destination, input.policy), ...validateTlsRequirement(destination, input.policy)]
      .map((d) => Object.freeze({ ...d, path: `destinations.${index}.${d.path ?? ""}`.replace(/\.$/, "") }));
    if (found.length === 0) validated.push(destination);
    else {
      denied.push(typeof destination?.name === "string" && destination.name.length > 0 ? destination.name : `#${index}`);
      diagnostics.push(...found);
    }
  });
  const webhookPolicies = (input.webhookPolicies ?? []).map((w) => {
    const { secret: _secret, ...rest } = w;
    return Object.freeze(rest);
  });
  return Object.freeze({
    schemaVersion: NETWORK_POLICY_REPORT_SCHEMA,
    generatedAt: input.generatedAt,
    policy: input.policy,
    validatedDestinations: Object.freeze(validated),
    deniedDestinations: Object.freeze(denied),
    diagnostics: Object.freeze(diagnostics),
    webhookPolicies: Object.freeze(webhookPolicies),
  });
}
