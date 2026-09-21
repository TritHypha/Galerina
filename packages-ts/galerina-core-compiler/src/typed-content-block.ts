import {
  FUNGI_BLOCK_004,
  FUNGI_BLOCK_005,
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

function locationAt(
  file: string,
  startLine: number,
  content: string,
  index: number,
): SourceLocation {
  let line = startLine;
  let column = 1;
  for (let i = 0; i < index; i += 1) {
    if (content[i] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { file, line, column };
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
  while (index < content.length) {
    const open = content.indexOf("{{", index);
    if (open < 0) break;
    const location = locationAt(file, startLine, content, open);
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
      continue;
    }
    sites.push({ name, location });
    index = cursor + 2;
  }
  return { sites, diagnostics };
}

export function validateTypedContentBlock(
  input: TypedContentBlockInput,
): readonly CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  const scanned = scanInterpolations(input.content, input.file, input.startLine);
  diagnostics.push(...scanned.diagnostics);

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
