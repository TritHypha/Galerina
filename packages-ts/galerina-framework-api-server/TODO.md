# Galerina API Server TODO

Current sequencing: [pre-.fungi work register](../../docs/PRE-FUNGI-WORK-REGISTER-2026-09-22.md),
W08/W09. The admitted HTTP adapter, historical manifest scaffold and deferred
durable replay adapter remain distinct; no new authority follows from prose.

## Current source-backed reconciliation (2026-09-21)

`[x]` means the current source and a focused test receipt support the claim.
`[HOLD]` means the old v0.2 design item has no current implementation authority;
it must not be closed by the existence of README prose. This package is a thin
Node HTTP adapter around the App Kernel. It does not own a manifest loader,
route table, runtime flow dispatcher, durable store, signing authority, or
OpenAPI generator.

### Current package and public seam

```text
[x] Package metadata and NodeNext strict TypeScript: package.json:1-32 and tsconfig.json:1-17.
[x] Public adapter exports: src/index.ts:47-71.
[x] `createApiServer(opts)` constructs an HTTP or HTTPS server and requires
    explicit plaintext authority when TLS is absent: src/index.ts:525-577.
[x] `listen(server, port, host)` restricts plaintext servers to loopback:
    src/index.ts:790-821.
[HOLD] The historical `cli` module, an exports map, and a `galerina-api-server`
    bin are not
    present and are outside the current adapter seam.
```

### Current kernel contracts

```text
[x] The adapter consumes `AppKernel.handle(req)` and the canonical
    `GalerinaKernelRequest`/`GalerinaKernelResponse` from
    ../galerina-framework-app-kernel/src/kernel.ts:45-75,303-304.
[x] `HttpMethod` is consumed from the kernel types, not redefined here:
    ../galerina-framework-app-kernel/src/types.ts:10.
[x] Body buffering, lowercase headers, URL/query normalization, request ID,
    and response writing are implemented by `bufferBody`, `lowercaseHeaders`,
    `parseUrl`, `normaliseMethod`, and `writeResponse`: src/index.ts:249-346.
[x] Kernel dispatch and fail-closed response handling are in `handleRequest`:
    src/index.ts:663-788. Route policy, decoding, and typed flow semantics
    remain App Kernel ownership.
```

### Current transport and identity gates

```text
[x] TLS certificate admission folds through the core-network cert gate;
    custom channel verdicts are an additional factor: src/index.ts:349-509.
[x] Principal evidence is snapshotted and rejects accessors, proxies, symbols,
    malformed scopes, duplicates, and invalid values: src/index.ts:583-660.
[x] Adapter body cap and explicit request/header/idle timeouts are wired:
    src/index.ts:74-79,249-296,570-577. Package tests: 14/14 in
    tests/api-server.test.mjs and 12/12 in tests/api-server-tls.test.mjs.
```

### Current webhook and replay boundary

```text
[x] Canonical core-network storage contracts are `ReplayStore.has/put` and
    `AtomicAdmissionStore.claim(scope, key, ttlSeconds)`, including the
    "claimed"/"duplicate" result: ../galerina-core-network/src/index.ts:102-130.
[x] `MemoryReplayStore` implements both contracts with validated clocks,
    TTLs, namespaced atomic claims, and pruning. It is process-local only and
    supplies no durability or cross-process authority: src/replay-store.ts:12-107.
[x] `admitWebhookReplay` verifies HMAC on raw bytes, then claims the fixed
    `replay` scope, then optionally invokes the decode hook: src/webhook-admission.ts:7-100.
    Invalid HMAC does not claim, decode, or dispatch.
[x] `createApiServer` invokes that gate before `kernel.handle` and maps HMAC,
    replay, and malformed-store refusals to 401, 409, and 500:
    src/index.ts:747-778.
[x] Hostile webhook and replay coverage: 5/5 tests in
    tests/replay-store.test.mjs and 4/4 tests in
    tests/webhook-admission.test.mjs. Package receipt: 35/35 tests, zero
    failures (`npm.cmd test`).
[HOLD] A durable, multi-process, crash-safe, or C16 production replay store
    is not implemented here. Do not add a durable store or treat `MemoryReplayStore`
    as production authority.
```

## Historical v0.2 architecture record (retained, non-authorizing)

The following checklist preserves the original v0.2 manifest-scaffold intent.
Those definitions remain design prose in `README.md`; they are not current
TypeScript implementation claims. The current implementation is the adapter
surface above.

```text
[x] Package boundary, transport -> kernel -> runtime position, and the
    proposed manifest/route policy vocabulary remain documented in README.md.
[HOLD] GalerinaApiManifest and GalerinaRouteManifest TypeScript interfaces.
[HOLD] The seven RoutePolicy kinds: auth, scope, body, effect, network,
       rateLimit, and idempotency.
[HOLD] BodyPolicy, RouteLimits, RouteReportPolicy, and
       WebhookVerificationConfig implementation.
[HOLD] A local GalerinaAppKernel/HandleApiRequestInput model; current code
       consumes AppKernel from framework-app-kernel.
[HOLD] A local manifestPath/port StartApiServerOptions model; current code
       exposes createApiServer and listen.
[HOLD] GalerinaHttpError and a standalone error-mapper module.
[HOLD] The proposed thirteen-module layout, including cli, load-manifest,
       route-table, read-body-with-limit, webhook, openapi, and safe-log.
[x] OpenAPI generation is owned by the docs package and consumes App Kernel
    route declarations or effective policies: ../galerina-docs/src/openapi.ts:2-9,330-398;
    `generateOpenApi` and its `exportOpenApi` alias are current there.
[HOLD] Adapter-local manifest-driven OpenAPI integration, examples, and a
       standalone route table with named :param matching.
```

## Historical v0.2 implementation scaffold - explicit HOLDs

These are the old unchecked implementation items, retained so their provenance
is visible. They are not a request to recreate the superseded architecture.

### Package setup and the historical types module

```text
[x] package.json, tsconfig.json, and src/index.ts exist in the current package.
[HOLD] Add the historical cli module, an exports map, and a bin entry.
[HOLD] Add the historical types module implementing the manifest, route-policy, local-kernel,
       and StartApiServerOptions models from the old v0.2 sketch.
```

### Historical load-manifest and route-table modules

```text
[HOLD] loadManifest, assertGalerinaApiManifest, schema validation, and startup
       rejection of an invalid manifest: no such current source seam exists.
[HOLD] buildRouteTable, compileRoute, :param matching, and standalone 404/405
       logic: the App Kernel owns route matching and the adapter forwards its
       normalized request.
[HOLD] route-table.test.ts: no standalone route-table module or receipt exists.
```

### Historical read-body-with-limit and error-mapper modules

```text
[x] The bounded behavior is implemented by `bufferBody` and `BodyCapExceeded`
    in src/index.ts:249-296; oversize input receives 413 and the socket is
    destroyed before kernel dispatch.
[HOLD] A separate read-body-with-limit module and GalerinaHttpError contract.
[x] Kernel responses and adapter failures are written by `writeResponse` and
    the fail-closed 500 paths in src/index.ts:229-247,333-346,675-728,761-786.
[HOLD] Development safeDetails, production publicMessageForStatus, and an
       independent error-mapper.test.ts receipt.
```

### Historical webhook module and current replay-store module

```text
[x] The bounded current equivalent is `admitWebhookReplay` in
    src/webhook-admission.ts:45-100: SHA-256 HMAC with timing-safe comparison,
    raw-body ordering, atomic claim, and fail-closed malformed-store handling.
[x] The current replay adapter is `MemoryReplayStore` in src/replay-store.ts:19-107.
[HOLD] Timestamp-window verification, provider-specific signature encodings,
       and the old has-then-put `assertWebhookNotReplayed` scaffold.
[HOLD] Reintroduce the historical webhook module or claim the old webhook-signature.test.ts
       contract without a current owner specification.
```

### Historical create-server and write-response modules, plus logging

```text
[x] Current request handling is `createApiServer` + `handleRequest` in
    src/index.ts:525-788; 10-step semantics that belong to the App Kernel are
    not duplicated in this transport adapter.
[x] Current listening helper is `listen` in src/index.ts:790-821.
[x] Current response writer is `writeResponse` in src/index.ts:333-346.
[HOLD] The old `startApiServer(options): Promise<void>` API, standalone
       writeJson, request-ID response-header policy, safe-log module, raw-body
       logging policy, and reports emission.
```

### OpenAPI, examples, and production startup policy

```text
[x] `generateOpenApi`/`exportOpenApi` and their source-backed route-policy
    tests belong to ../galerina-docs/src/openapi.ts (`generateOpenApi`,
    `exportOpenApi`, `sourceBackedSchemas`) and its docs package
    test suite; this package does not duplicate them.
[HOLD] Independent audit/receipt of any future adapter-to-docs integration is
       pending; this package's 35/35 tests do not close that boundary.
[HOLD] examples/basic-api and examples/webhook-api manifest/server trees.
[HOLD] Manifest-missing, handler-reference, per-route body-limit, and
       network-deny-by-default startup checks; these require the manifest and
       route authority that this package does not currently own.
```

## Remaining bounded work

```text
[HOLD] Replace process-local replay with a separately authorized durable,
       multi-process storage owner and receipt chain.
[HOLD] Reopen the v0.2 manifest scaffold only after an authoritative manifest,
       route, OpenAPI, and ownership contract is supplied.
[HOLD] Do not create or modify `.fungi` sources in this package as part of this
       reconciliation.
```
