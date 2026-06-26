# Galerina Web Render

`galerina-web-render` defines typed browser rendering pipeline contracts.

Use this package for:

```text
typed API-to-state render pipelines
safe text rendering
SafeHtml render gates
RawHtml denial policy
state-diff render plans
streaming batch render contracts
DOM update report contracts
web render performance reports
```

It must not become a full browser engine, layout engine, CSS framework, React
clone, Vue clone, Angular clone or mandatory app framework.

The default rendering rules are:

```text
Text is escaped by default.
HTML is denied unless sanitised.
RawHtml is denied unless an explicit reviewed non-production or trusted override exists.
API data is schema-checked before rendering.
State controls rendering.
DOM updates are generated safely.
Large data can stream in validated batches.
```

Example direction:

```Galerina
let products = fetch "/api/products" as Product[]

render ProductGrid from products {
  mode state_diff
  unsafe_html deny
  report "app.web-render-report.json"
}
```

`galerina-web-render` consumes contracts from `galerina-web-state`,
`galerina-data-json`, `galerina-data-html`, `galerina-core-security` and output target
packages. It should generate reports rather than hide unsafe rendering decisions
inside framework code.
