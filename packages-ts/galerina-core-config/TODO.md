# Galerina Config TODO

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
[ ] Upgrade EnvironmentConfig to v0.2: add schemaVersion "galerina.config.environment.v1", policy field
[ ] Upgrade SecretEnvironmentReference: add id, source (SecretConfigSource), category, provider, requiredIn[], allowedSinks, deniedSinks, redaction
[x] Define SecretConfigSource discriminated union: env|vault|kms|runtime (2026-05-26)
[ ] Define SecretEnvironmentReference.redacted: true marker (never the raw value)
[ ] Define LoadEnvironmentConfigInput: mode, variableNames, secretNames, availableEnvironment, policy?
[ ] Implement loadEnvironmentConfig(input): Promise<{config, diagnostics}> with FUNGI-CONFIG-001, FUNGI-CONFIG-002
[x] Define EnvironmentConfigReport and SecretReportValue (source: kind only, not raw path/value) (2026-05-26)
[x] Implement ProductionStrictnessPolicy enforcement — validateProductionStrictness() + integration in createRuntimeConfigHandoff()
[x] Implement RuntimeConfigHandoff type — type defined (project/environment/productionPolicy/activeProductionPackageOverrides/diagnostics/canRun/generatedAt) + createRuntimeConfigHandoff() constructor
[x] Ensure no raw secret values can appear in any config diagnostic output — EnvironmentPolicy.secretReportMode is always false (2026-05-26)
[x] Implement host package manifest boundary diagnostic (FUNGI-CONFIG-010) — validateHostPackageManifestBoundary() rejects Galerina keys from package.json; diagnostic rename pass complete — all codes now use FUNGI-CONFIG-001…027 format with {code, name, message} metadata (2026-05-26)
[x] Define ConfigVaultEntry<T>, ConfigVaultSchema, ConfigVaultResult, getVaultEntry<T>() (2026-05-26)
[x] Define FUNGI-VAULT-001 through FUNGI-VAULT-005 diagnostic codes and constructors (2026-05-26)
[x] Define SecretCategory type (api-key|signing-key|password|token|certificate|database-credential|webhook-secret|oauth-secret|generic) (2026-05-26)
[x] Define SecretRedactionPolicy with DEFAULT_SECRET_REDACTION_POLICY (2026-05-26)
[ ] Create internal dir structure: environment/, secrets/, loaders/, types/
```

## v0.2 admission blocker (2026-09-20)

`[BLOCKED]` No remaining v0.2 item is currently source-defined enough to enter a
TDD red/green cycle. Refuse new tests and production code until the owner/KB
contract resolves all of the following exact conflicts:

- `EnvironmentConfig` is still the v0.1 shape at
  `packages-ts/galerina-core-config/src/index.ts:97-101` (symbol
  `EnvironmentConfig`), while the TODO requires schema version
  `galerina.config.environment.v1` at `TODO.md:23` and the README requires
  `galerina.config.environment.v2` plus `SecretEnvironmentReference[]` and
  `policy` at `README.md:209-218`.
- The README's `SecretConfigSource` contract at `README.md:221-243` requires
  `file`, `secretStore`, and `runtimeInjected` variants plus underscore category
  values, but the source-defined `SecretConfigSource` at
  `packages-ts/galerina-core-config/src/index.ts:1142-1148` is `env|vault|kms|runtime`
  and `SecretCategory` at `src/index.ts:1170-1179` uses a different hyphenated
  closed set. `SecretEnvironmentReference` has no source symbol to extend.
- The loader contract at `README.md:246-260` and TODO item `TODO.md:27-28`
  assign `FUNGI-CONFIG-001`/`FUNGI-CONFIG-002` to missing variables/secrets,
  while the existing `resolveEnvironmentMode` symbol at
  `packages-ts/galerina-core-config/src/index.ts:218-255` already owns those
  codes for invalid/missing environment mode diagnostics.

Refusal condition: do not add a red test, implementation, or internal directory
split for TODO items 23-28 until an owner/KB decision publishes one schema
version, one secret-reference/source/category contract, and non-overlapping
diagnostic-code ownership. Evidence: `npm run typecheck` passed and the package
`npm test` command passed 54/54 tests on 2026-09-20; those tests cover the live
v0.1/config-vault surface only and do not authorize either conflicting v0.2
contract.
