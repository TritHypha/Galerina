# Galerina Frontend Compilation: JavaScript and WebAssembly Targets

This document explains how **Galerina / Galerina** could run in a client-side frontend environment by compiling to:

```text
JavaScript
WebAssembly
a hybrid JavaScript + WebAssembly output
```

Galerina should not try to replace the browser. It should compile into formats that browsers already understand.

---

## Purpose

The goal is to allow Galerina to do browser-side work such as:

```text
form validation
button click handling
DOM updates
client-side routing
API requests
UI state changes
browser-safe calculations
WebAssembly-powered heavy compute
```

---

## Main Idea

A browser cannot directly run `.spore` files unless a Galerina runtime or interpreter is written in JavaScript.

So Galerina needs one of these approaches:

```text
Galerina source code -> JavaScript
Galerina source code -> WebAssembly
Galerina source code -> JavaScript wrapper + WebAssembly module
```

Recommended approach:

```text
Use JavaScript for browser and DOM work.
Use WebAssembly for heavy safe compute.
Use JavaScript + WebAssembly together for advanced frontend apps.
```

---

## Why JavaScript Is Still Needed

JavaScript is the browser's native scripting language.

Even if Galerina compiles to WebAssembly, JavaScript is still useful for:

```text
loading the WebAssembly module
connecting to the DOM
adding click handlers
reading form values
updating page content
calling browser APIs
using fetch()
using localStorage/sessionStorage
working with existing frontend frameworks
```

Galerina should therefore treat JavaScript as the main browser integration layer.

Modern framework integration should stay framework-neutral. Galerina may generate
JavaScript, TypeScript declarations, schemas, source maps, WASM bridges and
adapter manifests for React, Angular, Node and similar ecosystems, but those
frameworks still own UI components, routing, state management and app structure.

Detailed framework-facing target planning lives in
`docs/javascript-typescript-framework-targets.md`.

---

## Target 1: JavaScript

The simplest frontend target is:

```text
app.spore -> app.js
```

The Galerina compiler reads `.spore` files and generates JavaScript modules.

For modern browser and Node targets, ESM should be the preferred module format.

Example output:

```text
src/main.spore
src/forms/contact-form.spore

dist/app.js
dist/app.d.ts
dist/app.js.map
dist/Galerina.browser-report.json
dist/framework-adapter-manifest.json
```

The generated JavaScript can then be loaded in the browser:

```html
<script type="module" src="/dist/app.js"></script>
```

### Example Form Validation

```Galerina
import browser.dom
import browser.forms
import browser.http

form ContactForm {
  field name string required min 2
  field email email required
  field message string required min 10
}

on click "#submitButton" {
  let result = validate ContactForm from "#contactForm"

  match result {
    Ok(data) => {
      hide "#formErrors"
      show "#successMessage"

      await http.post("/api/contact", data)
    }

    Err(errors) => {
      showErrors "#formErrors" errors
    }
  }
}
```

Possible generated JavaScript:

```js
import { validateContactForm } from "./generated/contact-form.js";

document.querySelector("#submitButton")?.addEventListener("click", async (event) => {
  event.preventDefault();

  const result = validateContactForm(document.querySelector("#contactForm"));

  if (result.ok) {
    document.querySelector("#formErrors")?.classList.add("hidden");
    document.querySelector("#successMessage")?.classList.remove("hidden");

    await fetch("/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(result.data)
    });

    return;
  }

  showErrors("#formErrors", result.errors);
});
```

### JavaScript Target Benefits

Compiling Galerina to JavaScript is good for:

```text
DOM manipulation
form validation
button clicks
browser events
fetch requests
frontend routing
client-side UI logic
simple calculations
progressive enhancement
static websites
```

This should be the first frontend target because it is easier to build and debug than WebAssembly.

---

## Target 2: WebAssembly

The second frontend target is:

```text
app.spore -> app.wasm
```

WebAssembly is best for low-level, performance-sensitive workloads.

Good examples:

```text
maths-heavy calculations
image processing
audio processing
data compression
encryption primitives
parsing large datasets
simulation
vector operations
AI/model inference helpers
game logic
physics calculations
```

Bad examples:

```text
direct DOM updates
button click registration
reading form fields directly
calling browser-only APIs directly
working with secret environment variables
database access
most normal UI logic
```

Important rule:

```text
WebAssembly should do compute.
JavaScript should connect WebAssembly to the browser.
```

### Example WebAssembly Compute Block

```Galerina
export compute calculateQuoteRisk(input: QuoteInput) -> RiskScore {
  let base = input.age * 1.2
  let vehicle = input.vehicleRisk * 2.4
  let postcode = input.postcodeRisk * 1.8

  return RiskScore(base + vehicle + postcode)
}
```

Possible output:

```text
dist/Galerina_quote.wasm
dist/Galerina_quote.js
dist/Galerina_quote.d.ts
dist/Galerina_quote.wasm.map
dist/Galerina.wasm-report.json
```

The JavaScript wrapper would load the WASM file and expose a normal JavaScript function:

```js
import { calculateQuoteRisk } from "./Galerina_quote.js";

const score = await calculateQuoteRisk({
  age: 35,
  vehicleRisk: 12,
  postcodeRisk: 8
});
```

### Why a Wrapper Is Needed

A browser normally needs JavaScript to:

```text
fetch the .wasm file
compile or instantiate it
pass data into it
read results from it
connect results back to the DOM
handle errors
handle memory conversion
```

Galerina should generate a JavaScript wrapper automatically.

Example structure:

```text
dist/
  app.js
  app.wasm
  app.wasm.map
  app.types.d.ts
  app.galerina-report.json
```

---

## Target 3: Hybrid JavaScript + WebAssembly

The best long-term frontend model is hybrid output.

Example:

```text
Galerina UI/event code -> JavaScript
Galerina heavy compute code -> WebAssembly
Galerina compiler generates the wrapper between them
```

This aLOws Galerina to use the right tool for each job.

### Example Hybrid App

```Galerina
import browser.dom
import browser.forms
import browser.http

form LoanForm {
  field amount number required min 100
  field years number required min 1 max 40
  field rate number required min 0
}

compute target wasm fallback js {
  export calculateMonthlyPayment(amount: Number, years: Number, rate: Number) -> Number {
    let monthlyRate = rate / 100 / 12
    let months = years * 12

    return amount * monthlyRate / (1 - pow(1 + monthlyRate, -months))
  }
}

on click "#calculateButton" {
  let form = validate LoanForm from "#loanForm"

  match form {
    Ok(data) => {
      let monthly = calculateMonthlyPayment(data.amount, data.years, data.rate)
      setText "#monthlyResult" formatCurrency(monthly)
    }

    Err(errors) => {
      showErrors "#formErrors" errors
    }
  }
}
```

Generated output:

```text
dist/
  app.js
  app.wasm
  app.js.map
  app.wasm.map
  Galerina.browser-report.json
  Galerina.wasm-report.json
```

Meaning:

```text
click handler compiles to JavaScript
form validation compiles to JavaScript
calculation compiles to WebAssembly
JavaScript fallback can be provided when WebAssembly is unavailable
```

---

## Browser Target Configuration

Galerina should support browser compilation inside `boot.spore` or `main.spore`.

Example:

```Galerina
boot {
  app "frontend-demo"

  target browser {
    output hybrid
    js enabled
    wasm optional
    source_maps true
    fallback js
  }

  security {
    block_server_imports true
    block_env_access true
    aLOw_browser_storage true
    aLOw_fetch true
  }
}
```

Meaning:

```text
compile this Galerina app for the browser
generate JavaScript
generate WebAssembly where suitable
generate source maps
fallback to JavaScript where WASM is not available
block server-only imports
block private environment access
allow browser storage and fetch requests
```

---

## Import Rules

Galerina should mark imports by target.

Browser-safe imports:

```Galerina
import browser.dom
import browser.forms
import browser.events
import browser.http
import browser.storage
import browser.router
```

Compute-safe imports:

```Galerina
import math
import tensor
import crypto.public
import image.processing
import data.buffer
```

Server-only imports:

```Galerina
import server.database
import server.filesystem
import server.secrets
import environment
import payment.private
```

The compiler should validate imports based on the target.

Example:

```Galerina
target browser

import browser.dom
import math
import server.database
```

Compiler error:

```text
galerina-ERR-TARGET-IMPORT-002: Import "server.database" is not aLOwed for browser target.
```

Reason:

```text
Database access must run on a server target, not inside client-side frontend code.
```

---

## Suggested File Structure

A frontend Galerina app could use:

```text
src/
  boot.spore
  main.spore

  pages/
    home.spore
    contact.spore

  forms/
    contact-form.spore
    login-form.spore

  components/
    button.spore
    modal.spore
    error-message.spore

  compute/
    quote-risk.spore
    image-resize.spore

  browser/
    routes.spore
    storage.spore

dist/
  app.js
  app.wasm
  app.js.map
  app.wasm.map
  Galerina.browser-report.json
  Galerina.wasm-report.json
```

---

## Browser Component Example

```Galerina
component ContactButton {
  prop label string default "Send message"

  render {
    button id "submitButton" class "btn btn-primary" {
      text label
    }
  }
}
```

Possible JavaScript output:

```js
export function ContactButton({ label = "Send message" } = {}) {
  const button = document.createElement("button");
  button.id = "submitButton";
  button.className = "btn btn-primary";
  button.textContent = label;
  return button;
}
```

---

## Client-Side Router Example

```Galerina
import browser.router

router {
  route "/" {
    render HomePage
  }

  route "/contact" {
    render ContactPage
  }

  not_found {
    render NotFoundPage
  }
}
```

Possible JavaScript output:

```js
const routes = {
  "/": HomePage,
  "/contact": ContactPage
};

function renderRoute() {
  const Page = routes[window.location.pathname] ?? NotFoundPage;
  document.querySelector("#app").replaceChildren(Page());
}

window.addEventListener("popstate", renderRoute);
renderRoute();
```

---

## API Request Example

```Galerina
import browser.http

secure flow submitContactForm(data: ContactFormData) -> Result<ApiResponse, Error> {
  let response = await http.post("/api/contact", data)

  match response.status {
    200 => return Ok(response.body)
    400 => return Err(Error.Validation(response.body))
    _ => return Err(Error.Network("Unexpected response"))
  }
}
```

Possible JavaScript output:

```js
export async function submitContactForm(data) {
  const response = await fetch("/api/contact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  if (response.status === 200) {
    return { ok: true, value: await response.json() };
  }

  if (response.status === 400) {
    return { ok: false, error: { type: "Validation", value: await response.json() } };
  }

  return { ok: false, error: { type: "Network", value: "Unexpected response" } };
}
```

---

## Frontend Security Rules

Galerina should treat browser code as public.

Anything compiled to the frontend can be read by users.

Browser Galerina must not contain:

```text
private API keys
payment secret keys
database passwords
server environment variables
admin credentials
private file paths
internal-only business rules that must remain secret
```

ALOwed frontend data:

```text
public validation rules
public API endpoints
public UI logic
public feature flags
public display text
public calculation rules where secrecy is not required
```

---

## Source Maps and Debugging

Galerina should generate source maps so browser errors point back to original `.spore` files.

Example:

```text
dist/app.js.map
dist/app.wasm.map
```

Example browser error:

```text
Error: Invalid email address

Compiled file:
dist/app.js:245

Original source:
src/forms/contact-form.spore:12
```

Developers should not have to debug only generated JavaScript or WebAssembly.

---

## Compiler Reports

Galerina should generate frontend reports.

Example:

```text
dist/Galerina.browser-report.json
dist/Galerina.wasm-report.json
dist/Galerina.security-report.json
```

Example report:

```json
{
  "target": "browser",
  "output": "hybrid",
  "javascript": {
    "enabled": true,
    "files": [
      "dist/app.js"
    ]
  },
  "webassembly": {
    "enabled": true,
    "files": [
      "dist/app.wasm"
    ],
    "fallback": "javascript"
  },
  "security": {
    "serverImportsBlocked": true,
    "environmentAccessBlocked": true,
    "privateSecretsFound": 0
  },
  "sourceMaps": {
    "javascript": "dist/app.js.map",
    "webassembly": "dist/app.wasm.map"
  }
}
```

---

## JavaScript vs WebAssembly Decision Rules

| Galerina Feature | Best Frontend Output |
|---|---|
| Button click | JavaScript |
| Form validation | JavaScript |
| DOM updates | JavaScript |
| Client-side routing | JavaScript |
| Fetch/API calls | JavaScript |
| localStorage/sessionStorage | JavaScript |
| Simple calculations | JavaScript |
| Heavy maths | WebAssembly |
| Image processing | WebAssembly |
| Audio processing | WebAssembly |
| Large parser | WebAssembly |
| Physics/game loop | WebAssembly |
| AI/tensor helper | WebAssembly |
| Secret server logic | Not aLOwed in browser |

---

## Recommended First Version

The first frontend version of Galerina should compile to JavaScript only.

Version 1:

```text
Galerina -> JavaScript
browser-safe imports
DOM events
form validation
fetch wrapper
source maps
security report
```

Later version:

```text
Galerina -> WebAssembly for compute blocks
JavaScript wrapper
JavaScript fallback
WASM source maps
WASM target report
```

Final version:

```text
Galerina -> hybrid JavaScript + WebAssembly
compiler automatically separates browser UI code from compute code
```

---

## Suggested Roadmap

```text
1. Define browser target in boot.spore.
2. Define browser-safe imports.
3. Compile simple Galerina functions to JavaScript.
4. Add DOM event support.
5. Add form validation support.
6. Add fetch/http support.
7. Generate source maps.
8. Generate browser security report.
9. Add compute target wasm blocks.
10. Generate .wasm output.
11. Generate JavaScript wrapper for WASM.
12. Add JavaScript fallback for WASM compute blocks.
13. Add hybrid compiler output.
```

---

## Final Rule

Galerina should start with JavaScript output first, then add WebAssembly compute blocks later.

Final model:

```text
JavaScript target for browser interaction.
WebAssembly target for heavy compute.
Hybrid target for real-world frontend apps.
```
