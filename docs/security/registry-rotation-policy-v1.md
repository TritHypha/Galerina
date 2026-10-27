# Registry rotation policy v1 - one root signature, automated bounded rotation

Status: tooling and verifier landed on branch `grok/registry-rotation-policy-20261027`
(local, not yet pushed; see "Open items"). Nothing here is activated: no policy has been
signed, no min-serial floor was raised, and `registry-runtime` does not yet consume v2
delegations (opt-in loader integration is an open item).

## 1. Why

Registry delegations are short (<= 90 days). Each one needs the cold root, so a lapse
(like serial 2 ending `2027-01-25T15:45:00.000Z`) means a registry with no authority until the
owner signs again. The policy moves the owner's recurring act to a rare one:

- The cold root signs **one** long-lived `galerina-registry-rotation-policy/v1` (<= 730 days).
- A separate, bounded **issuer key** (pinned in that policy) issues short-lived operational
  `galerina-registry-delegation/v2` documents inside the policy bounds, each overlapping its
  predecessor so there is never a gap.
- The root signs again only when the policy itself ends (about every 2 years), a key is
  revoked, or the bounds need to change.

## 2. Chain of trust

```
offline root --signs--> RotationPolicy v1 (bounds, issuer pin, key allow-list, anchor)
      |--signed earlier--> anchor: root-signed delegation v1 (serial 2, f3172a48372bfb23)
policy issuer --signs--> galerina-registry-delegation/v2  (serial anchor+1, +2, ...)
operational key (named by the v2 delegation) --signs--> registry index / package manifests
```

The issuer key can never sign content: its id may not be an operational key id. A compromised
issuer is bounded by the policy: roles, lifetime cap, overlap minimum, algorithm suite, key
allow-list/deny-list and the policy window. It cannot extend the policy or mint a root act.

Verifier trust anchors are unchanged: the locally pinned root key id plus the public key
bytes. A policy, delegation or index is never self-authenticating.

## 3. Documents

Canonicalization is JCS (`canonicalJson`). Signing preimage for both documents:

```
<context> NUL "Ed25519+ML-DSA-65" NUL <signerKeyId> NUL "jcs" NUL <canonicalJson without the signature field>
```

ML-DSA-65 uses the context string bytes as its context parameter, as in registry delegation v1.

| Document | Signed by | Context | Signature field |
| --- | --- | --- | --- |
| `galerina-registry-rotation-policy/v1` | offline root | `galerina.registry.rotation-policy.sig.v1` | `rootSignature` |
| `galerina-registry-delegation/v2` | policy issuer | `galerina.registry.delegation.issued.sig.v1` | `issuerSignature` |
| root delegation v1 (anchor, existing) | offline root | `galerina.registry.delegation.sig.v1` | `rootSignature` |
| registry index v2 (existing) | operational key | `galerina.registry.index.sig.v2` | `signature` |

### 3.1 RotationPolicy v1

| Field | Meaning / rule |
| --- | --- |
| `schema` | `galerina-registry-rotation-policy/v1` |
| `registry` | must equal the anchor's registry |
| `serial` | policy serial, rollback floor via `minPolicySerial` |
| `issuedAt`, `notBefore`, `notAfter` | ISO instants; `notAfter - notBefore <= 730 days` (hard ceiling) |
| `rootKeyId` | locally pinned root |
| `issuer` | `{keyId, algorithm, ed25519PublicKeySha256, mlDsa65PublicKeySha256}`; the issuer's public bytes are fingerprint-pinned |
| `allowedRoles` | subset of `package-manifest.sign`, `registry-index.sign` (closed set) |
| `allowedAlgorithms` | only `hybrid-ed25519-mldsa65` (Ed25519-only is a prohibited downgrade) |
| `maxDelegationLifetimeSeconds` | per-delegation cap, never above 90 days |
| `minOverlapSeconds` | minimum overlap with the predecessor, `> 0` and below the lifetime cap |
| `pinnedOperationalKeys` | `[{keyId, ed25519PublicKeySha256, mlDsa65PublicKeySha256}]` - keys that may be delegated, byte-pinned |
| `allowGeneratedKeyIds` | if true, a key not listed may be delegated; its fingerprints are then bound by the issuer instead of the policy |
| `deniedOperationalKeyIds` | never delegatable (carries the SLIDE key `f3172a48372bfb23`) |
| `anchor` | `{serial, keyId, notAfter}` of the root-signed v1 delegation the chain starts from |
| `firstRotation` | `{fromKeyId, toKeyId}` or null; the first issued delegation **must** name `toKeyId` |

### 3.2 Issued delegation v2

`schema, registry, serial, issuedAt, notBefore, notAfter, rootKeyId, operational{keyId, algorithm, ed25519PublicKeySha256, mlDsa65PublicKeySha256}, roles, policySerial, policySha256, issuerKeyId, issuerSignature`.
`policySha256` is the SHA-256 of the policy's unsigned preimage (printed as the
"policy digest"), binding each delegation to exactly one policy.

## 4. Verifier rules (all fail closed; only `"verified"` / `"ok"` authorizes)

`verifyRegistryRotationPolicy` and `verifyRegistryIssuedDelegationChain`
(`packages-ts/galerina-framework-app-kernel/src/registry-rotation-policy.ts`):

1. Policy envelope, context, key id, and **both** root signatures; root key pinned locally.
2. Root, issuer and the target operational key not revoked; revocation lookup failure is a refusal.
   The anchor is checked root-only so retired links do not break the chain.
3. Policy in force at the verification instant; policy serial >= floor.
4. Anchor matches the root-signed v1 delegation exactly (serial, key id, `notAfter`).
5. Serial strictly greater than its predecessor, starting from the anchor serial (the planner always issues anchor+1, +2, ...); duplicates refused; the target must be above the caller's `minSerial` floor.
6. Lifetime <= policy cap and the hard 90-day ceiling; window and `issuedAt` inside the policy window;
   `issuedAt <= notBefore` (no backdating).
7. Roles subset of the policy's closed role set (and of what the caller requires).
8. Algorithm in `allowedAlgorithms`; key id allowed (pinned, or generated and not denied,
   not root, not issuer); pinned fingerprints equal; issuer public bytes equal the host's bytes.
9. Overlap with the predecessor >= `minOverlapSeconds` and no gap
   (`successor.notBefore <= predecessor.notAfter - minOverlap`).
10. `firstRotation`: the first issued delegation names exactly `toKeyId`.
11. Chain length <= 1024; every link must belong to this policy digest.

| Code | Meaning |
| --- | --- |
| `ERR_REGISTRY_ROTATION_MALFORMED` | structure, instants, field format |
| `..._UNSIGNED` / `..._BAD_SIGNATURE` / `..._KEY_MISMATCH` | missing envelope; signature fails; signer or bytes not the pinned ones |
| `..._NOT_ACTIVE` / `..._POLICY_WINDOW` | not in force at the instant; delegation outside the policy window |
| `..._REVOKED` | revoked, or revocation unknowable |
| `..._ROLE` / `..._LIFETIME` / `..._ALGORITHM` / `..._KEY_NOT_ALLOWED` | outside the policy bounds |
| `..._SERIAL` / `..._STALE` / `..._POLICY_STALE` | non-monotonic/replay; below the floor |
| `..._GAP` / `..._OVERLAP` / `..._ORDER` | coverage hole; overlap too short; windows out of order |
| `..._ANCHOR` / `..._CHAIN` / `..._BACKDATED` | anchor mismatch; chain membership/length; `issuedAt` after `notBefore` |

## 5. Tooling

`node scripts/registry-rotation-cli.mjs <command>` (usage with no arguments):
`keygen`, `export-public`, `fingerprint`, `draft-policy`, `sign-policy` (root ceremony),
`verify-policy`, `issue`, `status`, `verify-chain`, `--self-test`.

- `keygen` writes the private env (same format as `registry-authority-cli.mjs`) and the public
  bundle into a directory **outside the repo**; it refuses repo paths and never overwrites.
- `issue` plans the next window with the overlap, issues and signs, then verifies the **whole
  chain** before writing `registry-issued-delegation-<keyId>-s<serial>.json`. It generates a
  fresh operational key (outside the repo) or delegates a pinned/known one by public bundle.
- `status` prints coverage, the `nextIssueBy` date and (with `--print-task`) a scheduler line it
  does **not** install; exit code 2 = not covered, 3 = issue soon. Nothing runs in the background.
- Private values are only read by `sign-policy` (root), `issue` (issuer) and `export-public`, and are never printed.

Typical cadence with the default bounds (30-day delegations, 7-day minimum overlap): one issuance
about every 3 weeks, fully automatable by whoever holds the issuer key; the root signs a policy
about every 2 years.

## 6. The migration off SLIDE is the first rotation

The policy's `anchor` is serial 2 of `f3172a48372bfb23` (SLIDE, active to `2027-01-25T15:45:00.000Z`).
`firstRotation` is `f3172a48372bfb23 -> 0da09262513e2a8d` with `0da09262513e2a8d` byte-pinned and
`f3172a48372bfb23` in `deniedOperationalKeyIds`. So the first issued delegation (serial 3) delegates the
Galerina key, overlapping serial 2 by the policy overlap, and SLIDE is never delegated again.
Re-signing the auth manifest and index under `0da09262513e2a8d` remains the separate publication step.

## 7. Placement: `.fungi` vs TypeScript

Per "TS is frozen reference; new work goes in .fungi where the codebase supports it":
- `src/self-hosted/registry-rotation-policy.fungi` holds the pure decisions (lifetime, overlap/gap,
  serial, role, algorithm, key, window) as flows over host-supplied evidence. It is checker-verified
  (`scripts/audit-kernel-fungi-twins.mjs`), non-authorizing and **not build-wired** (execution
  switch #143). `tests/rd0361-registry-rotation-policy-execution.test.mjs` runs it through the compiler
  dist and compares 148 cases to the TypeScript verdicts.
- Millisecond quantities exceed 2^31, and `.fungi` `Int` is 32-bit, so those parameters are `Float`.
- The executing verifier stays in the TS runtime path because canonical bytes, signature
  verification and revocation lookups are host effects. The TS change is minimal: one new seam file
  (`registry-rotation-policy.ts`), its export in the kernel index, and two roles/contexts
  (`rotationPolicy`, `rotationIssuer`) in `galerina-tower-citizen/src/registry-public-verifier.ts`.

## 8. Ceremony

The single owner act is described in the paste-ready prompt delivered with this change
(`rotation-policy-ceremony-prompt-20261027.md`): generate/locate the issuer key, publish public
bundles, draft the policy, review the digest, sign once offline, verify, publish.
The existing cold-root rules in `OFFLINE-KEY-SIGNING-CEREMONY-REFERENCE.md` apply unchanged.

## 9. Known limits and open items

- **Policy supersession.** A new policy needs a fresh root-signed anchor (policy N+1 starts from the
  anchor chain it extends). Renewing before the policy ends therefore costs one root v1 delegation too.
- **Issuer key custody.** The issuer key is online-capable by design. Compromise is bounded (section 2) but
  it can delegate any allowed/generated key inside the window until the root revokes it; keep it on a
  dedicated machine, revoke through `governance/revocation-registry.mjs`.
- **Runtime consumption.** `registry-runtime.ts` still loads only v1 delegations. Wiring v2 behind an opt-in
  switch and raising the min-serial floors are separate owner-gated steps; the min-serial floors are not raised.
- **Generated files.** New tracked files change `governance/flat-package-root-lock.json`
  (`gen-package-standard-manifests.mjs --write` needs `--accept-lock-drift`); that is an owner decision and
  was not taken here.
- **The 0da public bundle** is not in `governance/`; `export-public` derives it from the private env the owner holds.