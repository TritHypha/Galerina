import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CRYPTO_PROVIDER_SCHEMA,
  createSafeCookieReference,
  createSafeHeaderReference,
  createSafeTokenReference,
  createSecureStringReference,
  createSecurityDiagnostic,
  createSecurityReport,
  decidePermission,
  definePermissionModel,
  invokeCryptoProvider,
  redactText,
  validateCryptographicPolicy,
  validatePermissionModel,
  validateRedactionRule,
} from "../dist/index.js";

describe("galerina-core-security contracts", () => {
  it("creates SecureString references without exposing values", () => {
    const secret = createSecureStringReference("Galerina_APP_SECRET", {
      classification: "credential",
      fingerprint: "sha256:example",
    });

    assert.equal(secret.kind, "SecureString");
    assert.equal(secret.redacted, true);
    assert.equal(Object.hasOwn(secret, "value"), false);
  });

  it("redacts bearer tokens and credential assignments", () => {
    const result = redactText(
      "Authorization: Bearer abc.def.ghi api_key=super-secret",
    );

    assert.equal(result.redacted, true);
    assert.match(result.text, /Bearer SecureString\(redacted\)/);
    assert.match(result.text, /api_key=SecureString\(redacted\)/);
    assert.doesNotMatch(result.text, /super-secret/);
  });

  it("denies permissions by default and allows explicit grants", () => {
    const model = definePermissionModel([
      {
        action: "read",
        resource: "config:public",
        effect: "allow",
        reason: "Public config is safe to read.",
      },
    ]);

    assert.equal(
      decidePermission(model, "read", "config:public").allowed,
      true,
    );
    assert.equal(decidePermission(model, "write", "config:public").allowed, false);
  });

  it("gives deny grants precedence over broad allows", () => {
    const model = definePermissionModel([
      {
        action: "network",
        resource: "*",
        effect: "allow",
      },
      {
        action: "network",
        resource: "https://metadata.internal",
        effect: "deny",
        reason: "Metadata endpoints must not be reachable by default.",
      },
    ]);
    const diagnostics = validatePermissionModel(model);

    assert.equal(
      decidePermission(model, "network", "https://metadata.internal").allowed,
      false,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "Galerina_SECURITY_PERMISSION_WILDCARD_ALLOW",
      ),
      true,
    );
  });

  it("reports default-allow permission models as critical", () => {
    const diagnostics = validatePermissionModel(
      definePermissionModel([], "allow"),
    );

    assert.equal(diagnostics[0]?.severity, "critical");
    assert.equal(
      diagnostics[0]?.code,
      "Galerina_SECURITY_PERMISSION_DEFAULT_ALLOW",
    );
  });

  it("models tokens, cookies and sensitive headers as redacted references", () => {
    const token = createSafeTokenReference("SESSION_TOKEN", ["api"]);
    const cookie = createSafeCookieReference("Galerina_session", {
      sameSite: "strict",
    });
    const header = createSafeHeaderReference("Authorization", "Bearer secret");

    assert.equal(token.value.redacted, true);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, "strict");
    assert.equal(typeof header.value, "object");
  });

  it("validates cryptographic policies and security reports", () => {
    const diagnostics = validateCryptographicPolicy({
      allowedAlgorithms: ["aes-256-gcm"],
      deniedAlgorithms: ["md5"],
      requireAuthenticatedEncryption: false,
      requirePasswordHashingMemoryCost: true,
      minimumKeyBits: 64,
    });
    const report = createSecurityReport({
      diagnostics: [
        ...diagnostics,
        createSecurityDiagnostic(
          "Galerina_SECURITY_SECRET_REDACTED",
          "info",
          "Secret value was redacted.",
        ),
      ],
      redactedSecrets: 1,
      blockedOperations: ["secret.print"],
      generatedAt: "2026-05-08T00:00:00.000Z",
    });

    assert.equal(diagnostics[0]?.code, "Galerina_SECURITY_CRYPTO_KEY_TOO_SMALL");
    assert.equal(report.status, "error");
    assert.equal(report.redactedSecrets, 1);
    assert.equal(report.warnings.length, 1);
  });

  it("fails closed when a redaction rule is malformed", () => {
    const result = redactText("token=secret", [
      {
        name: "bad-rule",
        pattern: "[",
        replacement: "SecureString(redacted)",
        classification: "token",
      },
    ]);

    assert.equal(result.redacted, true);
    assert.equal(result.text, "SecureString(redacted-redaction-rule-error)");
    assert.equal(result.diagnostics?.[0]?.severity, "error");
  });

  it("rejects redaction replacements that can re-emit sensitive context", () => {
    const diagnostics = validateRedactionRule({
      name: "leaky-rule",
      pattern: "token=[^\\s]+",
      replacement: "$&",
      classification: "token",
    });

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code ===
          "Galerina_SECURITY_REDACTION_REPLACEMENT_CAN_LEAK_CONTEXT",
      ),
      true,
    );
  });

  it("decidePermission wildcard deny takes priority over explicit allow", () => {
    const model = definePermissionModel([
      { action: "read", resource: "*", effect: "deny" },
      { action: "read", resource: "config:public", effect: "allow" },
    ]);

    // Priority: explicitDeny > wildcardDeny > explicitAllow > wildcardAllow
    // wildcardDeny wins over explicitAllow — both resources are denied
    assert.equal(
      decidePermission(model, "read", "config:public").allowed,
      false,
    );
    assert.equal(
      decidePermission(model, "read", "config:private").allowed,
      false,
    );
  });

  it("validatePermissionModel detects duplicate grants", () => {
    const model = definePermissionModel([
      { action: "read", resource: "config:public", effect: "allow" },
      { action: "read", resource: "config:public", effect: "allow" },
    ]);
    const diagnostics = validatePermissionModel(model);

    assert.ok(
      diagnostics.some((d) => d.code === "Galerina_SECURITY_PERMISSION_DUPLICATE_GRANT"),
    );
  });

  it("validatePermissionModel rejects empty resource string", () => {
    const model = definePermissionModel([
      { action: "write", resource: "", effect: "allow" },
    ]);
    const diagnostics = validatePermissionModel(model);

    assert.ok(
      diagnostics.some((d) => d.code === "Galerina_SECURITY_PERMISSION_EMPTY_RESOURCE"),
    );
  });

  it("redactText preserves non-sensitive content unchanged", () => {
    const result = redactText("Hello, this is a normal message with no secrets.");

    assert.equal(result.redacted, false);
    assert.equal(result.text, "Hello, this is a normal message with no secrets.");
    assert.equal(result.diagnostics?.length ?? 0, 0);
  });

  it("createSecureStringReference includes fingerprint and classification", () => {
    const ref = createSecureStringReference("DB_PASSWORD", {
      classification: "credential",
      fingerprint: "sha256:abc123",
    });

    assert.equal(ref.kind, "SecureString");
    assert.equal(ref.label, "DB_PASSWORD");
    assert.equal(ref.classification, "credential");
    assert.equal(ref.fingerprint, "sha256:abc123");
    assert.equal(ref.redacted, true);
    assert.equal(Object.hasOwn(ref, "value"), false);
  });
});

describe("C19-C CryptoProvider — absent and throwing refuse closed", () => {
  const hashReq = {
    op: "password-hash",
    algorithm: "argon2id",
    plaintext: "secret",
  };

  it("refuses when no provider is injected", async () => {
    const result = await invokeCryptoProvider(undefined, hashReq);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FUNGI-CRYPTO-001");
  });

  it("refuses a provider with the wrong schema", async () => {
    const result = await invokeCryptoProvider(
      { schema: "not-a-provider", invoke: async () => ({ ok: true, kind: "hash", algorithm: "argon2id", hash: "$argon2id$x" }) },
      hashReq,
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FUNGI-CRYPTO-004");
  });

  it("refuses a throwing provider", async () => {
    const result = await invokeCryptoProvider(
      {
        schema: CRYPTO_PROVIDER_SCHEMA,
        invoke: async () => {
          throw new Error("native binding exploded");
        },
      },
      hashReq,
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FUNGI-CRYPTO-002");
  });

  it("refuses a malformed provider result", async () => {
    const result = await invokeCryptoProvider(
      {
        schema: CRYPTO_PROVIDER_SCHEMA,
        invoke: async () => ({ ok: true, kind: "hash", algorithm: "argon2id", hash: 1 }),
      },
      hashReq,
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FUNGI-CRYPTO-003");
  });

  it("accepts a closed fake hash result", async () => {
    const result = await invokeCryptoProvider(
      {
        schema: CRYPTO_PROVIDER_SCHEMA,
        invoke: async () => ({
          ok: true,
          kind: "hash",
          algorithm: "argon2id",
          hash: "$argon2id$v=19$m=16,t=2,p=1$fake",
        }),
      },
      hashReq,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.kind, "hash");
    assert.equal(result.hash.startsWith("$argon2"), true);
  });
});
