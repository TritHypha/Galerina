# Tower Citizen product entries

Current integration sequence: [pre-.fungi work register](../../docs/PRE-FUNGI-WORK-REGISTER-2026-09-22.md),
W02/W03. The table below remains the profile/cluster coverage owner; the
documentation refresh does not close composition admission or certify a load.

## Open review findings — 2026-09-22

The two original conditional-export/self-reference defects in
`src/load-graph.ts` were repaired during this refresh. Independent original
fixtures now conserve Node's target and reject wrong-target allow-lists.
The expanded Tower focused suite covers isolation plus products including
`/governance-v1` and live composition consumers. Full RD-1295 production
admission is not claimed. Package-graph C22 declarations for this package
are repaired (`node:module`, `typescript`, entryPoints).

Map every frozen profile/composition to entrypoints and refusal tests
separately; named subpaths alone are not complete composition admission.
Details: ../../docs/reports/rd1295-c17-review-2026-09-22.md.

Security continuation (same day, dirty tree): certified photonic coupons
snapshot own-data before verify and recheck coupon revocation on every infer
(`src/hybrid-engine.ts`). Focused photonic+bridge tests 24/24. That does not
close RD-1295 composition admission. Report:
../../docs/reports/security-q1q2-continuation-2026-09-22.md.

The package root is a compatibility barrel, not an isolated product. Use
`/kernel`, `/governance`, `/inference`, `/tpl`, `/photonic`, `/custody` or
`/dataplane`. Each entry exports its cluster; shared runtime dependencies are
explicitly enumerated in `src/product-profiles.ts`. Inference retains its TPL
stub bridge and capability-verification dependencies. Photonic uses the shared
vote primitive without loading the TPL simulator.

`/governance` is the kernel-free `cli-check` composition. The frozen
`tower.governance.v1` composition imports both `/kernel` and `/governance`.
`governanceAllowedFiles` in `src/load-graph.ts` admits exactly their combined
Tower stems and explicit external dependency files. It admits no hybrid, TPL,
photonic, registry custody or data-plane modules. Shared bridge attestation is
part of the existing kernel load boundary.

Use `walkLoadGraph` followed by `enforceClosedSet` and `productAllowedFiles`
with `PRODUCT_EXTERNALS` for the chosen entry. The walker permits only the
seven known Tower subpaths and refuses the root barrel and unknown subpaths.
The closed-set check compares canonical file identities, including dependency
files; a basename match never admits an extra file. Dependency upgrades that
change the loaded files require an explicit profile review. These are static
ESM checks; unsupported computed imports refuse, and custom/non-JS loaders
and `import.meta.glob` are not covered.

`/inference` exports `createCertifiedTower` and `createDevTower`. Each returns
a frozen `{ profile, engine }` object, named `tower.certified.v1` or
`tower.dev.v1`. Certified construction checks the existing `compilePolicy`
structural traps, rejects unsigned load and host-native opt-ins, and preserves
the existing governed-egress and hybrid-attestation requirements. Its internal
Tower requires a verified plugin manifest on every self-load. Deployment
evidence can be supplied as `pluginLoadEvidence`; these factories never sign.
Without valid evidence, inference refuses before LOAD/EXEC. The named product
is not a certification receipt or production admission.

Dev defaults to signed loading and denied host-native fallback. Development
use must explicitly set `allowUnsignedLoad: true` and
`governance.allowHostNativeFallback: true` to relax those respective gates.
Other existing capability and bridge gates still apply. Dev rejects a
certified label. Both named products reject photonic configuration; analog
execution needs a separate declared composition. The legacy
`createHybridEngine` bootstrap default is retained for compatibility and is
not the named certified product.

Frozen RD-1295 profiles versus implemented admission:

| Frozen name | Implemented surface | Isolation tests | Gap |
|---|---|---|---|
| `tower.kernel.v1` | `/kernel` + `productAllowedFiles("kernel")` | yes | none for the kernel cluster |
| `cli-check` | `/governance` kernel-free | yes | this is not `tower.governance.v1` |
| `tower.governance.v1` | `/governance-v1` + `governanceAllowedFiles` | yes | consumers may still import `/kernel` and `/governance` separately |
| `tower.inference.v1` | `/inference` cluster | yes | frozen text is governance+inference; the cluster already loads kernel+TPL stub |
| `tower.certified.v1` | `createCertifiedTower` | constructor refusals | not a separate load-graph; unsigned successful deployment untested |
| `tower.dev.v1` | `createDevTower` | constructor opt-ins | not a separate load-graph |
| `tower.tpl.v1` | `/tpl` cluster | cluster only | frozen text is governance+TPL; `/tpl` is not that composition |
| `tower.photonic.v1` | `/photonic` cluster | cluster only | frozen text is governance+photonic |
| `tower.custody.v1` | `/custody` cluster | cluster only | frozen text is kernel+custody |
| `tower.dataplane.v1` | `/dataplane` cluster | cluster only | frozen text is governance+dataplane |
| air-gap / registry / api-data / full-lab | `compositionAllowedFiles(id)` | live photonic/registry/api-data consumers + extra hybrid refuse | not physical SLIDE/VOK; air-gap/full-lab covered by certified+cluster unions |

The core-network package dependency on Tower remains installed. Installation
is not runtime TCB: the focused cert-gate and admission-feedback graphs admit
only the cli-check Tower set. Removing the package dependency remains HOLD.
Independent audit, `.fungi` implementation/conversion, hardware evidence and
SLIDE/VOK admission remain outside this implementation. No signing or
production certification is claimed.

Verification from this package directory:

```text
npm run build
node --test tests/rd-1295-governance-isolation.test.mjs tests/rd-1295-products.test.mjs
# isolation + products including /governance-v1 and composition consumers
```

Use `npm.cmd` on Windows when PowerShell blocks the npm script shim. The
product tests include package consumers, hostile extra-file controls, kernel
cluster import controls, constructor refusals and ternary-vote equivalence.
Constructor fixtures contain deliberately invalid attestation material and
do not prove a successful signed certified deployment.
