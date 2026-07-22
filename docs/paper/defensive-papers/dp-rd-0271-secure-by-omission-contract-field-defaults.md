# Defensive Publication — Secure-by-omission governance contracts: fail-closed injected defaults with declare-only-to-override and a mandatory expansion dump

**Disclosure ID:** DP-RD-0271 · **Date:** 2026-07-08 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Provenance:** RD-0266c §6 (`galerina-rd-0266c-zt-scorecard-and-20yr-legacy-checklist.md` (internal engineering KB), owner decision 2026-07-08) · security review findings A6/A15/A20/A24 (`galerina-rd-0266-syntax-security-review-2026-07-08.md`) · the trusted-by-omission fail-open it inverts (H2 / FO-TRUSTED-BY-DEFAULT-BOUNDARY, DP-RD-0269).

> **Purpose.** Defensive publication; **novelty disclaimed** (§3). The recorded construction: in a governance language where every flow carries a policy contract, an omitted contract field is **injected at compile time with its fail-closed (deny-side) default** — so a developer declares a field *only to override toward permissiveness*, and omission is always the safe direction ("secure-by-omission", the exact inverse of the trusted-by-omission defect class). Two fields are **non-defaultable toward permissiveness at all** (authorization and data classification). The injected expansion is compile-time, immutable, covered by the artifact signature, and **dumpable on demand** — "not declared" must never mean "invisible".

---

## 1. Technical field

Policy-carrying programming languages and configuration systems; default semantics for authorization, data classification, freshness, expiry, routing, and failure-path fields in per-flow security contracts; fail-closed compilation.

## 2. Background & problem

Contract/policy blocks accumulate fields (who-may, expiry/SLA, freshness/anti-rollback, output routing, breach handling, classification, effects). If omitted fields default to permissive values — or worse, to "unchecked" — then every new field added to the language becomes a fleet-wide silent hole, and every developer omission is an escalation. The witnessed defect class (H2: bare values trusted unless marked; FO-TRUSTED-BY-DEFAULT-BOUNDARY) shows omission defaulting to *trust*. The problem: define default semantics such that omission is always safe, overrides are always visible, and the expansion is attestable.

## 3. Prior art (stated honestly — novelty disclaimed)

- **Saltzer & Schroeder, Proc. IEEE 63(9), 1975** — fail-safe defaults ("base access decisions on permission rather than exclusion"). This disclosure is a systematic application of that 1975 principle across every field of a per-flow contract; the principle is not claimed.
- **CWE-276 (Incorrect Default Permissions), CWE-1188 (Initialization of a Resource with an Insecure Default)** — the defect classes this construction structurally excludes; cited as the negatives.
- **Deny-by-default firewall/policy practice; "secure by default" product doctrine** — standard; not claimed.
- **Sibling disclosures:** DP-RD-0269 (the fail-open taxonomy; H2/FO-TRUSTED-BY-DEFAULT-BOUNDARY is the inverted defect), DP-RD-0272 (schema-lock/prefilter — the construct these defaults are injected into).

**Novel only in combination:** (a) *every* governance dimension gets a deny-side injected default (not just permissions); (b) two dimensions are pinned non-defaultable-toward-permissive; (c) the injected expansion is signed and mechanically dumpable, making omission auditable rather than invisible.

## 4. Summary of the disclosed subject matter

A compiler pass ("govern: auto") that, for every contract field omitted by the author, injects a fixed fail-closed default: **permissions = deny-all** (must resolve to a registered key/capability to grant anything; must be able to deny under an empty policy); **classification = most-restrictive** (unknown data is never public); **time = conservative expiry/SLA window** (lengthening is a weakening and is capped under a hardened profile); **state = freshness/anti-rollback ON for signed inputs** (relaxing warns); **destination = return-to-caller** (any other routing runs an exposure check against the field's classification; state-changing flows require real origin/token intent, not a string); **breach = audit + drop + deny** (runtime-owned audit; never silent); **effects = deny-all** (closed allowlist; an unmapped effect denies). Declaring a field exists *only* to override its default, every override is visible in the source, and `explain <schema>` dumps the fully-expanded, signed contract so the injected defaults are first-class auditable artifacts.

## 5. Detailed description

### 5.1 The polarity rule
For each field F with value lattice ordered permissive→restrictive, the injected default is the restrictive end. Therefore omission can only ever *under-grant*, never over-grant; the failure mode of forgetting a field is a false DENY (availability) rather than a false ALLOW (breach). This is the design inverse of the H2 defect, where omission over-granted.

### 5.2 The two non-defaultable-toward-permissive pins
**permissions** and **classification** have no permissive default at any profile level: an empty policy must be able to deny (the gate is tested for deny-under-empty-policy, cf. FO-GATE-INERT-PREDICATE), and unclassified data is treated as the most sensitive class it could be. All other fields may be overridden toward permissiveness *explicitly and visibly*, subject to profile caps.

### 5.3 Attestable expansion ("not declared ≠ invisible")
The injection happens at compile time; the expanded contract is immutable, covered by the artifact signature, and dumpable (`explain` shows the effective contract with injected fields marked). A reviewer therefore audits the *effective* policy, not the source's silence. Without this, secure-by-omission would trade the H2 hole for an audit hole.

### 5.4 Worked example (minimal vs explicit)
A minimal `sealed auto schema DroneTelemetry { … }` with no declared contract compiles to: deny-all permissions, most-restrictive classification, conservative expiry, freshness-on, return-to-caller, audit+drop+deny breach, zero effects. The explicit form declares only the overrides (e.g. `permissions: Fleet.PubKey`, `destination: Stream.Radar`), each of which must resolve against a registry or the compile denies (name-based authority that binds to nothing is a compile error, finding A20).

## 6. Honest limitations & scope

- **Availability trade is real:** fail-closed defaults convert omissions into denials; teams must budget for false-DENY triage. That is the intended trade and is stated, not hidden.
- **Defaults are only as good as the registries:** `permissions` resolving "against a registered key" presumes a sound key/capability registry; this disclosure does not construct one.
- **The dump is load-bearing:** without the signed expansion dump, injected defaults would be invisible policy; implementations omitting §5.3 lose the audit property.
- **Not a formal-methods result:** no proof that the default set is complete over all future fields; the *rule* (restrictive end of each new field's lattice) is the durable part.
- **No new cryptography.**

## 7. Illustrative disclosure claims (prior-art disclosures, not patent claims)

1. **A method** of compiling policy-carrying programs wherein every omitted contract field is injected at compile time with the restrictive end of its value lattice, such that omission can under-grant but never over-grant.
2. **A method** as in claim 1 wherein authorization and data-classification fields have no permissive default at any configuration level, the authorization gate being required to demonstrate denial under an empty policy.
3. **A method** as in claims 1–2 wherein the post-injection expanded contract is immutable, covered by the artifact's signature, and mechanically dumpable with injected fields distinguished from authored fields.
4. **A method** as in claims 1–3 wherein any authored override naming an authority (key, capability, stream, destination) must resolve against a registry at compile time, an unresolvable name being a compile-time denial rather than a runtime lookup.

## 8. Evidence & cross-references

Settled field-defaults table and the minimal/explicit examples: RD-0266c §6. The inverted defect and its detector discipline: DP-RD-0269 (FO-TRUSTED-BY-DEFAULT-BOUNDARY; deny-under-empty-policy test). Registry-resolution enforcement precedent in-repo: FUNGI-ACCESS-001 (authority grants resolve-or-deny, `tests/governance/access-grant-resolution.test.mjs`).

### Declarations
- **Type / tier:** defensive-pub. Not a novelty claim. · **Authorship & AI assistance:** drafted with AI assistance under human direction (owner: Phillip Booth); grounded in the cited RD documents and in-repo tests. Prior-art triage from training knowledge, not a filed legal search. · **Funding:** none. · **Competing interests:** none. · **Artifacts:** at the stated in-repo paths. · **Licence:** Apache-2.0.
