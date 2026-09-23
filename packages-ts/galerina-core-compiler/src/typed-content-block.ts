import {
  FUNGI_BLOCK_004,
  FUNGI_BLOCK_005,
  FUNGI_BLOCK_006,
  type CompilerDiagnostic,
  type SourceLocation,
} from "./core-syntax-safety.js";

export interface TypedContentBinding {
  readonly name: string;
  readonly type: string;
}

export interface TypedContentEnvironment {
  readonly bindings: readonly TypedContentBinding[];
}

export interface TypedContentBlockInput {
  readonly blockType: "html" | "dom" | "script" | "css";
  readonly marker: string;
  readonly content: string;
  readonly file: string;
  readonly startLine: number;
  readonly environment?: TypedContentEnvironment;
}

interface InterpolationSite {
  readonly name: string;
  readonly location: SourceLocation;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const MAX_TYPED_CONTENT_CHARS = 1_048_576;
export const MAX_TYPED_CONTENT_INTERPOLATIONS = 4_096;

const HTML_INJECTION = [
  /<\s*script\b/i,
  /javascript\s*:/i,
  /\bon(?:error|load|click|mouseover)\s*=/i,
] as const;
const SCRIPT_INJECTION = [
  /\beval\s*\(/i,
  /\bFunction\s*\(/,
  /\bdocument\.write\s*\(/i,
] as const;
const CSS_INJECTION = [
  /expression\s*\(/i,
  /javascript\s*:/i,
] as const;

function advanceLocation(
  content: string,
  from: number,
  to: number,
  line: number,
  column: number,
): { line: number; column: number } {
  let nextLine = line;
  let nextColumn = column;
  const end = to < 0 ? content.length : Math.min(to, content.length);
  for (let i = from; i < end; i += 1) {
    if (content[i] === "\n") {
      nextLine += 1;
      nextColumn = 1;
    } else {
      nextColumn += 1;
    }
  }
  return { line: nextLine, column: nextColumn };
}

function locationAt(
  file: string,
  startLine: number,
  content: string,
  index: number,
): SourceLocation {
  const loc = advanceLocation(content, 0, index, startLine, 1);
  return { file, line: loc.line, column: loc.column };
}

function diagnostic(
  spec: { readonly code: string; readonly name: string; readonly severity: "error"; readonly message: string },
  message: string,
  location: SourceLocation,
  suggestedFix: string,
): CompilerDiagnostic {
  return {
    code: spec.code,
    name: spec.name,
    severity: spec.severity,
    message,
    location,
    suggestedFix,
  };
}

function isProtectedSecretType(type: string): boolean {
  const trimmed = type.trim();
  if (trimmed === "ProtectedSecret" || trimmed === "Secret") return true;
  if (trimmed.startsWith("protected ")) return true;
  return false;
}

function lookupBindingType(
  environment: TypedContentEnvironment | undefined,
  name: string,
): string | undefined {
  if (environment === undefined) return undefined;
  for (let index = environment.bindings.length - 1; index >= 0; index -= 1) {
    const binding = environment.bindings[index];
    if (binding?.name === name) return binding.type;
  }
  return undefined;
}

function scanInterpolations(
  content: string,
  file: string,
  startLine: number,
): { readonly sites: InterpolationSite[]; readonly diagnostics: CompilerDiagnostic[] } {
  const sites: InterpolationSite[] = [];
  const diagnostics: CompilerDiagnostic[] = [];
  let index = 0;
  let line = startLine;
  let column = 1;
  while (index < content.length) {
    const open = content.indexOf("{{", index);
    if (open < 0) break;
    const loc = advanceLocation(content, index, open, line, column);
    line = loc.line;
    column = loc.column;
    const location = { file, line, column };
    let cursor = open + 2;
    while (cursor < content.length && (content[cursor] === " " || content[cursor] === "\t")) {
      cursor += 1;
    }
    const nameStart = cursor;
    while (cursor < content.length && /[A-Za-z0-9_]/.test(content[cursor] ?? "")) {
      cursor += 1;
    }
    const name = content.slice(nameStart, cursor);
    while (cursor < content.length && (content[cursor] === " " || content[cursor] === "\t")) {
      cursor += 1;
    }
    if (content.slice(cursor, cursor + 2) !== "}}" || !IDENT.test(name)) {
      diagnostics.push(diagnostic(
        FUNGI_BLOCK_005,
        FUNGI_BLOCK_005.message,
        location,
        "Use a closed {{ identifier }} interpolation bound in the surrounding flow.",
      ));
      index = open + 2;
      const skipped = advanceLocation(content, open, index, line, column);
      line = skipped.line;
      column = skipped.column;
      continue;
    }
    sites.push({ name, location });
    if (sites.length > MAX_TYPED_CONTENT_INTERPOLATIONS) {
      diagnostics.push(diagnostic(
        FUNGI_BLOCK_005,
        `Typed content interpolation count exceeds the ${MAX_TYPED_CONTENT_INTERPOLATIONS} host bound.`,
        location,
        "Reduce interpolations in this block; the validator is single-pass and count-capped.",
      ));
      return { sites, diagnostics };
    }
    index = cursor + 2;
    const consumed = advanceLocation(content, open, index, line, column);
    line = consumed.line;
    column = consumed.column;
  }
  return { sites, diagnostics };
}

export function validateTypedContentBlock(
  input: TypedContentBlockInput,
): readonly CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  if (input.content.length > MAX_TYPED_CONTENT_CHARS) {
    return Object.freeze([
      diagnostic(
        FUNGI_BLOCK_005,
        `Typed content block exceeds the ${MAX_TYPED_CONTENT_CHARS}-character host bound.`,
        locationAt(input.file, input.startLine, input.content, 0),
        "Split the block or reduce interpolated payload size before type-checking.",
      ),
    ]);
  }
  const scanned = scanInterpolations(input.content, input.file, input.startLine);
  diagnostics.push(...scanned.diagnostics);

  const injection = input.blockType === "script"
    ? SCRIPT_INJECTION
    : input.blockType === "css"
      ? CSS_INJECTION
      : HTML_INJECTION;
  for (const pattern of injection) {
    if (pattern.test(input.content)) {
      diagnostics.push(diagnostic(
        FUNGI_BLOCK_006,
        FUNGI_BLOCK_006.message,
        locationAt(input.file, input.startLine, input.content, 0),
        "Remove the refused construct. This is a closed injection list, not a full HTML/JS/CSS parser.",
      ));
      break;
    }
  }

  for (const site of scanned.sites) {
    const type = lookupBindingType(input.environment, site.name);
    if (type === undefined) {
      diagnostics.push(diagnostic(
        FUNGI_BLOCK_005,
        `Typed content interpolation '{{ ${site.name} }}' is not bound in the type environment.`,
        site.location,
        `Declare '{{ ${site.name} }}' as a parameter or local before interpolating it.`,
      ));
      continue;
    }
    if (isProtectedSecretType(type)) {
      diagnostics.push(diagnostic(
        FUNGI_BLOCK_004,
        FUNGI_BLOCK_004.message,
        site.location,
        `Remove '{{ ${site.name} }}' or pass a non-protected value. Name matching is not admission.`,
      ));
    }
  }

  return Object.freeze(diagnostics);
}
