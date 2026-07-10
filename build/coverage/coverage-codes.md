# Coverage cross-check — dimension: codes (#218 / std #1 universal coverage)

Index: code-index.json (636 codes) · Derived registry: build/code-registry (ALL codes, by construction) · Curated: galerina-governance-rules.md (84 FUNGI codes).

## Universal coverage (anchor std #1)
- 636/636 codes catalogued in the DERIVED registry by construction → NO ORPHANS ✓

## Coverage HOLES (actionable — exit code)
- REGISTRY-PHANTOM (curated governance-rules.md lists a code absent from source — stale): 8
    FUNGI-CAP-003
    FUNGI-STEP-002
    FUNGI-CAP-004
    FUNGI-MONO-003
    FUNGI-FG-001
    FUNGI-DEP-001
    FUNGI-FAULT-002
    FUNGI-FAULT-004

## Backlogs (NOT orphans — tracked for incremental adoption, not exit-failing)
- governance-rules.md CURATION gap: 363 src-real FUNGI-* lack a semantic entry in the curated registry (they ARE in the derived registry). Generate/curate per std #10.
- PHANTOM doc-only drift: 110 (std #9/#10 → DOC-004).
- INLINE / no exported constant (R4): 145 (std #5 → taxonomy Stage F).
- DEAD / RESERVED (defined, never emitted): 8 (std #1 wire-or-retire; tagged RESERVED in the derived registry).

## Notes
- #215 scanner is SRC-ONLY; doc/README-declared ownership is invisible to it (Stage-D FUNGI-BOUNDARY lesson); REGISTRY-PHANTOM covers the reverse, full doc-ownership = scanner §6 (future).
- Known false-dead pending const-id resolution: FUNGI-BOOL-BOUNDARY-001/002 (live via validateBoolBoundary).

## Coverage holes: 8 · curation backlog: 363 · drift: 110 · R4-inline: 145 · RESERVED: 8
