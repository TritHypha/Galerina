import { createHash } from "node:crypto";
import {
  VERSION as TRIREGEX_VERSION,
  compileCapability,
  type TriMatcher,
} from "@galerina/tri-regex";

export const PATTERN_CAPABILITY_SCHEMA = "fungi.pattern.capability.v1";

export const PATTERN_PROFILE = Object.freeze({
  wordBoundary: "refused",
  captures: "refused",
  findAll: "interpreter-only",
  wat: "trap",
} as const);

export interface CompilerPatternCapability {
  readonly schema: typeof PATTERN_CAPABILITY_SCHEMA;
  readonly engineVersion: string;
  readonly pattern: string;
  readonly patternDigest: string;
  readonly profile: typeof PATTERN_PROFILE;
  readonly certificate: {
    readonly perCharWorkBound: number;
    readonly boundaryWorkBound: number;
    readonly patternLength: number;
  };
}

export type PatternAdmitResult =
  | {
      readonly ok: true;
      readonly capability: CompilerPatternCapability;
      readonly matcher: TriMatcher;
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
    };

export function digestPatternSource(pattern: string): string {
  return `sha256:${createHash("sha256").update(pattern, "utf8").digest("hex")}`;
}

export function admitPatternCapability(pattern: string): PatternAdmitResult {
  if (typeof pattern !== "string") {
    return {
      ok: false,
      code: "FUNGI-PATTERN-001",
      message: "pattern must be a string",
    };
  }
  const compiled = compileCapability(pattern, {
    budget: { maxPatternLength: 500 },
    uniformScan: true,
  });
  if (!compiled.ok) {
    return {
      ok: false,
      code: compiled.code,
      message: compiled.reason,
    };
  }
  const { capability } = compiled;
  return {
    ok: true,
    capability: Object.freeze({
      schema: PATTERN_CAPABILITY_SCHEMA,
      engineVersion: capability.engineVersion || TRIREGEX_VERSION,
      pattern: capability.pattern,
      patternDigest: digestPatternSource(capability.pattern),
      profile: PATTERN_PROFILE,
      certificate: {
        perCharWorkBound: capability.certificate.perCharWorkBound,
        boundaryWorkBound: capability.certificate.boundaryWorkBound,
        patternLength: capability.certificate.patternLength,
      },
    }),
    matcher: capability.matcher,
  };
}
