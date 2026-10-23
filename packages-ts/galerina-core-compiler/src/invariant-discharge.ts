// ─────────────────────────────────────────────────────────────────────────────
// invariant-discharge.ts — the ONE static-discharge oracle for governance `ensure`
// invariants, shared by the governance-verifier (which RECORDS the discharge) and the
// WAT emitter (which ELIDES a discharged gate). S2 fuller-A / RD-0456 Tri-Fuse: a single
// witness.
//
// Before this module there were TWO constant-fold implementations — the verifier's
// `tryStaticEval` and the emitter's `tryConstantFold` — that could DRIFT: if the emitter
// proved an operand the verifier did not, it could elide a gate the verifier never blessed
// (fail-OPEN); if the verifier proved one the emitter did not, a statically-false invariant
// might slip past the emitter to a runtime trap. R&D (KB `f86155b`) named this the
// "two-oracles-drift trap". This module makes drift IMPOSSIBLE by construction: both sides
// call `foldStaticVerdict`, so they cannot disagree about what is a proven constant.
//
// The fold is deliberately conservative — a constant boolean, an exact comparison of two
// complete integer literals, or the negation of a constant boolean, and nothing else. It NEVER folds a
// runtime-dependent operand, so an elided gate is ALWAYS a proven constant and UNKNOWN ⇒ 0
// ⇒ keep the runtime gate (fail-CLOSED). The richer lattice (escape-analysis, manifest-
// proven targets, effect/grant — RD-0456 full-A) plugs in HERE later; until then the trit
// is exactly what a constant-fold can prove, and both consumers see the same trit.
// ─────────────────────────────────────────────────────────────────────────────

import type { AstNode } from "./parser.js";

/** The static-discharge trit: +1 = proven-ALLOW (constant true) · -1 = proven-DENY (constant
 *  false) · 0 = unknown (not a constant — keep the runtime gate, fail-closed). This is the
 *  per-operand trit lattice: ALLOW ⇒ elide (min-identity) · DENY ⇒ collapse (FUNGI-INV-001) ·
 *  UNKNOWN ⇒ keep the gate. */
export type StaticVerdict = 1 | 0 | -1;

/** Prove only complete, nonnegative signed-i32 integer tokens, never a numeric
 * prefix or rounded Number. This type-free AST fold must agree with the current
 * untyped WASM literal lane; outside its common exact range, keep the runtime
 * check. This is a bootstrap-folding bound, not a Fungi language type rule.
 * The lexer preserves decimal separators; base-prefixed tokens have no
 * separators. Fractions/exponents need runtime enforcement here. Signs are
 * unary AST nodes, not part of a numberLiteral token. Bound token length before
 * BigInt parsing so an arbitrary source numeral cannot trigger unbounded work.
 */
function exactIntegerLiteral(value: string | undefined): bigint | undefined {
  if (value === undefined || value.length > 40 ||
      !/^(?:[0-9]+(?:_[0-9]+)*|0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+)(?![\s\S])/.test(value)) {
    return undefined;
  }
  const exact = BigInt(value.replace(/_/g, ""));
  return exact <= 2_147_483_647n ? exact : undefined;
}

/** Flatten a governance conjunction (`&&`/`and`, which lowers to K3 min / bitwise-and; `true`
 *  is the identity of both) into its operand list; a non-conjunction returns `[expr]`.
 *  `a && b && c` (left-assoc nested binaryExpr) → `[a, b, c]`, so each operand folds alone. */
export function flattenGovernanceConjunction(expr: AstNode): AstNode[] {
  if (expr.kind === "binaryExpr" && (expr.value === "&&" || expr.value === "and") && expr.children?.length === 2) {
    return [...flattenGovernanceConjunction(expr.children[0]!), ...flattenGovernanceConjunction(expr.children[1]!)];
  }
  return [expr];
}

/** The ONE constant-fold static oracle. Returns the discharge trit for `expr`:
 *  +1 if it provably evaluates to true, -1 if provably false, 0 if it is not a constant.
 *  Shared by both consumers. Numeric proof is restricted to complete integer tokens;
 *  valid fractional/exponent forms remain UNKNOWN and require runtime enforcement. */
export function foldStaticVerdict(expr: AstNode): StaticVerdict {
  // Strong-Kleene conjunction is false when any operand is false, even when
  // another operand is runtime-dependent.  Resolve that annihilator here so
  // the verifier reports FUNGI-INV-001 for `false && x` exactly as the emitter
  // removes the same dead gate.  A conjunction with no false operand remains
  // unknown unless every operand is statically true.
  if (expr.kind === "binaryExpr" && (expr.value === "&&" || expr.value === "and") && expr.children?.length === 2) {
    const operands = flattenGovernanceConjunction(expr);
    let allAllow = true;
    for (const operand of operands) {
      const verdict = foldStaticVerdict(operand);
      if (verdict === -1) return -1;
      if (verdict !== 1) allAllow = false;
    }
    return allAllow ? 1 : 0;
  }
  // ensure true / ensure false
  if (expr.kind === "boolLiteral") return expr.value === "true" ? 1 : -1;
  // ensure <numLit> <cmp> <numLit>   (5 > 0, 0 == 0, …)
  if (expr.kind === "binaryExpr" && expr.children?.length === 2) {
    const l = expr.children[0], r = expr.children[1];
    if (l?.kind === "numberLiteral" && r?.kind === "numberLiteral") {
      const lv = exactIntegerLiteral(l.value), rv = exactIntegerLiteral(r.value);
      if (lv === undefined || rv === undefined) return 0;
      switch (expr.value) {
        case ">":  return lv >  rv ? 1 : -1;
        case "<":  return lv <  rv ? 1 : -1;
        case ">=": return lv >= rv ? 1 : -1;
        case "<=": return lv <= rv ? 1 : -1;
        case "==": return lv === rv ? 1 : -1;
        case "!=": return lv !== rv ? 1 : -1;
      }
    }
  }
  // ensure !<boolLit>   (the verifier already proved this; the emitter now agrees — one oracle)
  if (expr.kind === "unaryExpr" && expr.value === "!" && expr.children?.[0]?.kind === "boolLiteral") {
    return expr.children[0].value === "true" ? -1 : 1; // !true = false = -1 · !false = true = +1
  }
  return 0; // unknown → keep the gate (fail-closed)
}

/** A per-operand static-discharge record for one `ensure` conjunction — the structured form
 *  the governance-verifier records on its result (`{operandIdx, staticVerdict}`), stable and
 *  typed rather than string-parsed. */
export interface OperandDischarge {
  readonly operandIdx: number;
  readonly staticVerdict: StaticVerdict;
}

/** Decompose an `ensure` expression into its conjunction operands and fold each — the
 *  structured per-operand discharge. Operand order matches `flattenGovernanceConjunction`. */
export function dischargeEnsureOperands(expr: AstNode): readonly OperandDischarge[] {
  return flattenGovernanceConjunction(expr).map((operand, operandIdx) => ({
    operandIdx,
    staticVerdict: foldStaticVerdict(operand),
  }));
}
