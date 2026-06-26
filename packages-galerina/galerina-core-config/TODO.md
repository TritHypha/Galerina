# Galerina Config TODO

```text
[x] Create /packages-galerina/galerina-core-config
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
[x] Implement EnvironmentMode unknown-mode diagnostic (SPORE-CONFIG-001, SPORE-CONFIG-002) — resolveEnvironmentMode() returns INVALID_ENVIRONMENT_MODE or MISSING_ENVIRONMENT_MODE
[x] Define ConfigValue discriminated union: string|number|boolean|url|duration|bytes|region|semver|currency|mime-type|array (2026-05-26)
[x] Define EnvironmentPolicy with allowSecretValuesInReports: false (always false — never expose secret values) (2026-05-26)
[x] Implement defaultEnvironmentPolicy(mode): EnvironmentPolicy per mode — development/test allow .env; staging/production forbid it (2026-05-26)
[ ] Upgrade EnvironmentConfig to v0.2: add schemaVersion "logicn.config.environment.v1", policy field
[ ] Upgrade SecretEnvironmentReference: add id, source (SecretConfigSource), category, provider, requiredIn[], allowedSinks, deniedSinks, redaction
[x] Define SecretConfigSource discriminated union: env|vault|kms|runtime (2026-05-26)
[ ] Define SecretEnvironmentReference.redacted: true marker (never the raw value)
[ ] Define LoadEnvironmentConfigInput: mode, variableNames, secretNames, availableEnvironment, policy?
[ ] Implement loadEnvironmentConfig(input): Promise<{config, diagnostics}> with SPORE-CONFIG-001, SPORE-CONFIG-002
[x] Define EnvironmentConfigReport and SecretReportValue (source: kind only, not raw path/value) (2026-05-26)
[x] Implement ProductionStrictnessPolicy enforcement — validateProductionStrictness() + integration in createRuntimeConfigHandoff()
[x] Implement RuntimeConfigHandoff type — type defined (project/environment/productionPolicy/activeProductionPackageOverrides/diagnostics/canRun/generatedAt) + createRuntimeConfigHandoff() constructor
[x] Ensure no raw secret values can appear in any config diagnostic output — EnvironmentPolicy.allowSecretValuesInReports is always false (2026-05-26)
[x] Implement host package manifest boundary diagnostic (SPORE-CONFIG-010) — validateHostPackageManifestBoundary() rejects Galerina keys from package.json; diagnostic rename pass complete — all codes now use SPORE-CONFIG-001…027 format with {code, name, message} metadata (2026-05-26)
[x] Define ConfigVaultEntry<T>, ConfigVaultSchema, ConfigVaultResult, getVaultEntry<T>() (2026-05-26)
[x] Define SPORE-VAULT-001 through SPORE-VAULT-005 diagnostic codes and constructors (2026-05-26)
[x] Define SecretCategory type (api-key|signing-key|password|token|certificate|database-credential|webhook-secret|oauth-secret|generic) (2026-05-26)
[x] Define SecretRedactionPolicy with DEFAULT_SECRET_REDACTION_POLICY (2026-05-26)
[ ] Create internal dir structure: environment/, secrets/, loaders/, types/
```
