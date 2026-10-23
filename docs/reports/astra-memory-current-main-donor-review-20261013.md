# Astra review: memory-current-main donor staged slices

- Reviewer model: `gpt-6-astra`
- Agent ID: `01a13463-d885-7141-a313-32b10e11298f`
- Follow-up submission ID: `01a13468-b4f9-79d2-bd21-e49a8ddb709f`
- Scope: read-only comparison of two staged donor slices against the pinned
  Galerina integration candidate. This is advisory review, not owner authority.

## Exact Astra reply

**Reject both donor slices as-is.** They remove protections present in the pinned integration revision. Each vector’s disposition is **PARTIAL**: the source establishes specific regressions, but this review does not establish complete compiler or runtime correctness.

Both registered worktrees are accessible and their HEADs match your pins. All eight requested blobs are accessible and match the integration HEAD/index or donor index as specified. The donor’s two test files are staged additions, absent from its HEAD; that is not an access failure.

The integration runtime and grant-test **working files differ from the pinned blobs**. The comparisons below use your immutable blobs. I inspected the current test file separately to confirm the two host-identity tests remain present.

### 1. Secret-label parser evidence

**CONFIRMED — donor loses structural type evidence.**

In `value-state-checker.ts`:

- Integration blob `e4b551714…`, lines 1552–1573, traverses `typeStructure`, checks generic arity, distinguishes type arguments from payloads, and refuses missing/invalid structural evidence.
- Donor blob `69773ec5b…`, lines 1543–1545, substitutes `/\\bSecureString\\b/.test(typeName)`.
- At donor lines 2661–2665, a successful textual match suppresses the secret-return diagnostic.

The smallest discriminating example is a secret-derived return declared as:

```text
Brand<String,"SecureString">
```

Here `SecureString` is a tag payload. The donor regex nevertheless treats it as preserving secrecy. The integration tests explicitly expect `FUNGI-SECRET-006` for this case and verify it reaches confidentiality checking without a type-checking error: test blob `8f0bb86c…`, lines 203–233.

**CONFIRMED — malformed and synthetic evidence no longer fails closed at this gate.**

Examples include `SecureString<String>` and a synthetic `typeRef` whose value is `SecureString` but lacks `typeStructure`. Both satisfy the donor regex. Integration tests cover invalid/non-type arguments at lines 236–250 and missing structural evidence at lines 284–289.

Some malformed examples have independent type errors. This finding establishes a regression in the confidentiality gate; it does not prove every example can execute through the full compiler.

**CONFIRMED — lexical alias/shadow handling regresses.**

Integration maintains alias identity through lexical bindings. Donor instead rebuilds a map on each flow/helper entry using `buildModuleAliasMap`.

I inspected that dependency’s donor-index blob, `30a23f02c1ff3ebb2e90199370bcd3ac88389711`, lines 183–205. It recursively collects declarations into a flat map, without preserving enclosing lexical captures or block boundaries.

A discriminating case is:

```text
let sink = AuditLog
fn helper() -> Bool {
  sink.write(raw)
  return true
}
```

When entering `helper`, the donor replaces the outer alias map with one collected from the helper itself. The outer `sink → AuditLog` capture is lost. Integration test lines 75–81 require the governed-sink diagnostic at that call. Other controls cover parameter shadows, siblings, transitive aliases and restoration.

**CONFIRMED — secret-lease coverage is reduced.**

The donor removes explicit handling of `resourceDecl` fields and `hallmarkDecl` carriers. Those nodes fall through to child traversal; there is no generic `paramDecl` case restoring the removed resource-field check. Record, parameter and local lease checks remain, so this is a specific coverage regression—not wholesale removal of lease refusal.

**CONFIRMED — donor tests discard the discriminating coverage.**

Donor test blob `c7095b5e…` retains the first three helper-context tests and removes the following 252 lines of alias, structural-type and malformed-evidence controls.

**Path disposition:** reject both the donor checker and donor helper-test file as-is. Preserve the integration versions. Any independently useful donor change within the checker needs its own bounded comparison before porting.

### 2. Async host identity / grant boundary

**CONFIRMED — donor can validate one host and use another.**

In runtime blob `cf1f517a…`, `admitAndInstantiate` reads `opts.host` separately at:

| Boundary | Donor line |
|---|---:|
| Factory-membership validation | 1099 |
| Import-roster checking, after awaited compilation | 1112 |
| Instantiation | 1131 |
| Memory binding | 1142 |
| Returned host identity | 1143 |

A caller can replace `options.host` while compilation is pending. A changing getter can also return different hosts on successive reads. Consequently, validation, import checking, instantiation and the returned host need not concern the same object.

Integration blob `e39cc2d1…` captures `const host = opts.host` at line 1091 and consistently uses that reference. Its factory freezes the import namespace at line 922 and runtime object at lines 1049–1050. This supports the particular identity guarantee under review.

**CONFIRMED — both identity tests are present and discriminating in integration.**

Pinned test blob `0aede244…` contains:

- **Lines 231–253:** performs real compilation, replaces `options.host` before admission resumes, then checks original host identity, original callback and result `7` rather than replacement result `99`.
- **Lines 255–271:** supplies a changing accessor and checks exactly one read, original host identity and original callback/result.

Both remain in the current working file, at lines 252 and 276 respectively. Donor test blob `668f6432…` removes both.

These controls directly distinguish the capture fix from the donor implementation. They do not directly exercise every possible identity change after instantiation or exported-memory binding.

**PLAUSIBLE — broader grant bypass using an unregistered replacement host.**

The source permits substitution after factory validation, suggesting a non-factory replacement could supply imports. The reviewed controls use two legitimate factory hosts, so they demonstrate identity substitution without establishing that broader exploit experimentally.

**Path disposition:** reject the donor runtime and donor grant-test file as-is. Retain the integration host capture and both controls. The integration working-file changes need separate adjudication before being included in a broader approval.

I made no edits or Git mutations, ran no CI, and inspected no ignored key contents. The supplied **55/55** and **2/2** results on Windows and WSL were not rerun here. They remain bounded bootstrap evidence; this review establishes no Fungi enforcement, production-authentication or RD-1413/1414/1415 closure.
