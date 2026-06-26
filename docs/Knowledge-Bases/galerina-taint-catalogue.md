# Galerina — Taint System Catalogue (Phase 28)

**Version: 1.0 — 2026-06-01**
**Status: Canonical — OWASP-aligned. Implements `Tainted<T>` and `SafeFor<Context, T>`.**
**Source: OWASP Cheat Sheet Series (SQL Injection, XSS, OS Command, File Upload).**

---

## The Core Principle

```
A value is only clean for the sink it was cleaned for.
```

Untainting is NOT a single `Clean<String>` state. A value escaped for HTML is still
dangerous in a SQL query. The type system tracks **what context** a value was made safe for:

```
SafeFor<SqlValue, String>
SafeFor<HtmlContent, String>
SafeFor<HtmlAttribute, String>
SafeFor<ShellArg, String>
SafeFor<PathWithin<Base>, String>
```

NOT just `Clean<String>`.

---

## Four Kinds of Boundary

```
Validators           prove shape / meaning      (Validated<T>)
Encoders             prove safe output context  (SafeFor<Context, T>)
Sanitisers           transform / remove unsafe structure
Parameterized APIs   avoid injection by construction (preferred)
```

**OWASP guidance:** Parameterized APIs beat escaping. `Sql.escape` is *strongly discouraged*
by OWASP — prefer `Sql.parameterize`. The same applies to shell (`Process.spawn` over `Shell.quote`).

---

## Canonical Untaint Boundaries

| Sink | Galerina Boundary | SafeFor Context | Priority | Notes |
|---|---|---|---|---|
| SQL query values | `Sql.parameterize(query, args)` | `SqlValue` | **Preferred** | Beats escaping (OWASP). |
| SQL identifiers | `Sql.identifierFromAllowlist(value, allowed)` | `SqlIdentifier` | Required | Table/column names can't be parameterized. |
| NoSQL query objects | `NoSql.sanitizeKeys(value)` | `NoSqlQuery` | Required | Strip `$`, `.`, operator/prototype keys. |
| HTML text | `Html.escapeContent(value)` | `HtmlContent` | Required | Text between tags. |
| HTML attributes | `Html.escapeAttribute(value)` | `HtmlAttribute` | Required | Separate from content. |
| JavaScript string | `Js.escapeString(value)` | `JsString` | Restricted | Quoted data values only. |
| CSS value | `Css.escapeValue(value)` | `CssValue` | Restricted | Safe property values only. |
| URL query component | `Url.encodeComponent(value)` | `UrlComponent` | Required | Query/fragment values. |
| Full outbound URL (SSRF) | `Url.parseAndAllowlist(value, policy)` | `SafeUrl` | Required | Scheme/host/port/private-IP checks. |
| Rich HTML (user-authored) | `Html.purify(value)` | `PurifiedHtml` | Required | DOMPurify-style (OWASP). |
| Shell / process | `Process.spawn(exec, args)` | (no shell) | **Preferred** | Avoid OS commands directly (OWASP). |
| Shell arg fallback | `Shell.quoteArg(value)` | `ShellArg` | Discouraged | Only if shell explicitly allowed. |
| File path | `Path.canonicalizeWithin(base, value)` | `PathWithin<Base>` | Required | Must prove final path stays inside base. |
| Filename upload | `FileName.generateSafe()` / `FileName.validateAllowlist()` | `SafeFileName` | Required | Generated names + length + char limits (OWASP). |
| Log lines | `Log.escapeLine(value)` | `LogLine` | Required | Strip CRLF, tabs, control chars, ANSI. |
| CSV cells | `Csv.escapeCell(value)` | `CsvCell` | Required | Formula injection: prefix `=` `+` `-` `@`. |
| XML text | `Xml.escapeText(value)` | `XmlText` | Required | Separate from attribute. |
| XML attribute | `Xml.escapeAttribute(value)` | `XmlAttribute` | Required | Separate context. |
| LDAP filter | `Ldap.escapeFilter(value)` | `LdapFilter` | If used | LDAP support only. |
| Regex pattern | `Regex.escapeLiteral(value)` | `RegexLiteral` | Required | Prevent regex injection. |

---

## Corrections to the Original Phase 28 Proposal

```
Sql.escape        → DEMOTE. Prefer Sql.parameterize (OWASP: escaping discouraged).
Html.escape       → SPLIT into escapeContent / escapeAttribute / purify.
Shell.quote       → DEMOTE. Prefer Process.spawn(exec, args) (no shell).
Path.normalize    → REPLACE with Path.canonicalizeWithin(base, path).
Url.encode        → SPLIT into encodeComponent / parseAndAllowlist.
```

---

## Type System Design

```typescript
// A value from an untrusted source carries Tainted<T>.
type Tainted<T> = { readonly __taint: "tainted"; readonly value: T };

// An untaint boundary produces SafeFor<Context, T> — clean ONLY for that context.
type SafeFor<Context extends SinkContext, T> = {
  readonly __safeFor: Context;
  readonly value: T;
};

// Sink contexts (closed set):
type SinkContext =
  | "SqlValue" | "SqlIdentifier" | "NoSqlQuery"
  | "HtmlContent" | "HtmlAttribute" | "PurifiedHtml"
  | "JsString" | "CssValue"
  | "UrlComponent" | "SafeUrl"
  | "ShellArg" | "PathWithin" | "SafeFileName"
  | "LogLine" | "CsvCell" | "XmlText" | "XmlAttribute"
  | "LdapFilter" | "RegexLiteral";
```

---

## Diagnostics

| Code | Trigger | Severity |
|---|---|---|
| `SPORE-TAINT-001` | Raw `Tainted<T>` reaches an injection sink (SQL/HTML/Shell/Path) | **error** |
| `SPORE-TAINT-002` | Unvalidated value reaches a business-logic sink | warning |
| `SPORE-TAINT-003` | Value untainted for context A used in sink expecting context B | **error** |
| `SPORE-TAINT-004` | `Sql.escape` / `Shell.quote` used where parameterize/spawn available | warning |

`SPORE-TAINT-003` is the key one — it enforces "clean for the sink it was cleaned for".

---

## Hybrid Model (Locked Decision)

- **Injection sinks** (`database.query`, `html.render`, `shell.exec`, `filesystem.path`):
  require a named sanitiser/encoder from the catalogue → `SafeFor<Context, T>`.
- **Business-logic sinks**: accept any `Validated<T>` from the existing value-state system.

---

## See Also
- `galerina-roadmap-next10-phases.md` — Phase 28
- `value-state-checker.ts` — existing Validated<T> infrastructure
- OWASP Cheat Sheets: SQL Injection, XSS, OS Command Injection, File Upload
