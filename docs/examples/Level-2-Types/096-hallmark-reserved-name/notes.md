# 096 — Hallmark reserved names (RD-0353, T1/T9)

The **protected-marks** rule: a hallmark may not mint a name that already carries built-in
or governance meaning. The reserved set is `BUILT_IN_TYPES` ∪ currency/unit tags ∪ the
epistemic/security vocabulary (`Trusted`, `Unverified`, `Refuted`, `Tainted`, `SafeFor`,
`Secret`, `Decision`, `Verdict`), with targeted hints:

```fungi
hallmark Money of Decimal { … }   // FUNGI-HALLMARK-001 — "use Money<GBP> or a `unit`"
hallmark GBP   of Decimal { … }   // FUNGI-HALLMARK-001 — "GBP is a currency/unit tag"
hallmark Verdict of Int  { … }    // FUNGI-HALLMARK-001 — "a reserved governance term"
```

This closes the **authority-by-naming** attack (T10): names carry no authority anywhere in
the compiler — authority is schema + gate only — so a name like `Money` or `Trusted` cannot
be repurposed to impersonate the meaning developers (and AIs) expect from it.

A related refusal happens one layer earlier: a **non-ASCII / mixed-script** name (a Cyrillic
`С` homoglyph of Latin `C`) is rejected by the lexer as `FUNGI-PARSE-001`, with
`FUNGI-HALLMARK-002` as the type-layer backstop.
