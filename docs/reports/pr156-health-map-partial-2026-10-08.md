# PR156 health-map integration: partial, not roadmap completion

## Integrated scope

The source changes from PR156 are integrated selectively on main, preserving
main's TODO, roadmap narrative and compute TODO instead of importing the older
census. WAT reports L1 self-hosted-flow coverage, not general target support;
interpreter parity is a text coverage row rather than a completion percentage.
The registry distinguishes design-done and build-pending work. Myco version
and recorded test count come from local owner files.

Independent Astra review: task `01a11aba-ac20-7271-8b91-500f8c93f484`, initial
reply `msg_0e5205410dcdb0ff016ac75d579ed881918b95bf7d63244f9e`.
Source base: `871212a1aff30f0ca274033e93cdbcda8009d6b6`.
SuperGrok patch SHA256:
`fada2a77b817936977ad49e1742907bd9ef923018c503ef1167c6124489add15`.
The integration additionally qualifies the historical hosted-retention claim.

## Evidence and limits

- WSL Ubuntu, Node 24.21.0: component-health self-tests passed.
- Native Windows generation and the owning health freshness check passed.
  The reproduced output reports build 75%, not the scratch report's 73%:
  available WAT ladder evidence changes 880/12 to 980/13 before rounding.
  This is measurement availability, not newly implemented functionality.
- Health HTML/JSON and informational provenance are regenerated together.
  Provenance is explicitly non-authorizing; its HEAD is not a binding of dirty
  source or proof of runtime behavior.
- Cross-project SLIDE/Lyth counts and historical hosted retention results are
  dated external reports, not freshly reproduced cross-project receipts.
  Reopen the exact owner artifacts before relying on them.
- WSL roadmap self-test reached nine successful checks, then refused because
  `build/graph/galerina-devtools-project-graph.html` is missing. The required
  artifact is ignored in Git. That run is not a passing roadmap test.

## Outstanding work: tooling/evidence owner

PR156 remains open for the coupled roadmap work. Restore or regenerate the
required graph evidence through its owning producer; establish all dependency
receipts; run the roadmap self-test and freshness checks; regenerate the
canonical SVG, document region and provenance together. Do not bypass the
missing-artifact refusal or copy stale scratch outputs to make the gate pass.
The old TODO census is intentionally not adopted as current state.

No GitHub Actions was run. No memory RD closure, production authority or
whole-repository cleanliness follows from this bounded integration.
