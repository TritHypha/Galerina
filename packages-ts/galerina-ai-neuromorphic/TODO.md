# Galerina Neuromorphic TODO

```text
[x] Create /packages-ts/galerina-ai-neuromorphic
[x] Add README.md
[x] Add TODO.md
[x] Add package metadata
[x] Add initial typed exports
[x] Define Spike, SpikeTrain, EventSignal and SpikingModel placeholders
[x] Define spiking model validation rules
[x] Define event budget and timeout policy
[x] Define non-authorizing neuromorphic target report examples (`examples/report.example.json`
    = exact `createNeuromorphicReport` output for `examples/plans.example.json`; 2026-10-05, Grok Bot)
[x] Add examples (`examples/model.example.json`, `examples/plans.example.json`; validated by
    `tests/neuromorphic-examples.test.mjs`; no execution surface, PAT-NEU-01 unchanged)
[x] Add validator tests
[x] Add PAT-NEU-01 non-execution architecture tests
[x] Mark package private, post-v1 and excluded from the beta-v1 public cut
[x] Package-side O2 pin (2026-10-08): PAT-NEU-01 surface now walks every
    `src/*.ts` file, requires exactly `index.ts`, and scans interface fields /
    accessors. Extra src files, re-exports, and authority-shaped field names
    are a stop. Runtime export surface stays the four pure helpers. Border
    stays empty. tests/pat-neu-01-surface.test.mjs, tests/o2-hold-pin.test.mjs.
    No execution, delay/refractory, implantation or actuator API was added.
[HOLD] Obtain a new element map, provenance review and qualified counsel decision before adding any execution, dynamic topology, delay/refractory, implantation or actuator surface
    HOLD 2026-10-05 (Grok Bot; zero-trust default, owner may revisit): needs a qualified counsel decision that no agent
    can supply. Until then tests/pat-neu-01-boundary.test.mjs keeps the package non-executing.
    Owner decision 2026-10-06 10:14 BST (O2, Phillip): no legal opinion will be sought now; the package stays
    private, post-v1 and non-executing.
    2026-10-06 (Grok Bot): PAT-NEU-01 guard widened, tests only (tests/pat-neu-01-surface.test.mjs, 6 tests):
    no import/require/dynamic import; no eval/Function/WebAssembly/process/timer/global-object reference; no
    authority-shaped name in any declaration (const arrows, methods, types, fields included); runtime exports
    pinned to the four pure helpers; reports add no authority fields and never admit request data. Sabotage
    control: `export const startSpikes` passes the old boundary test and fails this one. HOLD unchanged (O2).
    Kept HOLD: SuperGrok 2026-10-08 closed the extra-src-file false-pass (PAT-NEU-01
    now scans every src/*.ts and requires exactly index.ts). Counsel, element map,
    and provenance review remain owner O2. Unique PAT-NEU-01 surface review
    unchanged. No execution surface added.
```
