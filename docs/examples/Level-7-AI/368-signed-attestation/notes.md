# 368 — Signed Attestation

Demonstrates how 'require signed attestation' in the audit block connects to
the build-time Ed25519 artifact signing pipeline.

The signed artifact proves:
  "This audit proof came from this exact source, contract, compiler, target plan, and runtime."

Signing model:
  compiler signs build artifact
  runtime signs execution report
  verifier checks both

Galerina principle: "Galerina signs what it proves. It does not prove something merely because it is signed."
