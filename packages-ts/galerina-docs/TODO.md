# @galerina/docs — TODO

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

## Later
- [ ] Wire the compiler's real Galerina contract `types {}` export into the docs
      `contractSchemas` boundary. The docs package now refuses placeholders and
      proves the boundary with hostile/positive tests, but no compiler-to-docs
      export adapter is claimed here.
- [ ] OAuth2 / OpenID-Connect security schemes when the auth model grows beyond bearer + scopes.
- [ ] Optional YAML emitter (today the document is a plain JSON-serialisable object).
- [ ] CLI surface (`galerina docs openapi`) once the route table is exported from a build artifact.
- [ ] Webhook objects (OpenAPI 3.1 `webhooks`) for kernel webhook routes.
