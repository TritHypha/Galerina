# Galerina Standard Syntax: Typed Content Blocks

**Status:** Stage 1 — parser state tracking live in compiler; `SPORE-BLOCK-001..004` constants defined; `validateTypedContentBlock()` stub in place  
**Scope:** `html`, `dom`, `script`, `css` heredoc-style embedded content blocks  
**Packages:** `@galerina/core`, `@galerina/core-compiler`

---

## 1. Overview

Galerina provides four typed content block forms for embedding structured content inside flows:

| Block type | Purpose | Output |
|---|---|---|
| `html` | Server-rendered HTML markup | HTML string or AST |
| `dom` | Client-side DOM structure (component-style) | Reactive DOM binding |
| `script` | Embedded JavaScript (narrow use only) | Governed JS output |
| `css` | Stylesheet rules | Scoped CSS |

All four use **heredoc-style** syntax: the block opens with `blocktype <<MARKER` and closes when the bare marker string appears alone at the start of a line.

---

## 2. Syntax

### Opening a block

```
blocktype <<MARKER
```

- `blocktype` is one of `html`, `dom`, `script`, or `css` (case-insensitive)
- `MARKER` is one or more uppercase letters, digits, or underscores: `[A-Z_][A-Z0-9_]*`
- Optionally prefixed with `print ` to emit the block directly to the response

### Closing a block

The marker must appear **alone at the start of a line** (no leading whitespace, no trailing content):

```
MARKER
```

The closing marker must exactly match the opening marker.

---

## 3. Examples

### html block — server-rendered markup

```galerina
flow renderPage(title: String) -> Html {
  html <<HTML
    <html>
      <head><title>{{ title }}</title></head>
      <body>
        <h1>Hello Galerina</h1>
      </body>
    </html>
  HTML
}
```

### dom block — reactive client component

```galerina
flow counter(initial: Int) -> Dom {
  mut count = initial

  dom <<DOM
    <button @click="count = count + 1">
      Clicked {{ count }} times
    </button>
  DOM
}
```

### script block — governed JavaScript

```galerina
flow analyticsTag(pageId: String) -> Script {
  script <<SCRIPT
    window.analytics.page({ id: pageId });
  SCRIPT
}
```

`script` blocks are subject to strict content scanning. `ProtectedSecret` values must not be interpolated into script blocks (see `SPORE-BLOCK-004`).

### css block — scoped stylesheet

```galerina
flow buttonStyles() -> Css {
  css <<BUTTON_STYLES
    .btn {
      background-color: #0055ff;
      border-radius: 4px;
    }
  BUTTON_STYLES
}
```

The `{` and `}` characters in CSS, DOM, HTML, and script content do **not** affect Galerina brace depth tracking — the compiler suspends scope counting while inside a content block.

---

## 4. `print` prefix

When a content block is the primary output of a flow, prefix with `print`:

```galerina
flow renderAlert(message: String) {
  print html <<ALERT
    <div class="alert">{{ message }}</div>
  ALERT
}
```

---

## 5. Marker rules

- Marker must be uppercase: `HTML`, `DOM`, `SCRIPT`, `CSS`, `PAGE`, `HEADER`, `BUTTON_STYLES`
- Marker must be unique within the file — re-using the same marker name is allowed across different blocks, but nesting is not supported in Stage 1
- The closing marker must match exactly (case-sensitive)

---

## 6. What braces inside blocks do NOT do

Galerina tracks brace depth to determine flow scope exits. Content blocks suspend this tracking:

```galerina
flow renderTable() -> Html {
  html <<TABLE
    <table>
      <tr class="{ active }">  <!-- these braces are NOT Galerina scope braces -->
        <td>Row</td>
      </tr>
    </table>
  TABLE
}  // <-- this } closes the flow
```

The `{` and `}` inside the `TABLE` block are invisible to the Galerina brace counter.

---

## 7. What is NOT allowed inside blocks

Even though the compiler suspends its checks while inside a content block, the following rules still apply at the AST level (Stage 2):

- **`ProtectedSecret` values** must not be interpolated into `script` or `html` blocks — use `SPORE-BLOCK-004` check
- **Unclosed interpolations** are a parse error
- Secret literal patterns that appear in block interpolation sites are flagged during content block validation

---

## 8. Diagnostic Codes

### Content block diagnostics (SPORE-BLOCK-*)

| Code | Name | Trigger |
|---|---|---|
| `SPORE-BLOCK-001` | `UNKNOWN_CONTENT_BLOCK_TYPE` | Block type is not `html`, `dom`, `script`, or `css` |
| `SPORE-BLOCK-002` | `UNCLOSED_CONTENT_BLOCK` | Opening marker found but closing marker never appears |
| `SPORE-BLOCK-003` | `MISMATCHED_CONTENT_BLOCK_MARKER` | Closing marker does not match the opening marker |
| `SPORE-BLOCK-004` | `SECRET_IN_CONTENT_BLOCK` | `ProtectedSecret` interpolated into a `script` or `html` block |

---

## 9. Type Contracts (`@galerina/core`)

```ts
/**
 * The four canonical typed content block types.
 * All use heredoc-style `<<MARKER … MARKER` syntax.
 */
export type ContentBlockType = "html" | "dom" | "script" | "css";

export const CONTENT_BLOCK_TYPES: readonly ContentBlockType[] = [
  "html",
  "dom",
  "script",
  "css",
] as const;

/**
 * A typed content block expression — heredoc-style embedded content.
 *
 * @example
 *   html <<HTML
 *     <div class="foo">Hello Galerina</div>
 *   HTML
 *
 *   script <<SCRIPT
 *     console.log("hello");
 *   SCRIPT
 *
 * The `marker` must appear alone at the start of a line to close the block.
 * Content is preserved exactly as written.
 */
export interface TypedContentBlockExpression {
  readonly kind: "typedContentBlockExpr";
  readonly blockType: ContentBlockType;
  /** The closing marker string, e.g. "HTML", "SCRIPT". */
  readonly marker: string;
  /** Raw block content, exactly as written between opening and closing marker. */
  readonly content: string;
  readonly location?: SourceLocation;
}
```

New `AstNodeKind` value:
- `typedContentBlockExpr` — `blocktype <<MARKER … MARKER` expression

---

## 10. Compiler API (`@galerina/core-compiler`)

### `validateCoreSyntaxSafety()` — content block tracking (live)

The existing `validateCoreSyntaxSafety()` function now tracks content block state:

- When it encounters `html <<MARKER`, `dom <<MARKER`, `script <<MARKER`, or `css <<MARKER`, it enters content block mode
- While in content block mode, all other checks (var/const, secret literals, brace depth) are **suspended**
- When the bare closing marker is found alone at the start of a line, it exits content block mode
- If end-of-file is reached while still inside a block, `SPORE-BLOCK-002` is emitted

Unknown block types (e.g. `xml <<XML`) immediately emit `SPORE-BLOCK-001` without entering block mode.

### `validateTypedContentBlock()` — content validation (stub)

```ts
export function validateTypedContentBlock(input: {
  readonly blockType: "html" | "dom" | "script" | "css";
  readonly marker: string;
  readonly content: string;
  readonly file: string;
  readonly startLine: number;
}): readonly CompilerDiagnostic[]
```

Stage 1 status: **STUB** — returns empty diagnostics.

Stage 2 will implement:
- `html`/`dom` — HTML structure validation
- `script` — JavaScript syntax check; `SPORE-BLOCK-004` secret detection
- `css` — CSS property/selector validation

---

## 11. Implementation Status

| Area | Status | Notes |
|---|---|---|
| `ContentBlockType`, `CONTENT_BLOCK_TYPES` | ✅ | `@galerina/core/src/index.ts` |
| `TypedContentBlockExpression` interface | ✅ | `@galerina/core/src/index.ts` |
| `typedContentBlockExpr` AstNodeKind | ✅ | `@galerina/core/src/index.ts` |
| `SPORE-BLOCK-001..004` constants | ✅ | `@galerina/core-compiler` |
| `SPORE_BLOCK_DIAGNOSTICS` array | ✅ | `@galerina/core-compiler` |
| Content block state tracking in `validateCoreSyntaxSafety()` | ✅ | Real check; brace depth suspended inside blocks |
| `SPORE-BLOCK-001` unknown type detection | ✅ | `parseContentBlockOpen()` |
| `SPORE-BLOCK-002` unclosed block detection | ✅ | Post-loop check |
| `validateTypedContentBlock()` stub | ✅ | Returns empty; Stage 2 pending |
| Tests: content block tracking | ✅ | 5 new tests; 17/17 passing (2026-05-26) |
| HTML/DOM structure validation (Stage 2) | ⏳ | Blocked on content block AST |
| Script JS syntax check (Stage 2) | ⏳ | Blocked on content block AST |
| CSS validation (Stage 2) | ⏳ | Blocked on content block AST |
| `SPORE-BLOCK-003` mismatched marker (Stage 2) | ⏳ | Blocked on multi-block nesting parser |
| `SPORE-BLOCK-004` secret in script block (Stage 2) | ⏳ | Blocked on interpolation AST |
