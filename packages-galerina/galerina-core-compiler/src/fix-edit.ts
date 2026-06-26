// fix-edit.ts — the safe edit primitive for `galerina fix` (#56, the owner's #1 DX win).
//
// A diagnostic can carry a precise, machine-applicable `FixEdit` (a single-line span replacement). This module
// is the SAFE APPLIER: pure, no I/O, deny-by-default on anything ambiguous. The caller (the CLI `--fix-confirm`
// path) is responsible for re-parsing the result and only writing when the fixed source still compiles — this
// function never decides to write, it only computes the edited text.
//
// Safety rules (fail-safe — a questionable edit is SKIPPED, never misapplied):
//   • edits are applied in DESCENDING (line, column) order so earlier offsets are never shifted by later ones;
//   • OVERLAPPING edits on the same line are dropped (all but the first by sort order) — overlap means the
//     producers disagree about a region, so applying either blindly could corrupt the source;
//   • an edit whose span falls outside its line (bad column/endColumn) is skipped;
//   • a 1-based line beyond the source is skipped.
// The return value reports how many edits applied vs were skipped so the caller can surface "N of M applied".

export interface FixEdit {
  /** 1-based line of the span to replace. */
  readonly line: number;
  /** 1-based start column (inclusive). */
  readonly column: number;
  /** 1-based end column (EXCLUSIVE) — the span is [column, endColumn). */
  readonly endColumn: number;
  /** The text to substitute for the span. */
  readonly replacement: string;
}

export interface ApplyFixEditsResult {
  readonly result: string;
  readonly applied: number;
  readonly skipped: number;
}

/** True iff two same-line edits overlap (share any column in their half-open spans). */
function overlaps(a: FixEdit, b: FixEdit): boolean {
  return a.line === b.line && a.column < b.endColumn && b.column < a.endColumn;
}

/**
 * Apply non-overlapping single-line `FixEdit`s to `source`, fail-safe. Pure: returns the edited text + counts;
 * performs no I/O and never throws on a bad edit (it is skipped). Newline style (\n vs \r\n) is preserved.
 */
export function applyFixEdits(source: string, edits: readonly FixEdit[]): ApplyFixEditsResult {
  if (edits.length === 0) return { result: source, applied: 0, skipped: 0 };

  // Split preserving the exact line terminators so we can rejoin byte-identically.
  const parts = source.split(/(\r?\n)/); // [line, sep, line, sep, …, lastLine]
  const lineText: string[] = [];
  const sep: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) lineText.push(parts[i] ?? "");
    else sep.push(parts[i] ?? "");
  }

  // Validate + drop overlaps. Sort DESCENDING by (line, column) so we can mutate later positions first.
  const valid: FixEdit[] = [];
  let skipped = 0;
  const sorted = [...edits].sort((a, b) => (b.line - a.line) || (b.column - a.column));
  for (const e of sorted) {
    const li = e.line - 1;
    const ok =
      Number.isInteger(e.line) && Number.isInteger(e.column) && Number.isInteger(e.endColumn) &&
      li >= 0 && li < lineText.length &&
      e.column >= 1 && e.endColumn >= e.column &&
      (e.endColumn - 1) <= (lineText[li] ?? "").length;
    if (!ok) { skipped++; continue; }
    if (valid.some((v) => overlaps(v, e))) { skipped++; continue; }
    valid.push(e);
  }

  let applied = 0;
  for (const e of valid) {
    const li = e.line - 1;
    const text = lineText[li] ?? "";
    lineText[li] = text.slice(0, e.column - 1) + e.replacement + text.slice(e.endColumn - 1);
    applied++;
  }

  // Rejoin: lineText[0] sep[0] lineText[1] sep[1] … lineText[n].
  let out = "";
  for (let i = 0; i < lineText.length; i++) {
    out += lineText[i];
    if (i < sep.length) out += sep[i];
  }
  return { result: out, applied, skipped };
}

export interface AutoFixOutcome {
  readonly fixedSource: string;
  readonly applied: number;
  readonly skipped: number;
  /** True iff the fix was APPLIED and a re-check confirmed it did not increase the error count. */
  readonly accepted: boolean;
}

/**
 * Orchestrate a safe auto-fix: apply the `FixEdit`s, then RE-CHECK the result and accept it ONLY if the fix
 * did not increase the error count (fail-closed — never write a fix that breaks the file). Pure: `recheck`
 * (which compiles a candidate source and returns its error count) is injected, so this is fully testable
 * without I/O. The caller writes `fixedSource` to disk only when `accepted` (and typically only under an
 * explicit --fix-confirm). This is the orchestration core of `galerina fix` (#56); a diagnostic-producer that
 * emits `FixEdit`s is the remaining half.
 */
export function computeAutoFix(
  source: string,
  fixEdits: readonly FixEdit[],
  originalErrorCount: number,
  recheck: (candidate: string) => number,
): AutoFixOutcome {
  if (fixEdits.length === 0) return { fixedSource: source, applied: 0, skipped: 0, accepted: false };
  const { result, applied, skipped } = applyFixEdits(source, fixEdits);
  if (applied === 0) return { fixedSource: source, applied: 0, skipped, accepted: false };
  let accepted: boolean;
  try {
    accepted = recheck(result) <= originalErrorCount; // fail-closed: the fix must not make things worse
  } catch {
    accepted = false; // a recheck that throws ⇒ reject the fix (fail-closed)
  }
  return { fixedSource: accepted ? result : source, applied, skipped, accepted };
}
