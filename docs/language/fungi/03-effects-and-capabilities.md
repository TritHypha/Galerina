# 03 — Effects & Capabilities

> **This page's effect vocabulary is copied from the compiler, not from a doc table.**
> Source of truth: `packages-galerina/galerina-core-compiler/src/effect-checker.ts` —
> `CANONICAL_EFFECTS` (lines ~298-355), `EFFECT_REGISTRY` (lines ~45-132),
> `EFFECT_NAME_ALIASES` (~367-397), `DENY_ONLY_EFFECTS` (~363-365). Contract-clause wiring:
> `parser.ts:4080`. Real examples: `examples/healthcare/getPatient.fungi`,
> `examples/foundations/hardened-border-plugin.fungi`, `examples/ai-inference/classifyMessage.fungi`.
>
> `docs/AI/CANONICAL_SYNTAX.md`'s effect table and the KB clause-reference's effect table both
> contain names that are **not** in `CANONICAL_EFFECTS` (e.g. `network.egress`, `vault.read`,
> `queue.publish`, `db.write`, `ai.call`, `state.mutate`). Where they disagree with
> `effect-checker.ts`, the checker wins. This page lists the real set.

## What an effect is

An **effect** is a system capability the flow's body is allowed to exercise — reading a database,
writing an audit record, making a network call, running inference. You declare them in the
`contract`'s `effects { }` block. The effect checker then compares your declaration against what the
body actually does:

* Body does something not declared → `FUNGI-EFFECT-001`.
* Declared effects don't match the body → `FUNGI-EFFECT-002`.
* Any effect at all inside a `pure flow` → `FUNGI-EFFECT-003` (hard error).
* An unknown effect name → `UNKNOWN_EFFECT`.

**Deny-by-default:** an empty (or absent) `effects {}` declares the flow strictly pure. You never get
an effect "for free."

## Declaring effects — the syntax

Effects are bare, dotted names inside `effects { }`, separated by whitespace, newlines, or commas.
Both separators appear in the corpus and both parse:

```fungi
effects { database.read phi.read audit.write }        // whitespace, from getPatient.fungi:14
effects { database.write, audit.write }               // commas, from guard-domain-ceiling.fungi:58
effects { allow network.outbound, allow audit.write } // optional `allow` prefix, hardened-border-plugin.fungi:44
```

The optional `allow` prefix (`effects { allow audit.write }`) appears in several examples and reads as
"this flow is allowed to `audit.write`." It is accepted; plain `audit.write` is equally valid.

## The real effect vocabulary (`CANONICAL_EFFECTS`)

This is the complete set the production effect checker accepts. Grouped for learning:

### Data & storage
| Effect | Meaning |
|---|---|
| `database.read` | Query the database |
| `database.write` | Mutate the database |
| `storage.read` | Read persistent/file storage |
| `storage.write` | Write persistent/file storage |
| `cache.read` | Read from cache |
| `cache.write` | Write to cache |
| `state.read` | Read shared application state |
| `state.write` | Write shared application state |
| `ledger.mutate` | Financial/ledger mutation (the `storage.write`+`audit.write` composite) |

### Network & messaging
| Effect | Meaning |
|---|---|
| `network.outbound` | Any outbound network call |
| `network.inbound` | Accept an inbound connection |
| `network.external` | Cross an external trust boundary |
| `network.internal` | Internal-only network call |
| `email.send` | Send email (implies `network.outbound`) |
| `message.publish` | Publish to a message queue/bus |

### Secrets, crypto & randomness
| Effect | Meaning |
|---|---|
| `secret.read` | Read a secret/credential |
| `secret.write` | Write a secret |
| `crypto.verify` | Verify a signature / password hash |
| `crypto.sign` | Produce a signature |
| `crypto.encrypt` / `crypto.decrypt` / `crypto.seal` | AEAD / KEM-DEM confidentiality ops |
| `crypto.sign.ed25519` / `crypto.sign.mldsa65` / `crypto.sign.slhdsa` / `crypto.sign.hybrid` | signing-algorithm marker effects declared *alongside* `crypto.sign` to assert the algorithm (a PQ/hybrid marker is required in certified profiles) |
| `random.generate` | Generate secure random bytes |
| `clock.read` | Read the (non-deterministic) clock |

### Compute, AI & hardware
| Effect | Meaning |
|---|---|
| `ai.inference` | Run model inference |
| `ai.train` | Train / fine-tune a model |
| `compute.cpu` / `compute.gpu` / `compute.npu` | Explicit compute-lane use |
| `native.call` | Call into a native (non-WASM) capability |
| `shell.execute` | Run a shell command (restricted/dangerous) |
| `desktop.user.read` | Read user-desktop state |
| `telemetry.read` | Read telemetry (e.g. aerospace corpus) |

### Governance / privacy-domain
| Effect | Meaning |
|---|---|
| `audit.write` | Write to the audit log |
| `pii.read` | Read personally-identifiable information |
| `phi.read` / `phi.write` | Read/write protected health information |
| `payment.charge` | Charge a payment |
| `process.spawn` | Spawn a background process |
| `worker.spawn` | Spawn a worker |
| `event.schedule` | Schedule a future event |

### The one deny-only effect
| Effect | Meaning |
|---|---|
| `eval.execute` | Arbitrary dynamic evaluation — **RECOGNISED but NEVER grantable**. Declaring it is an error in every profile (`FUNGI-EFFECT-006`). It has no capability bit and no admission path. |

`eval.execute` is in the vocabulary on purpose: so that if you try to use it you get the real reason
("never grantable") instead of a typo hint.

## Design-stage (RD-0358): `memory.spill` — NOT yet a real effect

> **Not in `CANONICAL_EFFECTS`.** Do not declare it — the checker rejects it as unknown.

RD-0358 (governed memory-residency hardening) proposes that **crossing a residency ceiling** — a value
spilling past its declared `hardening { residency … }` tier — become a **deny-by-default effect**
(`memory.spill`-class): an *undeclared* spill would not compile, and a *declared* one would be the
audited paged-optimizer cousin. This is **design-stage (H-6)**: the hardening *derivation* and the
explicit-block *enforcement* ship in the prototype (see
[04 — Types § Governed memory-residency hardening](04-types-and-values.md)), but `memory.spill` is
**not** wired as a first-class effect yet. When it lands it joins `CANONICAL_EFFECTS` (the single source
of truth) and moves up into the real vocabulary above.

## Operation → effect inference (`EFFECT_REGISTRY`)

The checker also knows which **standard-library calls** produce which effects, so it can verify your
`effects {}` matches the body. A sample of the real mapping (`effect-checker.ts:45-132`):

| You call… | Inferred effect(s) |
|---|---|
| `database.find/get/select/query` | `database.read` |
| `database.insert/update/delete/upsert` | `database.write` |
| `AuditLog.write`, `audit.write`, `audit.log` | `audit.write` |
| `http.get/post/put/patch/delete`, `https.get/post` | `network.outbound` |
| `fs.read*` / `File.readText/Bytes` | `storage.read` |
| `fs.write*` | `storage.write` |
| `cache.get` / `cache.set` / `cache.delete` | `cache.read` / `cache.write` |
| `ai.inference`, `Model.run`, `Classifier.classify` | `ai.inference` |
| `email.send`, `EmailService.send` | `network.outbound` + `email.send` |
| `Crypto.verify/sign/encrypt/decrypt/seal`, `BCrypt.*`, `Argon2.*`, `Password.*` | the matching `crypto.*` |
| `Secrets.get`, `vault.secret` | `secret.read` |
| `Random.secureBytes/bytes` | `random.generate` |
| `Clock.now` | `clock.read` |

There is also a legacy pattern layer: any `*DB.insert/update/delete` call is treated as
`database.write`, and any other `*DB.*` as `database.read` (`effect-checker.ts:409-415`). So
`PatientsDB.find(...)` in `getPatient.fungi` implies `database.read`, which is why that flow declares
`effects { database.read ... }`.

## Aliases — accepted but nudged to the canonical name

Some names are **aliases** the checker resolves to a canonical effect (`EFFECT_NAME_ALIASES`,
`effect-checker.ts:367-397`). They compile, but you should prefer the canonical spelling:

| You wrote (alias) | Resolves to |
|---|---|
| `network` | `network.outbound` |
| `database` | `database.read` |
| `filesystem` / `file.read` | `storage.read` |
| `file.write` | `storage.write` |
| `secret` | `secret.read` |
| `secret.access` | `secret.read` (**broad-alias warning** `FUNGI-EFFECT-005`) |
| `ai` / `ai.remoteInference` / `ai.infer` | `ai.inference` |
| `audit` | `audit.write` |
| `pii` | `pii.read` |
| `pii.write` | `database.write` |
| `phi` | `phi.read` |
| `http.get/post/put/delete/patch` | `network.outbound` |
| `crypto.password.verify` | `crypto.verify` |

> Note the drift trap: `secret.access` (used in `examples/foundations/gate-access-example.fungi` and
> the KB tables) is a **broad alias** that resolves to `secret.read` and triggers
> `FUNGI-EFFECT-005`. In new code prefer the fine-grained `secret.read` / `secret.write`.

## Names that older docs use but the checker does NOT accept

Do **not** write these — they are not in `CANONICAL_EFFECTS` and not registered aliases:

| Doc-only name | Use instead |
|---|---|
| `network.egress` (CANONICAL_SYNTAX table) | `network.outbound` |
| `vault.read` (CANONICAL_SYNTAX table) | `secret.read` |
| `queue.publish` / `queue.subscribe` | `message.publish` (and there is no canonical subscribe effect) |
| `db.read` / `db.write` (KB clause table) | `database.read` / `database.write` |
| `state.mutate` (KB clause table) | `state.write` |
| `ai.call` (KB clause table) | `ai.inference` |
| `gateway.charge` (KB clause examples) | `payment.charge` |

(The KB and CANONICAL doc tables were written before the effect vocabulary was reconciled into a
single source. Trust `effect-checker.ts`.)

## Capabilities: `uses`, `access { grant }`, and how they relate to effects

Effects say *what the body does*. **Capabilities** are the runtime authority to do it. Two source
forms grant/negotiate capability:

### `uses cap.name` — inline capability declaration (Core style)

```fungi
flow load_secret(user_id: Id) -> Secret
  uses vault.secrets.read
{
  return GlobalVault.secrets.get(user_id)
}
```

Parsed at `parser.ts:4722`. Less common than `effects {}` in the corpus, but real.

### `access { grant ... }` — Default-Deny capability boundary

The dominant capability construct. It sits **between** the contract and the body (never inside the
contract), and it is **Default-Deny**: you list only what is granted; everything else is refused —
you never write `deny`. From `examples/foundations/gate-access-example.fungi:55-69`:

```fungi
secure flow processRequest(payload: String) -> Result<Bool, Error>
contract {
  intent "Process an incoming request"
  effects { allow database.write, allow audit.write }
}
access {
  grant database.write    ;; explicitly admitted capability
  grant audit.write       ;; explicitly admitted capability
  ;; everything else is implicitly DENIED — omission IS the denial
}
{
  trap payload == "" : ERR_EMPTY_PAYLOAD
  return Ok(true)
}
```

Key rule: `access { grant ... }` is a **filter**, not a widener. It cannot introduce an effect the
contract didn't declare — the contract's effects must be a subset of what's granted, not the other
way around. Full treatment (plus `guard`, `gate`, `[conforms_to]`) is in
[06 — Governance constructs](06-governance-constructs.md).

## Worked reading: why `getPatient` declares what it declares

```fungi
guarded flow getPatient(readonly request: Request) -> GetPatientResult
contract {
  effects { database.read phi.read audit.write }
  ...
}
{
  let patientId = validate.patientId(request.params.id)?
  let patient   = PatientsDB.find(patientId)?     // *DB.find  → database.read
  AuditLog.write({ ... })                          // AuditLog.write → audit.write
  return Ok({ ... })
}
```

* `PatientsDB.find(...)` → `database.read` (legacy `*DB.*` pattern).
* `AuditLog.write(...)` → `audit.write`.
* `phi.read` is declared because the flow handles protected health information (patient name/dob);
  the privacy checker expects it.

Drop any one of those three declarations and the effect checker fails the build.

## Common mistakes (effects)

| Mistake | Why wrong | Fix |
|---|---|---|
| `effects { network.egress }` | not a real effect name | `network.outbound` |
| `effects { db.write }` | `db.*` isn't canonical | `database.write` |
| `effects { vault.read }` | not canonical | `secret.read` |
| declaring `secret.access` | broad alias, warns | `secret.read` / `secret.write` |
| calling `AuditLog.write(...)` with no `audit.write` in `effects` | undeclared effect | add `audit.write` (`FUNGI-EFFECT-001`) |
| any effect in a `pure flow` | pure = zero effects | make it `guarded`/`secure`, or remove the effect (`FUNGI-EFFECT-003`) |
| `access { deny shell.execute }` | you never write `deny` | omit it — Default-Deny refuses it automatically |
| expecting `access { grant X }` to add an effect not in the contract | access is a filter | declare the effect in `contract.effects` first |

## Real files to open

* `examples/healthcare/getPatient.fungi` — `database.read phi.read audit.write` matched to the body.
* `examples/foundations/gate-access-example.fungi` — `access { grant ... }` Default-Deny.
* `examples/foundations/hardened-border-plugin.fungi` — `effects { allow network.outbound, allow audit.write }` + plugin `access`.
* `examples/ai-inference/classifyMessage.fungi` — `effects { ai.inference audit.write }` with `targets` and `hardware`.

Next: **[04 — Types & values](04-types-and-values.md)**.
