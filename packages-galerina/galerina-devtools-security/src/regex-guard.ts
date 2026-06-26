// =============================================================================
// @galerina/devtools-security — Regex ReDoS Guard
//
// Validates user-provided regex patterns before they reach new RegExp().
// Guards against catastrophic backtracking (ReDoS).
//
// Based on Security Audit F8 fix in stdlib.ts.
// Extracted here so it can be used in other runtimes / validators.
// =============================================================================

export interface RegexValidationResult {
  readonly safe:   boolean;
  readonly reason?: string;
}

const MAX_PATTERN_LENGTH = 500;

// Known catastrophic patterns — not exhaustive, but covers common cases.
// Full safe-regex analysis requires automata theory (exponential automata detection).
const CATASTROPHIC_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /\([^)]*[+*][^)]*\)[+*{]/,  label: "nested quantifier (e.g. (a+)+, (a*)*, (a+){n})" },
  { re: /\([^)]*\|[^)]*\)[+*{2,]/, label: "alternation with quantifier (e.g. (a|b)+)" },
  { re: /\.\*\.\*/,                   label: "double .* (catastrophic for long strings)" },
];

/**
 * Validate a regex pattern for ReDoS safety before passing to new RegExp().
 *
 * This is a conservative heuristic guard — it catches the most common
 * catastrophic patterns. A full analysis requires a regex complexity analyser.
 * In strict/high_integrity profiles, dynamic regex from user input should be
 * disabled entirely (SPORE-PROFILE-005B).
 */
export function validateRegexPattern(pattern: string): RegexValidationResult {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { safe: false, reason: `Pattern length ${pattern.length} exceeds maximum ${MAX_PATTERN_LENGTH} (ReDoS prevention)` };
  }
  for (const { re, label } of CATASTROPHIC_PATTERNS) {
    if (re.test(pattern)) {
      return { safe: false, reason: `Catastrophic backtracking pattern detected: ${label}` };
    }
  }
  // Attempt to compile — if it throws, it's also invalid
  try {
    new RegExp(pattern);
  } catch (e) {
    return { safe: false, reason: `Invalid regex: ${e instanceof Error ? e.message : String(e)}` };
  }
  return { safe: true };
}

/**
 * Safe regex compilation — validates first, then compiles.
 * Returns null if the pattern is unsafe.
 */
export function safeCompileRegex(pattern: string): RegExp | null {
  const result = validateRegexPattern(pattern);
  if (!result.safe) return null;
  try { return new RegExp(pattern); } catch { return null; }
}

/** Known dangerous patterns for testing. */
export const REDOS_TEST_VECTORS = [
  { pattern: "(a+)+b",       expectSafe: false, label: "nested quantifier (a+)+" },
  { pattern: "(a*)*b",       expectSafe: false, label: "nested quantifier (a*)*" },
  { pattern: "(a|b)+",       expectSafe: false, label: "alternation with quantifier" },
  { pattern: "^[a-z]+$",    expectSafe: true,  label: "simple safe pattern" },
  { pattern: "a+b+",        expectSafe: true,  label: "non-nested quantifiers" },
  { pattern: "a".repeat(501), expectSafe: false, label: "oversized pattern" },
] as const;
