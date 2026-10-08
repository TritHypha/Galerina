# @galerina/docs — TODO

Current sequencing: [pre-.fungi work register](../../docs/PRE-FUNGI-WORK-REGISTER-2026-09-22.md),
W06/W08/W13. Keep compiler-owned schema decisions, auth/kernel mappings and
optional YAML output separate; this documentation refresh closes no feature.

## Graph integration follow-up — 2026-09-22

- [x] Admitted `node:util/types` on the boundary because `src/openapi.ts` already
      loads it. Live `--check` PASS. Exact-specifier hostility retained.

## Review follow-up — 2026-09-22

- [x] C17 producer defect (RD-1287) repaired by the concurrent session:
      __proto__ own fields/types survive export and serialization; the docs
      consumer explicitly refuses these reserved names. Independent original
      probes and the expanded 12 nested-contract tests pass. See
      ../../docs/reports/rd1295-c17-review-2026-09-22.md.

## Done (v0.1)
- [x] OpenAPI 3.x document model (`src/types.ts`)
- [x] `generateOpenApi` / `exportOpenApi` from `EffectiveRoutePolicy[]` or `RouteDeclaration[]`
- [x] Policy → operation mapping (auth, body, idempotency, limits → security + error contract)
- [x] `:param` → `{param}` path-parameter extraction
- [x] Component schemas for referenced request/response types + shared `Error` schema,
      now requiring a versioned source-backed `contractSchemas` export and refusing
      missing, empty, non-finite, or component-name-colliding definitions.
- [x] Fail-closed structural self-validation (`src/validate.ts`, `OpenApiGenerationError`)
- [x] Tests (generation, security mapping, validation, fail-closed)

## Source reconciliation — 2026-09-21

- [x] C17 / `RD-1287`: compiler `exportContractSchemasFromSource` feeds
      `contractSchemas`. Integration fixture
      `tests/compiler-contract-export.test.mjs`.
- [x] Nested records and arrays: `src/openapi.ts` `sourceBackedSchemas`,
      `cloneContractValue`, and `refSchema` translate compiler `#/types/` refs
      to local components and include only the reachable definition closure.
      Recursive type references are retained; cyclic JavaScript objects,
      missing/inherited/accessor definitions, proxies, malformed refs and
      component collisions (including the shared Error envelope) refuse.
      Bounds: 1,024 referenced schemas, depth 64, 65,536 cloned values.
      `tests/nested-contracts.test.mjs` **12** tests at pin `df7f2fb5`
      (the 2026-09-21 **10/10** figure is stale). Package **41/41** from
      2026-09-21 is stale: pin `validate.test.mjs` "not absolute" still
      sees a kernel `Error` (PR #134 wraps it as `OpenApiGenerationError`;
      not duplicated here).
- [!] HOLD: Option/Result and Decimal schema semantics still need the compiler
      contract export owner's admitted mapping and refusal fixtures. C17
      nested record/array support does not supply those mappings.
      Refusal fixtures landed 2026-10-06 (Grok Bot; zero-trust defaults, owner may
      revisit): `tests/contract-export-refusals.test.mjs` shows the compiler refuses
      Option/Result/Decimal fields (FUNGI-CONTRACT-SCHEMA-003, no export) and docs then
      refuses the route (no placeholder schema). The admitted mapping half stays HOLD.
- [!] Audited 2026-10-07 (SuperGrok, pin `df7f2fb5`): L33-L42 claims verified
      against `src/openapi.ts` (`refSchema` :141, `cloneContractValue` :162,
      `sourceBackedSchemas` :242, wired from `generateOpenApi` :513); counts
      corrected above. Added `tests/contract-clone-bounds.test.mjs` **6/6**
      (65,536 cloned-value budget and clone hostile arms). Full Docker package run
      (node:24, main `85b6875d`, #134 merged) **59/59** green. Stays [!]
      (zero-trust default; owner closes). L45 mapping stays HOLD.

## Later — remaining owner contracts and optional output

- [x] Kernel `AuthMode` is only `required` | `public` (`app-kernel/src/types.ts`).
      OpenAPI emits bearerAuth for required routes and empty security for public;
      scopes stay on `x-galerina-scopes`. OAuth2/OIDC flows are not kernel-owned.
- [!] HOLD OAuth2/OIDC scheme objects until the kernel admits a scheme other
      than bearer/public.
- [x] Optional YAML emitter: `exportOpenApiYaml` emits JSON-compatible YAML 1.2
      of the same `generateOpenApi` document. No second object model. Empty
      routes still refuse. Test in `tests/generate.test.mjs`.
- [!] HOLD CLI (`galerina docs openapi`): needs the compiler/build owner's
      versioned route-table artifact and source-identity binding. The current
      `GenerateOpenApiInput` in `src/types.ts` accepts in-memory routes/policies.
- [!] HOLD OpenAPI 3.1 webhook objects: needs the kernel/webhook owner's
      mapping of verified webhook routes, operation direction and security
      metadata into the exported route table. Do not infer it from HMAC success.
