# Galerina Target Native TODO

```text
[x] Create /packages-ts/galerina-target-native
[x] Document package boundary
[x] Add package metadata
[x] Add initial typed exports
[ ] Define native target metadata
[ ] Define platform triple rules
[ ] Define ABI constraint model
[ ] Define native artifact report format
[ ] Define machine profile bridge handoff rules
[ ] Add examples
[x] Add tests
[x] Add the bounded fail-closed runtime own-data decoder and detached immutable
    report snapshot; hostile records, arrays and retained-alias controls pass
    in `src/index.ts:85-165`, `:173-277`, `:369-443`, `:445-484` and
    `tests/native-contracts.test.mjs:42-67`, `:102-157`.
[x] Current bounded package verification is **12/12** with clean typecheck/build.
[!] Keep canonical artifact path containment and binding of selected ABI/profile
    to the exact artifact, target, digest and VOK evidence open; the current
    contract only requires a non-empty path at `src/index.ts:340-367`.
[!] Legacy `Galerina_NATIVE_*` diagnostics still require owner-approved
    `FUNGI-CATEGORY-NNN` registry ownership before promotion.
```
