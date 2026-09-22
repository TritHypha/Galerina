# Galerina Config TODO

## Graph integration follow-up — 2026-09-22

- [x] Admitted `node:util/types` on the boundary because `src/index.ts` already
      loads it. Live `--check` PASS. Exact-specifier hostility retained.

```text
[x] Create /packages-ts/galerina-core-config
[x] Add README.md
[x] Add TODO.md
[x] Add package metadata
[x] Add initial typed exports
[x] Define project config shape
[x] Define environment mode loader
[x] Define production strictness policy
[x] Define production-disabled package defaults and explicit override contract
[x] Define config validation diagnostic format
[x] Define safe environment variable reference model
[x] Define runtime config handoff contract
[x] Add examples
[x] Add tests
[x] Define EnvironmentMode as closed type: "development" | "test" | "staging" | "production" — implemented as (typeof ENVIRONMENT_MODES)[number] from as-const tuple
[x] Implement EnvironmentMode unknown-mode diagnostic (FUNGI-CONFIG-001, FUNGI-CONFIG-002) — resolveEnvironmentMode() returns INVALID_ENVIRONMENT_MODE or MISSING_ENVIRONMENT_MODE
[x] Define ConfigValue discriminated union: string|number|boolean|url|duration|bytes|region|semver|currency|mime-type|array (2026-05-26)
[x] Define EnvironmentPolicy with secretReportMode: "redacted-only" (single-valued by type; no plaintext mode exists) (2026-05-26)
[x] Implement defaultEnvironmentPolicy(mode): EnvironmentPolicy per mode — development/test allow .env; staging/production forbid it (2026-05-26)
[x] Upgrade EnvironmentConfigV2: schemaVersion "galerina.config.environment.v2", policy field (`RD-1285`)
[x] Upgrade SecretEnvironmentReference: add id, source (SecretConfigSource), category, requiredIn[], allowedSinks, deniedSinks, redaction
[x] Define SecretConfigSource discriminated union: env|vault|kms|runtime (2026-05-26)
[x] Define SecretEnvironmentReference.redacted: true marker (never the raw value)
[x] Define LoadEnvironmentConfigInput: mode, variableNames, secretNames, availableEnvironment, policy?
[x] Implement loadEnvironmentConfig(input): Promise<{config, diagnostics}> with FUNGI-CONFIG-028/029 (001/002 remain mode-owned)
[x] Define EnvironmentConfigReport and SecretReportValue (source: kind only, not raw path/value) (2026-05-26)
[x] Implement ProductionStrictnessPolicy enforcement — validateProductionStrictness() + integration in createRuntimeConfigHandoff()
[x] Implement RuntimeConfigHandoff type — type defined (project/environment/productionPolicy/activeProductionPackageOverrides/diagnostics/canRun/generatedAt) + createRuntimeConfigHandoff() constructor
[x] Define the redacted-only config report contract; loadEnvironmentConfig redacts available environment values from diagnostic message/path/suggestedFix without removing errors or changing code/name/severity (verified 2026-09-21)
[x] Implement host package manifest boundary diagnostic (FUNGI-CONFIG-010) — validateHostPackageManifestBoundary() rejects Galerina keys from package.json; historical diagnostic rename pass covered FUNGI-CONFIG-001…027 with {code, name, message} metadata (2026-05-26); v2 loader/schema codes 028…030 are later additions
[x] Define ConfigVaultEntry<T>, ConfigVaultSchema, ConfigVaultResult, getVaultEntry<T>() (2026-05-26)
[x] Define FUNGI-VAULT-001 through FUNGI-VAULT-005 diagnostic codes and constructors (2026-05-26)
[x] Define SecretCategory type (api-key|signing-key|password|token|certificate|database-credential|webhook-secret|oauth-secret|generic) (2026-05-26)
[x] Define SecretRedactionPolicy with DEFAULT_SECRET_REDACTION_POLICY (2026-05-26)
[ ] Create internal dir structure: environment/, secrets/, loaders/, types/ — DEFERRED by the RD-1285 v0.2 freeze; symbols remain intentionally in src/index.ts and no split receipt authorizes this work
```

## v0.2 freeze (2026-09-21) — `RD-1285`

- Schema: `galerina.config.environment.v2` as `EnvironmentConfigV2`.
- Handoff snapshot remains unversioned `EnvironmentConfig`.
- Secret sources: `env|vault|kms|runtime`. Categories hyphenated.
- Loader diagnostics: `FUNGI-CONFIG-028`/`029`. Mode diagnostics keep `001`/`002`.
- No internal directory split. `file`/`secretStore`/`runtimeInjected` and
  underscore categories are not admitted.

## Live reconciliation (2026-09-21)

- Implemented source locators are in `src/index.ts`: `resolveEnvironmentMode`,
  `createRuntimeConfigHandoff`, `validateHostPackageManifestBoundary`,
  `SecretConfigSource`, `SecretCategory`, `defaultEnvironmentPolicy`,
  `ConfigVaultEntry`, `EnvironmentConfigReport`, `EnvironmentConfigV2`,
  `LoadEnvironmentConfigInput`, and `loadEnvironmentConfig`.
- Loader hardening helpers are `readOwnEnvironmentString`,
  `collectAvailableEnvironmentStrings` and `redactConfigDiagnostic` in
  `src/index.ts`. They accept only own data string descriptors;
  `src/node-util-shim.d.ts` declares the `node:util/types` import used to
  refuse proxies before reflection, including revoked and
  trapping proxies. Redaction sanitizes messages, paths and suggested fixes
  without dropping diagnostics.
- The package-owned v2 hostile tests are
  `tests/environment-config-v2.test.mjs:16-228`. Fresh focused tests pass
  **11/11**; fresh full `npm.cmd test` passes **65/65**, including typecheck and
  build.
- The sole unchecked row is intentionally deferred by RD-1285, not an
  unexplained implementation blocker. The historical source layout remains
  preserved above for traceability.
- Independent audit remains pending. The source encoding check still flags
  pre-existing mojibake; this bounded repair does not rewrite those comments.
