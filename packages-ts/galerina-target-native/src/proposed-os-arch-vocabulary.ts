// PROPOSED closed OS/architecture vocabulary.
// Not wired into validateDecodedNativeTarget. Owner Phillip approves the set.
// Not a physical loader and not native execution.

export const PROPOSED_NATIVE_ARCHITECTURES = Object.freeze(["aarch64", "x86_64"] as const);
export const PROPOSED_NATIVE_OPERATING_SYSTEMS = Object.freeze(["linux", "windows"] as const);

export const PROPOSED_NATIVE_ARCHITECTURE_UNAPPROVED = "PROPOSED_NATIVE_ARCHITECTURE_UNAPPROVED";
export const PROPOSED_NATIVE_OS_UNAPPROVED = "PROPOSED_NATIVE_OS_UNAPPROVED";

export type ProposedNativeArchitecture = (typeof PROPOSED_NATIVE_ARCHITECTURES)[number];
export type ProposedNativeOperatingSystem = (typeof PROPOSED_NATIVE_OPERATING_SYSTEMS)[number];

export interface ProposedNativeVocabularyDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly path: string;
}

const ARCH_SET: ReadonlySet<string> = new Set(PROPOSED_NATIVE_ARCHITECTURES);
const OS_SET: ReadonlySet<string> = new Set(PROPOSED_NATIVE_OPERATING_SYSTEMS);

function freezeDiag(
  code: string,
  message: string,
  path: string,
): ProposedNativeVocabularyDiagnostic {
  return Object.freeze({ code, severity: "error", message, path });
}

/** Exact-token membership. Unknown strings are refused. Not an admission path. */
export function isProposedNativeArchitecture(value: string): value is ProposedNativeArchitecture {
  return ARCH_SET.has(value);
}

export function isProposedNativeOperatingSystem(value: string): value is ProposedNativeOperatingSystem {
  return OS_SET.has(value);
}

/**
 * PROPOSED refusals for os/architecture tokens outside the closed lists.
 * Callers of validateNativeTarget / validateDecodedNativeTarget must not invoke this.
 */
export function proposedNativeVocabularyDiagnostics(
  target: { readonly os: string; readonly architecture: string },
  path = "target",
): readonly ProposedNativeVocabularyDiagnostic[] {
  const diagnostics: ProposedNativeVocabularyDiagnostic[] = [];
  if (!isProposedNativeArchitecture(target.architecture)) {
    diagnostics.push(freezeDiag(
      PROPOSED_NATIVE_ARCHITECTURE_UNAPPROVED,
      "Architecture is outside the PROPOSED closed native architecture vocabulary.",
      `${path}.architecture`,
    ));
  }
  if (!isProposedNativeOperatingSystem(target.os)) {
    diagnostics.push(freezeDiag(
      PROPOSED_NATIVE_OS_UNAPPROVED,
      "OS is outside the PROPOSED closed native OS vocabulary.",
      `${path}.os`,
    ));
  }
  return Object.freeze(diagnostics);
}
