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
[HOLD] Obtain a new element map, provenance review and qualified counsel decision before adding any execution, dynamic topology, delay/refractory, implantation or actuator surface
    HOLD 2026-10-05 (Grok Bot; zero-trust default, owner may revisit): needs a qualified counsel decision that no agent
    can supply. Until then tests/pat-neu-01-boundary.test.mjs keeps the package non-executing.
```
