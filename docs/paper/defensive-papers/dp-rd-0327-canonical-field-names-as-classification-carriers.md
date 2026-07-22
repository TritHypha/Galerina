# Defensive Publication — Canonical field names as classification carriers: redaction-preserving cross-application mapping by construction

**Disclosure ID:** DP-RD-0327 (landed in `docs/paper/defensive-papers/` 2026-07-22; number = the source RD id, verified free in the canonical index) · **Date:** 2026-07-10 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Provenance:** RD-0327. **DESIGN-STAGE — no shipped implementation yet.** Extends the existing `galerina-naming-conventions.md` (code-identifier naming) to *data-field* naming; composes with the shipped classification/egress machinery it would ride (`route-defaults` unknown/duplicate-key denial; destination-aware egress, RD-0315; redaction-survives-round-trip, RD-0323). This is a construction *design* disclosed to bank prior art; it is **not** a measured result and **not** a claim that Galerina implements it today.

> **Purpose.** Defensive publication of a construction *design*; **novelty disclaimed** (§3). Canonical data models, field-name vocabularies, schema typing, and data-classification tagging are all long-standing and **not** claimed. What is recorded is a specific, narrower combination: making a canonical field *name* the deterministic carrier of its *type + data-classification + output-encoder*, so that mapping a value between two applications that share the vocabulary **preserves classification and redaction by construction** — without re-tagging at each boundary — while a **fail-closed** name-normaliser keeps the mechanism an *interop convention, never an authorisation*. Passes the harm filter: it discloses a strength (a redaction-preserving construction), no Galerina-specific weakness or bypass.

---

## 1. Technical field

Data-interoperability and information-flow control; canonical field-naming vocabularies; binding a field identifier to a data-classification label and a context-specific output encoder; redaction/classification preservation across application-to-application data mapping; fail-closed name normalisation as a defence against field-aliasing/mass-assignment and case-confusion (CWE-915 mass assignment; CWE-178 improper case handling).

## 2. Background & problem

When two systems exchange records, field names rarely agree (`first_name` vs `firstName`; `email` vs `emailAddress`; `id` vs `ID`). Integrations therefore hand-write per-pair *mapping/translation* layers. Two problems compound:

- **Redaction is defeated by name drift.** A redaction or classification rule keyed on a field name (`password`, `ssn`, `emailAddress`) silently stops firing when a mapping renames the field (`pass`, `taxId`, `mail`). The datum is the same; the label that governed it did not travel with it. Classification therefore has to be *re-asserted* at every boundary, and any boundary that forgets leaks.
- **Predictable-but-ungoverned names invite mass assignment.** A shared vocabulary makes privileged fields (`role`, `isAdmin`, `ownerId`) guessable; an auto-mapper that accepts any field it recognises can be steered to set them (CWE-915). Consistency without governance *raises* this risk.

The problem this design closes: make the classification **travel with the canonical name itself**, so cross-application mapping preserves redaction by construction, while keeping name-recognition strictly separate from authorisation.

## 3. Prior art (stated honestly — novelty disclaimed)

- **Canonical data models / ubiquitous language** (enterprise-integration and domain-driven-design practice); **schema.org, JSON:API, HL7 FHIR** — shared field vocabularies. The idea of *agreeing on names* is standard and **not** claimed.
- **JSON Schema / typed contracts** — binding a field to a *type*. Not claimed.
- **Data-classification / labelling systems and taint/information-flow tracking** — attaching a sensitivity label to data and propagating it. Not claimed; this design *applies* label-propagation, keyed on the canonical name, rather than inventing a new label calculus.
- **Contextual output-encoding libraries** (e.g. context-aware auto-escaping, typed "safe" string families) — choosing an encoder by output context. Not claimed; RD-0323's shipped contextual-safe-type family is the encoder side this would select.
- **Sibling disclosures:** DP-RD-0271 (secure-by-omission contract field *defaults* — the restrictive-default polarity, applied there per-contract-field; this design applies a *classification* to the field's canonical *name* rather than a default to its presence); DP-RD-0301b (the fail-closed "unknown → deny" polarity, reused here for the name-normaliser's ambiguity handling); DP-RD-0204 (parameterised-not-string-built query safety — the same "structure fixed, values bound" discipline, applied here to field identity rather than query shape).
- **Explicitly not claimed:** canonical vocabularies; name/type binding; classification labelling; contextual encoding; automatic field mapping — each individually is prior art.

**Novel only in combination:** making the canonical *name* the single deterministic carrier of `(type, classification, encoder)` such that adopting the name auto-applies its redaction and the *right* encoder on egress; the resulting **redaction-survives-mapping** property (a `protected` field stays protected through serialise→map→store→retrieve→serialise because its governance is a property of the name, not of any one boundary's code); and the **fail-closed normaliser** whose "ambiguous/duplicate alias → reject" rule makes the mechanism an interop convention that provably cannot become an authorisation (recognising a name grants no access; deny-unknown-fields and explicit-allow remain in force).

## 4. Summary of the disclosed subject matter

A design in which a governed runtime maintains a **canonical field vocabulary**: each entry binds a canonical field *name* to a *type*, a *default data-classification* (e.g. `public` / `internal` / `pii` / `secret`), and a *context-appropriate output encoder*. (a) On ingest, a **fail-closed normaliser** maps recognised aliases to the canonical name, **rejecting** any payload in which two aliases collapse to one canonical field (duplicate/smuggling), in which casing is ambiguous, or — under a strict posture — which carries unknown fields; recognition is by exact, deterministic rule, never best-guess. (b) The canonical name's *classification* attaches to the value automatically, so redaction/egress rules keyed on the classification fire without per-boundary re-tagging. (c) On egress, the name's bound *encoder* is selected by destination (the RD-0315 destination-aware discipline), so the correct contextual encoding is chosen by construction. (d) **Recognising a canonical name is explicitly not permission**: deny-unknown-fields, explicit allow-lists, and per-actor authorisation remain independent and in force — the vocabulary governs *meaning and redaction*, never *access*.

## 5. Detailed description

- **The registry entry.** `name → { type, classification, encoder }`. Example: `emailAddress → { Email, pii, html-attribute/url-safe as context requires }`; `id → { OpaqueId, public, opaque }`; `password → { Secret, secret, never-emit }`. Adopting `emailAddress` in any application therefore inherits the PII classification and its redaction/egress handling with no additional code.
- **Casing and identity are exact.** A single canonical case is chosen (a JSON-native design would choose camelCase); `id`, `ID`, `Id` are **not** silently unified — the normaliser maps only declared aliases and treats an undeclared casing variant as unknown, failing closed rather than guessing. Canonical `id` is bound to an *opaque* identifier type, so the naming standard also removes sequential-ID enumeration as a side effect.
- **Redaction-survives-mapping.** Because the classification is a property of the *name*, a value mapped from application A to application B carries its classification into B's store and out of B's responses; a `secret`/`pii` field cannot be silently declassified by a rename. This is an information-flow obligation discharged by the vocabulary, not by each integration's hand-written mapper.
- **Interop-not-authorisation (the invariant).** The normaliser and vocabulary decide *what a field means and how it must be encoded/redacted*; they never decide *whether the caller may set or read it*. Mass-assignment is prevented by the unchanged deny-unknown-fields + explicit-allow gate: a recognised `role`/`isAdmin` name is still rejected unless the route explicitly admits it for that actor. Predictability is thus made safe, not dangerous.
- **Auditability.** Every alias→canonical rewrite and every classification attachment is emitted to the security report, so a mapping is inspectable rather than implicit.

## 6. Honest limitations & scope

- **Design-stage; unbuilt.** No implementation exists at disclosure time. This bank-prior-art disclosure records the construction *design*; a shipped, tested version would be a stronger, separate artifact.
- **A convention is only as good as its adoption, and adoption is a governance cost.** A canonical vocabulary must be curated, versioned, and agreed; drift, forks, and per-tenant extensions are real operational problems this design does not solve — it only makes the *governed* subset safe.
- **Classification defaults are a floor, not a proof.** Binding `pii` to `emailAddress` sets a safe default; it does not prove a given deployment's egress actually honours it — that remains the (shipped) egress gate's job. A field carrying application-specific sensitivity beyond its canonical default still needs an explicit per-field classification.
- **Not an authorisation mechanism, by design.** The vocabulary must never be read as access control; §5's invariant is load-bearing and any implementation that let name-recognition imply permission would reintroduce mass assignment. Stated as a non-goal so it cannot be mistaken for one.
- **Normalisation is a parsing surface.** The alias→canonical step is itself untrusted-input handling; it must be total and fail-closed (ambiguity/duplicate/over-long → reject), or it becomes a smuggling vector — the same discipline the sibling deny-only prefilter/parameterised-query disclosures apply.

## 7. Illustrative disclosure claims (prior-art disclosures, not patent claims)

1. **A method** of data interoperability wherein a canonical field name is bound, in a shared vocabulary, to a data type, a default data-classification label, and a context-specific output encoder, such that adopting the canonical name for a field automatically applies that field's classification and encoder without per-field re-declaration.
2. **A method** as in claim 1 wherein a value mapped between two applications that share the vocabulary retains its classification across the mapping by virtue of the classification being a property of the canonical name, such that a field designated sensitive cannot be declassified by renaming it during the mapping.
3. **A method** as in claims 1–2 comprising a fail-closed ingest normaliser that maps declared aliases to canonical names by exact rule and rejects any input in which two aliases resolve to the same canonical field, in which casing is undeclared/ambiguous, or, under a strict posture, which carries unrecognised fields — rather than resolving such inputs by best-guess.
4. **A method** as in claims 1–3 wherein recognition of a canonical field name confers no access authority, such that setting or reading a recognised field remains subject to an independent deny-by-default field-admission and per-actor authorisation check.
5. **A system** applying claims 1–4 wherein the canonical name bound to a record identifier is an opaque, non-sequential identifier type, whereby adoption of the naming standard additionally removes sequential-identifier enumeration as a data-exposure vector.
6. **A system** as in claims 1–5 emitting, to an audit report, each alias-to-canonical rewrite and each classification attachment, such that the meaning-and-redaction decisions applied to a mapped record are inspectable.

## Declarations
- **Type / tier:** defensive-pub, **design-stage** (no shipped construction yet). Not a novelty claim; not a measured result. · **Authorship & AI assistance:** drafted with AI assistance under human direction (owner: Phillip Booth); prior-art triage from training knowledge, not a filed legal search. · **Contact:** hello@trithypha.dev · **Funding:** none. · **Competing interests:** none. · **Licence:** Apache-2.0.
