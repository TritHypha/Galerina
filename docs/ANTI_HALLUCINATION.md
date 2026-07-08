# Anti-hallucination in Galerina — `.gate` and `.fungi`

**Owner questions (2026-07-08):** *"could we apply an anti-hallucination to `.fungi` as
well?"* and *"should the anti-hallucination have a multi-check phase — I do not trust just
one check to be certain of a hallucination?"*

**Answers, up front:** Yes, and it is largely already there. And yes — it is multi-phase by
construction, with deliberate redundancy on the highest-risk class and a meta-check that
proves the phases actually fire. This doc explains the model and points at the running proof
(`tests/anti-hallucination-corpus.test.mjs`, 26/26 green).

---

## 1. What "0% hallucination" actually means

It is **not** a promise that the model never writes a wrong token. It is a property of the
*system around* the model:

1. **Fail-closed grammar.** The accepted vocabulary is small and closed. Anything the model
   invents that is not in the closed set is **REJECTED**, never best-effort accepted. Unknown
   ⇒ deny (LN-048). A hallucination cannot become a silent capability.
2. **A verify-loop.** The author runs a checker and gets a fast green/red. Green means
   *structurally admissible*; red names the exact violation. The model self-corrects against
   ground truth instead of guessing.
3. **Compose-from-verified-patterns.** The author assembles from known-good building blocks
   that already pass, rather than free-writing.

The guarantee is: *an invented construct cannot pass, and the author is told why.*

---

## 2. `.gate` (the established model)

`.gate` is the "draw-don't-code" surface, so its closed set is tiny and the property is
easy to see:

- **Frozen 8 glyphs** at exact codepoints; look-alikes/homoglyphs rejected.
- **Live-validated names** — effect and sensitivity-class names checked against the *same*
  registries the compiler uses; unknown ⇒ reject.
- **The verify-loop is `gate-check.mjs`** — green = structurally valid. Its self-test
  (135/135) is the meta-check.

This is why a `.gate` change must land on **three surfaces in lockstep** (compiler
front-end, reference checker, teaching docs) — if they disagree, the verify-loop
split-brains and the guarantee is void. (See `docs/language/gate/` and the
`galerina-gate-ecosystem-three-surfaces` memory.)

---

## 3. `.fungi` — the same property, on a richer language

`.fungi` is real application logic, so its hallucination surface is bigger than `.gate`'s.
But the compiler is **already a numbered multi-phase pipeline**, and *every "unknown ⇒
reject" gate in it is an anti-hallucination gate.* We did not need to bolt anything on — we
needed to (a) recognise the pipeline as the multi-check, (b) close the remaining fail-opens
(the W3/W4 hardening did this), and (c) prove it with a corpus.

| Phase | Checker | Hallucination class it fails closed on | Example code |
|------:|---------|----------------------------------------|--------------|
| **Token** | lexer + parser | a construct keyword that does not exist (`async flow`) | parse error |
| **Shape** | parser structural gates | an unknown governance block; a non-exhaustive `match`; a bad/absent `@version` | `FUNGI-SYNTAX-011/013/014/015`, `FUNGI-MATCH-001` |
| **Vocabulary** | effect checker / symbol resolver | an invented effect / capability / type / sink name | `FUNGI-EFFECT-004`, `FUNGI-TYPE-*` |
| **Type / K3** | type checker | a Verdict mixed with a Bool; `flip` on a non-Verdict; a non-Verdict fold operand | `FUNGI-K3-001/002/003` |
| **Dataflow / governance** | governance verifier, taint, leak-proof | an invented grant; a capability used-but-not-granted; a sensitive read reaching egress uncut | `FUNGI-ACCESS-001`, `FUNGI-PRIVACY-*` |

A hallucination has to be, *simultaneously*, a real token **and** a real shape **and** a real
name **and** well-typed **and** governance-sound. The probability of an invented construct
clearing all five independent gates is effectively zero — that is the `.fungi` "0%
hallucination" story, and it is now the same property `.gate` has.

---

## 4. "I don't trust just one check" — why it is multi-phase, three ways

**(a) Independence.** The five phases fail by *different mechanisms* — token-level,
shape-level, vocabulary-level, type-level, dataflow-level. A bug that blinds one phase does
not blind the others, because they share no logic. This is the opposite of running the same
check twice (which catches nothing new).

**(b) Deliberate redundancy on the highest-risk class.** Names are what models most often
invent, so the vocabulary is fail-closed at **every point a name can appear**, by
independent checkers:

- An invented token in `effects { … }` is rejected by the **effect checker**
  (`FUNGI-EFFECT-004`).
- The *same* token in `access { grant … }` is rejected by the **governance verifier**
  (A20 resolves grants against `ADMISSION_CAPABILITIES ∪ CANONICAL_EFFECTS`,
  `FUNGI-ACCESS-001`).

So mis-declaring a hallucinated name in one clause cannot launder its use in another. This
is the corpus entry `H6-invented-effect-DEFENSE-IN-DEPTH`, asserted to be caught by **≥ 2
independent phases**. `@version` is redundant the same way — checked at parse, at every
disk-read path, and inside the signed region (A4/sourceHash) — three independent
enforcement points.

**(c) A meta-check — who checks the checker.** A check that *silently passes* a hallucination
is itself a fail-open, and worse than no check because it reads as safety. So the phases are
themselves verified by running a **corpus of known hallucinations** through them and
asserting each is rejected. If a future edit defangs a phase, the corpus goes red.

---

## 5. The corpus — verify-by-running the guarantee

`packages-galerina/galerina-core-compiler/tests/anti-hallucination-corpus.test.mjs` (in the
6131-test suite). It feeds 11 hallucination classes and 2 valid **controls** through the
*real* phase entry points (`parseProgram`, `checkEffects`, `checkTypes`,
`verifyGovernance`) and asserts:

1. **0% pass-through** — every hallucination is caught by **≥ 1** phase (the aggregate
   guarantee: no fail-open survivors).
2. **Checker wiring** — each is caught by its *designated* phase and code (so a green here
   means the specific gate is live, not that some unrelated error masked it).
3. **Defense-in-depth** — the high-risk class is caught by **≥ 2 independent** phases.
4. **Anti-vacuous (A27)** — the two valid controls pass **every** phase, proving the harness
   discriminates rather than rejecting everything.

Run it:

```
cd packages-galerina/galerina-core-compiler && node --test tests/anti-hallucination-corpus.test.mjs
```

The corpus is designed to grow: every new fail-open we find or fix should add an entry, so
the guard tracks the real threat surface (the same discipline as the `.gate` self-test).

---

## 6. The self-correction half — did-you-mean

Rejection tells the author *that* they hallucinated; a suggestion tells them *what to write
instead*, which is what actually closes the loop cheaply. Status:

- Known aliases already resolve with a canonical suggestion (`FUNGI-EFFECT-004`:
  `Effect "db.read" … Use "database.read"`).
- **DONE for effect names.** `FUNGI-EFFECT-004` now nudges a *likely typo* toward the
  nearest canonical name — `database.wrote` → `database.write`, `secret.raed` →
  `secret.read` — via a local Levenshtein within `max(2, len/4)` edits. A *wild* invention
  (`totally.fake.effect`) lands far from every canonical name and correctly gets **no**
  suggestion (a misleading nudge is worse than none). Fail-closed is unchanged: every
  unknown name is still an error; this only *adds* the suggestion. Guard:
  `tests/effect-did-you-mean.test.mjs`.
- **Remaining.** Extend the same nearest-name nudge to capability / type / sink names, and
  add the R&D-locked **version-format** did-you-mean (`@version 1.0.0` written on a `.fungi`
  → *"did you mean `@version 1`?"*, and vice-versa on a `.gate`) plus a lint auto-fix —
  which mitigates the dual-format confusion surface *without* collapsing the deliberate
  `.fungi` `@version 1` (grammar version) / `.gate` `@version 1.0.0` (signed-artifact compat
  floor) distinction.

---

## 7. How an AI author uses the loop

1. **Compose** from a verified pattern (an existing flow that passes), don't free-write.
2. **Run the verify-loop** — `galerina check <file>` for `.fungi`, `gate-check.mjs` for
   `.gate`. Green = admissible.
3. **On red**, read the code + suggestion, fix, re-run. Never hand-wave past a red.
4. Remember the ceiling: *a green lint is necessary, not sufficient* — admission is the
   **signed capability at fuse time**, not a passing check. The multi-check keeps
   hallucinations out of the *source*; the signature keeps unsigned artifacts out of the
   *runtime*.

---

## 8. Related

- `docs/SYNTAX_UPDATE_TRACKER.md` — the W3/W4 fail-closed hardening that removed the
  remaining `.fungi` fail-opens this guarantee depends on.
- `ZTF-Knowledge-Bases/compiler-diagnostics.md` — the registered codes each phase raises.
- `galerina-gate-ecosystem-three-surfaces` memory — why `.gate`'s three surfaces must stay
  in lockstep or the verify-loop split-brains.
