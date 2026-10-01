import type { AstNode } from "./parser.js";

/** True for `Money` and `Money<CCY>` (the WAT emitter's inferred Money types). */
export function isMoneyWatType(t: string | undefined): boolean {
  return t === "Money" || (t !== undefined && t.startsWith("Money<"));
}

/**
 * R2 (Grok Bot rounding work, 2026-09-30): the WASM host ABI admits ONLY the per-currency Money
 * constructors (__money_gbp … __money_hkd). Every other Money form — operators, comparisons, methods,
 * Money.of — has no lowering; emitting an i32 op over the opaque handle (or an `(unreachable)` stub) would
 * be a silent wrong answer or a deferred trap. Refuse at compile time, by name.
 * FUNGI-WAT-MONEY-001 — registered in the KB compiler-diagnostics.md (2026-10-01).
 */
export function refuseMoneyWat(form: string): never {
  const diag = { code: "FUNGI-WAT-MONEY-001", name: "MONEY_FORM_NOT_LOWERED", severity: "error" } as const;
  throw new Error(
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
  const diag = { code: "FUNGI-WAT-DECIMAL-001", name: "DECIMAL_FORM_NOT_LOWERED", severity: "error" } as const;
  throw new Error(
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
  const diag = { code: "FUNGI-WAT-METHOD-001", name: "UNKNOWN_METHOD_NOT_LOWERED", severity: "error" } as const;
  const extra = detail === undefined || detail === "" ? "" : ` ${detail}`;
  throw new Error(
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
  const diag = { code: "FUNGI-WAT-INT64-001", name: "MIXED_64BIT_OP_NOT_LOWERED", severity: "error" } as const;
  throw new Error(
    `${diag.code}: 64-bit op '${op}' is not lowered to WASM (${detail}). WAT emission refuses rather ` +
    `than emit an (unreachable) stub or a standalone trap (fail-closed).`,
  );
}

/**
 * D4 PatternCapability is interpreter-only. WASM refuses matchesPattern /
 * extractGroups / replacePattern at emit rather than a run-time (unreachable)
 * stub or an undefined host callee. No pattern host ABI is added.
 * FUNGI-WAT-PATTERN-001 — KB registration is an owner/KB step before carry.
 */
export function refusePatternWat(method: string, kind: "literal" | "dynamic" = "literal"): never {
  const diag = { code: "FUNGI-WAT-PATTERN-001", name: "PATTERN_CAPABILITY_NOT_LOWERED", severity: "error" } as const;
  const identity = kind === "dynamic"
    ? "C20: dynamic matchesPattern refused"
    : `C20: ${method} WAT ABI is not admitted; compile-time PatternCapability is interpreter-only`;
  throw new Error(
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
  const diag = { code: "FUNGI-WAT-STMT-001", name: "GOVERNED_OR_CLOSURE_STMT_NOT_LOWERED", severity: "error" } as const;
  const identity = kind === "fnDecl"
    ? "D7: local fnDecl WAT ABI is not admitted; closure lowering is interpreter-only"
    : `D7: ${kind} WAT ABI is not admitted; governed statement lowering is interpreter-only`;
  throw new Error(
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
  const diag = { code: "FUNGI-WAT-EFFECT-001", name: "EFFECTFUL_ENTRY_NOT_LOWERED", severity: "error" } as const;
  throw new Error(
    `${diag.code}: effectful flow '${flowName}' is named in gir.entryPoints and is not WASM-exportable ` +
    `(D8: EFFECTFUL_ENTRY_NOT_LOWERED). WAT emission refuses rather than export an (unreachable) stub ` +
    `(fail-closed).`,
  );
}

export function refuseHofCapture(method: string, fnName: string): never {
  const diag = { code: "FUNGI-WAT-HOF-001", name: "ARRAY_HOF_REQUIRES_NAMED_FLOW", severity: "error" } as const;
  throw new Error(
    `${diag.code}: ${method} named flow '${fnName}' is an undeclared identifier. ` +
    `Required form: a capture-free named ${method === "reduce" ? "binary" : "unary"} flow identifier. ` +
    `WAT emission refuses rather than lower a capturing callback (fail-closed).`,
  );
}

export function refuseHofShadowed(method: string, fnName: string): never {
  const diag = { code: "FUNGI-WAT-HOF-001", name: "ARRAY_HOF_REQUIRES_NAMED_FLOW", severity: "error" } as const;
  throw new Error(
    `${diag.code}: ${method} callback '${fnName}' names a local value, not a flow. ` +
    `Required form: a capture-free named ${method === "reduce" ? "binary" : "unary"} flow identifier. ` +
    `WAT emission refuses rather than resolve a shadowed name to a same-named top-level flow (fail-closed).`,
  );
}

export function refusePureFlowRequiresAstBody(flowName: string): never {
  const diag = { code: "FUNGI-WAT-BODY-001", name: "PURE_FLOW_REQUIRES_AST_BODY", severity: "error" } as const;
  throw new Error(
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
  if (astHasParamAdmission(ast)) {
    throw new Error(
      `${caller}: refusing to lower a flow carrying a parameter admission (\`where <predicate>\`) ` +
      `to WASM — the admission entry gate is NOT lowered to WAT, so a raw WASM run (--invoke / build+wasmtime) ` +
      `would BYPASS it and run a denied/unknown admission to completion (fail-closed, bridge 0155). Run the ` +
      `flow via the governed interpreter until admission lowering lands.`,
    );
  }
}
