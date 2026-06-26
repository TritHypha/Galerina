# Type Manifest

## Definition

The **type manifest** (`app.type-manifest.json`) is a compiler-generated artefact
that records all type contracts used by a Galerina project. It bridges compile-time
proof and runtime authority.

## Core Rule

```text
The type manifest is generated from source. Developers do not maintain it manually.
The compiler owns it.
```

## Source Hook

The boot file references the manifest as compiler-generated:

```galerina
boot {
  type_manifest generated
}
```

The compiler produces `app.type-manifest.json` during build. The runtime uses it
to pre-plan type contracts before execution starts.

## Generated Output Location

```text
build/galerina/manifests/app.type-manifest.json
```

## Manifest Content

The manifest records types used by the project:

```json
{
  "kind": "galerina.typeManifest",
  "generated": true,
  "sourceHash": "sha256:...",
  "types": [
    { "name": "String",              "origin": "builtin" },
    { "name": "Bool",                "origin": "builtin" },
    { "name": "Int",                 "origin": "builtin" },
    { "name": "Option",              "origin": "builtin" },
    { "name": "Result",              "origin": "builtin" },
    { "name": "Customer",            "origin": "project" },
    { "name": "CreateOrderRequest",  "origin": "project", "boundary": "api-request" },
    { "name": "CreateOrderResponse", "origin": "project", "boundary": "api-response" },
    { "name": "WebhookConfig",       "origin": "project", "containsSecureFields": true }
  ],
  "genericInstantiations": [
    "Array<Customer>",
    "Option<String>",
    "Result<Order, ApiError>"
  ],
  "brands": [
    { "name": "CustomerId", "base": "String", "brand": "CustomerId" },
    { "name": "OrderId",    "base": "String", "brand": "OrderId" }
  ],
  "secureFields": [
    "LoginRequest.password",
    "WebhookConfig.signingSecret"
  ],
  "boundaryTypes": [
    "CreateOrderRequest",
    "CreateOrderResponse"
  ]
}
```

## What the Runtime Uses It For

```text
schema precompilation
API decoder setup and pre-planning
known-type validation
faster startup checks
route/request/response binding
secure-field redaction maps
report generation
AI-readable project context
source-map lookups
hot reload invalidation
runtime compatibility checks
```

## Relationship to Build Stages

The type manifest is produced in **Stage 7: Build manifests**:

```text
Stage 1: Load project
Stage 2: Resolve entry
Stage 3: Parse source
Stage 4: Check types
Stage 5: Check effects
Stage 6: Check boundaries
Stage 7: Build manifests  ← app.type-manifest.json produced here
Stage 8: Build runtime plan
...
```

## Package Ownership of Types

Types should be packaged by responsibility, not by individual type.

```text
galerina-core
  String, Bool, Int, Option, Result, Void

galerina-core-runtime
  InitPlan, RuntimeMode, StartupReport

galerina-data-json
  Json, JsonObject, JsonArray, JsonDecodeError

application package
  Customer, Order, Payment, OrderLine
```

Do NOT create one package per type. A package may expose many related types.

## Why Not a Hand-Maintained Source Block

A manually edited type list in `boot.spore` would become stale:

```galerina
// Avoid — becomes stale
types {
  Init
  Customer
  CreateOrderRequest
}
```

The compiler-generated manifest reflects the actual project graph. Developers
cannot accidentally list a type that does not exist or forget one that does.

## Preloading Semantics

Built-in types (`String`, `Bool`, `Int`) are intrinsic to the compiler and
runtime. There is nothing meaningful to "preload" for them.

For project and boundary types, the manifest enables the runtime to pre-plan:

```text
CreateOrderRequest -> JSON decoder
CreateOrderResponse -> JSON encoder
LoginRequest.password -> redaction rule
PaymentStatus -> exhaustive enum table
```

Recommended framing:
```text
The runtime may pre-plan type contracts from the manifest.
```
Not: "The runtime preloads types to make execution faster."

## Connection to Authority Model

The type manifest is part of the governed execution plan:

```text
intent -> governed execution plan -> coordinated compute -> audit proof
```

The manifest feeds:
```text
effect graph planning
authority cache
startup planning
safe target selection
fast route binding
```

## Option<T> and Null Compatibility

`Option<T>` is the only normal way to express a missing-capable field.
JSON null compatibility is a boundary encoding detail, not permission for silent
null inside Galerina source.

The manifest records `Option<T>` instantiations so the runtime can prepare the
correct `anyOf [T, null]` JSON schema shape at boundaries.

## Core Principle

```text
The type manifest is generated from source and used by runtime planning,
schema generation, redaction, API binding, diagnostics, hot reload
and AI context.

It is a runtime governance asset, not just metadata.
```
