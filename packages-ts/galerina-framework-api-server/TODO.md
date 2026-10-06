# Galerina API Server TODO

Current sequencing: [pre-.fungi work register](../../docs/PRE-FUNGI-WORK-REGISTER-2026-09-22.md),
W08/W09. The admitted HTTP adapter, historical manifest scaffold and deferred
durable replay adapter remain distinct; no new authority follows from prose.

## HOLD reconciliation against current source (2026-10-06)

Every `[HOLD]` below was re-checked against source at `main` `df7f2fb51`
(line pointers in this file are at that commit). Markers:

- `[x]` the current source and a focused test receipt support the claim.
- `[SUPERSEDED]` the old item is replaced by named current code or a named
  owner outside this package; the reason and pointer are on the row. It is not
  a completion claim for the old design and does not reopen it.
- `[HOLD]` still open: either a genuine blocker (stated on the row) or a
  historical guard that explains why the old scaffold is not recreated.

Counts: before this pass **26** literal `[HOLD]` rows and 0 `[SUPERSEDED]`.
Rows that bundled separate concerns (webhook replay, OpenAPI duplication,
examples, logging, the old server-start API) were split, giving 34 rows:
after this pass **13** `[HOLD]` and **21** `[SUPERSEDED]`. Nothing was ticked
`[x]` by this pass. Docker receipt at `df7f2fb51` (node 20.20.2): package
tests **59/59** (`npm test`: api-server 15, api-server-tls 12,
q2-durable-replay-admission 13, replay-store 13, webhook-admission 6).

## Current source-backed reconciliation (2026-09-21, pointers refreshed 2026-10-06)

`[HOLD]` means the old v0.2 design item has no current implementation authority;
it must not be closed by the existence of README prose. This package is a thin
Node HTTP adapter around the App Kernel. It does not own a manifest loader,
route table, runtime flow dispatcher, durable store, signing authority, or
OpenAPI generator.

### Current package and public seam

```text
[x] Package metadata and NodeNext strict TypeScript: package.json:1-33 and tsconfig.json:1-17.
[x] Public adapter exports: src/index.ts:59-72.
[x] `createApiServer(opts)` constructs an HTTP or HTTPS server and requires
    explicit plaintext authority when TLS is absent: src/index.ts:551-621.
[x] Q2 `requireDurableReplay` refuses unless `isAdmittedDurableReplayStore`
    (empty admit-list). Hostile `q2-durable-replay-admission.test.mjs` **13/13**.
    No durable backend fabricated. RD-1286 remains deferred.
[x] `listen(server, port, host)` restricts plaintext servers to loopback:
    src/index.ts:856-884.
[SUPERSEDED] Duplicate of the historical cli / exports-map / bin row under
    "Package setup" below; tracked there once (still HOLD there).
```

### Current kernel contracts

```text
[x] The adapter consumes `AppKernel.handle(req)` and the canonical
    `GalerinaKernelRequest`/`GalerinaKernelResponse` from
    ../galerina-framework-app-kernel/src/kernel.ts:47-72,309-311.
[x] `HttpMethod` is consumed from the kernel types, not redefined here:
    ../galerina-framework-app-kernel/src/types.ts:10.
[x] Body buffering, lowercase headers, URL/query normalization, request ID,
    and response writing are implemented by `bufferBody`, `lowercaseHeaders`,
    `parseUrl`, `normaliseMethod`, and `writeResponse`: src/index.ts:261-374,795.
[x] Kernel dispatch and fail-closed response handling are in `handleRequest`:
    src/index.ts:707-854. Route policy, decoding, and typed flow semantics
    remain App Kernel ownership.
```

### Current transport and identity gates

```text
[x] TLS certificate admission folds through the core-network cert gate;
    custom channel verdicts are an additional factor: src/index.ts:376-549.
[x] Principal evidence is snapshotted and rejects accessors, proxies, symbols,
    malformed scopes, duplicates, and invalid values: src/index.ts:623-705.
[x] Adapter body cap and explicit request/header/idle timeouts are wired:
    src/index.ts:79-85,261-308,614-619. Package tests: 15/15 in
    tests/api-server.test.mjs and 12/12 in tests/api-server-tls.test.mjs.
```

### Current webhook and replay boundary

```text
[x] Canonical core-network storage contracts are `ReplayStore.has/put` and
    `AtomicAdmissionStore.claim(scope, key, ttlSeconds)`, including the
    "claimed"/"duplicate" result: ../galerina-core-network/src/index.ts:106-134.
[x] `MemoryReplayStore` implements both contracts with validated clocks,
    TTLs, namespaced atomic claims, and pruning. It is process-local only and
    supplies no durability or cross-process authority: src/replay-store.ts:29-163.
[x] `admitWebhookReplay` verifies HMAC on raw bytes, then claims the fixed
    `replay` scope, then optionally invokes the decode hook: src/webhook-admission.ts:7-108.
    Invalid HMAC does not claim, decode, or dispatch.
[x] `createApiServer` invokes that gate before `kernel.handle` and maps HMAC,
    replay, and malformed-store refusals to 401, 409, and 500:
    src/index.ts:804-838.
[x] Hostile webhook and replay coverage: 13/13 tests in
    tests/replay-store.test.mjs and 6/6 tests in
    tests/webhook-admission.test.mjs. Package receipt: 59/59 tests, zero
    failures (Docker `npm test` at df7f2fb51).
[HOLD] A durable, multi-process, crash-safe, or C16 production replay store
    is not implemented here. Do not add a durable store or treat `MemoryReplayStore`
    as production authority. Blocker: no admitted durable store exists
    (`isAdmittedDurableReplayStore` admit-list is empty, src/replay-store.ts:37-39)
    and RD-1286 / a separately authorized storage owner is still deferred.
```

## Historical v0.2 architecture record (retained, non-authorizing)

The following checklist preserves the original v0.2 manifest-scaffold intent.
Those definitions remain design prose in `README.md`; they are not current
TypeScript implementation claims. The current implementation is the adapter
surface above.

```text
[x] Package boundary, transport -> kernel -> runtime position, and the
    proposed manifest/route policy vocabulary remain documented in README.md.
[SUPERSEDED] GalerinaApiManifest and GalerinaRouteManifest TypeScript interfaces.
    Reason: routes are declared to the App Kernel, not loaded from an adapter
    manifest. Pointer: `RouteDeclaration` / `EffectiveRoutePolicy`
    (../galerina-framework-app-kernel/src/types.ts:68-103) passed to
    `createAppKernel({ routes })` (../galerina-framework-app-kernel/src/kernel.ts:421-469).
[SUPERSEDED] The seven RoutePolicy kinds: auth, scope, body, effect, network,
       rateLimit, and idempotency. Reason: route policy is App Kernel
       ownership. Pointer: auth + scopes, body, idempotency and limits.rate in
       ../galerina-framework-app-kernel/src/types.ts:17-52. Note: `effect` and
       `network` have no kernel route-policy kind today; adding them is App
       Kernel owner work, not adapter work.
[SUPERSEDED] BodyPolicy, RouteLimits, RouteReportPolicy, and
       WebhookVerificationConfig implementation. Reason/pointer: `BodyPolicy`,
       `LimitsPolicy`, `AuditPolicy` and `EffectiveRoutePolicy.relaxations` are
       kernel types (../galerina-framework-app-kernel/src/types.ts:32-56,101-102);
       webhook verification is `ApiServerWebhookOptions` (src/index.ts:231-239).
[SUPERSEDED] A local GalerinaAppKernel/HandleApiRequestInput model. Reason: the
       adapter consumes the real kernel. Pointer: `AppKernel`
       (../galerina-framework-app-kernel/src/kernel.ts:309-311).
[SUPERSEDED] A local manifestPath/port StartApiServerOptions model. Reason: the
       old server-start API is replaced. Pointer: `CreateApiServerOptions`
       (src/index.ts:161-229) plus `listen(server, port, host)` (src/index.ts:856-884).
[SUPERSEDED] GalerinaHttpError and a standalone error-mapper module. Reason:
       kernel refusals are typed by the kernel; adapter failures use fixed
       fail-closed bodies. Pointer: `errorResponse`
       (../galerina-framework-app-kernel/src/kernel.ts:341-350) and
       src/index.ts:241-259.
[HOLD] The proposed thirteen-module layout, including cli, load-manifest,
       route-table, read-body-with-limit, webhook, openapi, and safe-log.
       Historical, kept: the layout is not recreated; each named concern now has
       its own row below with its own status.
[x] OpenAPI generation is owned by the docs package and consumes App Kernel
    route declarations or effective policies: ../galerina-docs/src/openapi.ts:472-537;
    `generateOpenApi` and its `exportOpenApi` alias are current there.
[SUPERSEDED] Adapter-local manifest-driven OpenAPI integration. Reason:
       duplicating OpenAPI here would fork the docs-package generator.
       Pointer: ../galerina-docs/src/openapi.ts:472 (`generateOpenApi`), :537
       (`exportOpenApi`).
[SUPERSEDED] A standalone route table with named :param matching. Reason: route
       matching is App Kernel ownership. Pointer: the kernel's pre-resolved
       path -> method table and 404/405 refusals
       (../galerina-framework-app-kernel/src/kernel.ts:444-469,504,508). Note:
       the kernel matches exact declared paths; named :param matching is not
       implemented there either and would be App Kernel owner work. Examples
       are tracked under "OpenAPI, examples" below.
```

## Historical v0.2 implementation scaffold - explicit HOLDs

These are the old unchecked implementation items, retained so their provenance
is visible. They are not a request to recreate the superseded architecture.

### Package setup and the historical types module

```text
[x] package.json, tsconfig.json, and src/index.ts exist in the current package.
[HOLD] Add the historical cli module, an exports map, and a bin entry.
       Historical, kept: not recreated. Process start is host-owned (for example
       ../galerina-framework-example-app/host/server.ts:165-166 calls
       `createApiServer` + `listen`); package.json exposes `main`/`types` only.
       A CLI or bin needs an owner decision first.
[SUPERSEDED] Add the historical types module implementing the manifest, route-policy, local-kernel,
       and StartApiServerOptions models from the old v0.2 sketch. Reason: those
       types now come from the App Kernel (types.ts:10-103, kernel.ts:47-72,309-311)
       and the adapter's own options (src/index.ts:95-239).
```

### Historical load-manifest and route-table modules

```text
[SUPERSEDED] loadManifest, assertGalerinaApiManifest, schema validation, and startup
       rejection of an invalid manifest. Reason: there is no adapter manifest.
       Pointer: route declarations are validated at kernel construction by
       `assertRouteDeclaration` / `resolveEffectiveRoutePolicy`
       (../galerina-framework-app-kernel/src/route-defaults.ts:115,205) and
       duplicate declarations refuse (kernel.ts:464-467).
[SUPERSEDED] buildRouteTable, compileRoute, :param matching, and standalone 404/405
       logic. Reason: the App Kernel owns route matching and the adapter forwards
       its normalized request. Pointer: kernel.ts:444-469,504,508 (exact-path
       matching; :param noted above as kernel owner work).
[SUPERSEDED] route-table.test.ts. Reason: no standalone route-table module exists
       to test. Pointer: adapter pass-through of kernel 405/404 is covered in
       tests/api-server.test.mjs:122-139.
```

### Historical read-body-with-limit and error-mapper modules

```text
[x] The bounded behavior is implemented by `bufferBody` and `BodyCapExceeded`
    in src/index.ts:261-308; oversize input receives 413 and the socket is
    destroyed before kernel dispatch (src/index.ts:717-734).
[SUPERSEDED] A separate read-body-with-limit module and GalerinaHttpError contract.
       Reason: `bufferBody` already does bounded buffering and stops at the cap.
       Pointer: src/index.ts:261-308,717-734; test
       tests/api-server.test.mjs:159-171. Error typing: see the error-mapper row above.
[x] Kernel responses and adapter failures are written by `writeResponse` and
    the fail-closed 500 paths in src/index.ts:363-374,595-600,735-740,840-851.
[HOLD] Development safeDetails, production publicMessageForStatus, and an
       independent error-mapper.test.ts receipt. Historical, kept: adapter
       failure bodies never carry error detail in any posture
       (src/index.ts:241-259). A development detail mode would widen what can
       leak, so it needs an owner decision; it is not recreated by default.
```

### Historical webhook module and current replay-store module

```text
[x] The bounded current equivalent is `admitWebhookReplay` in
    src/webhook-admission.ts:45-108: SHA-256 HMAC with timing-safe comparison,
    raw-body ordering, atomic claim, and fail-closed malformed-store handling.
[x] The current replay adapter is `MemoryReplayStore` in src/replay-store.ts:41-163.
[SUPERSEDED] The old has-then-put `assertWebhookNotReplayed` scaffold. Reason: a
       read followed by a write is not atomic. Pointer: the single atomic
       `claim` (src/webhook-admission.ts:66-108;
       ../galerina-core-network/src/index.ts:119-134, whose contract states
       has-then-put does not implement it).
[HOLD] Timestamp-window verification and provider-specific signature encodings
       (webhook replay concern). Genuine: no owner specification exists for a
       timestamp header, tolerance window, clock source or provider formats.
       Current gate is hex HMAC-SHA256 over the raw body with an optional prefix
       plus an event-id claim (src/webhook-admission.ts:45-108).
[SUPERSEDED] Reintroduce the historical webhook module or claim the old
       webhook-signature.test.ts contract. Reason/pointer: replaced by
       src/webhook-admission.ts and tests/webhook-admission.test.mjs (6) plus
       tests/replay-store.test.mjs (13). New webhook behavior still needs a
       current owner specification.
```

### Historical create-server and write-response modules, plus logging

```text
[x] Current request handling is `createApiServer` + `handleRequest` in
    src/index.ts:551-854; 10-step semantics that belong to the App Kernel are
    not duplicated in this transport adapter.
[x] Current listening helper is `listen` in src/index.ts:856-884.
[x] Current response writer is `writeResponse` in src/index.ts:363-374.
[SUPERSEDED] The old `startApiServer(options): Promise<void>` API (old
       server-start API). Pointer: `createApiServer` (src/index.ts:551-621)
       returns a server and `listen` (src/index.ts:856-884) binds it.
[SUPERSEDED] Standalone writeJson. Pointer: `writeResponse`
       (src/index.ts:363-374); JSON encoding is done by the kernel.
[HOLD] Request-ID response-header policy. Genuine: the adapter mints
       `requestId` for the kernel (src/index.ts:795) but no component writes a
       request-ID response header. Needs an owner decision (header name, mint vs
       echo, whether an inbound ID is ever trusted).
[HOLD] Safe-log module and raw-body logging policy (logging concern). Genuine:
       the adapter emits no logs at all (no console use in src/), so no raw body
       is logged today. Any logging sink needs an owner redaction/sink spec first.
[SUPERSEDED] Reports emission. Reason/pointer: audit and relaxation reporting is
       App Kernel ownership (`AuditSink`, kernel.ts:188-201,439;
       `EffectiveRoutePolicy.relaxations`, types.ts:101-102). The adapter emits none.
```

### OpenAPI, examples, and production startup policy

```text
[x] `generateOpenApi`/`exportOpenApi` and their source-backed route-policy
    tests belong to ../galerina-docs/src/openapi.ts (`generateOpenApi`,
    `exportOpenApi`, `sourceBackedSchemas`) and its docs package
    test suite; this package does not duplicate them.
[HOLD] Independent audit/receipt of any future adapter-to-docs integration.
       Genuine but conditional: no such integration exists today; if one is
       proposed it needs its own audit and receipt. This package's 59/59 tests
       do not close that boundary.
[SUPERSEDED] examples/basic-api manifest/server tree. Reason: the manifest tree
       belongs to the superseded scaffold. Pointer: the current runnable example
       is ../galerina-framework-example-app (host/server.ts:165-166).
[HOLD] examples/webhook-api. Genuine gap: no example wires
       `ApiServerWebhookOptions`. Owner decision whether framework-example-app
       gains a webhook route (it would need the process-local replay disclaimer).
[SUPERSEDED] Manifest-missing and per-route body-limit startup checks. Reason:
       there is no manifest; per-route body limits are validated at kernel
       construction and enforced per request. Pointer:
       ../galerina-framework-app-kernel/src/route-defaults.ts:137 and
       kernel.ts:514-517.
[HOLD] Boot-time handler-reference check and network-deny-by-default route
       policy. Genuine, owner App Kernel (not this adapter): a missing handler is
       refused only at request time with 500 (kernel.ts:668-673), and there is
       no network route-policy kind (types.ts:69-83).
```

## Remaining bounded work

```text
[HOLD] Replace process-local replay with a separately authorized durable,
       multi-process storage owner and receipt chain. Genuine: same blocker as
       the webhook/replay row above (empty durable admit-list; RD-1286 deferred).
[HOLD] Reopen the v0.2 manifest scaffold only after an authoritative manifest,
       route, OpenAPI, and ownership contract is supplied. Historical guard, kept.
[HOLD] Do not create or modify `.fungi` sources in this package as part of this
       reconciliation. Process guard, kept (this pass edited TODO.md only).
```