# 06 — Worked examples

Four complete, **real** `.gate` files from the example corpus, read end to end. All four pass
`gate-check.mjs` (`21/21` corpus run, verified while writing these docs). Each shows a different core
pattern. Read them as *maps*, tracing every path to a terminal.

Sources: all files under `<GitHub>\ZT-Galerina-GRAPH-ASCII-v2\examples\`.

---

## Example 1 — `getPatient` (the Rosetta stone): authorise, read, cut, audit, egress

The canonical "read sensitive data, redact before egress" shape. This is the spec's own Rosetta
stone (`SPEC-gate-language.md` §2b).

```gate
@version 1.0.0
GATE getPatient(caller: CallerId, patientRef: PatientRef) -> PatientView:
  INTENT  "Return a patient record to an authorised caller; PatientId and SSN are redacted before egress."
  EFFECTS { database.read, audit.write }
  PRIVACY deny protected PatientId -> response.body
          deny protected SSN       -> response.body
  AUDIT   on
  FLOW:
    [in] := IN
    [in]                 -> [authz]              ? authorised     # signed-capability guard, not the verdict
    [authz]              -> [✓]                                   # caller holds capability
    [authz]              -> [×]                                   # caller lacks capability
    [authz]              -> [-]                                   # unknown/undecidable -> deny drain (distinct from × arm)
    [×]                  -> [-]                                   # rejected caller -> deny (drains, no effect, no egress)
    [✓]                  -> [raw:fu dbRead]       @database.read  # dense read delegated to .fungi fu
    [raw:fu dbRead]      -> [view:cut fu redactPHI]               # EXPLICIT CUT (:cut) — strips PatientId + SSN
    [view:cut fu redactPHI] -> [logged:fu audit] @audit.write    # access is audited
    [logged:fu audit]    -> [+]                                   # egress: only the redacted view
END
```
*Source: `examples/flow01.gate` (verbatim).*

**How to read it:**
- **Header**: `@version 1.0.0`, one `GATE`, typed signature, `END`.
- **Clauses**: mandatory `INTENT` + `EFFECTS { database.read, audit.write }`; two `PRIVACY` deny
  rules; `AUDIT on`.
- **Authorization**: `? authorised` fans into `✓` (ALLOW) / `×` (DENY-False) / `-` (HOLD-Unknown) —
  three distinct arms; the `×` arm drains to `[-]`.
- **The cut**: the only path from `[raw:fu dbRead]` to `[+]` passes through `[view:cut fu redactPHI]`,
  which dominates `[+]`. Raw PatientId/SSN provably cannot leave.
- **Effects**: both `@database.read` and `@audit.write` are declared in `EFFECTS { }`.

---

## Example 2 — `transferMoney`: balance branch, AML tri-state, panic, cut-before-audit

A multi-stage financial flow: authorise → check funds → AML screen → post → persist → **cut** →
audit. Note the AML test uses `!` (panic) for its undecidable arm, and the PAN is cut before audit.

```gate
@version 1.0.0
GATE transferMoney(from: AccountId, to: AccountId, amount: Money<GBP>) -> TransferReceipt:
  INTENT  "Move funds between two accounts after balance and AML checks; the account PAN is redacted before it is audited."
  EFFECTS { database.read, database.write, ledger.mutate, audit.write }
  PRIVACY deny protected accountPAN -> audit.log
  AUDIT   on
  FLOW:
    [in] := IN
    [in]                  -> [authz]              ? authorised     # signed-capability guard
    [authz]               -> [✓]                                   # caller may transfer
    [authz]               -> [×]                                   # caller may not
    [authz]               -> [-]                                   # undecidable -> deny drain (distinct)
    [×]                   -> [-]                                   # rejected caller -> deny (drains)
    [✓]                   -> [bal:fu readBalance] @database.read   # read source balance
    [bal:fu readBalance]  -> [funds]              ? sufficient     # balance branch
    [funds]               -> [✓fund]                               # enough funds
    [funds]               -> [×fund]                               # insufficient funds
    [funds]               -> [-]                                   # balance unknown -> deny drain (distinct)
    [×fund]               -> [-]                                   # insufficient -> reject (drains)
    [✓fund]               -> [aml:fu amlScreen]                    # AML screening compute
    [aml:fu amlScreen]    -> [amlq]               ? amlClear       # AML tri-state test (exhaustive)
    [amlq]                -> [✓aml]                                # AML clear
    [amlq]                -> [×aml]                                # AML hit -> reject
    [amlq]                -> [!]                                   # AML undecidable -> panic drain (distinct, fail-closed)
    [×aml]                -> [-]                                   # AML flagged -> deny (drains)
    [✓aml]                -> [post:fu postLedger] @ledger.mutate   # commit the double-entry
    [post:fu postLedger]  -> [persist:fu writeTxn] @database.write # persist transaction record
    [persist:fu writeTxn] -> [view:cut fu redactPAN]              # EXPLICIT CUT (:cut) — strip accountPAN before audit
    [view:cut fu redactPAN] -> [logged:fu audit] @audit.write     # audit with PAN removed
    [logged:fu audit]     -> [+]                                  # egress: transfer receipt
END
```
*Source: `examples/flow02.gate` (verbatim).*

**Patterns to notice:**
- **Labelled marks** give each split a distinct identity: `[✓fund]`/`[×fund]`, `[✓aml]`/`[×aml]`.
- **Three tri-states**, each exhaustive: `? authorised`, `? sufficient`, `? amlClear`. The AML one
  routes its Unknown to `[!]` (panic) rather than `[-]` — a design choice for a high-consequence
  branch (both are valid default drains).
- **Cut before audit**: `accountPAN` is denied to `audit.log`, and `[view:cut fu redactPAN]`
  dominates the `@audit.write` edge.
- **Effect on deny arms**: none. Every `×`/`-` arm just drains — no `@ledger.mutate` etc. hangs off a
  reject arm.

---

## Example 3 — `provisionTenant`: the panic-rollback (compensation) pattern

The reference example for `[!]` panic used as **fail-closed compensation**. A partial provision is
unwound by a rollback that then drains to `[-]`.

```gate
@version 1.0.0
GATE provisionTenant(caller: CallerId, tenantName: TenantName) -> TenantHandle:
  INTENT  "Provision a new tenant for an admin caller; a partial provision is unwound by rollback on failure."
  EFFECTS { database.write, audit.write }
  AUDIT   on
  FLOW:
    [in] := IN
    [in]              -> [admin]                     ? adminOnly
    [admin]           -> [✓admin]                                      # caller is an admin
    [admin]           -> [×denied]                                     # caller is not an admin -> forbidden
    [admin]           -> [-]                                           # capability unknown -> deny drain (distinct)
    [×denied]         -> [-]                                           # non-admin denied (drains)
    [✓admin]          -> [created:fu dbCreateTenant] @database.write
    [created:fu dbCreateTenant] -> [ok]              ? provisionOk
    [ok]              -> [✓provisioned]                                # provision succeeded
    [ok]              -> [×failed]                                     # provision failed -> unwind
    [ok]              -> [!]                                           # provision state unknown -> panic rollback (distinct, fail-closed)
    [×failed]         -> [!]                                           # explicit failure also drains to panic rollback
    [!]               -> [rollback:fu dbRollback]    @database.write   # fail-closed compensation: unwind the partial tenant
    [rollback:fu dbRollback] -> [-]                                    # after unwind: governed deny (no tenant handle egress)
    [✓provisioned]    -> [logged:fu audit]           @audit.write
    [logged:fu audit] -> [+]                                           # egress: tenant handle
END
```
*Source: `examples/flow17.gate` (verbatim).*

**Why this passes the strict panic rule:**
- Both the `×failed` (definite failure) arm and the `[ok]` Unknown arm route to `[!]`.
- The panic subgraph does **one** thing — a compensating `@database.write` rollback — then drains to
  a **terminal** `[-]`. A panic reaching `[+]`, or resuming past a non-terminal drain, would be
  rejected; a rollback-to-terminal-`[-]` is the allowed shape. (Source: `gate-check.mjs`
  `panic_no_egress`; self-test `[H1]`/`[H6]`.)
- The rollback write is *topologically indistinguishable* from an "advance" write, so effect
  governance stays on the signed capability — the checker allows the write on the panic-compensation
  subgraph specifically because it drains to `[-]`.

---

## Example 4 — `classifyMessage`: seal-before-provider, fresh-guard re-auth, and an honest warning

An AI-classification flow. It shows **sealing PII before egress to a provider**, a **fresh guard
re-authorising** a low-confidence review path — and it is the honest example of a file that
**passes but carries a posture-B INTERIM warning**.

```gate
@version 1.0.0
GATE classifyMessage(caller: CallerId, text: Message) -> Label:
  INTENT  "Classify a caller message with an AI model; text may be PII so it is sealed before leaving to the provider."
  EFFECTS { ai.inference, audit.write }
  PRIVACY deny PII text -> ai.provider
  AUDIT   on
  FLOW:
    [in] := IN
    [in]              -> [authz]                   ? authorised
    [authz]           -> [✓]                                       # caller ok
    [authz]           -> [×]                                       # caller not authorised
    [authz]           -> [-]                                       # undecidable -> deny drain (distinct)
    [×]               -> [-]                                       # not authorised -> deny (drains)
    [✓]               -> [sealed:cut fu sealText]                  # EXPLICIT CUT (:cut) — seal PII text before provider egress
    [sealed:cut fu sealText] -> [scored:fu aiClassify] @ai.inference # only the sealed text reaches the model provider
    [scored:fu aiClassify] -> [conf]               ? confident
    [conf]            -> [✓confident]                              # high confidence
    [conf]            -> [×lowconf]                                # low confidence
    [conf]            -> [!]                                       # unknown confidence -> panic drain (distinct)
    [×lowconf]        -> [route]                    ? reviewAllowed # FRESH guard re-authorises the review egress path
    [route]           -> [✓review]                                 # human review permitted for this label
    [route]           -> [×noreview]                               # review not permitted
    [route]           -> [-]                                       # review policy unknown -> deny drain (distinct)
    [×noreview]       -> [-]                                       # no review path -> deny (drains)
    [✓review]         -> [review:fu flagForReview]                 # low-confidence routed to human review, still a Label
    [✓confident]      -> [okLabel:fu emitLabel]                    # high-confidence label emitted directly
    [okLabel:fu emitLabel]    -> [logged:fu audit] @audit.write
    [review:fu flagForReview] -> [logged:fu audit] @audit.write
    [logged:fu audit] -> [+]                                       # egress: label only, never raw text
END
```
*Source: `examples/flow11.gate` (verbatim).*

**Patterns:**
- **Seal before provider**: `[sealed:cut fu sealText]` cuts the PII *before* the `@ai.inference` edge,
  so only sealed text reaches the model provider (the `deny PII text -> ai.provider` rule).
- **Fresh-guard re-auth**: the `×lowconf` (False) arm does **not** drain immediately — it passes a
  **new** `? reviewAllowed` guard, which re-establishes authority and carries its own three arms.
  Only the guard's own `✓review` arm continues; `×noreview` and Unknown drain.
- **Panic for unknown confidence**: the `? confident` test routes its Unknown to `[!]`.

**The honest warning.** This file **passes** all checks, but `gate-check.mjs` emits:

```
⚠ INTERIM (deferred to compile-time FUNGI-PRIVACY-002): derive-effect @ai.inference at [scored]
  reaches an egress with no intervening cut — topology cannot decide whether its output carries
  "text"; prod must confirm (RD-0232b ROUND 3 documented limit)
```

The classifier's *output* (`@ai.inference` is a **derive** effect) reaches egress, and topology
cannot decide whether that output re-carries the PII it was derived from — that needs field-level
types, which only compile-time `FUNGI-PRIVACY-002` has. Posture B says: **warn loudly, never silently
pass, defer the sound verdict**. So a green here means "well-formed", not "proven leak-free". (Source:
`SPEC-gate-language.md` privacy-posture note; `gate-check.mjs` `privacy_cut` derive-effect warning;
observed on this file in the corpus run.)

Files in the corpus that similarly pass-with-warning: `flow11` (derive-effect output to egress),
`flow12` (a sensitive `@database.read` credit score reaching the `[✓:hold]` egress uncut), `flow13`
(telemetry read to report), `flow18` (ledger read to report). This is expected and documented.

---

## The bounded-loop pattern (bonus, real)

Loops are cycles with a bound. `flow20.gate` (`exportPatientBatch`) processes a cohort one record at
a time, each redacted through a cut, within a `decreases` budget:

```gate
    [✓]                     -> [cohort:fu dbReadCohort]  @database.read   # load cohort + set the record budget (pre-loop)
    [cohort:fu dbReadCohort] -> [more]                   ? recordsLeft
    [more]                  -> [✓next]
    [more]                  -> [×done]
    [more]                  -> [-]
    [✓next]                 -> [raw:fu dbReadRecord]      @database.read   # dense per-record read
    [raw:fu dbReadRecord]   -> [view:cut fu redactPHI]                    # cut EACH record
    [view:cut fu redactPHI] -> [collected:fu collect]
    [collected:fu collect]  -> [more]                    decreases cohort # bounded per-record loop (variant produced pre-loop)
    [×done]                 -> [fin]                      ? manifestReady  # FRESH guard re-authorises egress after the loop
    ...
    [✓ready]                -> [sealed:cut fu sealManifest]               # final cut dominates every egress path
    [sealed:cut fu sealManifest] -> [logged:fu audit]    @audit.write
    [logged:fu audit]       -> [+]
```
*Source: `examples/flow20.gate` (fragment; the file passes all checks).*

The back-edge is `[collected:fu collect] -> [more]` with `decreases cohort`; `cohort` is produced
pre-loop at `[cohort:fu dbReadCohort]`, so it dominates the loop header and the variant is verified.

---

### Next

→ [07 — Cheat sheet & gotchas](07-cheatsheet-and-gotchas.md): one-page reference and the full list of
mistakes the checker rejects.
