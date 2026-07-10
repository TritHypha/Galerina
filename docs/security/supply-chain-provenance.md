# Supply-chain provenance — signer chain, consumer verification, base-image digest pinning

> Scope: how Galerina's signed artifacts trace back to a key, how a consumer verifies that
> chain end-to-end with in-repo tooling only, and the operational procedure for pinning the
> production container's base image by digest (RD-0310 / RD-0317 / RD-0319 build cluster).
> Everything here is fail-closed: when a verification input is missing or untrusted, the
> answer is deny, not proceed.

## 1. The signer-provenance chain

Every governed artifact admitted at runtime is the end of this chain — each link is a file
in this repository that can be independently checked:

| # | Link | Artifact | Verified by |
|---|------|----------|-------------|
| 1 | Source | `*.fungi` sources + `package.fungi.json` | `sourceHash` recorded in the manifest |
| 2 | Build output | `<name>.wasm` | `wasmSha256` pin inside the signed manifest |
| 3 | Manifest signature | `<name>.lmanifest.json` (`governanceSignature`: JCS canon, Ed25519, `keyId`) | committed public key `governance/signing-key-<keyId>.pub.pem` |
| 4 | Key legitimacy | the signing key itself | `governance/revocations.json` — a revoked `keyId` is refused at admission |
| 5 | Registry legitimacy | `governance/revocations.json` (append-only, signed) | `assertRegistryTrustworthy()` in `governance/revocation-registry.mjs`, checked against the pin in `governance/trust-anchor.json` |
| 6 | Root of trust | `governance/trust-anchor.json` | committed, reviewed in-diff; changing it is a deliberate, visible act |

Admission (`fusePackage`, used by the App Kernel and by the production `Dockerfile` build
gate) walks links 2→5 in order and throws on the first failure: hash mismatch, bad or
missing signature, unknown capability, revoked signer, or an untrustworthy registry. There
is no warn-and-continue path outside an explicit, logged development override.

## 2. Where signing keys come from

- **Ceremony (anchor) keys** are minted offline per the
  [offline key ceremony runbook](./galerina-34-offline-key-ceremony-runbook.md): hybrid
  Ed25519 + ML-DSA-65 pairs. Only the **public** halves are committed, always as a pair —
  `governance/signing-key-<id>.pub.pem` **plus** `governance/signing-key-<id>.mldsa.pub.b64`.
  Private halves never enter the repository: the `.gitignore` secret rules block the file
  shapes, and CI runs a full-history secret scan every week.
- **Development keys** are auto-minted per machine by `governance/key-lifecycle.mjs`
  (Ed25519 only). Their public halves are deliberately gitignored so a per-machine dev key
  is never published. Distinguishing rule: a ceremony anchor always has a `.mldsa.pub.b64`
  sibling; a dev key never does.
- **Which key is authoritative is not stated in prose.** The single source of truth is the
  pin in `governance/trust-anchor.json`; verify against the file, not against
  documentation (including this one).
- **Compromise lifecycle**: a compromised key is revoked by appending to
  `governance/revocations.json` (append-only — entries are never removed) and re-signing
  the registry via `governance/sign-revocations.mjs`, which itself refuses to sign with a
  revoked key. From that point every admission path evaluates the key as Deny. The 2026-06
  incident documented in `SECURITY.md` and `security/revocations/REV-2026-06.md` is the worked,
  public example of this machinery being exercised end-to-end. Revocation is a forward
  policy guarantee: it stops the key producing anything Galerina will accept going
  forward — which is why verifiers must consult the **current** registry (link 5), and why
  "registry unknown/unreachable" resolves to deny.

## 3. How a consumer verifies provenance

All commands run from the repository root, offline, with no dependencies beyond Node.

**a. Verify the revocation registry against the pinned trust anchor (links 5–6):**

```sh
node --input-type=module -e "const m = await import('./governance/revocation-registry.mjs'); m.assertRegistryTrustworthy(process.cwd()); console.log('registry: TRUSTWORTHY under pinned anchor');"
```

A tampered registry, a signature by an unpinned or revoked signer, or an unsigned registry
under an active pin all throw.

**b. Verify a signed application artifact through the full admission gate (links 2–5):**

```sh
node --input-type=module -e "const m = await import('./packages-galerina/galerina-framework-example-app/dist/server.js'); await m.fuseGreeting(); console.log('fuse gate: ACCEPT');"
```

This is byte-for-byte the same gate the production image build runs (`Dockerfile`, builder
stage) and the same gate the server re-runs on every boot: sha256 pin → Ed25519 signature
against the committed public key → revocation registry under the pinned anchor. Requires
the package to be built (`npm ci && npm run build` in the app's closure) — see the
`Dockerfile` for the exact topological order.

**c. Verify third-party dependencies (the npm graph):**

- `npm ci` (never `npm install`) in any package directory: npm enforces the lockfile's SRI
  integrity hashes — a substituted registry artifact fails the install.
- Cross-check against the SBOM: `node scripts/generate-sbom.mjs` regenerates
  `build/sbom/sbom.json` deterministically from the tree. Two SBOMs over the same source
  are byte-identical except the single marked `metadata.timestamp` field, and carry the
  same `galerina:sbom:content-digest`, so drift is a one-line diff. A component the
  lockfiles cannot vouch for is marked `UNVERIFIED` (`FUNGI-SBOM-001`) and flips
  `galerina:sbom:complete` to `false` — missing evidence is visible, never dropped.
  Ambiguous evidence (duplicated lockfile records, conflicting integrity for the same
  locked version) refuses to produce an SBOM at all.

**d. Verify the container image:**

The production `Dockerfile` refuses to build if secret-shaped files enter the context, if
the SBOM cannot be generated fail-closed, or if the fuse gate (b) rejects the signed
artifact. The shipped image carries its build-time SBOM at `/app/build/sbom/sbom.json`
(root-owned, read-only to the runtime user) and contains verify-side governance material
only — the image can check signatures but holds nothing that can produce one.

## 4. Base-image digest pinning (deploy-time procedure)

**Why:** an image *tag* (`node:24-alpine`) is mutable — the registry can re-point it at new
bytes at any time. A *digest* (`node:24-alpine@sha256:…`) is a content address: the runtime
refuses anything but those exact bytes. The digest, not the tag, is the control.

**Why the digest is not hardcoded in this repository today:** a digest can only be obtained
from a registry, and this procedure is written to be executable from an offline tree. A
digest that is copy-pasted into the Dockerfile without independent verification would add
the *appearance* of pinning without the control. So the `Dockerfile` pins the exact
major-LTS variant tag and this procedure applies the digest at deploy time — treat the
digest-pin step as **mandatory before any production push**.

**Procedure (run on the deploy/release host):**

1. Resolve the current digest for the tag, for the platforms you deploy:

   ```sh
   docker buildx imagetools inspect node:24-alpine
   ```

   Record the top-level (manifest-list) `Digest:` — that is the value to pin. As a
   fallback, `docker pull node:24-alpine && docker inspect --format '{{index .RepoDigests 0}}' node:24-alpine`
   yields the same manifest-list digest.
2. **Cross-check over a second, independent channel** before trusting it — e.g. the Docker
   Hub tag page for the official `node` image from a different machine/network, or a
   second registry mirror you already trust. Both channels must agree byte-for-byte. One
   channel is a request; two independent channels are verification.
3. Rewrite **both** `FROM` lines in the root `Dockerfile` to
   `node:24-alpine@sha256:<verified-digest>` (builder and runtime stages must pin the same
   digest).
4. Record the pin in the ledger below (date, tag, digest, both verification channels,
   operator), rebuild, and confirm the build's fuse gate still reports `ACCEPT`.
5. **Refresh policy:** re-run this procedure on every deliberate base refresh (security
   patch cadence for the base OS/Node). If the digest for a tag changes when upstream has
   announced no release, stop and investigate before rebuilding.

Enforcement: a conformance check that fails CI when a production `FROM` lacks a digest is
the designated twin of the existing `checkActionsPinned` CI-action pin check.

**Digest ledger** (append one row per verified pin; never edit prior rows):

| Date (UTC) | Tag | Manifest-list digest | Verified via (2 channels) | Operator |
|---|---|---|---|---|
| — | — | — | — | — |

## 5. Policy for any fetched binary

The production server image fetches **no** binaries — the entire download-and-trust class
is absent from that path by construction. If any image or script ever needs a fetched
binary (the wasmtime class), the mandatory shape is:

1. download to a file (no pipe-to-extractor),
2. verify a checksum/signature that is pinned **in the repository** against the downloaded
   file (`sha256sum -c` or equivalent),
3. extract only after verification succeeds,
4. no fallback that swallows a failure — a failed verification fails the build.

## 6. Reporting

Supply-chain concerns (suspected tamper, a digest mismatch under this procedure, a
signature that verifies when it should not): see `SECURITY.md` for the disclosure process
and contact.
