# Owner-gate checkpoint — WSL, EOL, KB and dependency order

Date: 2026-09-19
Status: NON-AUTHORIZING / PARTIAL

This handover records the bounded non-key work completed at the current
checkout heads. It does not release signing, producer, VOK, platform,
durability, queue, corpus or `.fungi` authority.

## Exact heads observed

| Repository | HEAD | Working-tree disposition |
|---|---|---|
| Galerina | `d3c5abda714fa0baf710941233336d6d6581b64b` | pre-existing `README.md` modification preserved |
| SLIDE | `1b59525055b265d11c63aaabacb43cccf3c84f07` | clean at observation |
| Lyth-Weaver | `8d3eaaa469ff128f9c9b7158c0a4d105839f1971` | pre-existing untracked private handover preserved |
| ZTF-Knowledge-Bases | `5143f0a9cd42ac493e08d7a310284be6816966a6` | two pre-existing tracked private RD modifications preserved |

These are observation receipts, not PROJECT evidence. The Galerina, Lyth and
KB working trees are not clean, so graph/RD freshness and absence claims remain
fail-closed.

## WSL evidence

The Ubuntu WSL2 run completed the bounded non-authorizing checks:

- Rust formatting check: PASS.
- Recovery protocol tests: 6/6 PASS.
- Linux host-admission tests: 9/9 PASS.
- All runnable all-feature tests: PASS; live-host/process-kill tests remain
  ignored by their explicit environment gate.
- Recovery worker and verifier debug builds: PASS.

The ignored live-host and injected-fault attempts did not produce production
durability evidence. The available filesystem is WSL2 VMBUS-backed virtual
storage. Live candidate admission was refused before the fault-specific
publication boundary; the injected-fault test therefore exited 1 rather than
minting a false fault receipt. No restart, rollback, crash, reboot or
power-loss durability is claimed. The sacrificial-host runbook remains the
owner-controlled route for those claims.

## EOL policy adopted for the next PROJECT check

EOL means the byte separator: LF (`0A`) or CRLF (`0D 0A`). A file is mixed
when it contains both separator forms, or a lone CR (`0D`). Uniform LF and
uniform CRLF are admissible only where the file-specific format permits them;
the recovery protocol's LF requirement remains binding. Separator-free files
must be judged by their owning format rather than silently normalized.

The PROJECT gate must refuse mixed EOL, invalid UTF-8, BOM where prohibited,
replacement characters, and any stale or dirty source identity. No broad EOL
normalization is authorized. A touched file receives a bounded source-aware
check. `.fungi` additionally preserves explicit `_=>` exits and rejects
`null` and `NaN`; byte checks do not replace semantic checks.

Sampled current evidence: Galerina `docs/TODO.md` is mixed (one LF and 10,824
CRLF separators); the durability README is uniform CRLF; SLIDE `TODO.md` is
uniform LF; Lyth `TODO.md` is mixed (19 LF and 224 CRLF separators); the KB
RD-0349, RD-0361 and RD-0363 sources are uniform LF and decode as UTF-8 without
BOM or replacement characters.

## KB and R&D routing

The canonical index is the KB-root `AI_INDEX.md`; the requested `AI/_INDEX.md`
path is absent. RD-0349, RD-0361, RD-0363, RD-0364 and RD-0365 exist as
tracked `research/rd-legacy` sources. The bounded RD query returned
`REFUSED: tracked RD source paths are dirty`; this is not a missing-R&D claim.
Historical/legacy source status remains subject to current-source and
supersession verification.

## Dependency disposition

Lyth P7 is explicitly a generation-dependent Fungi assurance gate, not a
pre-generation readiness proof. Current local Lyth work is DONE/REFUSED/HOLD;
SLIDE/VOK still require producer/GIR and owner lifecycle/authority evidence;
Galerina still requires valid exact-head PROJECT evidence. Therefore no new
non-key implementation is admitted by this checkpoint.

The full corpus compile/build and conversion-queue regeneration remain held.
They may run only after the preceding lanes and owner gates are valid, with
final corpus assurance last. Private-key ceremonies remain with the owner.

## Independent review

An Astra review was obtained as advisory input and adjudicated as `PARTIAL`:
the holds and WSL routing are supported, but current production readiness,
physical durability, owner release, and a PROJECT-ready R&D state are not
established. The review also confirmed that TODO wording must keep downstream
generation-dependent gates distinct from pre-generation prerequisites.
