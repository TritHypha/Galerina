// EffectEvidence v0.2 (TODO pass, Grok 2026-10-05; owner may revisit).

export interface EffectEvidence {
  readonly schemaVersion: "galerina.evidence.v1";
  readonly evidenceId: string;
  readonly generatedAt: string;
  readonly effect: string;
  readonly declared: boolean;
  readonly inferred: boolean;
  readonly transitive: boolean;
  readonly allowed: boolean;
  readonly reason: string;
}
