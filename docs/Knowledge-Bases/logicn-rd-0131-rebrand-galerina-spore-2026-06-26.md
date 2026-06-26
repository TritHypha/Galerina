# RD-0131 — Rebrand LogicN→Galerina, .lln→.spore (R&D ONLY — DO NOT EXECUTE)

**Date:** 2026-06-26 · **Source:** owner note `notes/68-branding.md` · **Status:** R&D ANALYSIS ONLY — owner said explicitly *"R&D only do not put into action"* (brand/trademark usage already cleared by owner elsewhere). This doc scores the **rename engineering**, NOT the brand choice. **No rename has been executed.**

## Verdict in one line
A naive `find-and-replace LogicN→Galerina` + `.lln→.spore` would **silently invalidate every persisted signature/manifest and break 362 diagnostic-code registrations + lockfiles/URLs** — it is a fail-open-equivalent (ZT 2). The same rename done as a **category-aware staged codemod with an exclusion list + per-category verify** is safe (ZT 6–7). The blast radius is large but mechanical: **2,259 files · 3,654 `logicn` refs · 429 `.lln` files · 1,641 `.lln` string refs · 93 `@logicn/` packages · 8 self-hosted `.lln` sources**.

## ZT rubric (0–10): 7–10 safe/sound · 5–7 doable with care · 3–5 risky · 0–3 fail-open / breaks security artifacts — do NOT blind-do.

## The table

| # | Rename component | Scope | Naive find-replace risk | Safe approach | ZT |
|---|---|---|---|---|---|
| 1 | **Brand concept** (LogicN→Galerina, .lln→.spore) | — | — | Owner-cleared; mycological theme is coherent (mycelium = distributed governed network, *spore* = portable compiled unit). **One factual flag (defer to owner):** *Galerina* is a genus incl. the deadly-poisonous *G. marginata* (amatoxins) — a possible negative association for a security brand; owner says cleared. | n/a (owner) |
| 2 | **Crypto domain-separation contexts** — `logicn.proofgraph.governance.v1`, `logicn.bridge.manifest.v1`, `logicn.audit.attestation.v1`, `logicn.config.environment.v1` | 4 strings | 🔴 **CRITICAL** — these are HASHED INTO signatures/manifests. Blind-renaming them **invalidates every persisted ProofGraph/attestation/.lmanifest** (verification fails closed → all signed artifacts rejected). Silent security breakage. | **KEEP `logicn.*` verbatim** (they are versioned WIRE-FORMAT identifiers, not brand surface), OR do a deliberate `galerina.*.v2` bump WITH a re-sign migration + dual-accept window. NEVER in the blanket replace — add to the exclusion list. (Design-stability crypto-versioning rule.) | 2→8 |
| 2b | **`lln.*` signature/schema VERSION tags** — `lln.gov.sig.v1`/`v2` (governance-signature ALGORITHM tag; v2 = hybrid Ed25519+ML-DSA-65), `lln.runtime.audit.v1` (audit-event schemaVersion), `lln.runtime.manifest.v1` / `lln.gir.v1` / `lln.govdiff.v1` (schema tags) | ~6 tags | 🔴 **CRITICAL** — a DISTINCT token from #2 (`logicn.*`) and #3 (`LLN-`). HARD-GATED in verification: `proof-graph.ts` rejects any `algorithm !== "lln.gov.sig.v2"` (+ v1), `audit-writer.ts:77` fails closed on `schemaVersion !== "lln.runtime.audit.v1"`. A `lln`→`spore`/`galerina` sweep of the BARE `lln` token ⇒ the verifier expects `spore.gov.sig.v2` while persisted sigs are `lln.gov.sig.v2` ⇒ **every hybrid governance signature + the HMAC'd audit chain become unverifiable** (same fail-closed invalidation as #2). Bites IFF the codemod touches the bare `lln` token (not only the `.lln` extension) — PIN it, don't assume. | **KEEP `lln.*` verbatim** (versioned wire-format, not brand surface) OR a deliberate `vN`-bump WITH a re-sign/dual-accept migration. Exclude with regex `\blln\.[a-z]` from any brand sweep. (Same crypto-versioning rule as #2.) | 2→8 |
| 3 | **`LLN-` diagnostic codes** (e.g. LLN-GOV-019) | 362 codes | 🔴 break the doc-drift lint, `diagnostic-namespace` registry, `governance-rules.md`, every `expected.diagnostics.txt`, KB cross-refs | **KEEP `LLN-`** initially (it is a stable code NAMESPACE decoupled from the brand — like CWE/CVE). Optional later: migrate to `GAL-` as its OWN staged task (registry + 362 codes + all expected-diagnostics + lint in lockstep). Exclude from the brand replace. | 3→8 |
| 4 | **`.lln`→`.spore` extension** | 429 files + 1,641 string refs + 8 self-hosted sources + .gitignore globs | 🟡 file globs, `parseProgram(filename)`, CLI dispatch, extension constant, test fixtures, the **self-hosted bootstrap** (parser.lln→parser.spore + the loader that reads them) | Centralize on ONE extension constant if not already; `git mv` every file (preserve history); update globs/checks/.gitignore; rebuild the self-hosted bootstrap last. Mechanical but wide — verify the compiler self-hosts after. | 5 |
| 5 | **`@logicn/` npm scope + pkg dirs** | 93 packages | 🟡 every package.json name + every import specifier + workspace globs + the 93 `.graph/` border dirs | Scripted: rename scope in all package.json, codemod import specifiers, rename pkg dirs via `git mv`, update workspace config. Re-run the Hardened Border (`graph --check`). | 5 |
| 6 | **CLI binary `logicn`, `.logicn/` config dir, env vars** | CLI + config | 🟡 `logicn run`→`galerina run`; `.logicn/capabilities.local.json`; LOGICN_* env vars; AGENTS.md/READMEs | Rename binary + bin entry; keep a `logicn` shim alias for one release; rename config dir with a fallback-read of the old path for one release. | 5 |
| 7 | **URLs, lockfiles, third-party refs** | repo URL, package-lock, vendored | 🔴 a blanket replace corrupts `github.com/.../LogicN` URLs, `package-lock.json` integrity, vendored third-party strings | Hard EXCLUDE: `**/package-lock.json`, `node_modules/`, `*.lock`, URLs (handle the repo-rename separately on the platform), vendored spec dirs. | 3→8 |
| 8 | **The rename SCRIPT itself** | tooling | 🔴 a blind `sed -i` is the fail-open: no dry-run, no case-handling, no exclusions, no per-step verify | A deterministic, **idempotent, dry-run-first codemod**: case-aware (LogicN/logicn/LOGICN→Galerina/galerina/GALERINA), explicit exclusion list (#2/#2b/#3/#7), `git mv` for files (history), and **build + full suite + 9 CI audits + graph --check after EACH category** (fail-closed: stop on first red). | 6 |

## Landmine register (must be EXCLUDED from any blanket replace)
1. **The 4 crypto context strings** (`logicn.*.v1`) — invalidates signatures. Keep or version-bump-with-migration; never blind-replace.
2. **`lln.*` signature/schema version tags** (`lln.gov.sig.v1`/`v2`, `lln.runtime.audit.v1`, `lln.runtime.manifest.v1`, `lln.gir.v1`, `lln.govdiff.v1`) — a DISTINCT token from the `LLN-` codes (#3 below) and the `logicn.*` contexts (#1); hard-gated in `proof-graph.ts` (`algorithm !==`) + `audit-writer.ts:77` (`schemaVersion !==`). A brand sweep of the **bare `lln`** token invalidates every hybrid signature + the HMAC'd audit chain. Exclude with `\blln\.[a-z]`; keep verbatim or version-bump-with-migration. *(Completeness-critic finding, worker RD-0121 → hub, 2026-06-26 — verified against live source.)*
3. **`LLN-` (362 codes)** — keep the namespace; migrate separately if ever.
4. **`package-lock.json` / `node_modules` / `*.lock`** — integrity hashes; never touch.
5. **Repo/GitHub URLs** — rename on the platform, not by text replace.
6. **Vendored third-party specs** (e.g. `logicn-ext-tmf/spec/` pins) — don't rewrite upstream.
7. **Git history** — use `git mv` for the 429 `.lln` + 93 pkg dirs so blame/history survives.

## Recommended sequence (when/if owner greenlights — staged, verify-after-each, fail-closed)
1. Dry-run the codemod; produce a diff report + the exclusion-hit list for owner review.
2. Decide #2 (crypto contexts: keep vs v2-bump) and #3 (LLN- vs GAL-) FIRST — they gate everything.
3. `.lln→.spore` (git mv + globs + self-hosted bootstrap) → build + self-host + full suite.
4. `@logicn/`→`@galerina/` scope + dirs → build + graph --check border.
5. CLI/config/env (+ shims for one release) → e2e.
6. Docs/KB/README text sweep (the bulk of the 3,654 refs) → graph (kb) + doc-drift audit.
7. Final: full suite (60/60) + 9 CI audits + project/kb/package graphs all green; then the platform repo-rename.

## Compliance
- **R&D ONLY** — owner directive honored; **nothing renamed**. This is the blueprint + risk table.
- **Verify-before-build:** blast radius + landmines measured against the live tree (grep counts above), not assumed.
- **Zero-trust:** the headline finding is that the naive method silently breaks security artifacts (crypto contexts) — flagged as the #1 landmine, mapped to the design-stability crypto-versioning rule.
- **Substrate lane:** binary/digital tooling; no crypto/photonic operand (the crypto note is about NOT disturbing existing signatures).

## Update 2026-06-26 (RD-0131b — crypto-landmine completion)
Worker RD-0121's read-only completeness-critic pass on this blueprint found a crypto landmine the first cut missed: the **`lln.*` signature/schema version tags** (row **2b**, register item **2**). These are a third, distinct token class — neither the `logicn.*` domain-separation contexts (#2) nor the `LLN-` diagnostic codes (#3) — yet they are hard-gated in verification (`proof-graph.ts` algorithm check + `audit-writer.ts:77` schema check). Verified against live source this session (`proof-graph.ts` `lln.gov.sig.v1|v2`; `audit-writer.ts:77` `lln.runtime.audit.v1`). The rebrand exclusion list now covers all three crypto/wire-format token classes (`logicn.*` contexts, `lln.*` version tags, `LLN-` codes). Still R&D-only — nothing renamed.
