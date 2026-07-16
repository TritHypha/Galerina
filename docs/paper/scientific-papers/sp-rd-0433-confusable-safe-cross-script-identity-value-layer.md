# Confusable-safe cross-script identity at the value layer: a three-valued admission gate for Latin and non-Latin symbols

**Disclosure ID:** SP-RD-0433 · **Date:** 2026-07-16 · **Type:** construction paper (prior-art disclosure — NOT a patent claim) · **Provenance:** KB RD-0433/0434; runnable harness `TritMesh-Database/examples/symbols-cross-script/verify-symbols.mjs` — **13/13 assertions green on real Unicode data** (re-run and personally verified 2026-07-16).

## Purpose
Financial and identity systems must compare symbols across scripts (tickers, account labels, instrument codes) where homoglyphs (`USDС` with a Cyrillic Es), invisible characters, bidi controls, and locale-dependent case folds are live attack material. We disclose a value-layer construction that admits non-Latin symbols as **first-class** while making the confusable-counterfeit class a *deny by construction* — and the honest boundary that keeps it at the value layer.

## The construction (all 13 behaviours machine-checked)
Identity is decided on an **immutable canonical key**, never on the display label:
1. **Canonicalize once at admission:** Unicode NFKC normalization (full-width/ligature forms compare equal), then **Unicode default case-fold** — never a locale fold (the Turkish-i trap is a checked fixture: locale folds change identity; the default fold is stable).
2. **Deny invisibles and direction controls:** zero-width and bidi-control code points in an identifier-class value → DENY (they exist only to deceive).
3. **Single-script confinement:** a symbol whose letters span scripts (Latin+Cyrillic `AMAZОN`) → DENY by default; a *pure* non-Latin symbol (CJK, Cyrillic, Arabic) is **admissible** — flagged INDETERMINATE for policy admission, never auto-denied. Non-Latin is a first-class citizen; *mixing* is the attack signature.
4. **Confusable skeleton as the counterfeit detector:** compute the UTS #39 skeleton; a new symbol whose skeleton collides with a *different* registered key is a counterfeit-canonical attempt → DENY.
5. **Three-valued verdict:** ALLOW (canonical, clean) / INDETERMINATE (admissible pending policy — e.g. new script for this registry) / DENY (homoglyph mix, invisible, bidi, skeleton collision). Unknown ⇒ deny at any boundary.

## The honest boundary (as load-bearing as the mechanism)
This construction belongs at the **value layer** — registries, labels, stored symbols. It must **not** be "fixed" by making a programming language's *identifier grammar* Unicode-flexible: a strict-ASCII identifier lexer already closes the homoglyph-identifier class **by construction**, and widening it to be helpful would re-open that class. Where a host language has ASCII identifiers, the correct integration is values-only; the lexer stays closed. (Verified against a production lexer before transfer; the transfer shipped value-layer-only.)

## Prior art (novelty disclaimed)
Unicode UTS #39 (confusable skeletons, mixed-script detection), UAX #15 (NFKC), UAX #31 (identifier syntax), IDN homograph-attack literature, and registry "bundling" practices (ICANN) are established — **no novelty is claimed over any of them**. The disclosed composition — canonical-key-not-label, NFKC + default-case-fold at admission, deny-invisibles/bidi, single-script-confinement with non-Latin-first-class, skeleton-collision-as-counterfeit, all under a three-valued fail-closed verdict, with the value-layer-only boundary stated — is recorded as prior art.

## Honest bound
The skeleton table is versioned data: new confusables ship with Unicode revisions, so the gate's coverage is as current as its table (pin and update it like any security dependency). Single-script confinement is a *default*, not a universal: legitimately mixed-script names exist and take the INDETERMINATE policy path — the construction refuses to silently auto-allow them, which is the point.

*Contact hello@trithypha.dev.*
