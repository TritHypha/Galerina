export type SecuritySeverity = "info" | "warning" | "error" | "critical";

export type SecretClassification =
  | "secret"
  | "token"
  | "cookie"
  | "private-key"
  | "credential"
  | "personal-data";

export type PermissionEffect = "allow" | "deny";

export type PermissionAction =
  | "read"
  | "write"
  | "execute"
  | "network"
  | "environment"
  | "native"
  | "unsafe"
  | "crypto";

export type CryptoAlgorithm =
  | "aes-256-gcm"
  | "chacha20-poly1305"
  | "argon2id"
  | "ed25519"
  | "x25519"
  | "sha-256"
  | "sha-512";

export type WeakCryptoAlgorithm =
  | "md5"
  | "sha-1"
  | "des"
  | "3des"
  | "rc4"
  | "rsa-pkcs1-v1_5";

export interface SecureStringReference {
  readonly kind: "SecureString";
  readonly label: string;
  readonly classification: SecretClassification;
  readonly redacted: true;
  readonly fingerprint?: string;
}

export interface SecurityDiagnostic {
  readonly code: string;
  readonly severity: SecuritySeverity;
  readonly safeMessage: string;
  readonly path?: string;
  readonly source?: string;
  readonly suggestedFix?: string;
  readonly redacted: true;
}

export interface RedactionRule {
  readonly name: string;
  readonly pattern: string;
  readonly flags?: string;
  readonly replacement: string;
  readonly classification: SecretClassification;
}

export interface RedactionMatch {
  readonly ruleName: string;
  readonly classification: SecretClassification;
  readonly count: number;
}

export type RedactionFailureMode = "fail-closed" | "skip" | "throw";

export interface RedactionOptions {
  readonly maxInputLength?: number;
  readonly onInvalidRule?: RedactionFailureMode;
}

export interface RedactionResult {
  readonly text: string;
  readonly matches: readonly RedactionMatch[];
  readonly redacted: boolean;
  readonly diagnostics?: readonly SecurityDiagnostic[];
}

export interface PermissionGrant {
  readonly action: PermissionAction;
  readonly resource: string;
  readonly effect: PermissionEffect;
  readonly reason?: string;
}

export interface PermissionModel {
  readonly grants: readonly PermissionGrant[];
  readonly defaultEffect: PermissionEffect;
}

export interface PermissionDecision {
  readonly action: PermissionAction;
  readonly resource: string;
  readonly allowed: boolean;
  readonly matchedGrant?: PermissionGrant;
  readonly reason: string;
}

export interface SafeTokenReference {
  readonly kind: "token";
  readonly name: string;
  readonly value: SecureStringReference;
  readonly scopes: readonly string[];
}

export interface SafeCookieReference {
  readonly kind: "cookie";
  readonly name: string;
  readonly value: SecureStringReference;
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: "strict" | "lax" | "none";
}

export interface SafeHeaderReference {
  readonly kind: "header";
  readonly name: string;
  readonly value: string | SecureStringReference;
  readonly sensitive: boolean;
}

export interface CryptographicPolicy {
  readonly allowedAlgorithms: readonly CryptoAlgorithm[];
  readonly deniedAlgorithms: readonly WeakCryptoAlgorithm[];
  readonly requireAuthenticatedEncryption: boolean;
  readonly requirePasswordHashingMemoryCost: boolean;
  readonly minimumKeyBits: number;
}

export interface SecurityReport {
  readonly generatedAt: string;
  readonly diagnostics: readonly SecurityDiagnostic[];
  readonly permissions: PermissionModel;
  readonly redactions: readonly RedactionRule[];
  readonly redactedSecrets: number;
  readonly blockedOperations: readonly string[];
  readonly warnings: readonly string[];
  readonly status: "ok" | "warning" | "error" | "critical";
}

export const DEFAULT_REDACTION_RULES: readonly RedactionRule[] = [
  {
    name: "bearer-token",
    pattern: "\\bBearer\\s+[A-Za-z0-9._~+\\-/]+=*",
    flags: "gi",
    replacement: "Bearer SecureString(redacted)",
    classification: "token",
  },
  {
    name: "api-key-assignment",
    pattern: "\\b(api[_-]?key|token|secret|password)\\s*[=:]\\s*[^\\s,;]+",
    flags: "gi",
    replacement: "$1=SecureString(redacted)",
    classification: "credential",
  },
  {
    name: "private-key-block",
    pattern:
      "-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\\s\\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    flags: "g",
    replacement: "SecureString(redacted-private-key)",
    classification: "private-key",
  },
];

export const DEFAULT_PERMISSION_MODEL: PermissionModel = {
  grants: [],
  defaultEffect: "deny",
};

export const DEFAULT_CRYPTOGRAPHIC_POLICY: CryptographicPolicy = {
  allowedAlgorithms: [
    "aes-256-gcm",
    "chacha20-poly1305",
    "argon2id",
    "ed25519",
    "x25519",
    "sha-256",
    "sha-512",
  ],
  deniedAlgorithms: ["md5", "sha-1", "des", "3des", "rc4", "rsa-pkcs1-v1_5"],
  requireAuthenticatedEncryption: true,
  requirePasswordHashingMemoryCost: true,
  minimumKeyBits: 128,
};

export function createSecureStringReference(
  label: string,
  options: {
    readonly classification?: SecretClassification;
    readonly fingerprint?: string;
  } = {},
): SecureStringReference {
  return {
    kind: "SecureString",
    label,
    classification: options.classification ?? "secret",
    redacted: true,
    ...(options.fingerprint === undefined
      ? {}
      : { fingerprint: options.fingerprint }),
  };
}

export function createSecurityDiagnostic(
  code: string,
  severity: SecuritySeverity,
  safeMessage: string,
  options: {
    readonly path?: string;
    readonly source?: string;
    readonly suggestedFix?: string;
  } = {},
): SecurityDiagnostic {
  return {
    code,
    severity,
    safeMessage,
    ...(options.path === undefined ? {} : { path: options.path }),
    ...(options.source === undefined ? {} : { source: options.source }),
    ...(options.suggestedFix === undefined
      ? {}
      : { suggestedFix: options.suggestedFix }),
    redacted: true,
  };
}

export function redactText(
  input: string,
  rules: readonly RedactionRule[] = DEFAULT_REDACTION_RULES,
  options: RedactionOptions = {},
): RedactionResult {
  const maxInputLength = options.maxInputLength ?? 1024 * 1024;
  const onInvalidRule = options.onInvalidRule ?? "fail-closed";
  const diagnostics: SecurityDiagnostic[] = [];

  if (input.length > maxInputLength) {
    return {
      text: "SecureString(redacted-redaction-input-too-large)",
      matches: [
        {
          ruleName: "redaction-input-too-large",
          classification: "secret",
          count: 1,
        },
      ],
      redacted: true,
      diagnostics: [
        createSecurityDiagnostic(
          "Galerina_SECURITY_REDACTION_INPUT_TOO_LARGE",
          "error",
          "Redaction input exceeded the configured maximum length and was fully redacted.",
          { path: "redaction.input" },
        ),
      ],
    };
  }

  let text = input;
  const matches: RedactionMatch[] = [];

  for (const rule of rules) {
    const ruleDiagnostics = validateRedactionRule(rule);

    if (ruleDiagnostics.length > 0) {
      diagnostics.push(...ruleDiagnostics);

      if (
        ruleDiagnostics.some((diagnostic) => diagnostic.severity === "error")
      ) {
        if (onInvalidRule === "throw") {
          throw new Error("Invalid redaction rule.");
        }

        if (onInvalidRule === "fail-closed") {
          return {
            text: "SecureString(redacted-redaction-rule-error)",
            matches: [
              {
                ruleName: rule.name,
                classification: rule.classification,
                count: 1,
              },
            ],
            redacted: true,
            diagnostics,
          };
        }

        continue;
      }
    }

    const regex = compileRedactionRule(rule, onInvalidRule);

    if (regex === "fail-closed") {
      return {
        text: "SecureString(redacted-redaction-rule-error)",
        matches: [
          {
            ruleName: rule.name,
            classification: rule.classification,
            count: 1,
          },
        ],
        redacted: true,
        diagnostics,
      };
    }

    if (regex === undefined) {
      continue;
    }

    const found = text.match(regex);

    if (found === null || found.length === 0) {
      continue;
    }

    matches.push({
      ruleName: rule.name,
      classification: rule.classification,
      count: found.length,
    });
    text = text.replace(regex, rule.replacement);
  }

  return {
    text,
    matches,
    redacted: matches.length > 0,
    ...(diagnostics.length === 0 ? {} : { diagnostics }),
  };
}

export function definePermissionModel(
  grants: readonly PermissionGrant[] = [],
  defaultEffect: PermissionEffect = "deny",
): PermissionModel {
  return {
    grants,
    defaultEffect,
  };
}

export function decidePermission(
  model: PermissionModel,
  action: PermissionAction,
  resource: string,
): PermissionDecision {
  const matchingGrants = model.grants.filter(
    (item) =>
      item.action === action &&
      (item.resource === resource || item.resource === "*"),
  );
  const explicitDeny = matchingGrants.find(
    (item) => item.effect === "deny" && item.resource === resource,
  );
  const wildcardDeny = matchingGrants.find(
    (item) => item.effect === "deny" && item.resource === "*",
  );
  const explicitAllow = matchingGrants.find(
    (item) => item.effect === "allow" && item.resource === resource,
  );
  const wildcardAllow = matchingGrants.find(
    (item) => item.effect === "allow" && item.resource === "*",
  );
  const grant = explicitDeny ?? wildcardDeny ?? explicitAllow ?? wildcardAllow;

  if (grant !== undefined) {
    return {
      action,
      resource,
      allowed: grant.effect === "allow",
      matchedGrant: grant,
      reason: grant.reason ?? `Matched ${grant.effect} grant.`,
    };
  }

  return {
    action,
    resource,
    allowed: model.defaultEffect === "allow",
    reason: `No matching grant; default ${model.defaultEffect}.`,
  };
}

export function validatePermissionModel(
  model: PermissionModel,
): readonly SecurityDiagnostic[] {
  const diagnostics: SecurityDiagnostic[] = [];

  if (model.defaultEffect === "allow") {
    diagnostics.push(
      createSecurityDiagnostic(
        "Galerina_SECURITY_PERMISSION_DEFAULT_ALLOW",
        "critical",
        "Permission models must deny by default unless a higher layer has explicitly justified a permissive compatibility mode.",
        { path: "permissions.defaultEffect" },
      ),
    );
  }

  const seenGrants = new Set<string>();

  model.grants.forEach((grant, index) => {
    const grantKey = `${grant.action}:${grant.resource}:${grant.effect}`;

    if (seenGrants.has(grantKey)) {
      diagnostics.push(
        createSecurityDiagnostic(
          "Galerina_SECURITY_PERMISSION_DUPLICATE_GRANT",
          "warning",
          "Permission model contains a duplicate grant.",
          { path: `permissions.grants.${index}` },
        ),
      );
    }

    seenGrants.add(grantKey);

    if (grant.resource.trim() === "") {
      diagnostics.push(
        createSecurityDiagnostic(
          "Galerina_SECURITY_PERMISSION_EMPTY_RESOURCE",
          "error",
          "Permission grants must declare a non-empty resource.",
          { path: `permissions.grants.${index}.resource` },
        ),
      );
    }

    if (grant.effect === "allow" && grant.resource === "*") {
      diagnostics.push(
        createSecurityDiagnostic(
          "Galerina_SECURITY_PERMISSION_WILDCARD_ALLOW",
          isHighRiskPermissionAction(grant.action) ? "critical" : "warning",
          "Wildcard allow grants are risky and should be replaced with explicit resources.",
          { path: `permissions.grants.${index}.resource` },
        ),
      );
    }
  });

  return diagnostics;
}

export function createSafeTokenReference(
  name: string,
  scopes: readonly string[] = [],
): SafeTokenReference {
  return {
    kind: "token",
    name,
    value: createSecureStringReference(name, { classification: "token" }),
    scopes,
  };
}

export function createSafeCookieReference(
  name: string,
  options: {
    readonly httpOnly?: boolean;
    readonly secure?: boolean;
    readonly sameSite?: SafeCookieReference["sameSite"];
  } = {},
): SafeCookieReference {
  return {
    kind: "cookie",
    name,
    value: createSecureStringReference(name, { classification: "cookie" }),
    httpOnly: options.httpOnly ?? true,
    secure: options.secure ?? true,
    sameSite: options.sameSite ?? "lax",
  };
}

export function createSafeHeaderReference(
  name: string,
  value: string | SecureStringReference,
  sensitive = isSensitiveHeaderName(name),
): SafeHeaderReference {
  return {
    kind: "header",
    name,
    value: sensitive && typeof value === "string"
      ? createSecureStringReference(name, { classification: "token" })
      : value,
    sensitive,
  };
}

export function validateCryptographicPolicy(
  policy: CryptographicPolicy = DEFAULT_CRYPTOGRAPHIC_POLICY,
): readonly SecurityDiagnostic[] {
  const diagnostics: SecurityDiagnostic[] = [];

  if (policy.minimumKeyBits < 128) {
    diagnostics.push(
      createSecurityDiagnostic(
        "Galerina_SECURITY_CRYPTO_KEY_TOO_SMALL",
        "error",
        "Cryptographic policy requires at least 128-bit keys.",
        { path: "crypto.minimumKeyBits" },
      ),
    );
  }

  for (const algorithm of policy.deniedAlgorithms) {
    if (isAllowedWeakAlgorithm(policy, algorithm)) {
      diagnostics.push(
        createSecurityDiagnostic(
          "Galerina_SECURITY_WEAK_CRYPTO_ALLOWED",
          "error",
          `Weak cryptographic algorithm "${algorithm}" must not be allowed.`,
          { path: "crypto.allowedAlgorithms" },
        ),
      );
    }
  }

  if (!policy.requireAuthenticatedEncryption) {
    diagnostics.push(
      createSecurityDiagnostic(
        "Galerina_SECURITY_AUTHENTICATED_ENCRYPTION_REQUIRED",
        "warning",
        "Authenticated encryption should be required for encryption policies.",
        { path: "crypto.requireAuthenticatedEncryption" },
      ),
    );
  }

  return diagnostics;
}

export function validateRedactionRule(
  rule: RedactionRule,
): readonly SecurityDiagnostic[] {
  const diagnostics: SecurityDiagnostic[] = [];

  if (rule.name.trim() === "") {
    diagnostics.push(
      createSecurityDiagnostic(
        "Galerina_SECURITY_REDACTION_RULE_NAME_EMPTY",
        "error",
        "Redaction rules must have a non-empty name.",
        { path: "redaction.rule.name" },
      ),
    );
  }

  if (/\$(?:&|`|')/.test(rule.replacement)) {
    diagnostics.push(
      createSecurityDiagnostic(
        "Galerina_SECURITY_REDACTION_REPLACEMENT_CAN_LEAK_CONTEXT",
        "error",
        "Redaction replacements must not use full-match, prefix or suffix replacement tokens.",
        { path: `redaction.rules.${rule.name}.replacement` },
      ),
    );
  }

  try {
    new RegExp(rule.pattern, normalizeRegexFlags(rule.flags));
  } catch {
    diagnostics.push(
      createSecurityDiagnostic(
        "Galerina_SECURITY_REDACTION_RULE_INVALID",
        "error",
        "Redaction rule pattern or flags are invalid.",
        { path: `redaction.rules.${rule.name}` },
      ),
    );
  }

  return diagnostics;
}

export function createSecurityReport(input: {
  readonly diagnostics?: readonly SecurityDiagnostic[];
  readonly permissions?: PermissionModel;
  readonly redactions?: readonly RedactionRule[];
  readonly redactedSecrets?: number;
  readonly blockedOperations?: readonly string[];
  readonly generatedAt?: string;
} = {}): SecurityReport {
  const diagnostics = input.diagnostics ?? [];

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    diagnostics,
    permissions: input.permissions ?? DEFAULT_PERMISSION_MODEL,
    redactions: input.redactions ?? DEFAULT_REDACTION_RULES,
    redactedSecrets: input.redactedSecrets ?? 0,
    blockedOperations: input.blockedOperations ?? [],
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.safeMessage),
    status: selectSecurityStatus(diagnostics),
  };
}

function isSensitiveHeaderName(name: string): boolean {
  return ["authorization", "cookie", "set-cookie", "x-api-key"].includes(
    name.toLowerCase(),
  );
}

function isAllowedWeakAlgorithm(
  policy: CryptographicPolicy,
  algorithm: WeakCryptoAlgorithm,
): boolean {
  return (policy.allowedAlgorithms as readonly string[]).includes(algorithm);
}

function compileRedactionRule(
  rule: RedactionRule,
  onInvalidRule: RedactionFailureMode,
): RegExp | "fail-closed" | undefined {
  try {
    return new RegExp(rule.pattern, normalizeRegexFlags(rule.flags));
  } catch (error) {
    if (onInvalidRule === "throw") {
      throw error;
    }

    return onInvalidRule === "fail-closed" ? "fail-closed" : undefined;
  }
}

function normalizeRegexFlags(flags: string | undefined): string {
  const normalized = new Set((flags ?? "g").split(""));
  normalized.add("g");
  return [...normalized].join("");
}

function isHighRiskPermissionAction(action: PermissionAction): boolean {
  return ["execute", "network", "environment", "native", "unsafe", "crypto"].includes(
    action,
  );
}

function selectSecurityStatus(
  diagnostics: readonly SecurityDiagnostic[],
): SecurityReport["status"] {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "critical")) {
    return "critical";
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "error";
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "warning";
  }

  return "ok";
}
