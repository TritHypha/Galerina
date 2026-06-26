# Ecosystem / "social-computer" positioning + the verified-import model (R&D 0051)

**Status:** DESIGN / POSITIONING (production **READ-ONLY**, zero code) · **Date:** 2026-06-19 · **Source:** R&D 0051
(`Galerina-R-AND-D/ecosystem-positioning/ECOSYSTEM-LANGUAGE-POSITIONING-0051.md`) · **Grounding bench**
`verified-import-surface-verify.mjs` **exit 0, 13/13**.

## Verdict
**Positioning, not a language change.** "Capability-as-a-social-contract" is **already shipped** — adopting the
ecosystem / social-computer reframe adds **zero grammar / type / runtime**. The only design outputs are **two decisions on
the existing fuse/admission path**: the verified-import HYBRID profile, and the core-vs-mesh stdlib boundary.

## Already shipped (the reframe describes reality)
- `contract` **effects / intent** parsed in core (`parser.ts:71,402,647,749-770`); permissions are **capability
  deny-by-default** + Domain-Guard `guard.permitted_capabilities` (no separate permissions sub-block).
- `governance-verifier.ts` SPORE-GOV effect obligations (verified).
- `galerina build --package` signs **wasm + lmanifest**, fuse descriptor + `wasmSha256` embedded **before** signing; build
  signs **standalone Ed25519** today.
- **fuse-loader three fail-closed gates:** hash (`SPORE-FUSE-HASH-MISMATCH`), signature (`crypto.verify`,
  `SPORE-FUSE-UNSIGNED`/`SIG-INVALID`), deny-by-default capabilities via a **closed wasm import object**
  (`SPORE-FUSE-UNKNOWN-CAP`).
- `SecurityPosture` off|auto|on (default **auto**, fail-secure; prod/staging/unknown → on).
- `#94` import DAG wired.

→ So adopt the **Erlang/OTP-of-zero-trust** ("Let it deny" + fail-closed gates = trust-tolerant distributed systems)
framing in **docs / north-star only**.

## Decision 1 — verified-import HYBRID
- **prod / mesh = signed-hash** via the shipped fuse path; **dev = file-path / URL.**
- The **import profile is DERIVED from the existing `SecurityPosture`** (off/auto/on; unknown→on = signed-only), not a new
  knob — a **policy binding**. Strict precedence: **tamper is denied in every posture.**
- **NO lockfile.** The signature already binds `wasmSha256` *before* signing, so a lockfile would be redundant; instead
  emit an **untrusted `import-closure.json` report** (from the `#94` DAG; `keyId` + `wasmSha256` per node) — a *report*,
  not a trusted manifest.

## Decision 2 — core vs mesh stdlib boundary
- **Core keeps:** capability / effect / contract + **Ed25519 as a build step**.
- **Separate TritMesh layer:** identity/signature **types**, `runtime.emit`/`onSignal`, P2P/Any-Sync. Absence is a
  **standing bench tripwire** — `MeshIdentity` / `CryptographicSignature` count = **0 over 759 files**; no new
  Mesh-branded type names (Mesh is a RETIRED brand — UK trademark; "mesh layer" = the generic concept, **TritMesh** = the
  kept name of the separate networking project). See [[galerina-mesh-brand-rename]].

## SHIPPED 2026-06-20 (owner green-lit, after 0050)
- **`deriveImportProfile(resolved)`** in `@galerina/core-config` (`posture.ts`) — the policy binding: posture `on`
  (prod/staging/unknown/invalid) ⇒ `requireSignature` (signed-hash admission); posture `off` (dev/test) ⇒
  `allowFilePath`. Fail-secure: only an explicit `off` relaxes. Tamper is denied by the loader regardless. +4 tests.
- **`requireSignature` enforcement** in `fuse-loader.ts` (`FusePackageOptions`) — wired into BOTH `fusePackage`
  (single) and `fusePackages` (set). It **overrides `allowUnsigned` fail-secure**: an unsigned import is refused even
  if `allowUnsigned:true` was passed (single ⇒ `SPORE-FUSE-UNSIGNED` "posture requires a signature"; set ⇒
  `SPORE-FUSE-SET-UNSIGNED`). The host derives the boolean from `deriveImportProfile(...)` and passes it — app-kernel
  stays decoupled from core-config. +2 tests.
- **`buildImportClosure(dirs)`** — the UNTRUSTED `import-closure.json` report (`trusted:false` ALWAYS): `{ name,
  wasmSha256, keyId, signature }` per module, each run through Gates 1+2 (a tampered module throws). NOT a lockfile —
  the trust already lives in the signed manifest (signature binds `wasmSha256` pre-sign). +1 test. app-kernel 57/57.

## Honest tiers / open
- **Net-new — now BUILT (above):** posture-derived import profile + `requireSignature` enforcement + the
  `import-closure.json` report. Open follow-up: wire the host to actually call `resolvePosture`→`deriveImportProfile`
  →`fusePackages({requireSignature})` end-to-end (the pieces exist; the production wiring is the host's to assemble).
- **#34-gated:** ML-DSA-65 hybrid signing is a placeholder — the fuse loader treats the `Ed25519 + ML-DSA-65` placeholder
  manifest as **UNSIGNED** until #34 (Node FIPS-204 key custody) lands.
- **Tech debt:** `#105` `admitAndInstantiate` gate is **export/test-only**, NOT in the production fuse path.
- **Forward line:** signed-hash admission is the trust fence for a capability-gated photonic T-MAC offload across
  untrusted peers (deny-by-default via Gate 3; unknown→deny mirrors `SPORE-SUBSTRATE-001`; Gate-1 `wasmSha256` is the audit
  anchor). Governance stays digital + bit-exact on core; HW-gated; no perf claim.

Pairs with [[galerina-social-ecosystem-cloud-native]], [[galerina-wasm-compilation-granularity]] (0052 — the import model
rides the multi-module decision), [[reference-galerina-runtime-status-sot]] (#175 fuse / #105 admission),
[[galerina-key-custody-rotation-decision]] (#34).
