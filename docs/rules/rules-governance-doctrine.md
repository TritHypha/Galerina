# Rules: Governance Doctrine (RD-0290)

How Galerina's **governance gates, CI credentials, cross-references, and dated records** must behave. These
are load-bearing security rules — a violation here is a fail-**open**, the most dangerous failure mode
(a check that passes when it should deny). They sit with the [Non-Negotiable Rules](rules-non-negotiable.md);
see also [Design Principles](rules-design-principles.md) and the applied evidence in
[`docs/security/cybersec-skills-audit-2026-07-09.md`](../security/cybersec-skills-audit-2026-07-09.md).

The one-line frame: **a fail-open gate is a disabled smoke detector.** It stops going off — which reads as
"all clear" — precisely when the thing it guards has failed.

## 1. Gates fail closed, never open

Classify every gate as **load-bearing** (its verdict authorizes something: admission, signing, a merge, a
deploy) or **enrichment** (advisory, informational). A **load-bearing gate must fail closed or hold** — on a
missing input, a failed credential, an absent corpus, or an error, it **denies / red / throws**, it does not
**skip / pass / green**.

**Why.** A red gate is the check *working* — the smoke detector doing its job. Greening it by disabling,
skipping, or `catch{}`-swallowing the failure removes the detector, not the smoke. The bug is never "the gate
is red"; it is whatever made it red.

**How to apply.**
- A gate that cannot read what it needs (no token, no network, no file) → **fail/hold**, never a silent pass.
  A `catch {}` that swallows the failure into a green result is the canonical bug (a real audit once *"silently
  lost its whole corpus to a fail-open catch{}"*).
- Never resolve an **unknown / undecidable** verdict to ALLOW — K3 `0` sits on the deny side (deny-by-default).
- The fix for a red credential-gate is a **correctly scoped credential**, never lowering the gate. Skipping a
  gate "until the credential exists" is still a fail-open for as long as it lasts — prefer fail/hold, and make
  the gate run unconditionally the moment the credential lands.
- Every guard ships a **`--self-test`** that proves its detectors still fire; a neutered guard is itself a
  fail-open.

## 2. CI credentials are least-privilege

A credential a gate uses must be the **narrowest** that lets it verify: read-only where reading suffices,
scoped to the one repo/resource it needs, never a broad or write-capable token doing a read-only job.

**Why.** A gate holding more authority than its job requires is blast radius waiting to happen; and a
mis-scoped token that "works" hides that the gate isn't really testing what it claims. Least-privilege keeps
the gate's authority equal to its purpose.

**How to apply.** A doc-drift gate that reads a *separate private* repo needs a **read-only, that-repo-scoped
fine-grained token**, not the default workflow token (which cannot) and not a broad PAT (which over-grants).

## 3. Never point a reference at a name that does not exist yet

A ref — import, path, provenance citation, package name — must point at **reality**. Rewriting refs *ahead of*
the target they name is a **dependency-confusion** hazard: the dangling name is a slot an attacker (or a
future typo) can fill.

**Why & how.** Point refs at what exists; **gate a rename behind the target's creation**, never the reverse.
A dead folder's real path (`Galerina-R-AND-D/tmf/spec/…`) is the correct citation even after a format rename —
do not propagate the new name into a ref whose target has not been created.

## 4. Do not mutate dated / published records

A blanket codemod over a **dated or published artifact** (a defensive publication, a dated eprint, an audit
snapshot) rewrites history — the old name/claim was *accurate as of that date*.

**Why & how.** Add an **editorial note**, do not rewrite the body. Codemod only **live working docs** (a date
in the filename only, content still evolving). Integrity of the record beats cosmetic consistency.

## Priority

These are **Non-Negotiable / Core** governance rules ([priority model](rules-priority-categories.md)) — enforced
by the build-free `--self-test`-then-enforcing gates in `.github/workflows/conventions.yml` (path-leak,
papers-index, route-overlap, name-collisions, …) and by review. A change that makes a load-bearing gate
fail open is rejected.
