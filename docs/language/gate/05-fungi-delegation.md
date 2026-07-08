# 05 — `fu` delegation & the `:cut` privacy cut

`.gate` draws *topology*, not computation. There is **no ASCII math** — arithmetic, strings, tensors,
crypto, and any dense logic live in **`.fungi` `fu` functions**, and a `.gate` node *delegates* to
them. Two node forms do this:

- **`[name:fu op]`** — a plain delegation to a pure `.fungi` `fu` body.
- **`[name:cut fu op]`** — a delegation that is *also* an **explicit privacy cut** (a re-type /
  redaction vertex). This is the single most security-relevant construct in the language.

```ebnf
node_body = qname ":" op                    (* [name:fu op]      — dense compute delegated to .fungi *)
          | qname ":" "cut" ws op ;         (* [name:cut fu op]  — EXPLICIT privacy-cut node *)
op        = "fu" ws ident ;
```
*Source: `SPEC-gate-language.md` §1; §1.1 (the `[name:fu op]` / `[name:cut fu op]` rows).*

---

## 1. `[name:fu op]` — delegate dense compute to `.fungi`

`name` is the node's identity; `op` is the `.fungi` `fu` function it calls. The node runs in its own
sandbox (WASM memory region) and lowers to a **call into a pure `fu` function**.

```gate
    [✓]                 -> [record:fu dbQuery]  @database.read   # .fungi fu body runs: SELECT ... WHERE id = :customerId
    [record:fu dbQuery] -> [view:cut fu redactPII]
```
*Source: `examples/demo-getCustomerById.gate:17-18`.*

Reading `[record:fu dbQuery]`: the node is named `record`; it delegates to the `.fungi` `fu` function
`dbQuery`; the edge into/out of it may carry an `@effect` (here `@database.read`). The dense work
(the actual SQL, the balance arithmetic, the AML screen) is `.fungi`'s job — `.gate` only says *where
it sits in the flow* and *what effect it performs*.

More real delegations: `[bal:fu readBalance]`, `[aml:fu amlScreen]`, `[post:fu postLedger]`
(`flow02`); `[tds:fu run3DS]`, `[charge:fu acquirerCharge]` (`flow06`);
`[cmp:fu constantTimeEq]` (`flow03`).

### Node identity rule (M7)

A node name binds **at most one** `:op`. You cannot draw `[view:fu redactPHI]` and
`[view:fu passEverything]` — that double-bind is rejected, because a node's identity *includes* its
op. Give distinct nodes distinct names. (Source: `gate-check.mjs` `double_bind`; self-test `[M7]`.)

---

## 2. `[name:cut fu op]` — the explicit privacy cut

A **cut** is a vertex that strips or re-types sensitive data (redaction, tokenisation, sealing). It
is the *only* structure that clears taint. In v0.4 there is **one canonical cut form**: the
`[name:cut fu op]` **node** — the `cut` keyword after the colon.

```gate
    [raw:fu dbRead]      -> [view:cut fu redactPHI]               # EXPLICIT CUT (:cut) — strips PatientId + SSN
    [view:cut fu redactPHI] -> [logged:fu audit] @audit.write
```
*Source: `examples/flow01.gate:16-17`.*

Why the explicit marker exists (B2): earlier versions inferred a cut from a node *name* matching a
regex (`redactPHI` "looks like" a redaction). That let an author claim "authority by naming" — a
hallucination risk. So a cut now counts **only** when explicitly marked `:cut`. A name-only
`[view:fu redactPHI]` is **not** a cut. (Source: `SPEC-gate-language.md` §1.1, §2; `gate-check.mjs`
`nodeKey` cut detection + `privacy_cut`.)

### What a cut *proves* (shape guarantee)

For each `PRIVACY deny <class> <field> -> <sink>` rule, the checker proves:

1. an **explicit `:cut` node dominates** the sink (every path to the sink passes through a cut), and
2. **no taint path** runs from a sensitive read to that sink **without** crossing a cut.

If either fails, the file is rejected. Which field a cut actually strips is bound at compile time by
`FUNGI-PRIVACY-002`; the checker enforces the explicit marker + domination now. (Source:
`SPEC-gate-language.md` §2, §3; `gate-check.mjs` `privacy_cut`.)

Read `flow01` as a security reviewer: there is **no drawn edge** from `[raw:fu dbRead]` to `[+]`. The
only route from the raw record to egress goes through `[view:cut fu redactPHI]`, which **dominates**
`[+]`. So `Taint(PatientId ⇝ [+] | cut = redactPHI) = 0` **by shape**.

### Cut variants seen in the corpus

Cuts do more than redact — the pattern covers any re-type-before-egress:

| Cut node | Purpose | Source |
|----------|---------|--------|
| `[view:cut fu redactPHI]` | strip PatientId + SSN before egress | `flow01`, `flow20` |
| `[view:cut fu redactPAN]` | tokenise/strip PAN before charge/audit | `flow02`, `flow06` |
| `[verdict:cut fu sealVerdict]` | seal secret-derived compare to a bare boolean | `flow03` |
| `[sealed:cut fu sealText]` | seal PII text before it leaves to an AI provider | `flow11` |
| `[scope:cut fu tenantFilter]` | re-type a query to the caller's tenant | `flow07` |
| `[receipt:cut fu redactReceipt]` | strip old/new secret values from a receipt | `flow10` |

*Sources as cited.*

### Placement matters — cut *before* the sink, *after* the source

A cut only clears data that flows **through** it. Two real subtleties:

- **A reveal/read after a cut re-introduces taint.** In `flow03`, the secret material is sealed
  *after* the compare; putting the seal *before* a `@secret.read`/`@crypto.decrypt` would leave the
  plaintext uncut. (Source: `gate-check.mjs` self-test `[H2]`/`[H7]` — cut-before-read REJECTED,
  cut-after-read ACCEPTED.)
- **Seal before egress to a provider.** In `flow11`, `[sealed:cut fu sealText]` seals the PII text
  *before* the `@ai.inference` edge to the provider, so only sealed text leaves. (Source:
  `examples/flow11.gate:14-15`.)

### Mistake to avoid — the name-only "cut"

```gate
  PRIVACY deny protected PatientId -> response.body
  FLOW:
    [in]            -> [raw:fu dbRead]     @database.read
    [raw:fu dbRead] -> [view:fu redactPHI]        # ← WRONG: :fu is NOT a cut, even named "redactPHI"
    [view:fu redactPHI] -> [+]
```
Rejected: *"no EXPLICIT :cut node dominates the sink "response.body" — cannot prove "PatientId" is
stripped before it (M1/B2…)"*. (Verified while writing this page.) Fix: mark it a cut —
`[view:cut fu redactPHI]`.

Also rejected: using a name as **both** a cut and a plain op (`[x:cut fu a]` … `[x:fu b]`). That
cross-kind collision could launder cut authority across a dead branch, so it fails (order-independent,
ROUND-5 H-C). Give the cut and the op distinct names. (Source: `gate-check.mjs`
`node_kind_consistent`.)

---

## 3. The removed `@redact` edge tag (v0.4 tombstone)

Older `.gate` drafts had a second cut form — an `@redact` **edge tag**. In v0.4 it is **removed**:
the checker rejects `@redact` with an explicit migration message. There is exactly **one** cut form
now — the `[name:cut fu op]` node.

```gate
    [raw:fu dbRead] -> [view:fu applyRedaction] @redact    # ← WRONG in v0.4: @redact was removed
```
Rejected: *""@redact" was removed in v0.4 — the ONE canonical cut form is a [name:cut fu op] node
(owner 2026-07-02)"*. (Source: `SPEC-gate-language.md` §1 grammar note + changelog B2; `gate-check.mjs`
`@redact` tombstone; self-test `[v0.4] @redact edge tag is REMOVED`.)

> The `@redact` edge tag is REMOVED — a file using it REJECTS (use the `[name:cut fu op]` node form).
> This is independent of the version header; `@version 1.0.0` files still reject `@redact`.

---

## 4. How `fu` bodies fit the pipeline

The `.gate` node names a `fu` — the body itself is authored in `.fungi`. When the app is compiled,
`.gate` and `.fungi` merge into **one** GIR: the `:fu op` node lowers to a call into the pure `fu`
function, and the `:cut` node lowers to the re-type/redaction effect that `FUNGI-PRIVACY-002` binds.
The signed artifact is the **IR digest**, never the `.gate` source. (Source: `SPEC-gate-language.md`
§0, §3; workspace `README.md` §2 hybrid-app merge.)

This is exactly why the corpus keeps dense work in `fu`: `.gate` is a *topology* language, and the
"one graph for both" merge is what lets a hybrid app draw its flow in `.gate` while computing in
`.fungi`.

---

## 5. Worked cut chain (real, verified)

`flow06.gate` (`chargeCard`) — the PAN is cut *before* it can be charged, and PCI is denied to
storage:

```gate
  EFFECTS { network.outbound, ledger.mutate, audit.write }
  PRIVACY deny PCI PAN -> storage.write
  ...
    [✓tds]                  -> [view:cut fu redactPAN]            # EXPLICIT CUT (:cut) — tokenise/strip PAN before any charge
    [view:cut fu redactPAN] -> [charge:fu acquirerCharge] @network.outbound # send tokenised charge to acquirer
    [charge:fu acquirerCharge] -> [post:fu postLedger]  @ledger.mutate # record the settled amount
    [post:fu postLedger]    -> [logged:fu audit]    @audit.write   # audit (token only, PAN never stored)
    [logged:fu audit]       -> [+]                                 # egress: charge receipt
```
*Source: `examples/flow06.gate` (verbatim fragment; the file passes all checks).*

The cut `[view:cut fu redactPAN]` dominates every downstream node — the charge, the ledger post, the
audit, and `[+]` — so the raw PAN provably cannot reach `storage.write` (there is no `@storage.write`
edge at all) nor the receipt.

---

### Next

→ [06 — Worked examples](06-worked-examples.md): four complete gates, read end to end.
