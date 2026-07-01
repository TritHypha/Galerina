# TODO

Living task list. Authoritative forward view: `../ZTF-Knowledge-Bases/galerina-roadmap.md`.
Consistency rules + gates: `docs/CONSISTENCY_GATES.md`.

## ✅ Done — 2026-07-01 (pushed) + 2026-07-01/02 evening sessions (local)
- [x] 2026-07-01 day: 15 commits **PUSHED** → `origin/main` (`c691d81..302565d`) — effect-SoT Commits 1–3
      (full rename cddb930 + V_DPM domain bits c2492cb), proofs/kb-index/memory-graph gates, signing fix.
- [x] governance:diff fixture noise — gitignored `build/*.fungi` no longer phantom "added"/false EXPANSION — `941ec41`
- [x] **CG-7** annotation→re-fuse→unsigned cascade closed (owner: "both ends + detector"): writer guard +
      rebuild guard (`--force` to override) + BLOCKING `signed:fixtures` phase-close gate; `index.fungi` residue reverted — `4190287`
- [x] **Declared-effect hardening** (owner: "harden after proof"; proof P1–P6 green in KB `proofs/rd-declared-effect-hardening-proof.mjs`):
      `telemetry.read` canonical + mask-visible (bit 14) · `ai.infer` → one-way alias of `ai.inference` ·
      `eval.execute` DENY-ONLY (`FUNGI-EFFECT-006`, fails EVERY profile incl. dev) · Stage-B `knownEffects`
      reconciled (C9 drift GONE) · new C10 (deny-only name must never be grantable) · corpus renamed
      (healthcare `medical.read`→`phi.read`, `ai.infer`→`ai.inference`; Level-9 `pii.write`→`database.write`
      keeping the pinned Wave-2 error semantic).
- [x] **CG-4 at the bundled CLI**: lenient `galerina build`/`build --package` no longer mints a signed
      `.lmanifest`/`.fuse.json` for a production-violating artifact (was proven still hybrid-signing
      `effects{totally.fake.effect}` on 2026-07-02; cli.ts had the gate, galerina.mjs did not).
- [x] **CG-6 corpus gate**: `scripts/audit-corpus-effect-names.mjs` (`effects:corpus` in phase-close) — the
      teaching corpus may declare only names a production compile accepts; aerospace invented names on a
      reviewed allowlist pending the domain-namespace decision.

## 🔲 Next (short-term)
- [ ] Push the local commits to `origin/main` (owner OK required — publish act).
- [ ] **Owner-gated: domain-effect namespaces** — aerospace showcase invents `mission.read`/`orbit.compute`/
      `propulsion.plan`/`navigation.compute`/`flight_control.propose`. Decide: governed custom-namespace
      mechanism (R&D + ZT-score first) vs canonical-families-only (rewrite showcase). Until then: allowlisted
      WARN-level in the corpus gate; any NEW invented name still blocks.
- [ ] `.graph` A/B fair re-run — PAUSED with the `.gate` model (below).

## 🔲 PAUSED by owner (2026-07-01) — do NOT build until the owner's model explanation
- [ ] **`.gate` integration**: owner revision — `.gate` = the light-ASCII AI-authoring surface (SPEC mis-named
      it `.graph`; original intent `notes/77-mesh-r-d-07.md`); `.graph` = standard ASCII Topology ONLY (never
      logic files alongside `.fungi`); logic IR stays internal GIR unless the explanation says otherwise.
      Hard locks unchanged (runtime pure `.fungi`; deny-only signed-capability admission; one IR; no
      `.gate`-derived `.fungi` on disk). Record: `.claude` memory `galerina-gate-graph-owner-revision-2026-07-01`,
      KB results-log 2026-07-01 OWNER REVISION entry, `ZT-Galerina-GRAPH-ASCII/RESUME-2026-07-01.md` item 2.

## 🔲 Owner-gated (surface; do not build without GO)
- [ ] RD-0231 build spike (~3–5d) — subject to the paused model explanation.
- [ ] OSS top-3: freivalds-verifier · k3-decision · signed-index-sidecar.
- [ ] `galerina build --package <signed-pkg>` direct-invocation refusal without `--force` (CG-7 completion;
      the phase-close detector already catches the resulting drift).
- [ ] Offline re-sign ceremony owed: `greeting.lmanifest` (old-brand `lln.` schema).
- [ ] Runtime-planning roadmap: track the USES/USEDBY dep-graph (incremental recompute, lazy exec, cache-invalidation).

## 🔲 Long-term / carried forward
- [ ] DSS.wasm (#102–106); post-P9 enhancements; CI secret-scan (residual of the #149 revocation).
