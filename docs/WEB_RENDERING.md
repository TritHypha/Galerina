# Typed Browser Rendering

Galerina should support browser rendering as a typed, safe and reportable pipeline.

The goal is not to replace the browser or copy a frontend framework. Galerina
should compile safe, typed UI contracts into browser-compatible JavaScript,
WebAssembly or framework adapter output, while ensuring received data is
validated before it becomes UI.

Core rule:

```text
Data received by the browser must be validated before it becomes UI.
```

Pipeline:

```text
API response
  -> validate schema
  -> convert to typed state
  -> sanitise unsafe content
  -> compare with current UI state
  -> render or update only changed parts
  -> report errors, security and performance
```

## Package Direction

Browser rendering belongs in `galerina-web-*` packages:

```text
galerina-web
  umbrella browser-safe web contracts

galerina-web-render
  typed safe browser rendering pipeline

galerina-web-state
  client state, state transitions, hydration and diff plans

galerina-web-components
  typed component props, child rendering and component effects

galerina-web-router
  browser routes, navigation and route parameter validation

galerina-web-events
  typed browser events and event-to-state transitions
```

Supporting packages:

```text
galerina-data-json
  JSON decoding, streaming and schema validation

galerina-data-html
  SafeHtml, sanitization and unsafe HTML reports

galerina-core-security
  browser security policy, secret denial, permissions and redaction

galerina-target-js
  browser JavaScript output planning and source maps

galerina-target-wasm
  browser-safe WebAssembly compute output
```

Do not put browser rendering into `galerina-core`, the app kernel or the API
server. Core may define target boundaries and safe primitive concepts, but
browser UI behaviour must stay package-owned.

## Typed API Responses

Browser code must not render loose JSON directly.

Unsafe shape:

```javascript
const data = await response.json();
element.innerHTML = data.description;
```

Galerina direction:

```Galerina
schema Product {
  id Text
  title Text
  price Money<GBP>
  imageUrl Url
  inStock Bool
}

let products = fetch "/api/products" as Product[]
```

If the API returns invalid data, Galerina should block rendering and return a
typed error. The render report should record the API, schema, failure reason and
whether any fallback UI was rendered.

## Safe Rendering

Text must be escaped by default.

```text
Text       escaped by default
SafeHtml   sanitised and approved
RawHtml    denied unless explicitly enabled by reviewed policy
```

Example:

```Galerina
render Text(product.title)
render SafeHtml(product.description) where policy allows sanitized_product_html
```

Raw HTML writes, unsafe `innerHTML`, untrusted script URLs, event-handler
attributes and unknown remote image domains should produce diagnostics or
security report warnings.

## State-Driven UI

Galerina browser rendering should be state-driven:

```Galerina
state ProductPage {
  products Product[]
  loading Bool = true
  error Text optional
}

view ProductGrid(state ProductPage) {
  if state.loading {
    render LoadingSpinner()
  }

  if state.error exists {
    render ErrorBox(state.error)
  }

  for product in state.products {
    render ProductCard(product)
  }
}
```

State changes should produce a render plan:

```text
old state -> new state -> changed UI only
```

The implementation may use generated DOM operations, virtual-DOM-style diffing,
fine-grained reactive updates, JavaScript, WebAssembly or framework adapters.
The Galerina contract is the typed state transition and safe render report, not a
specific rendering engine.

## Streaming Rendering

Large data should be able to stream in validated batches:

```Galerina
stream Product[] from "/api/products" {
  validate_each Product
  render_each ProductCard
  batch_size 20
}
```

Useful cases:

```text
search results
large tables
logs
chat messages
product grids
financial data
AI responses
```

Instead of:

```text
download all data
parse all data
render all data
freeze browser
```

Galerina should support:

```text
receive chunk
validate chunk
convert chunk to typed state
render batch
continue with backpressure
```

Streaming render contracts must include cancellation, timeout, partial failure,
backpressure and error UI behaviour.

## Example Page

```Galerina
use web.render
use web.state
use data.json

schema Product {
  id Text
  title Text
  price Money<GBP>
  imageUrl Url
  inStock Bool
}

state ProductPage {
  products Product[]
  loading Bool = true
  error Text optional
}

component ProductCard(product Product) {
  render article class "product-card" {
    img src product.imageUrl alt product.title
    h2 Text(product.title)
    p Text(product.price.format())

    if product.inStock {
      span class "stock-ok" Text("In stock")
    } else {
      span class "stock-none" Text("Out of stock")
    }
  }
}

page Products {
  onLoad {
    let result = fetch "/api/products" as Product[]

    match result {
      Ok(items) => state.products = items
      Err(error) => state.error = error.message
    }

    state.loading = false
  }

  render {
    if state.loading {
      LoadingSpinner()
    }

    if state.error exists {
      ErrorBox(state.error)
    }

    grid {
      for product in state.products {
        ProductCard(product)
      }
    }
  }
}
```

This is design-direction syntax. It must not be treated as v1 frozen Galerina
syntax until the language docs and compiler agree.

## Reports

Galerina browser rendering should generate:

```text
app.web-render-report.json
app.client-state-report.json
app.api-schema-report.json
app.security-html-report.json
app.web-performance-report.json
app.browser-target-report.json
```

Example:

```json
{
  "page": "Products",
  "api": "/api/products",
  "schema": "Product[]",
  "renderMode": "state-diff",
  "unsafeHtml": "denied",
  "streaming": false,
  "warnings": [
    "Product imageUrl is remote. Consider image domain allowlist."
  ]
}
```

Reports must redact secrets, bearer tokens, cookies, private URLs where
configured, raw personal data and raw unsafe HTML payloads.

## Non-Goals

Galerina browser rendering should not become:

```text
a browser engine
a mandatory frontend framework
a CMS or admin UI
a CSS framework
a replacement for React, Vue, Angular, Svelte or browser APIs
raw DOM mutation exposed to ordinary app code
unchecked JSON-to-HTML rendering
```

Framework adapters may be added later, but they must compile from the same typed
state, safe HTML and reportable rendering contracts.
