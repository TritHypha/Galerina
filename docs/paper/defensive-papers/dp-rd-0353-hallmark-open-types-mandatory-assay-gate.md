# Defensive Publication — Hallmark open types: developer-minted nominal types with a mandatory assay gate, so a raw value can never masquerade as a validated domain value

**Disclosure ID:** DP-RD-0353 · **Date:** 2026-07-12 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Stage:** shipped construction (the hallmark open-type mechanism + its fail-closed diagnostics are landed and tested); disclosed here as prior art.

## 1. What is disclosed

A language mechanism — **hallmark open types** — by which a developer mints a new **nominal** domain type whose values *cannot exist* without passing a declared validation ("assay") gate:

```
hallmark CustomerRef of Text {
  gate: flow ... // the assay: the only way a Text becomes a CustomerRef
}
```

1. **Nominal, not structural.** A `CustomerRef` is a *distinct* type from the `Text` it wraps; the two are not interchangeable even though they share a representation. "Open" means any developer may mint one over a base type — the mechanism is a first-class part of the language, not a privileged built-in.
2. **A mandatory assay gate.** The **only** way to obtain a value of the hallmark type is through its declared gate flow. A direct assignment of a raw base value to the hallmark type is a **compile REJECT** (a dedicated diagnostic), not a coercion. There is no unchecked constructor and no implicit widening.
3. **Operations deny-by-default.** Operations on the hallmark type are refused unless declared for it — the type does not silently inherit the full operation surface of its base representation, so it cannot be treated as "just a string/number" wherever convenient.
4. **Reserved-name guard + taint-transparency.** Minting cannot shadow reserved/primitive names (a guard diagnostic), and the hallmark wrapper is transparent to taint/epistemic tracking — wrapping a tainted value does not launder its taint.

The net effect: **the validated-domain-value invariant is carried by the type system**. If you hold a `CustomerRef`, the compiler guarantees it passed the assay; there is no code path that produces one otherwise.

## 2. What it prevents

- **The "stringly-typed" confusion class.** A raw, unvalidated `Text`/`Int` cannot flow into a position that expects a validated domain value — the mismatch is a compile error, not a runtime surprise. Injection and malformed-identifier bugs that rely on an unchecked string reaching a sink are structurally blocked at the type boundary.
- **Constructor-bypass / validation-skipping.** Because the gate is the *only* constructor, there is no "forgot to validate here" path; you cannot mint the type without the assay, and you cannot assign your way around it.
- **Silent representation laundering.** A hallmark value cannot be implicitly used as its raw base (deny-by-default ops), so code cannot quietly strip the domain meaning and operate on the underlying bytes.
- **Taint laundering through a wrapper.** Wrapping does not clear taint, so a hallmark type cannot be used to "clean" an untrusted value without a real assay.

## 3. Honest scope and bounds

- **The assay is a modeling obligation.** The type guarantees *a* gate ran; it does not guarantee the gate's predicate is *sufficient* — a weak assay yields weakly-validated values. Correctness of the validation logic is above the mechanism.
- **Guarantees hold within the typed boundary.** Data arriving from outside the type system (deserialization, FFI, a host value) must pass the assay at the boundary; the mechanism enforces that raw→hallmark needs the gate, but the boundary discipline (assay-on-ingress) is the developer's to place.
- **Nominal distinctness is a compile-time property.** At runtime the value may share its base representation; the guarantee is that no *well-typed program* produced it without the assay, not that a memory-level forgery is impossible (that is a separate integrity concern).

## 4. Prior art acknowledged (novelty disclaimed)

Newtype / branded / opaque types (Haskell `newtype`, TypeScript branded types, Rust newtypes); smart constructors and "parse, don't validate" (Alexis King 2019); refinement types and contract types (Liquid Haskell, Racket contracts); abstract data types and constructor encapsulation (Liskov–Zilles); capability/deny-by-default operation surfaces; taint-transparency in information-flow systems. The disclosed composition — *a first-class, developer-mintable **nominal** open type over a base representation whose values are obtainable **only** through a mandatory declared assay gate (raw→type is a compile REJECT), with operations deny-by-default, a reserved-name guard, and taint-transparent wrapping* — is published to establish prior art; novelty is disclaimed for every constituent.

## 5. Declarations

- **Type/tier:** defensive-pub (shipped construction).
- **Authorship & AI assistance:** drafted with AI assistance (Claude) under human direction, grounded in KB RD-0353 (finding H1) and the shipped hallmark type mechanism + its diagnostics and example corpus.
- **Funding:** none. **Competing interests:** none declared.
- **Data / artifact availability:** design source KB `galerina-rd-0353…`; the mechanism, its fail-closed diagnostics, and a worked reject-on-raw-assignment example are in-repo and re-runnable.
- **Licence:** Apache-2.0.
