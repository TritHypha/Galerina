import type { AstNode } from "./parser.js";
import { executableFaultHandlers } from "./resilience-inference.js";
import { flowHasBodyLocalInvariants } from "./body-local-invariants.js";

/** True for `Money` and `Money<CCY>` (the WAT emitter's inferred Money types). */
export function isMoneyWatType(t: string | undefined): boolean {
  return t === "Money" || (t !== undefined && t.startsWith("Money<"));
}

// 2026-10-02 diag-constants (Phillip 16:35 BST order): every FUNGI-WAT-* refusal is ONE exported constant
// { code, name, severity, message, suggestedFix } in FUNGI_WAT_DIAGNOSTICS, and every emit references it.
// IDs, names and the emitted (thrown) text are unchanged; the thrown Error now also carries the structured
// `code` / `diagnosticName` fields from the constant (as the I2/I3 refusals already did).
export interface WatDiagnosticDefinition {
  readonly code: `FUNGI-WAT-${string}`;
  readonly name: string;
  readonly severity: "error";
  readonly message: string;
  readonly suggestedFix: string;
}

/** The thrown refusal: unchanged message text plus the structured code fields from the constant. */
export function createWatRefusalDiagnostic(diag: WatDiagnosticDefinition, message: string): Error {
  return Object.assign(new Error(message), { code: diag.code, diagnosticName: diag.name });
}

export const FUNGI_WAT_MONEY_001 = {
  code: "FUNGI-WAT-MONEY-001",
  name: "MONEY_FORM_NOT_LOWERED",
  severity: "error",
  message:
    "a Money form other than a per-currency constructor (for example Money.gbp(\"1.00\")) is not in the WASM " +
    "host ABI; WAT emission refuses rather than operate on the opaque Money handle (fail-closed).",
  suggestedFix: "Run the flow through the governed interpreter, or use only the per-currency Money constructors.",
} as const satisfies WatDiagnosticDefinition;

export const FUNGI_WAT_DECIMAL_001 = {
  code: "FUNGI-WAT-DECIMAL-001",
  name: "DECIMAL_FORM_NOT_LOWERED",
  severity: "error",
  message:
    "a Decimal form outside the C02 host ABI is not lowered; WAT emission refuses rather than emit an " +
    "(unreachable) stub or guess a conversion or rounding policy (fail-closed).",
  suggestedFix: "Use a.divide(b, scale, mode) / a.remainder(b) with literal arguments, or run the flow through the governed interpreter.",
} as const satisfies WatDiagnosticDefinition;

export const FUNGI_WAT_METHOD_001 = {
  code: "FUNGI-WAT-METHOD-001",
  name: "UNKNOWN_METHOD_NOT_LOWERED",
  severity: "error",
  message:
    "a method call with no WASM lowering reached WAT emission; WAT emission refuses rather than emit an " +
    "(unreachable) stub or an undefined callee (fail-closed).",
  suggestedFix: "Rewrite with a lowered method form, or run the flow through the governed interpreter.",
} as const satisfies WatDiagnosticDefinition;

export const FUNGI_WAT_INT64_001 = {
  code: "FUNGI-WAT-INT64-001",
  name: "MIXED_64BIT_OP_NOT_LOWERED",
  severity: "error",
  message:
    "a 64-bit integer operation with no WASM lowering reached WAT emission; WAT emission refuses rather than " +
    "emit an (unreachable) stub or a standalone trap (fail-closed).",
  suggestedFix: "Keep both operands the same 64-bit type, or run the flow through the governed interpreter.",
} as const satisfies WatDiagnosticDefinition;

export const FUNGI_WAT_PATTERN_001 = {
  code: "FUNGI-WAT-PATTERN-001",
  name: "PATTERN_CAPABILITY_NOT_LOWERED",
  severity: "error",
  message:
    "a PatternCapability method (matchesPattern, extractGroups, replacePattern) is interpreter-only and is not " +
    "lowered to WASM; WAT emission refuses (fail-closed).",
  suggestedFix: "Run the flow through the governed interpreter; there is no pattern host ABI.",
} as const satisfies WatDiagnosticDefinition;

export const FUNGI_WAT_STMT_001 = {
  code: "FUNGI-WAT-STMT-001",
  name: "GOVERNED_OR_CLOSURE_STMT_NOT_LOWERED",
  severity: "error",
  message:
    "a requireStmt or a local fnDecl is not lowered to WASM; WAT emission refuses rather than ship an " +
    "apparently executable export (fail-closed).",
  suggestedFix: "Move the governed statement or closure out of WASM-bound code, or run the flow through the governed interpreter.",
} as const satisfies WatDiagnosticDefinition;

export const FUNGI_WAT_EFFECT_001 = {
  code: "FUNGI-WAT-EFFECT-001",
  name: "EFFECTFUL_ENTRY_NOT_LOWERED",
  severity: "error",
  message:
    "an effectful (non-WASM-exportable) flow is named in gir.entryPoints; WAT emission refuses rather than " +
    "export an (unreachable) stub (fail-closed).",
  suggestedFix: "Remove the effectful flow from the WASM entry points, or run it through the governed interpreter.",
} as const satisfies WatDiagnosticDefinition;

export const FUNGI_WAT_HOF_001 = {
  code: "FUNGI-WAT-HOF-001",
  name: "ARRAY_HOF_REQUIRES_NAMED_FLOW",
  severity: "error",
  message:
    "an array map/filter/reduce callback is not a capture-free named flow of the required arity; WAT emission " +
    "refuses rather than lower a capturing, shadowed or unresolved callback (fail-closed).",
  suggestedFix: "Pass a capture-free named unary flow (map/filter) or binary flow (reduce) identifier.",
} as const satisfies WatDiagnosticDefinition;

export const FUNGI_WAT_BODY_001 = {
  code: "FUNGI-WAT-BODY-001",
  name: "PURE_FLOW_REQUIRES_AST_BODY",
  severity: "error",
  message:
    "a pure flow has no usable AST body to lower; WAT emission refuses rather than emit a guessed identity or " +
    "default body (fail-closed).",
  suggestedFix: "Compile from source through checkProgram so the flow carries a Phase-25-lowerable AST body.",
} as const satisfies WatDiagnosticDefinition;

/** The only public WAT path takes a CheckedProgram; unchecked GIR/AST values are refused (also the checkProgram fallback code). */
export const FUNGI_WAT_CHECKED_001 = {
  code: "FUNGI-WAT-CHECKED-001",
  name: "CHECKED_PROGRAM_REQUIRED",
  severity: "error",
  message: "WAT emission requires a CheckedProgram minted by checkProgram; unchecked GIR/AST values are refused (fail-closed).",
  suggestedFix: "Call checkProgram(source, filePath) and pass its program to buildWATFromCheckedProgram.",
} as const satisfies WatDiagnosticDefinition;

/**
 * R2 (Grok Bot rounding work, 2026-09-30): the WASM host ABI admits ONLY the per-currency Money
 * constructors (__money_gbp … __money_hkd). Every other Money form — operators, comparisons, methods,
 * Money.of — has no lowering; emitting an i32 op over the opaque handle (or an `(unreachable)` stub) would
 * be a silent wrong answer or a deferred trap. Refuse at compile time, by name.
 * FUNGI-WAT-MONEY-001 — registered in the KB compiler-diagnostics.md (2026-10-01).
 */
export function refuseMoneyWat(form: string): never {
  const diag = FUNGI_WAT_MONEY_001;
  throw createWatRefusalDiagnostic(FUNGI_WAT_MONEY_001,
    `${diag.code}: Money ${form} is not in the WASM host ABI (only the per-currency constructors such as ` +
    `Money.gbp("1.00") are lowered). WAT emission refuses rather than operate on the opaque Money handle ` +
    `(fail-closed); run the flow through the governed interpreter.`,
  );
}

/**
 * K4b / R3: a Decimal form outside the C02 host ABI — mixed Decimal × Int/Float, the partial `/` and `%`
 * operators, a divide/remainder whose arguments are not (Decimal|Int, Int, "<literal mode>"), or a Decimal
 * method with no host lowering. Refused at compile time, by name, instead of an `(unreachable)` stub.
 * FUNGI-WAT-DECIMAL-001 — registered in the KB compiler-diagnostics.md (2026-10-01).
 */
export function refuseDecimalWat(detail: string): never {
  const diag = FUNGI_WAT_DECIMAL_001;
  throw createWatRefusalDiagnostic(FUNGI_WAT_DECIMAL_001,
    `${diag.code}: ${detail}. WAT emission refuses rather than emit an (unreachable) stub or guess a ` +
    `conversion or rounding policy (fail-closed).`,
  );
}

/**
 * D3 unknown-method / unlowered method form. Replaces the former
 * `(unreachable) (; unknown method …)` stub so unsupported method syntax
 * cannot become an apparently executable WASM target.
 * FUNGI-WAT-METHOD-001 — registered in the KB compiler-diagnostics.md (2026-10-01).
 */
export function refuseUnknownMethodWat(method: string, detail?: string): never {
  const diag = FUNGI_WAT_METHOD_001;
  const extra = detail === undefined || detail === "" ? "" : ` ${detail}`;
  throw createWatRefusalDiagnostic(FUNGI_WAT_METHOD_001,
    `${diag.code}: method '${method}' is not lowered to WASM.${extra} WAT emission refuses rather ` +
    `than emit an (unreachable) stub or an undefined callee (fail-closed).`,
  );
}

/**
 * D9 mixed / i32-only-over-64-bit ops. Replaces the former run-time
 * `(unreachable)` traps so a standalone WASM module cannot look executable
 * for a construct the emitter declines to lower. Interpreter unchanged.
 * FUNGI-WAT-INT64-001 — KB registration is an owner/KB step before carry.
 */
export function refuseMixed64BitWat(op: string, detail: string): never {
  const diag = FUNGI_WAT_INT64_001;
  throw createWatRefusalDiagnostic(FUNGI_WAT_INT64_001,
    `${diag.code}: 64-bit op '${op}' is not lowered to WASM (${detail}). WAT emission refuses rather ` +
    `than emit an (unreachable) stub or a standalone trap (fail-closed).`,
  );
}

/**
 * E5 (PROVISIONAL, narrow-float.ts): a Float32/Float16 form the provisional narrow-float WASM lane does not
 * lower faithfully — e.g. a Float32 record slot fed a value that is not statically Float32/Float16 (a literal
 * or an f64 Float, which the walker cannot round because a record literal carries no field types), a
 * narrow-float operand mixed with an operand of unknown type, or a narrow slot fed an Int64. Refused at emit
 * rather than risk a value that differs from the tree-walker. Interpreter unchanged.
 * FUNGI-WAT-FLOAT32-001 — KB registration is an owner/KB step before carry (pending-registration fixture).
 */
export const FUNGI_WAT_FLOAT32_001 = {
  code: "FUNGI-WAT-FLOAT32-001",
  name: "NARROW_FLOAT_FORM_NOT_LOWERED",
  severity: "error",
  message:
    "a Float32/Float16 form the provisional narrow-float WASM lane does not lower faithfully reached WAT emission; " +
    "WAT emission refuses rather than emit a value that could differ from the interpreter's binary32/binary16 rounding (fail-closed).",
  suggestedFix: "Feed Float32/Float16 slots and operands statically narrow values, or run the flow through the governed interpreter.",
} as const satisfies WatDiagnosticDefinition;

export function refuseNarrowFloatWat(detail: string): never {
  const diag = FUNGI_WAT_FLOAT32_001;
  throw createWatRefusalDiagnostic(FUNGI_WAT_FLOAT32_001,
    `${diag.code}: Float32/Float16 form is not lowered to WASM (${detail}). WAT emission refuses rather ` +
    `than emit a value that could differ from the interpreter's binary32/binary16 rounding (fail-closed).`,
  );
}

/**
 * D4: an admitted literal matchesPattern lowers to a bounded pure in-Wasm
 * matcher (wat-emitter-pattern.ts). Everything else - a dynamic pattern, a
 * literal the capability does not admit or that exceeds the in-Wasm automaton
 * bound, extractGroups, replacePattern - is refused at emit rather than a
 * run-time (unreachable) stub or an undefined host callee. No pattern host ABI
 * is added.
 * FUNGI-WAT-PATTERN-001 — KB registration is an owner/KB step before carry.
 */
export function refusePatternWat(method: string, kind: "literal" | "dynamic" = "literal", detail: string = ""): never {
  const diag = FUNGI_WAT_PATTERN_001;
  const identity = kind === "dynamic"
    ? "C20: dynamic matchesPattern refused"
    : detail !== ""
      ? `C20: ${method} literal is not lowered to the bounded in-Wasm matcher; ${detail}`
      : `C20: ${method} WAT ABI is not admitted; compile-time PatternCapability is interpreter-only`;
  throw createWatRefusalDiagnostic(FUNGI_WAT_PATTERN_001,
    `${diag.code}: method '${method}' is not lowered to WASM (${identity}). WAT emission refuses rather ` +
    `than emit an (unreachable) stub or an undefined callee (fail-closed).`,
  );
}

/**
 * D7 requireStmt / local fnDecl. Replaces the generic default run-time
 * `(unreachable) ;; unsupported-in-WASM: ${kind}` trap so a governed or
 * closure statement cannot ship as an apparently executable WASM export.
 * Generic default stays for other statement kinds.
 * FUNGI-WAT-STMT-001 — KB registration is an owner/KB step before carry.
 */
export function refuseGovernedOrClosureStmtWat(kind: string): never {
  const diag = FUNGI_WAT_STMT_001;
  const identity = kind === "fnDecl"
    ? "D7: local fnDecl WAT ABI is not admitted; closure lowering is interpreter-only"
    : `D7: ${kind} WAT ABI is not admitted; governed statement lowering is interpreter-only`;
  throw createWatRefusalDiagnostic(FUNGI_WAT_STMT_001,
    `${diag.code}: statement '${kind}' is not lowered to WASM (${identity}). WAT emission refuses rather ` +
    `than emit an (unreachable) stub or an apparently executable export (fail-closed).`,
  );
}

/**
 * D8 item 2: an effectful (non-exportable) flow named in gir.entryPoints
 * would otherwise export as a trapping stub. Refuse at emit.
 * FUNGI-WAT-EFFECT-001 — KB registration is an owner/KB step before carry.
 */
export function refuseEffectfulEntryWat(flowName: string): never {
  const diag = FUNGI_WAT_EFFECT_001;
  throw createWatRefusalDiagnostic(FUNGI_WAT_EFFECT_001,
    `${diag.code}: effectful flow '${flowName}' is named in gir.entryPoints and is not WASM-exportable ` +
    `(D8: EFFECTFUL_ENTRY_NOT_LOWERED). WAT emission refuses rather than export an (unreachable) stub ` +
    `(fail-closed).`,
  );
}

/**
 * Real I2 (R-I2-9, zero-trust default, owner may revisit): executable fault handlers are
 * interpreter-only. WASM has no handler ABI (ties into the parked D8 host-import ABI), so a flow
 * declaring one is refused by name instead of shipping with its handler silently dropped.
 * FUNGI-WAT-FAULT-001 - KB registration is an owner/KB step before carry.
 */
export const FUNGI_WAT_FAULT_001 = {
  code: "FUNGI-WAT-FAULT-001",
  name: "EXECUTABLE_FAULT_HANDLER_NOT_LOWERED",
  severity: "error",
  message:
    "declares an executable fault handler (on_timeout_fault quarantine) that is not lowered to WASM. WAT " +
    "emission refuses rather than ship the flow with its handler silently dropped (fail-closed).",
  suggestedFix: "Run the flow through the governed interpreter; there is no WASM handler ABI.",
} as const;

export function refuseExecutableFaultHandlerWat(flowName: string): never {
  // §5: the code is a structured field on the thrown error (not only free text), referencing the constant.
  throw Object.assign(
    new Error(`${FUNGI_WAT_FAULT_001.code} ${FUNGI_WAT_FAULT_001.name}: flow '${flowName}' ${FUNGI_WAT_FAULT_001.message}`),
    { code: FUNGI_WAT_FAULT_001.code, diagnosticName: FUNGI_WAT_FAULT_001.name },
  );
}

/**
 * Real I3 (R-I3-6, zero-trust default, owner may revisit): body-local invariants are checked by the
 * governed interpreter right after their binding; the WAT entry gate cannot see body locals, so WASM
 * refuses by name rather than lower an unbound reference.
 * FUNGI-WAT-INV-001 - KB registration is an owner/KB step before carry.
 */
export const FUNGI_WAT_INV_001 = {
  code: "FUNGI-WAT-INV-001",
  name: "BODY_LOCAL_INVARIANT_NOT_LOWERED",
  severity: "error",
  message:
    "declares a body-local invariant (an ensure over a body local) that is not lowered to WASM. WAT emission " +
    "refuses rather than lower an unbound reference (fail-closed).",
  suggestedFix: "Run the flow through the governed interpreter, which checks the invariant after its binding.",
} as const;

/**
 * FUNGI-WAT-* constants that use the §5 constant pattern. All FUNGI-WAT-* refusal codes are listed here;
 * since 2026-10-02 the older WAT-* refusals use the constant pattern too (IDs, names and thrown text unchanged).
 */
export const FUNGI_WAT_DIAGNOSTICS = Object.freeze([
  FUNGI_WAT_BODY_001,
  FUNGI_WAT_CHECKED_001,
  FUNGI_WAT_DECIMAL_001,
  FUNGI_WAT_EFFECT_001,
  FUNGI_WAT_FAULT_001,
  FUNGI_WAT_FLOAT32_001,
  FUNGI_WAT_HOF_001,
  FUNGI_WAT_INT64_001,
  FUNGI_WAT_INV_001,
  FUNGI_WAT_METHOD_001,
  FUNGI_WAT_MONEY_001,
  FUNGI_WAT_PATTERN_001,
  FUNGI_WAT_STMT_001,
] as const);

export function refuseBodyLocalInvariantWat(flowName: string): never {
  // §5: the code is a structured field on the thrown error (not only free text), referencing the constant.
  throw Object.assign(
    new Error(`${FUNGI_WAT_INV_001.code} ${FUNGI_WAT_INV_001.name}: flow '${flowName}' ${FUNGI_WAT_INV_001.message}`),
    { code: FUNGI_WAT_INV_001.code, diagnosticName: FUNGI_WAT_INV_001.name },
  );
}

const FLOW_DECL_KINDS: ReadonlySet<string> = new Set(["pureFlowDecl", "flowDecl", "secureFlowDecl", "guardedFlowDecl"]);

/** Per-flow: refuse (by name) a flow carrying interpreter-only I2/I3 governed control. */
export function refuseInterpreterOnlyFlowWat(flowNode: AstNode): void {
  if (executableFaultHandlers(flowNode).length > 0) refuseExecutableFaultHandlerWat(flowNode.value ?? "");
  if (flowHasBodyLocalInvariants(flowNode)) refuseBodyLocalInvariantWat(flowNode.value ?? "");
}

/** Module-wide: refuse (by name) any flow in the AST carrying interpreter-only I2/I3 governed control. */
export function refuseInterpreterOnlyGovernedControl(ast: AstNode | undefined): void {
  if (ast === undefined) return;
  const walk = (node: AstNode): void => {
    if (FLOW_DECL_KINDS.has(node.kind)) refuseInterpreterOnlyFlowWat(node);
    for (const c of node.children ?? []) walk(c);
  };
  walk(ast);
}

export function refuseHofCapture(method: string, fnName: string): never {
  const diag = FUNGI_WAT_HOF_001;
  throw createWatRefusalDiagnostic(FUNGI_WAT_HOF_001,
    `${diag.code}: ${method} named flow '${fnName}' is an undeclared identifier. ` +
    `Required form: a capture-free named ${method === "reduce" ? "binary" : "unary"} flow identifier. ` +
    `WAT emission refuses rather than lower a capturing callback (fail-closed).`,
  );
}

export function refuseHofShadowed(method: string, fnName: string): never {
  const diag = FUNGI_WAT_HOF_001;
  throw createWatRefusalDiagnostic(FUNGI_WAT_HOF_001,
    `${diag.code}: ${method} callback '${fnName}' names a local value, not a flow. ` +
    `Required form: a capture-free named ${method === "reduce" ? "binary" : "unary"} flow identifier. ` +
    `WAT emission refuses rather than resolve a shadowed name to a same-named top-level flow (fail-closed).`,
  );
}

export function refusePureFlowRequiresAstBody(flowName: string): never {
  const diag = FUNGI_WAT_BODY_001;
  throw createWatRefusalDiagnostic(FUNGI_WAT_BODY_001,
    `${diag.code}: pure flow '${flowName}' has no usable AST body to lower. ` +
    `Required form: a Phase-25-lowerable AST body. ` +
    `WAT emission refuses rather than emit a guessed Phase-24A identity (local.get $p0) or default (i32.const 0) body (fail-closed).`,
  );
}

export function astHasParamAdmission(node: AstNode | undefined): boolean {
  if (node == undefined) return false;
  if (node.kind === "paramAdmissionDecl") return true;
  for (const c of node.children ?? []) if (astHasParamAdmission(c)) return true;
  return false;
}

export function refuseUnadmittedPublicWAT(
  schemaVersion: string | undefined,
  ast: AstNode | undefined,
  caller: string,
): void {
  if (schemaVersion !== "fungi.gir.v1") {
    throw new Error(
      `${caller}: ${schemaVersion === undefined ? "MISSING" : "unsupported"} GIR schemaVersion ` +
      `${JSON.stringify(schemaVersion)} — expected "fungi.gir.v1" (BK-4/A4 fail-closed; an absent or ` +
      `unrecognised GIR version is refused, never best-effort lowered).`,
    );
  }
  // Real I2/I3 (R-I2-9 / R-I3-6): module-wide, before any lowering - every flow in the AST, not only
  // the ones that reach the per-flow body emitter (an impure flow may never get there).
  refuseInterpreterOnlyGovernedControl(ast);
  if (astHasParamAdmission(ast)) {
    throw new Error(
      `${caller}: refusing to lower a flow carrying a parameter admission (\`where <predicate>\`) ` +
      `to WASM — the admission entry gate is NOT lowered to WAT, so a raw WASM run (--invoke / build+wasmtime) ` +
      `would BYPASS it and run a denied/unknown admission to completion (fail-closed, bridge 0155). Run the ` +
      `flow via the governed interpreter until admission lowering lands.`,
    );
  }
}
