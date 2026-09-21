export interface SourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface CompilerDiagnostic {
  readonly code: string;
  readonly name: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly location?: SourceLocation;
  readonly suggestedFix?: string;
}

export interface CompilerResult {
  readonly ok: boolean;
  readonly diagnostics: readonly CompilerDiagnostic[];
  readonly reports: readonly string[];
}

export interface CompilerSourceText {
  readonly file: string;
  readonly text: string;
}

export interface CoreSyntaxSafetyOptions {
  readonly scanSecrets?: boolean;
  readonly scanUnsafeDynamicCode?: boolean;
}

type ContentBlockType = "html" | "dom" | "script" | "css";

interface ContentBlockScope {
  readonly blockType: ContentBlockType;
  readonly marker: string;
  readonly startLine: number;
}

type ContentBlockOpenResult =
  | { readonly kind: "entered"; readonly scope: ContentBlockScope }
  | { readonly kind: "unknown_type"; readonly diagnostics: readonly CompilerDiagnostic[] };

type KnownCoreType = "Bool" | "Tri" | "Decision";

interface KnownSymbol {
  readonly name: string;
  readonly type: KnownCoreType;
  readonly location: SourceLocation;
}

interface FlowScope {
  readonly kind:
    | "flow"
    | "secure flow"
    | "pure flow"
    | "guarded flow"
    | "privileged flow"
    | "unsafe flow"
    | "experimental flow"
    | "unsafe block";
  readonly startLine: number;
  readonly braceDepth: number;
}

interface MatchBlock {
  readonly symbol: KnownSymbol;
  readonly startLine: number;
  readonly braceDepth: number;
  readonly cases: Set<string>;
}


export const FUNGI_SYNTAX_001 = {
  code: "FUNGI-SYNTAX-001",
  name: "VAR_NOT_SUPPORTED",
  severity: "error",
  message: "Galerina does not support var. Use let for immutable bindings or mut for mutable bindings.",
} as const;

export const FUNGI_SYNTAX_002 = {
  code: "FUNGI-SYNTAX-002",
  name: "CONST_NOT_SUPPORTED",
  severity: "error",
  message: "Galerina does not support const. Use let for immutable bindings or readonly for read-only values.",
} as const;

export const FUNGI_BINDING_001 = {
  code: "FUNGI-BINDING-001",
  name: "IMMUTABLE_LET_REASSIGNMENT",
  severity: "error",
  message: "Cannot reassign immutable let binding. Use mut only if reassignment is required.",
} as const;

export const FUNGI_BINDING_002 = {
  code: "FUNGI-BINDING-002",
  name: "READONLY_REASSIGNMENT",
  severity: "error",
  message: "Cannot reassign readonly binding.",
} as const;

export const FUNGI_BINDING_003 = {
  code: "FUNGI-BINDING-003",
  name: "READONLY_PROPERTY_MUTATION",
  severity: "error",
  message: "Cannot mutate a value through a readonly binding.",
} as const;

export const FUNGI_BINDING_004 = {
  code: "FUNGI-BINDING-004",
  name: "MUT_IN_PURE_CONTEXT",
  severity: "error",
  message: "mut binding used where mutation is forbidden. Use let or a functional accumulator (fold, count, filter).",
} as const;

export const FUNGI_RAWPTR_001 = {
  code: "FUNGI-RAWPTR-001",
  name: "RAW_POINTER_OUTSIDE_UNSAFE",
  severity: "error",
  message: "Raw pointer access is not allowed in normal Galerina code. Move this into an approved unsafe block with declared reason and fallback.",
} as const;

export const FUNGI_BLOCK_001 = {
  code: "FUNGI-BLOCK-001",
  name: "UNKNOWN_CONTENT_BLOCK_TYPE",
  severity: "error",
  message: "Unknown typed content block type. Valid types are: html, dom, script, css.",
} as const;

export const FUNGI_BLOCK_002 = {
  code: "FUNGI-BLOCK-002",
  name: "UNCLOSED_CONTENT_BLOCK",
  severity: "error",
  message: "Typed content block is never closed. The closing marker must appear alone at the start of a line.",
} as const;

export const FUNGI_BLOCK_003 = {
  code: "FUNGI-BLOCK-003",
  name: "MISMATCHED_CONTENT_BLOCK_MARKER",
  severity: "error",
  message: "Typed content block closing marker does not match the opening marker.",
} as const;

export const FUNGI_BLOCK_004 = {
  code: "FUNGI-BLOCK-004",
  name: "SECRET_IN_CONTENT_BLOCK",
  severity: "error",
  message: "ProtectedSecret cannot be emitted into a typed content block.",
} as const;

export const FUNGI_BLOCK_005 = {
  code: "FUNGI-BLOCK-005",
  name: "INVALID_CONTENT_INTERPOLATION",
  severity: "error",
  message: "Typed content interpolation must be a closed {{ identifier }} bound in the type environment.",
} as const;

export const FUNGI_MEMORY_008 = {
  code: "FUNGI-MEMORY-008",
  name: "UNSAFE_MEMORY_REQUIRES_FALLBACK",
  severity: "error",
  message: "Unsafe memory operation must declare a safe fallback. Every unsafe block requires a fallback flow.",
} as const;

export const FUNGI_SAFETY_001 = {
  code: "FUNGI-SAFETY-001",
  name: "TRI_BRANCH_CONDITION",
  severity: "error",
  message: "Tri values must not be used directly as branch conditions. Use exhaustive match or an explicit conversion policy.",
} as const;

export const FUNGI_SAFETY_002 = {
  code: "FUNGI-SAFETY-002",
  name: "UNSAFE_LOGIC_ASSIGNMENT",
  severity: "error",
  message: "Implicit conversion between Tri, Bool, and Decision is not allowed. Use an explicit policy-bearing conversion flow.",
} as const;

export const FUNGI_SAFETY_003 = {
  code: "FUNGI-SAFETY-003",
  name: "TRI_UNKNOWN_AS_TRUE",
  severity: "error",
  message: "Converting Tri unknown to true requires explicit policy justification. In secure flows, this is always an error.",
} as const;

export const FUNGI_SAFETY_004 = {
  code: "FUNGI-SAFETY-004",
  name: "SECRET_LITERAL",
  severity: "error",
  message: "Source must not contain raw secret literals. Use SecureString or an environment reference.",
} as const;

export const FUNGI_SAFETY_005 = {
  code: "FUNGI-SAFETY-005",
  name: "UNSAFE_DYNAMIC_CODE",
  severity: "error",
  message: "Unsafe dynamic code execution must not appear in Galerina source. Declare intent and use a governed flow.",
} as const;

export const FUNGI_SAFETY_006 = {
  code: "FUNGI-SAFETY-006",
  name: "TRI_MATCH_NOT_EXHAUSTIVE",
  severity: "error",
  message: "Tri match must handle all three cases: Positive, Neutral, and Negative.",
} as const;

const VALID_CONTENT_BLOCK_TYPES: ReadonlySet<string> = new Set<ContentBlockType>([
  "html", "dom", "script", "css",
]);

const TRI_CASES = ["Positive", "Neutral", "Negative"] as const;

const CONTENT_BLOCK_OPEN_RE =
  /^\s*(?:print\s+)?([a-zA-Z][a-zA-Z0-9_]*)\s+<<([A-Z_][A-Z0-9_]*)\s*$/;

export function validateCoreSyntaxSafety(
  source: CompilerSourceText,
  options: CoreSyntaxSafetyOptions = {},
): CompilerResult {
  const diagnostics: CompilerDiagnostic[] = [];
  const symbols = new Map<string, KnownSymbol>();
  const lines = source.text.split(/\r?\n/);
  let flowScope: FlowScope | undefined;
  let matchBlock: MatchBlock | undefined;
  let contentBlockScope: ContentBlockScope | undefined;
  let braceDepth = 0;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    // ── Typed content block tracking ─────────────────────────────────────
    // When inside a block, skip all other checks. Brace depth is not updated
    // so that { } in HTML/CSS/JS do not affect Galerina scope tracking.
    if (contentBlockScope !== undefined) {
      if (trimmed === contentBlockScope.marker) {
        contentBlockScope = undefined;
      }
      return;
    }

    // Detect typed content block opens (html/dom/script/css <<MARKER).
    const blockOpen = parseContentBlockOpen(source.file, line, lineNumber);
    if (blockOpen !== undefined) {
      if (blockOpen.kind === "entered") {
        contentBlockScope = blockOpen.scope;
      } else {
        diagnostics.push(...blockOpen.diagnostics);
      }
      return; // block opener line needs no further processing
    }
    // ─────────────────────────────────────────────────────────────────────

    collectFlowSymbols(source.file, line, lineNumber, symbols);
    collectVariableSymbol(source.file, line, lineNumber, symbols);

    const flowStart = parseFlowStart(line, lineNumber, braceDepth);

    if (flowStart !== undefined) {
      flowScope = flowStart;
    }

    if (matchBlock !== undefined) {
      collectMatchCases(line, matchBlock);
    }

    if (matchBlock === undefined) {
      matchBlock = parseTriMatchStart(source.file, line, lineNumber, braceDepth, symbols);
    }

    diagnostics.push(
      ...detectTriBranchCondition(source.file, line, lineNumber, symbols),
      ...detectUnsafeCoreAssignment(source.file, line, lineNumber, symbols),
      ...detectRiskyTriBoolPolicy(source.file, line, lineNumber, flowScope),
      ...detectUnsupportedBindingKeyword(source.file, line, lineNumber),
      ...detectMutInPureFlow(source.file, line, lineNumber, flowScope),
      ...detectUnsafeBlockWithoutReason(source.file, line, lineNumber),
      ...detectRawPointerOutsideUnsafe(source.file, line, lineNumber, flowScope),
    );

    if (options.scanSecrets ?? true) {
      diagnostics.push(...detectSecretLiteral(source.file, line, lineNumber));
    }

    if (options.scanUnsafeDynamicCode ?? true) {
      diagnostics.push(...detectUnsafeDynamicCode(source.file, line, lineNumber));
    }

    braceDepth += countBraceDelta(line);

    if (
      matchBlock !== undefined &&
      braceDepth < matchBlock.braceDepth
    ) {
      diagnostics.push(...validateTriMatchExhaustive(source.file, matchBlock));
      matchBlock = undefined;
    }

    if (flowScope !== undefined && braceDepth < flowScope.braceDepth) {
      flowScope = undefined;
    }

    if (trimmed === "") {
      return;
    }
  });

  if (matchBlock !== undefined) {
    diagnostics.push(...validateTriMatchExhaustive(source.file, matchBlock));
  }

  // Report any typed content block that was opened but never closed.
  if (contentBlockScope !== undefined) {
    diagnostics.push(
      createCompilerDiagnostic(
        FUNGI_BLOCK_002.code,
        FUNGI_BLOCK_002.name,
        FUNGI_BLOCK_002.severity,
        `${contentBlockScope.blockType} block opened with marker ${contentBlockScope.marker} is never closed.`,
        { file: source.file, line: contentBlockScope.startLine, column: 1 },
      ),
    );
  }

  return {
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    diagnostics,
    reports: [],
  };
}

function collectFlowSymbols(
  file: string,
  line: string,
  lineNumber: number,
  symbols: Map<string, KnownSymbol>,
): void {
  const flowMatch = line.match(
    /^\s*(?:secure\s+|pure\s+)?flow\s+[A-Za-z_][A-Za-z0-9_]*\s*\(([^)]*)\)/,
  );

  if (flowMatch?.[1] === undefined) {
    return;
  }

  for (const parameter of flowMatch[1].split(",")) {
    const parameterMatch = parameter.match(
      /\b([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(Bool|Tri|Decision)\b/,
    );

    if (parameterMatch?.[1] === undefined || parameterMatch[2] === undefined) {
      continue;
    }

    symbols.set(parameterMatch[1], {
      name: parameterMatch[1],
      type: parameterMatch[2] as KnownCoreType,
      location: { file, line: lineNumber, column: line.indexOf(parameterMatch[1]) + 1 },
    });
  }
}

function collectVariableSymbol(
  file: string,
  line: string,
  lineNumber: number,
  symbols: Map<string, KnownSymbol>,
): void {
  const variableMatch = line.match(
    /^\s*(?:let|const)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(Bool|Tri|Decision)\b/,
  );

  if (variableMatch?.[1] === undefined || variableMatch[2] === undefined) {
    return;
  }

  symbols.set(variableMatch[1], {
    name: variableMatch[1],
    type: variableMatch[2] as KnownCoreType,
    location: { file, line: lineNumber, column: line.indexOf(variableMatch[1]) + 1 },
  });
}

function parseFlowStart(
  line: string,
  lineNumber: number,
  braceDepth: number,
): FlowScope | undefined {
  // Match: [safety-level] flow <name> or unsafe block <name>
  const flowMatch = line.match(
    /^\s*(secure\s+|pure\s+|guarded\s+|privileged\s+|unsafe\s+|experimental\s+)?(?:(flow)\b|(block)\b)/,
  );

  if (flowMatch === null) {
    return undefined;
  }

  // "unsafe block" is distinct from "unsafe flow"
  const isBlock = flowMatch[3] === "block";
  const prefix = flowMatch[1]?.trim() ?? "";

  let kind: FlowScope["kind"];

  if (isBlock && prefix === "unsafe") {
    kind = "unsafe block";
  } else {
    switch (prefix) {
      case "secure":       kind = "secure flow";       break;
      case "pure":         kind = "pure flow";         break;
      case "guarded":      kind = "guarded flow";      break;
      case "privileged":   kind = "privileged flow";   break;
      case "unsafe":       kind = "unsafe flow";       break;
      case "experimental": kind = "experimental flow"; break;
      default:             kind = "flow";              break;
    }
  }

  return {
    kind,
    startLine: lineNumber,
    braceDepth: braceDepth + Math.max(countBraceDelta(line), 1),
  };
}

function parseTriMatchStart(
  file: string,
  line: string,
  lineNumber: number,
  braceDepth: number,
  symbols: Map<string, KnownSymbol>,
): MatchBlock | undefined {
  const match = line.match(/^\s*match\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/);

  if (match?.[1] === undefined) {
    return undefined;
  }

  const symbol = symbols.get(match[1]);

  if (symbol?.type !== "Tri") {
    return undefined;
  }

  return {
    symbol: {
      ...symbol,
      location: { file, line: lineNumber, column: line.indexOf(match[1]) + 1 },
    },
    startLine: lineNumber,
    braceDepth: braceDepth + 1,
    cases: new Set<string>(),
  };
}

function collectMatchCases(line: string, matchBlock: MatchBlock): void {
  const caseMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=>/);

  if (caseMatch?.[1] !== undefined) {
    matchBlock.cases.add(caseMatch[1]);
  }
}

function detectTriBranchCondition(
  file: string,
  line: string,
  lineNumber: number,
  symbols: Map<string, KnownSymbol>,
): readonly CompilerDiagnostic[] {
  const conditionMatch = line.match(/^\s*if\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/);
  const symbol = conditionMatch?.[1] === undefined ? undefined : symbols.get(conditionMatch[1]);

  if (symbol?.type !== "Tri") {
    return [];
  }

  return [
    createCompilerDiagnostic(
      FUNGI_SAFETY_001.code,
      FUNGI_SAFETY_001.name,
      FUNGI_SAFETY_001.severity,
      FUNGI_SAFETY_001.message,
      { file, line: lineNumber, column: line.indexOf(symbol.name) + 1 },
    ),
  ];
}

function detectUnsafeCoreAssignment(
  file: string,
  line: string,
  lineNumber: number,
  symbols: Map<string, KnownSymbol>,
): readonly CompilerDiagnostic[] {
  const assignmentMatch = line.match(
    /^\s*(?:let|const)\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*(Bool|Tri|Decision)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\b/,
  );

  if (assignmentMatch?.[1] === undefined || assignmentMatch[2] === undefined) {
    return [];
  }

  const targetType = assignmentMatch[1] as KnownCoreType;
  const sourceSymbol = symbols.get(assignmentMatch[2]);

  if (sourceSymbol === undefined || sourceSymbol.type === targetType) {
    return [];
  }

  if (
    (sourceSymbol.type === "Tri" && (targetType === "Bool" || targetType === "Decision")) ||
    (sourceSymbol.type === "Decision" && targetType === "Tri")
  ) {
    return [
      createCompilerDiagnostic(
        FUNGI_SAFETY_002.code,
        FUNGI_SAFETY_002.name,
        FUNGI_SAFETY_002.severity,
        `${sourceSymbol.type} must not implicitly convert to ${targetType}. Use an explicit policy-bearing conversion flow.`,
        { file, line: lineNumber, column: line.indexOf(sourceSymbol.name) + 1 },
      ),
    ];
  }

  return [];
}

function detectRiskyTriBoolPolicy(
  file: string,
  line: string,
  lineNumber: number,
  flowScope: FlowScope | undefined,
): readonly CompilerDiagnostic[] {
  const secure = flowScope?.kind === "secure flow";

  // Case 1: an EXPLICIT `unknown_as: true` / `unknown_as_true` policy. This was
  // always flagged — converting the indeterminate (Neutral/HOLD) state to `true`
  // is risky, and forbidden outright in secure flows.
  if (/\bunknown_as(?:\s*:\s*true|_true)\b/.test(line)) {
    return [
      createCompilerDiagnostic(
        FUNGI_SAFETY_003.code,
        FUNGI_SAFETY_003.name,
        secure ? "error" : "warning",
        secure
          ? "secure flow must not convert Tri unknown to true."
          : "Converting Tri unknown to true is risky and must be justified by policy.",
        { file, line: lineNumber, column: line.search(/\bunknown_as/) + 1 },
      ),
    ];
  }

  // Case 2 (FAIL-CLOSED, #153): a Tri→Bool / Tri→Decision conversion with NO
  // explicit policy for the unknown (Neutral/HOLD) state. Previously this was
  // silently accepted — the HOLD state could collapse to a default value (and a
  // truthy default is the dangerous case). Deny-by-default: every conversion
  // must declare how the unknown state is handled via an `unknown_as:` clause.
  const conversionMatch = line.match(/\b[Tt]ri\.(toBool|toDecision)\s*\(/);
  if (conversionMatch !== null && !/\bunknown_as\b/.test(line)) {
    const method = conversionMatch[1];
    const col = line.search(/\b[Tt]ri\.(?:toBool|toDecision)/);
    return [
      createCompilerDiagnostic(
        FUNGI_SAFETY_003.code,
        FUNGI_SAFETY_003.name,
        secure ? "error" : "warning",
        secure
          ? `secure flow must not call Tri.${method} without an explicit unknown-state policy (e.g. unknown_as: Negative). The Neutral/HOLD state must never silently coerce to a truthy default.`
          : `Tri.${method} without an explicit unknown-state policy is risky: the Neutral/HOLD state may silently coerce to a default. Declare unknown_as: to make the conversion fail-closed.`,
        { file, line: lineNumber, column: col >= 0 ? col + 1 : 1 },
      ),
    ];
  }

  return [];
}

function detectSecretLiteral(
  file: string,
  line: string,
  lineNumber: number,
): readonly CompilerDiagnostic[] {
  const secretMatch = line.match(
    /\b(api[_-]?key|token|secret|password)\b\s*[:=]\s*"([^"]+)"/i,
  );

  if (secretMatch?.[2] === undefined || isPlaceholderSecret(secretMatch[2])) {
    return [];
  }

  return [
    createCompilerDiagnostic(
      FUNGI_SAFETY_004.code,
      FUNGI_SAFETY_004.name,
      FUNGI_SAFETY_004.severity,
      FUNGI_SAFETY_004.message,
      { file, line: lineNumber, column: line.indexOf(secretMatch[2]) + 1 },
    ),
  ];
}

function detectUnsafeDynamicCode(
  file: string,
  line: string,
  lineNumber: number,
): readonly CompilerDiagnostic[] {
  if (!/\b(?:eval|Function|unsafe_exec|raw_shell)\s*\(/.test(line)) {
    return [];
  }

  return [
    createCompilerDiagnostic(
      FUNGI_SAFETY_005.code,
      FUNGI_SAFETY_005.name,
      FUNGI_SAFETY_005.severity,
      FUNGI_SAFETY_005.message,
      { file, line: lineNumber, column: Math.max(line.search(/\b(?:eval|Function|unsafe_exec|raw_shell)\s*\(/) + 1, 1) },
    ),
  ];
}

function validateTriMatchExhaustive(
  file: string,
  matchBlock: MatchBlock,
): readonly CompilerDiagnostic[] {
  const missing = TRI_CASES.filter((triCase) => !matchBlock.cases.has(triCase));

  if (missing.length === 0) {
    return [];
  }

  return [
    createCompilerDiagnostic(
      FUNGI_SAFETY_006.code,
      FUNGI_SAFETY_006.name,
      FUNGI_SAFETY_006.severity,
      `Tri match is missing cases: ${missing.join(", ")}.`,
      { file, line: matchBlock.startLine, column: matchBlock.symbol.location.column },
    ),
  ];
}

function parseContentBlockOpen(
  file: string,
  line: string,
  lineNumber: number,
): ContentBlockOpenResult | undefined {
  const match = line.match(CONTENT_BLOCK_OPEN_RE);

  if (match === null || match[1] === undefined || match[2] === undefined) {
    return undefined;
  }

  const rawType = match[1].toLowerCase();
  const marker = match[2];

  if (!VALID_CONTENT_BLOCK_TYPES.has(rawType)) {
    return {
      kind: "unknown_type",
      diagnostics: [
        createCompilerDiagnostic(
          FUNGI_BLOCK_001.code,
          FUNGI_BLOCK_001.name,
          FUNGI_BLOCK_001.severity,
          `Unknown typed content block type "${rawType}". Valid types are: html, dom, script, css.`,
          { file, line: lineNumber, column: line.search(new RegExp(`\\b${match[1]}\\b`)) + 1 },
        ),
      ],
    };
  }

  return {
    kind: "entered",
    scope: {
      blockType: rawType as ContentBlockType,
      marker,
      startLine: lineNumber,
    },
  };
}

function detectUnsupportedBindingKeyword(
  file: string,
  line: string,
  lineNumber: number,
): readonly CompilerDiagnostic[] {
  const trimmed = line.trim();

  // Ignore comment lines and doc comments
  if (trimmed.startsWith("//") || trimmed.startsWith("///")) {
    return [];
  }

  // Detect `var <identifier>` or `var <identifier>:` as a statement
  if (/^\s*\bvar\s+[A-Za-z_]/.test(line)) {
    return [
      createCompilerDiagnostic(
        FUNGI_SYNTAX_001.code,
        FUNGI_SYNTAX_001.name,
        FUNGI_SYNTAX_001.severity,
        FUNGI_SYNTAX_001.message,
        { file, line: lineNumber, column: line.search(/\bvar\b/) + 1 },
      ),
    ];
  }

  // Detect `const <identifier>` or `const <identifier>:` as a statement
  // Exclude TypeScript-style `export const` — this scanner runs on .fungi files
  if (/^\s*\bconst\s+[A-Za-z_]/.test(line)) {
    return [
      createCompilerDiagnostic(
        FUNGI_SYNTAX_002.code,
        FUNGI_SYNTAX_002.name,
        FUNGI_SYNTAX_002.severity,
        FUNGI_SYNTAX_002.message,
        { file, line: lineNumber, column: line.search(/\bconst\b/) + 1 },
      ),
    ];
  }

  return [];
}

function detectMutInPureFlow(
  file: string,
  line: string,
  lineNumber: number,
  flowScope: FlowScope | undefined,
): readonly CompilerDiagnostic[] {
  if (flowScope?.kind !== "pure flow") {
    return [];
  }

  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("///")) {
    return [];
  }

  // Match `mut <identifier>` as a binding declaration (not a type name or argument label)
  const mutMatch = line.match(/^\s*\bmut\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
  if (mutMatch === null || mutMatch[1] === undefined) {
    return [];
  }

  return [
    createCompilerDiagnostic(
      FUNGI_BINDING_004.code,
      FUNGI_BINDING_004.name,
      FUNGI_BINDING_004.severity,
      `mut binding "${mutMatch[1]}" is not allowed in a pure flow. Use let or a functional accumulator (fold, count, filter).`,
      { file, line: lineNumber, column: line.search(/\bmut\b/) + 1 },
    ),
  ];
}

function detectUnsafeBlockWithoutReason(
  file: string,
  line: string,
  lineNumber: number,
): readonly CompilerDiagnostic[] {
  // Only fire on lines that begin an unsafe block scope
  if (!/^\s*\bunsafe\s+block\b/.test(line)) {
    return [];
  }

  // If `reason` keyword already appears on the same line, declaration is present
  if (/\breason\b/.test(line)) {
    return [];
  }

  return [
    createCompilerDiagnostic(
      FUNGI_MEMORY_008.code,
      FUNGI_MEMORY_008.name,
      FUNGI_MEMORY_008.severity,
      `unsafe block must declare a reason on the opening line. Expected: unsafe block <name> reason "<justification>" fallback <safeFlow> { ... }`,
      { file, line: lineNumber, column: line.search(/\bunsafe\b/) + 1 },
    ),
  ];
}

function detectRawPointerOutsideUnsafe(
  file: string,
  line: string,
  lineNumber: number,
  flowScope: FlowScope | undefined,
): readonly CompilerDiagnostic[] {
  // Pointer access is permitted inside unsafe scopes
  if (flowScope?.kind === "unsafe flow" || flowScope?.kind === "unsafe block") {
    return [];
  }

  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("///")) {
    return [];
  }

  // Detect `*identifier` as a pointer dereference — after `=`, `(`, or at start
  const ptrMatch = line.match(/(?:^|[=(,\s])\*([A-Za-z_][A-Za-z0-9_]*)\b/);
  if (ptrMatch === null) {
    return [];
  }

  const column = line.search(/(?:^|[=(,\s])\*[A-Za-z_]/) + 1;

  return [
    createCompilerDiagnostic(
      FUNGI_RAWPTR_001.code,
      FUNGI_RAWPTR_001.name,
      FUNGI_RAWPTR_001.severity,
      FUNGI_RAWPTR_001.message,
      { file, line: lineNumber, column },
    ),
  ];
}

function createCompilerDiagnostic(
  code: string,
  name: string,
  severity: CompilerDiagnostic["severity"],
  message: string,
  location?: SourceLocation,
  suggestedFix?: string,
): CompilerDiagnostic {
  return {
    code,
    name,
    severity,
    message,
    ...(location === undefined ? {} : { location }),
    ...(suggestedFix === undefined ? {} : { suggestedFix }),
  };
}

function countBraceDelta(line: string): number {
  let delta = 0;

  for (const character of line) {
    if (character === "{") {
      delta += 1;
    }

    if (character === "}") {
      delta -= 1;
    }
  }

  return delta;
}

function isPlaceholderSecret(value: string): boolean {
  return /^(?:example|placeholder|redacted|change-me|todo|SecureString\(redacted\))$/i.test(
    value,
  );
}
