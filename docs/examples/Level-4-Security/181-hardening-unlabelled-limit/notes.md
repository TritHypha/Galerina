# 181 — The honest limit: an unlabelled value is NOT auto-hardened (RD-0358 HV8)

Auto-hardening triggers only on a value the type/effect system knows is sensitive — `Secret<T>`,
`Tainted<T>`, or a flow reached by a `secret.read` effect. A value the developer never labelled gets
**no hardening** and **no diagnostic**:

```
pure flow addTwo(a: Int, b: Int) -> Int { return a + b }
```

This is pinned deliberately. The security of auto-hardening is **only as good as the taint/secret
labelling** (RD-0358 HV8) — an unlabelled secret is an unhardened secret. Do not read "auto" as "all
secrets are hardened"; the fix for a missed value is upstream (label it), not here. Contrast with
example 179, where a labelled secret is hardened with zero ceremony.
