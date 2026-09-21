export const COMPILER_BUILD_EVIDENCE_SCHEMA: "fungi.compiler.build-evidence.v1";
export const CONSUMED_COMPILER_OUTPUTS: readonly string[];

export interface BuildEvidenceFileRecord {
  readonly path: string;
  readonly bytes: number;
  readonly digest: string;
}

export interface CompilerBuildEvidence {
  readonly schema: typeof COMPILER_BUILD_EVIDENCE_SCHEMA;
  readonly algorithm: "sha256";
  readonly package: string;
  readonly inputs: readonly BuildEvidenceFileRecord[];
  readonly config: {
    readonly tsconfigPath: string;
    readonly digest: string;
    readonly include: readonly string[];
  };
  readonly toolchain: {
    readonly node: string;
    readonly typescript: string;
  };
  readonly outputs: readonly BuildEvidenceFileRecord[];
  readonly inputDigest: string;
  readonly outputDigest: string;
}

export function assertNoDuplicateJsonKeys(json: string): void;
export function createBuildEvidence(root?: string, compiler?: string): CompilerBuildEvidence;
export function writeBuildEvidence(
  root?: string,
  compiler?: string,
  output?: string,
): CompilerBuildEvidence;
export function verifyBuildEvidence(
  root: string,
  compiler: string,
  rawJson: string,
):
  | { readonly ok: true; readonly evidence: CompilerBuildEvidence }
  | { readonly ok: false; readonly reason: string };
