# JavaScript, TypeScript and Framework Target Syntax

Status: Draft.

This file defines syntax direction for JavaScript, TypeScript, Node, WASM,
React Native and framework adapter targets.

Galerina is a language and compiler/toolchain. React, React Native, Angular, Node.js
and similar systems are external frameworks, runtimes and build tools that
consume generated outputs.

---

## Purpose

```text
generate ESM JavaScript
generate TypeScript declarations
generate browser/Node WASM bridges
mark exports as client_safe, server_only or worker_safe
generate framework adapter metadata
keep React, React Native, Angular and Node framework conventions outside core Galerina syntax
```

---

## Grammar Direction

```text
target_js       = target "javascript" block
target_node     = target "node" block
target_wasm     = target "wasm" block
target_adapter  = target ("react-adapter" | "react-native-adapter" | "angular-adapter") block
export_marker   = "client_safe" | "server_only" | "worker_safe"
export_decl     = "export" export_marker* (flow_decl | type_decl)
package_targets = "targets" "[" identifier_list "]"
```

---

## Minimal Examples

JavaScript target:

```Galerina
target javascript {
  module esm
  typescript_declarations true
  source_maps true
}
```

Node target:

```Galerina
target node {
  module esm
  version ">=22"
  workers true
  source_maps true
}
```

WASM target:

```Galerina
target wasm {
  runtime browser_node
  js_bridge true
  source_maps true
}
```

Client-safe export:

```Galerina
export client_safe pure flow calculateVat(subtotal: Money) -> Money {
  return subtotal * 0.20
}
```

Server-only export:

```Galerina
export server_only secure flow createOrder(req: Request) -> Result<Response, ApiError>
effects [database.write, network.inbound] {
  ...
}
```

Worker-safe export:

```Galerina
export worker_safe pure vector float flow createEmbedding(text: Text) -> TextEmbedding {
  compute auto {
    return TextEmbeddingModel.encode(text)
  }
}
```

Framework adapter targets:

```Galerina
target react-adapter {
  hooks true
  fetch_clients true
  validation_schemas true
  source_maps true
}

target react-native-adapter {
  hooks true
  fetch_clients true
  validation_schemas true
  native_boundary_manifest true
  permissions_report true
  source_maps true
}

target angular-adapter {
  services true
  validators true
  signal_wrappers true
  source_maps true
}
```

Framework-safe package mode:

```Galerina
package VatTools {
  targets [browser, node, server, wasm]

  exports {
    client_safe calculateVat
    server_only saveInvoice
    worker_safe createEmbedding
  }
}
```

---

## Security Rules

```text
client_safe exports cannot use secret, database, filesystem or server-only effects
server_only exports cannot be emitted into browser bundles
worker_safe exports cannot use DOM, secret, database or uncontrolled filesystem effects
worker_safe exports must be structured-clone/transfer safe
React and Angular adapters must respect export markers
React Native adapters must respect export markers and device permission policy
Node adapters must preserve declared module format
WASM bridges must report memory and JS boundary conversions
```

---

## Report Output

Recommended reports:

```text
js-target-report.json
typescript-declarations-report.json
framework-boundary-report.json
framework-adapter-manifest.json
react-native-native-boundary-report.json
react-native-permissions-report.json
wasm-bridge-report.json
worker-bridge-report.json
client-server-split-report.json
```

Report fields should include:

```text
generated ESM files
generated .d.ts files
client_safe exports
server_only exports
worker_safe exports
forbidden effects rejected from client bundles
WASM bridge functions
worker transfer/clone decisions
framework adapter files
React Native native boundary files
source-map links back to .spore files
```

---

## Open Parser and Runtime Work

```text
parse target javascript
parse target node
parse target wasm bridge settings
parse react-adapter, react-native-adapter and angular-adapter target blocks
parse client_safe, server_only and worker_safe export markers
reject forbidden effects in client_safe exports
reject unsafe captures in worker_safe exports
emit TypeScript declaration reports
emit framework adapter manifests
emit source maps for JS and WASM outputs
generate Node/browser worker-compatible module reports
keep React/Angular component syntax out of core Galerina
keep React Native component, JSX/TSX, navigation and native project syntax out of core Galerina
```
