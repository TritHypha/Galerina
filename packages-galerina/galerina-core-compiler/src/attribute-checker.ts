// =============================================================================
// Galerina — Attribute-directive governance gate (RD-0234b Class D closure)
//
// The parser accepts feature-gate attribute directives of the form
//   @experimental_profile(name: "…", status: "…") { …forward-looking code… }
// and, because that inner syntax is not yet compiled by Stage A, it drops the
// wrapped block from the AST (parser.ts parseAttributeDirective →
// skipBalancedBraces, leaving a `{ kind:"block", value:"__experimental__" }`
// placeholder). RD-0234b proved this is a GOVERNANCE ESCAPE HATCH: arbitrary
// governed code (secret reads, network egress, eval, undeclared effects) placed
// inside the block is invisible to EVERY checker — taint, effects, value-state,
// governance — yet the file still mints a signed .lmanifest.
//
// Deny-by-default closure: a wrapped attribute block is NOT admitted (its
// contents are unverifiable), and an unrecognised `@name` directive is rejected
// outright. These are hard errors in every mode — there is no legitimate reason
// to sign an artifact whose source contains code the compiler refuses to read.
// When the forward-looking syntax actually ships, the block will be parsed and
// governed like any other code, and this gate relaxes to allow the *verified*
// form (behind an explicit --enable-experimental-profile=<name> opt-in).
// =============================================================================

import { type AstNode } from "./parser.js";

// Deny-by-default: the closed set of attribute directives the compiler
// recognises AS A BARE ANNOTATION (no body). Any other `@name` is rejected.
const KNOWN_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set<string>([
  "experimental_profile",
]);

export interface AttributeDiagnostic {
  readonly code: string;
  readonly name: string;
  readonly severity: "error";
  readonly message: string;
  readonly location?: { readonly line: number; readonly column: number };
}

export interface AttributeCheckResult {
  readonly diagnostics: AttributeDiagnostic[];
}

/** FUNGI-ATTR-001: an attribute directive wraps a block the compiler does not verify. */
export const FUNGI_ATTR_001 = {
  code: "FUNGI-ATTR-001",
  name: "UNVERIFIED_ATTRIBUTE_BLOCK",
  severity: "error" as const,
  message:
    "Attribute directive wraps a block the compiler does not parse or verify — its contents are invisible to every effect/taint/value-state/governance check, yet the artifact would still sign. Deny-by-default (RD-0234b Class D): such blocks are not admitted. Remove the block, or wait for the release that compiles this forward-looking syntax under an explicit --enable-experimental-profile opt-in.",
} as const;

/** FUNGI-ATTR-002: an unrecognised attribute directive. */
export const FUNGI_ATTR_002 = {
  code: "FUNGI-ATTR-002",
  name: "UNKNOWN_ATTRIBUTE_DIRECTIVE",
  severity: "error" as const,
  message:
    "Unknown attribute directive — rejected (deny-by-default). Only recognised attribute directives are permitted; an unrecognised '@name' may silently alter, gate, or hide governed code.",
} as const;

export const ATTRIBUTE_DIAGNOSTICS = [FUNGI_ATTR_001, FUNGI_ATTR_002] as const;

/**
 * True when an attributeDecl carries a wrapped `{ … }` body. parseAttributeDirective
 * appends the body as the LAST child: a `block` node whose value is "__experimental__"
 * exactly when a brace-block was present (a bodyless `@x(...)` appends a valueless
 * `block` placeholder instead). Matching on that marker is how we tell "had a body
 * (contents erased)" from "bare annotation".
 */
function hasWrappedBody(node: AstNode): boolean {
  return (node.children ?? []).some(
    (c) => c.kind === "block" && c.value === "__experimental__",
  );
}

function locOf(node: AstNode): AttributeDiagnostic["location"] {
  const l = node.location;
  if (l?.line !== undefined && l?.column !== undefined) {
    return { line: l.line, column: l.column };
  }
  return undefined;
}

function walk(node: AstNode, out: AttributeDiagnostic[]): void {
  if (node.kind === "attributeDecl") {
    const name = node.value ?? "unknown";
    const loc = locOf(node);
    const where = loc ? { location: loc } : {};
    if (!KNOWN_ATTRIBUTE_NAMES.has(name)) {
      out.push({ ...FUNGI_ATTR_002, ...where,
        message: `Unknown attribute directive '@${name}'. ${FUNGI_ATTR_002.message}` });
    } else if (hasWrappedBody(node)) {
      out.push({ ...FUNGI_ATTR_001, ...where,
        message: `Attribute directive '@${name} { … }' wraps a block the compiler does not verify. ${FUNGI_ATTR_001.message}` });
    }
  }
  for (const child of node.children ?? []) walk(child, out);
}

/**
 * Walk the AST and reject attribute directives that hide governed code or use an
 * unrecognised name. See file header for the threat model (RD-0234b Class D).
 */
export function checkAttributeDirectives(ast: AstNode): AttributeCheckResult {
  const diagnostics: AttributeDiagnostic[] = [];
  walk(ast, diagnostics);
  return { diagnostics };
}
