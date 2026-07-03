# `.gate` authoring rules — the fail-closed invariants

Every rule below is **enforced by `tools/gate-check.mjs`** (SPEC v0.4). They exist to make the "50-year mistake" (unversioned syntax +
silent tolerance + frozen vocabulary) *unrepresentable*. The master rule: **Unknown ⇒ REJECT, never ignore.** Each row notes what it
prevents (the audit id from the RD-0232b adversarial hardening).

| # | Rule | Why / what it prevents |
|---|---|---|
| **R1** | **Version pragma first** — `#gate <int>.<int>` on the first non-blank line; unsupported version ⇒ REJECT. | No "best-effort" parse of an unknown dialect (B7). |
| **R2** | **Exactly one `GATE` per file**, ending in `END`, with a single `[in] := IN` entry. | A 2nd GATE / 2nd entry was silently mangled (B5 / m1). |
| **R3** | **INTENT + EFFECTS mandatory.** | A gate omitting them used to pass (M2). |
| **R4** | **The 8 glyphs at EXACT codepoints** (`-> [] ✓ × ? ! + -`); look-alikes (✗ U+2717, fullwidth, homoglyphs) REJECT; identifiers/labels ASCII only. | `✗` was parsed as a node; Cyrillic `а` ≠ `a` (B4). |
| **R5** | **Unknown ⇒ REJECT** — unknown sections, marks, tags, pragma keys, effect names, sensitivity classes. | There is no silent-skip path; that is how dialects are born. |
| **R6** | **K3 exhaustiveness** — every `?` tri-state has THREE distinct out-edges: True (`✓`), False (`×`), and a default drain (`[-]`/`[!]`). One `[-]` may NOT be both False and default. | K3 no-collapse: False must not silently fold into Unknown (M4). |
| **R7** | **Deny arms drain** — a `×`/`-` arm is dominated by a terminal drain; **no `[+]` egress and no privileged effect** on the way (only `audit.write` is allowed on a deny arm), unless re-authorised by a FRESH `?` guard. | A deny arm could carry a read and reach egress (B3). |
| **R8** | **Privacy resolves + the cut dominates** — `deny <class> <qname> -> <sink>`; qname AND sink must resolve in the flow (else vacuous ⇒ REJECT); a sensitive read reaches `[+]` ONLY through a `:cut` that dominates it. | Vacuous privacy rules; a raw read reaching egress uncut (M1). |
| **R9** | **A cut is ONLY `[name:cut fu op]`** — never a naming convention. | "Authority by naming" (a node merely *called* `redact`) was hallucinatable (B2). |
| **R10** | **Vocabulary is validated LIVE, never frozen** — effect names against the compiler registry; sensitivity classes against the prod type-qualifier + domain SoTs; unknown ⇒ REJECT. | A frozen EBNF list becomes a permanent wart — the C++ trap (B6). |
| **R11** | **Loops terminate** — a back-edge (target dominates source) MUST carry `decreases <var>` (a real pre-loop numeric) or `hops <N ≥ 1>`. | Unbounded cycle = DoS, CWE-400 (M5 / M8). |
| **R12** | **Comments carry no authority** — a `#` comment narrating the opposite of the drawn edges is ignored. The edges are the truth. | WYSIWYG spoofing via comments (m2). |
| **R13** | **Deny-only** — a passing map NEVER authorizes; admission is the SIGNED capability at fuse; the signature binds the runtime **IR digest** — **sign the IR, never `.gate`.** | Topology-as-authority is forgeable; a clean-but-unsigned map DENIES. |

## The one honest caveat (posture B)
The checker is a **necessary-not-sufficient authoring pre-filter**, not a soundness proof. For a sensitive read that reaches a
*non-`response.body`* egress with no cut it can decide (a genuine topological limit), it emits a **loud INTERIM warning** — never a
silent pass — and defers the sound verdict to the compile-time `FUNGI-PRIVACY-002`. So a passing `.gate` is a *clean map*; the sound
guarantee is the **composite** with the production security gate at fuse. (You'll see this warning on `02-write-transaction.gate` — it
is expected for a transactional write.)

## Verifying
```
GALERINA_ROOT=<path-to-Galerina>  node <path>/gate-check.mjs <file>.gate
```
Green with no `ERROR` ⇒ structurally valid. Compose from the verified examples in this folder and **re-check after every edit.** The
reference checker and full normative spec live in the `ZT-Galerina-GRAPH-ASCII-v2` workspace (`tools/gate-check.mjs`,
`SPEC-gate-language.md` v0.4).
