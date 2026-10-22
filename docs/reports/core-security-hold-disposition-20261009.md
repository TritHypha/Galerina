# Galerina core-security HOLD disposition — 2026-10-09

## Scope and authority

This records a bounded review of `packages-ts/galerina-core-security/TODO.md`
against the owner-approved first-slice decisions for `POST /auth/verify`. It is
not an owner approval, implementation authorization, production clearance, or
R&D closure. Galerina is designing `.fungi` as a new language; TypeScript
bootstrap evidence is not a ceiling on Fungi guarantees, and neither proposed
Fungi semantics nor TypeScript code establish Fungi enforcement by themselves.

The reviewer was Astra, task `01a11642-55bd-7c23-9ccc-587f10444bf9`, turn
`01a11ee8-a6e2-7052-a6e8-a786dd2eed1f`, final message
`msg_0617df87b65142c5016ac86cd50ca087d2aaf89daafe8201a4`. The review was
advisory and read-only. It verified the primary checkout at
`9a26c71e60e491766ef351d0efe0405b0739c1b6` and these owner-file hashes at
review time:

| Source | SHA-256 |
|---|---|
| `packages-ts/galerina-core-security/TODO.md` | `600299A06DA1D0949EEDBB48DED3A5858F42FB44244C699791EBDB7DFDF3B4AD` |
| `docs/TODO.md` | `655F0757939325B05AC69B76A3EFFF4EF757911E7D5890134BF6FCC8D15B5BB7` |
| `packages-ts/galerina-framework-app-kernel/TODO.md` | `1B77ECC0EA7BE305B8A244131C942796B9D090428453DAE185A9250C71D905D1` |

Those hashes identify the reviewed snapshot, not necessarily later working
bytes. Recheck before relying on this disposition after source changes.

## Result

**All 26 `[HOLD]` rows remain `KEEP_HOLD` as written; none is `SUPERSEDED`.**
The owner fixed one operation and its authority, custody, result, recovery,
deployment and provisional workload bounds. That is relevant design input, but
does not specify the generic types, sink taxonomy, taint algebra, redaction,
fingerprinting, diagnostics, logging or resolver requested by this legacy
TypeScript backlog. “Partial” below means only that a related constraint
exists; it does not mean the generic row is partly authorized.

| TODO line | Held item | Coverage of owner decision | Disposition and smallest safe next step |
|---:|---|---|---|
| 27 | `SecretReference` v0.2 | Partial | **KEEP_HOLD** — map operation identity to existing Fungi/runtime owners before proposing a generic record. |
| 28 | `SecretSource` union | Partial | **KEEP_HOLD** — obtain the exact provider/acquisition contract; interim provider custody does not approve the proposed source variants. |
| 29 | `SecretCategory` union | Absent | **KEEP_HOLD** — identify a real consumer and obtain approval for its categories; the password-verification slice does not approve the cross-product taxonomy. |
| 30 | `SecretRedactionPolicy` | Partial | **KEEP_HOLD** — define allowed observations and refusal cases; no partial, prefix, suffix, or fingerprint policy is approved. |
| 31 | `SecretDerivedReference` | Absent | **KEEP_HOLD** — require a concrete authorized derivation use and its custody/lifecycle contract. |
| 32 | `SecretDerivation` union | Partial | **KEEP_HOLD** — specify only the selected operation’s cryptographic behavior; webhook HMAC is a separate later candidate. |
| 33 | Expanded `SecureStringReference` | Partial | **KEEP_HOLD** — settle Fungi ownership and persistence rules before adding generic lifetime metadata. |
| 34 | Generic `ProtectedSecret<T>` unwrap/redaction class | Partial | **KEEP_HOLD** — reconcile the historical API checkbox with the Fungi-owned boundary; do not add TypeScript secret authority. |
| 35 | `SecretSafeSink` and sink constants | Partial | **KEEP_HOLD** — specify the operation-bound recipient/output contract, not a generic sink catalogue. |
| 36 | `canSendSecretToSink` | Partial | **KEEP_HOLD** — define an atomic authorization/lifecycle decision binding revocation, object/version, lease and recipient before selecting an API. |
| 37 | `redactSecretValue` | Partial | **KEEP_HOLD** — specify observable output and failure behavior; no generic `ProtectedSecret` conversion is authorized. |
| 38 | HMAC fingerprint, truncated to 16 hex characters | Partial | **KEEP_HOLD** — establish purpose, key custody and correlation policy, or exclude fingerprints from this slice. |
| 39 | `SecretDiagnostic` schema | Absent | **KEEP_HOLD** — map required failures to existing diagnostic owners before proposing schema changes. |
| 40 | `FUNGI-SECRET-001/002` checks | Partial | **KEEP_HOLD** — approve exact predicates, diagnostic ownership and discriminating compiler/runtime cases first. |
| 41 | `SecretTaint` union | Partial | **KEEP_HOLD** — map confidentiality and ownership obligations separately to existing compiler passes; no taint union is specified. |
| 42 | `combineTaint` | Absent | **KEEP_HOLD** — produce a proposed join table and counterexamples for review; do not implement an unapproved algebra. |
| 43 | `checkStringConcat` | Partial | **KEEP_HOLD** — specify forbidden transformations plus public-value controls before defining a generic checker interface. |
| 44 | `checkSecretSink` | Partial | **KEEP_HOLD** — bind output type, recipient and release phase before selecting enforcement points. |
| 45 | Recursive `safeLog` | Partial | **KEEP_HOLD** — specify allowlisted metadata and hostile-object handling; recursive TypeScript redaction is not containment. |
| 46 | `buildAuthorizationHeader` | Absent | **KEEP_HOLD** — obtain a concrete protocol and custody decision; gateway authentication does not authorize generic plaintext unwrapping. |
| 47 | Nine-file `secrets/` subsystem | Partial | **KEEP_HOLD** — map responsibilities to existing Fungi/runtime components and identify actual missing components; names alone do not approve a subsystem. |
| 48 | Three-file `checks/` subsystem | Partial | **KEEP_HOLD** — map proposed checks to existing passes and show they are non-duplicating before implementation. |
| 49 | `runtime/` resolver/log/JSON subsystem | Partial | **KEEP_HOLD** — define the loaded Fungi/runtime ABI and transport boundary; no generic TypeScript resolver or plaintext serialization path is authorized. |
| 50 | Protected serialization marker | Partial | **KEEP_HOLD** — specify an enforceable representation and test copy, alias, conversion and serialization bypasses before choosing a marker. |
| 55 | Malicious-data/taint diagnostics | Partial | **KEEP_HOLD** — catalogue malformed-input refusals separately; input bounds do not adopt the held taint vocabulary. |
| 57 | Hardware-risk report inputs | Partial | **KEEP_HOLD** — request the exact platform evidence/receipt schema and its owner; a candidate attestation platform is not a generic risk vocabulary. |

“Absent” means not specified in the inspected owner sections, not absent from
all repositories or records. No row should be reopened solely because a phrase
resembles an owner decision. The security TODO itself says to reopen an
individual row only when the owner specifies that part of the model
(`packages-ts/galerina-core-security/TODO.md:8-15`).

## Independently checked implementation boundary

The cited current source supports the boundary distinction, not any broad
closure claim:

- `packages-ts/galerina-core-security/src/index.ts` describes
  `SecureStringReference` as metadata with an optional caller-supplied
  fingerprint; this is not the held v0.2 lifecycle or an approved fingerprint
  policy.
- `packages-ts/galerina-core-security/src/capability-lease-contracts.ts:21-22`
  says that live issuance/revocation and clock sources are not covered.
- `packages-ts/galerina-framework-app-kernel/src/secret-gate.ts:183,226,245`
  stages bytes, calls the consumer, and wipes its staged view. This does not
  prove erasure of an independent copy made by the consumer.
- `packages-ts/galerina-framework-app-kernel/src/self-hosted/secret-gate.fungi:3-13`
  describes a presence-evidence fold, not ownership of bytes, provider access,
  allocation, cleanup or release.
- `examples/auth-service/deno-adapter.ts:27-35` returns 503 for the selected
  path, while `examples/auth-service/verifyPasswordService.fungi:65-70`
  registers a fixture route. A real protected operation is not established.

These files were independently read in the primary checkout after Astra’s
review. Their exact working-file hashes at that verification are:

| Source | SHA-256 |
|---|---|
| `packages-ts/galerina-core-security/src/index.ts` | `D3FAA57950FC6F57DDF73586DC0937E863346B01455C576A48A05481FE41E2EB` |
| `packages-ts/galerina-core-security/src/capability-lease-contracts.ts` | `0AC89DEB4A9860C0374E1187814006B34723ADE10D7484BFBAAB1F85E42CA089` |
| `packages-ts/galerina-framework-app-kernel/src/secret-gate.ts` | `DF1E4AC1992E1A0F7DB869742417D85357AFCEB0F0D77E655AB566512A71F128` |
| `packages-ts/galerina-framework-app-kernel/src/self-hosted/secret-gate.fungi` | `F62C6F939FBB5EAE68FACE87048292FC9BBACBCDA94D817D9C9E883EB7AF347F` |
| `examples/auth-service/deno-adapter.ts` | `718F4DDAD8579819CE50140A0E724B74983FC6D551C3256AE02BE1BD75457D4C` |
| `examples/auth-service/verifyPasswordService.fungi` | `274C05453441DC44E19F1120919F30AC9429B3CAFF6705E96076C2B009F12B67` |

Recheck exact bytes before using these as a later verification receipt.

## Safe unblocking: proposal-only semantic test catalogue

The core TODO explicitly allows proposal-only semantic case-catalogue work at
`packages-ts/galerina-core/TODO.md:1072-1075`, provided unresolved outcomes stay
unresolved. This does not authorize syntax, generic TypeScript secret
authority, compiler/runtime enforcement, closure of ownership/checker rows, or
RD closure. The catalogue is recorded in
`packages-ts/galerina-core/docs/memory-safety-test-catalogue.md`; the
`Define memory-safety tests` checkbox remains open until an owner-approved
semantic oracle and enforcing test path exist.

The catalogue contains candidate probes for ownership/move, aliasing,
borrow escape, copying, cleanup exits, re-entry/revocation ordering, allocation
bounds, reuse, effects/sinks, FFI, host boundaries, and backend parity. Every
case is marked `UNRESOLVED`; these are test-design questions, not adopted
language rules. Once a rule is approved, the next step is to bind a positive
control and discriminating violation to the layer that enforces it, then test
that layer and any claimed composed route.
