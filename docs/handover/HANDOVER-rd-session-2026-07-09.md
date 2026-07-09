# HANDOVER — R&D session working alongside Galerina (2026-07-09)

**From:** the main Galerina session (owns and is responsible for everything that lands in this repo).
**To:** the R&D session.
**Authority:** the main session is the boss for Galerina. R&D **proposes**; the main session **lands**. The owner (addressed as **Sir**) executes all pushes, merges, and ceremonies. House rules ZT-01..ZT-51 apply to you in full: `docs/rules/rules-zero-trust-sir.md`.

---

## 1 · Ground truth as of this handover

| Item | State |
|---|---|
| Working branch | `refactor/tmf-format-to-spore`, tip `e906ae56`, **in sync with origin** (owner pushed) |
| Core-compiler suite | 4390/4390 green |
| Self-hosted corpus | 8/8 `check`-clean (`src/self-hosted/*.fungi`); **not yet the running toolchain** |
| Compiler reality | 88 `.ts` files vs 8 `.fungi`; the CLI runs compiled TypeScript (`dist/index.js`). "100% .fungi, no .ts" is **false today** — it is step 5 of a staged plan |
| Local gate matrix | 25/25 build-free gates green; conformance scanner 9 checks self-test-clean |
| ADT ABI (owner gate #8) | **DECIDED: host-shim.** The main session is building it **now** — this surface is locked to me (see §4) |

## 2 · Your scope (DO)

1. **TritMesh Database R&D** — `.hypha` query engine and `.spore`-consuming design work. This engine is **external to Galerina**: design in your own workspace/repo, consume Galerina only through its published readers and specs. Its by-construction claims are **design-stage** — mark them SPEC'D, never CONFIRMED.
2. **Research and specs** — papers, threat models, grammar proposals (Tier-3 `.gate` grammar stays proposal-only). Use the claim tiers honestly: CONFIRMED / SPEC'D / DEMONSTRATED / GAP / OPEN-RISK.
3. **Propose Galerina changes** — as PROMPT-style handover docs or patch files for the main session to review and land. Include: what you verified **by running**, exact commands, and which gates you re-ran (ZT-51).
4. **Read anything** — the repo, the graph index, the docs. Reading is unrestricted; landing is not.

## 3 · Hard prohibitions (DO NOT)

1. **No pushes, no PRs, no merges, anywhere** — the owner does all of these by hand (ZT-15). Do not "helpfully" run any command from the owner-gates table (§5).
2. **No commits into Galerina.** You propose; the main session lands. If you believe something must land urgently, flare it to the owner with `Sir,` and stop.
3. **Never touch the frozen surfaces:**
   - crypto/wire labels and golden vectors (`.spore` v0 format, KEM/DEM/AAD strings),
   - `kemdem.ts`, `tower-citizen` crypto, `tri-pipe` interop — the working TCB,
   - the gate trust-root repo `ZT-Galerina-GRAPH-ASCII-v2` (owner + main session only).
4. **Do not delete or "convert" `.ts` toward self-hosting.** Deleting the TypeScript toolchain deletes the only thing that compiles `.fungi`. Self-hosting is staged (lowering → corpus green → crypto self-host → host bridge → convert outward). Any shortcut here is a refusal case, not an optimisation.
5. **Do not recreate the retired `Galerina-R-AND-D` folder** (deleted 2026-07-09; its graph project is the archive of record).
6. **No absolute local paths** (drive letters, user-home paths) in any file that could ever be committed — public-repo leak (ZT-17). `scripts/audit-path-leak.mjs` enforces; run it before proposing files.
7. **Never green a red gate by disabling, skipping, or loosening it.** A red gate is the check working. Fix the cause or flare it.
8. **No `git add -A` / `git add .`** in any repo, ever — explicit pathspecs only (ZT-14).
9. **ZTF-Knowledge-Bases:** additive doc commits only if the owner has granted you that channel; never rebase, force-push, or rewrite history there. If unsure, write nothing and flare.
10. **Do not edit the ADT/WASM surface while I hold the lock** (§4): `wat-emitter.ts`, `gir*`, `wasm-runtime.ts`, the CLI run path, `src/self-hosted/*`.

## 4 · Surface locks (collision avoidance)

The main session is actively building the **ADT host-shim** (standalone WASM Result/Option/String + `?` lowering). Until the work-state memory says it has landed, treat the files in §3.10 as read-only. If your research needs a change there, write the proposal and queue it — do not edit.

## 5 · Owner-gates you must never execute

Push branch / merge PRs / close PRs / delete remote branches / create the private gate-repo remote / KB pushes / KB PAT minting / ML-DSA-65 ceremony (+ F10 AAD fold + `.spore` v1 bump) / history-purge of the leaked `ae55016e` blobs. These exist **because** they are owner-only. Listing one in your output as a suggestion is fine; running one is a breach.

## 6 · Handoff protocol back to me

- One doc per proposal, dated, claim-tiered, with a **verification transcript** (commands + observed output).
- State what you did NOT verify. Unverifiable claims are marked PLAUSIBLE and never banked.
- If a proposal touches security posture, include the fail-closed analysis: what happens on the missing/invalid/hostile input path.
- Address the owner as **Sir**; prefix any line needing a human decision with `Sir,`.

*— main Galerina session, 2026-07-09*
