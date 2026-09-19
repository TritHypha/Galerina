# AGENTS capability-route recheck — 2026-09-19

Status: NON-AUTHORIZING / PASS for bounded route controls

This receipt verifies the required AGENTS-owned tooling route without changing
repository source, generating keys, regenerating the conversion queue, running
a corpus build, or authorizing `.fungi` work.

## Explicit route inputs

- `AGENTS_ROOT` was bound to the canonical AGENTS owner directory.
- `RD0873_GIT_PATH` was bound to the absolute Git executable path required by
  the Galerina RD-0873 audit-map contract.
- The variables were supplied only to the bounded test process; no global
  configuration was changed.

## Fresh bounded results

- `scripts/tests/rd0873-native-fungi-audit-map.test.mjs`: **7/7 pass**.
  The tests covered canonical AGENTS ownership, closed DAG/order, five
  read-only entry points, one receipt per entry point, unsafe-tool refusal,
  exact-base refusal, and deterministic sequential output.
- `scripts/audit-fungi-corpus-check.mjs --self-test`: **self-test PASS**.
  It verified tracked-corpus discovery and detector controls only. Its report
  found 2,975 tracked `.fungi` paths; this is not a compile/build result.
- SLIDE focused current suites (publication loader, detached scalar/VOK,
  String-match constellation, filesystem identity): **53/53 pass**.

## Boundary

These results validate bounded tooling and focused reference controls only.
They do not create exact-head PROJECT evidence, producer/GIR inputs, VOK
authority, owner lifecycle receipts, physical durability evidence, signing
authority, queue eligibility, or corpus assurance. The full `.fungi` corpus
compile/build remains the final step after the four dependency lanes and
owner-only gates are resolved.
