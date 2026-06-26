# Galerina Self-Audit — 40-Issue TypeScript Toolchain Threat Sweep (2026-06-25)

Owner asked (notes 60 §I non-code + notes 61 code-writing): the Galerina compiler/CLI/runtime is **itself** a
TypeScript/Node project — **have we cloned these 40 classic TS security issues, and if so what do we do?**
Audited the REAL repo with a 17-agent workflow (8 category finders → adversarial red-team skeptics over every
"safe" claim → synthesis). Workflow `wf_73480c62-b2b`. One skeptic override (61-6) was independently confirmed in
source and adopted.

> **Headline:** of 40 issues, **only 4 are genuinely cloned (`yes`)** — 60-4, 60-6, 61-2, 61-9 — plus **15
> `partial`** (real but bounded/mitigated) and **21 `no`** (15 structurally absent because we are a *compiler*, not
> a web app — each verified against the host effect-runtime, the stub web packages, and the real parsers, not
> assumed). The Galerina **language** structurally prevents ~12 of these classes for app developers (deny-by-default
> effects, Map-backed prototype-pollution-immune records, the taint-checker, `SPORE-SOURCE-ESCAPE-001`, the
> fail-closed App Kernel). **The single most important real finding is 61-9 (SSRF):** the live interpreter `http.*`
> path (`stdlib.ts` `fetch`) uses a bypassable inline regex and never calls the already-built `egress-guard.ts` —
> `[::ffff:169.254.169.254]`, `*.corp`, `100.64.x` CGNAT, and DNS-rebinding all pass. It is the only
> `clonedInOurCode: yes` finding that is also a directly exploitable code path (ZT 48).

## Findings table

| # | Issue | Cloned? | Lang exposes to devs? | Evidence (file:line) | Action | ZT |
|---|---|---|---|---|---|---|
| **Supply Chain & Dependency Hijacking** ||||||
| 60-1 | Malicious `@types` packages | partial | partial | 30 pkgs `@types/node ^25.9.1`/`^22.10.0`; `fuse-loader.ts:24-65` drops `@types/node`, hand-declares node slices | config | 62 |
| 60-2 | Typosquatting | no | n/a | All 8 external deps spelled correctly; `audit-name-collisions.mjs` guards names | already-safe | 90 |
| 60-3 | Dependency-confusion | partial | yes | All internal deps `file:`; `@galerina` scope unclaimed, `@galerina/core` not `private`; LANG strength SPORE-PKG-002 + `fuse-loader` registryCheck | config | 58 |
| 60-4 | Deep transitive vulns | **yes** | n/a | snarkjs locks 38 entries (ejs/escodegen/static-eval…); **no `npm audit`/OSV/dependabot in CI** | ci | 48 |
| 60-5 | Malicious lifecycle scripts | partial | yes | 0 first-party hooks; only `argon2 install` (legit gyp); no `.npmrc`/`ignore-scripts`; LANG SPORE-PKG-004 deny | config | 60 |
| 60-6 | Unpinned deps (`^`/`~`) | **yes** | partial | 100% caret, 0 pins; locks mitigate `npm ci` but `npm install`/root absorb | config | 55 |
| **Build Pipeline & CI/CD** ||||||
| 60-7 | Poisoned post-`tsc` artifacts | no | no | `dist/` untracked, no post-tsc mutation; `.lindex` integrity-tagged | already-safe | 84 |
| 60-8 | No build provenance / SLSA | partial | partial | `provenance.mjs` unsigned sidecar (devtools); WASM path fully signed; no SLSA/cosign | build | 62 |
| 60-9 | Compromised publish tokens | no | n/a | No publish pipeline/token; workflows `contents: read`; gitleaks weekly; key gitignored | already-safe | 88 |
| 60-10 | Env-var injection at build | partial | partial | `NODE_OPTIONS` read nowhere; signing-env fail-secure; LANG `env.get` needs `secret.read` | config | 80 |
| **Compiler & Config Blind Spots** ||||||
| 60-11 | Source-map exposure | partial | n/a | 91/93 `private`; `galerina-devtools-project-graph` ships `.js.map`+`.d.ts.map` | build | 62 |
| 60-12 | tsconfig `extends` hijack | no | n/a | 0 `extends` in 66 tsconfigs; no base config | already-safe | 95 |
| 60-13 | Target-downgrade attack | no | n/a | 66/66 `target: ES2022`; no down-level helpers | already-safe | 96 |
| 60-14 | `outDir` escape | no | n/a | All `outDir: dist` local; no `..`/absolute | already-safe | 94 |
| **Tooling & Execution Environment** ||||||
| 60-15 | Vulnerable bundlers/minifiers | no | no | 0 esbuild/rollup/webpack/terser/babel; emits `.wat`/`.wasm` directly | already-safe | 92 |
| 60-16 | Malicious tsserver plugins | no | n/a | workspace settings `{}`; no `compilerOptions.plugins` | already-safe | 90 |
| 60-17 | Linter hijacking | no | n/a | No eslint config/dep; 13 `eslint-disable` cosmetic; **no SAST gate in CI** | lint | 78 |
| 60-18 | `ts-node`/`tsx` temp-swap | no | n/a | 0 ts-node/tsx; builds `dist` + `node --test` | already-safe | 90 |
| 60-20 | Dev-machine compromise via tooling | partial | no | child_process uses constant/array args; residual = floating `^` + no root lock; LANG `process.spawn` gated | config | 74 |
| **Type-Safety Illusion** ||||||
| 61-1 | `any`-abuse on external input | partial | no | 29 `:any`/16 `as any`, none on untrusted dataflow; parsers ingest `unknown`; no CI `tsc` gate | ci | 78 |
| 61-2 | Blind type assertions | **yes** | no | `vault-client.ts:103/121 as KvV2Response` (untrusted Vault HTTP); `store.ts:67 as Manifest` | build | 66 |
| 61-3 | Missing runtime validation | partial | no | 0 zod/io-ts/ajv; hand-rolled, rigorous in trust-critical parsers but inconsistent | build | 70 |
| 61-4 | Dangerous non-null `!` | partial | no | 24 `!` on compiler-internal AST/IR only; none on JSON-derived input | lint | 82 |
| 61-5 | `@ts-ignore` masking | no | no | 1 benign ESM-interop hit; no `@ts-nocheck`/`@ts-expect-error` | already-safe | 95 |
| 61-6 | Enum reverse-map key leak | **partial** *(skeptic override)* | no | `DataClassification` regular enum (`galerina-core-economics/src/index.ts:137`) → reverse map; `risk-calculator.ts:78 DataClassification[profile.classification]` CLI-reachable; input pre-validated ⇒ display-only | build | 60 |
| **Injection & Input Mishandling** ||||||
| 61-7 | SQL/NoSQL injection | no | no | db-* packages are stubs (no `src/`); taint-checker SqlValue/NoSqlQuery sinks | already-safe | 88 |
| 61-8 | Command injection | partial | no | #174 sink fixed → `spawnSync(...,{shell:false})`; **residual dead `execSync` import** `cli.ts:21`/`galerina.mjs:27` | lint | 86 |
| 61-9 | **SSRF (user URL → fetch)** | **yes** | partial | `stdlib.ts:1184-1235` inline regex bypassable; hardened `egress-guard.ts:313-331` **never imported**; taint sink name mismatch (`Http.fetch` vs `http.*`) | build | 48 |
| 61-10 | XSS / playground | no | no | 0 `innerHTML`/`.tsx`; servers emit `text/plain`/Buffer only | already-safe | 90 |
| 61-11 | Path traversal | no | no | 3-layer fs confinement `stdlib.ts:1238-1310` (relative + realpath symlink + fail-closed) | already-safe | 85 |
| **Object & Memory Manipulation** ||||||
| 61-12 | Prototype pollution | no | no | No deepMerge over external data; records `ReadonlyMap`; YAML allowlist-reads | already-safe | 92 |
| 61-13 | Mass assignment | no | no | No `{...req.body}`; kernel hands body as opaque `json: unknown` | already-safe | 90 |
| 61-14 | Insecure deserialization | partial | n/a | Mostly allowlisted typed fields; gap = `secrets-tmf store.ts:66-68` bare `as Manifest` (post-AEAD only) | track | 80 |
| 61-15 | Unsafe Buffer alloc | no | n/a | 0 `new Buffer(`/`allocUnsafe`; `Buffer.from`/`alloc` only | already-safe | 100 |
| **Cryptography, Auth & Logic** ||||||
| 61-16 | Timing attack (non-CT `===`) | partial | no | `cert-gate.ts:124` non-CT `===` on cert digest — **both operands PUBLIC SHA-256**; real sigs use CT `crypto.verify`; MACs use `timingSafeEqual` | track | 88 |
| 61-17 | Insecure randomness | no | no | All security randomness CSPRNG; 2 `Math.random` are trace IDs only | already-safe | 96 |
| 61-18 | Hardcoded secrets | no | n/a | 0 secret literals; key gitignored; only committed PEM is a redaction-test fake; gitleaks + revocation registry | already-safe | 90 |
| 61-19 | Unhandled promise rejection (DoS) | partial | n/a | `index.ts:434 void handleRequest(...)` floating, no `.catch()`, no global net | build | 82 |
| 61-20 | Client-side-only authz | no | no | Authz server-side, fail-closed; kernel non-pluggable; auth gate-6 before dispatch | already-safe | 94 |

## Prioritized remediation (genuine BUILD / CI / CONFIG only — `already-safe`/`n/a`/`track` omitted)

### A. Fix our own toolchain
1. **[ZT 48 · BUILD · 61-9 SSRF — TOP PRIORITY]** Wire `egress-guard.ts` into the live `fetch` path: replace the inline hostname regex in `stdlib.ts` `networkAsync` with `guardOutboundHost(new URL(url).hostname)`, then `dns.lookup` (all addresses) → `guardResolvedAddresses()`, connect only to a verified pinned IP, block on `requiresDnsRecheck`. Reconcile the taint sink name (`Http.fetch`/`http.*`). Regressions: `[::ffff:169.254.169.254]`, `*.corp`, `100.64.x`, DNS→`127.0.0.1`.
2. **[ZT 48 · CI · 60-4]** Add `npm audit --omit=dev --audit-level=high` (or `osv-scanner -r .`) per package + Dependabot/Renovate; gate snarkjs ext behind opt-in install.
3. **[ZT 55 · CONFIG · 60-6]** Mandate `npm ci` everywhere + `lockfile-lint`; add a root `package-lock.json` (or document dep-free).
4. **[ZT 58 · CONFIG · 60-3]** Claim the `@galerina` npm scope; `"private": true` on `@galerina/core` + `@galerina/devtools-project-graph`; keep internal deps `file:`/`workspace:`; turn `requireCertified` on in prod.
5. **[ZT 60 · CONFIG · 60-5]** Root `.npmrc` `ignore-scripts=true`; allow-list `argon2`'s build; document `npm ci --ignore-scripts`.
6. **[ZT 62 · BUILD · 60-8]** Extend `provenance.mjs` to cover `dist/` + CLI and **sign** with the existing `attestation.ts` hybrid signer.
7. **[ZT 62 · BUILD · 60-11]** `galerina-devtools-project-graph`: exclude `*.map`/`*.d.ts.map` from the published tarball (`files:` allowlist or drop `sourceMap`/`declarationMap`); add a `npm pack --dry-run` CI lint.
8. **[ZT 62 · CONFIG · 60-1]** Pin `@types/node` exactly per package; unify the major; keep the `fuse-loader` no-trust-`@types` pattern.
9. **[ZT 60 · BUILD · 61-6]** `DataClassification` → `const enum` (or string-keyed `Record` + reject-on-undefined at `risk-calculator.ts:78`). Display-only today.
10. **[ZT 66 · BUILD · 61-2]** Replace blind `as T` with narrowing guards, highest-trust first: `vault-client.ts:103/121` → `isKvV2Response(x: unknown)`; then `secrets-tmf store.ts:67`. Shared `assertShape` per the `manifest.ts` gold standard.
11. **[ZT 70 · BUILD · 61-3]** Formalize the `typeof`-guard pattern into a shared `@galerina/schema` `parse(unknown): T | trap`; route all external/network parsers through it.
12. **[ZT 74 · CONFIG · 60-20]** Overlaps #3/#5: committed root lockfile + `npm ci --ignore-scripts` + pin the crypto/wasm `^` ranges.
13. **[ZT 80 · CONFIG · 60-10]** Set `env: { NODE_OPTIONS: '' }` on CI build/test jobs.
14. **[ZT 82 · BUILD · 61-19]** `.catch()` at `index.ts:434` (fail-closed 500) + a process-level `unhandledRejection`/`uncaughtException` backstop.

### B. Additive lint / regression locks (no live defect)
- **[61-8]** Remove the dead `execSync` import (`cli.ts:21`, `galerina.mjs:27`); lint banning `execSync`/`exec`/`shell:true` with a non-literal first arg so the #174 sink can't reappear.
- **[61-1]** `tsc --noEmit` per package in CI (strict already on) + eslint flat config `@typescript-eslint/no-explicit-any=error`.
- **[60-17/60-19]** Pinned eslint + minimal security ruleset (`no-eval`, `no-implied-eval`, `detect-child-process`, `ban-ts-comment`) as an enforcing CI job; forbid inline disables of security rules.
- **Regression-lock guards:** tsconfig `target ES2022+` (60-13); future `extends` resolves inside-repo (60-12); `outDir`/`rootDir` reject `..`/absolute (60-14); ban `new Buffer(`/`allocUnsafe` (61-15); re-grep `innerHTML` (61-10); extend `audit-name-collisions.mjs` to a vetted external-dep allow-list (60-2).

### C. Track (no build now)
- **61-14** secrets-tmf `parseManifest` fail-closed validator — **✅ DONE (`f860bfd`)**: `validateManifest`/`validateSecretMeta` replace the bare `as Manifest`; prototype-free rebuild + `__proto__`/`constructor`/`prototype` rejection; 18/18.
- **61-16** route `cert-gate.ts:124` through `timingSafeEqual` (public digests → hygiene, not exploitable).

## Honesty note
Every `n/a`/`no` resting on "we're a compiler" was checked against the **actual host effect-runtime, the web
packages, and the real parsers** — not assumed. The SSRF finding is precisely where "compiler ≠ web server" was
**rejected** because the interpreter *does* call `fetch`. Net posture: a low real-clone count (4 `yes`, 1
exploitable) is an accurate, evidenced result. The dominant defenses are structural (deny-by-default effects,
Map-backed records, the taint type-system, the non-pluggable fail-closed kernel, signed WASM admission); the
residual gaps cluster in **un-gated dependency hygiene** and the **one unwired SSRF guard** — all addressable
without language changes.

*Source: workflow `wf_73480c62-b2b` (2026-06-25), verify-before-build against the live compiler.*
