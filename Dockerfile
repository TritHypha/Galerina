# syntax=docker/dockerfile:1
# Dockerfile — hardened production image for the governed Galerina HTTP app (RD-0310 / RD-0317).
#
# WHAT THIS BUILDS: the canonical governed server (galerina-framework-example-app): the
# committed, SIGNED greeting.wasm fused FAIL-CLOSED into the App Kernel and served over
# node:http on port 8787. This is the production server path the repo previously lacked —
# scripts/Dockerfile.galerina remains the CLI *tooling* image and is superseded by this file
# for anything network-exposed. Wasmtime is deliberately ABSENT: the server closure does not
# use it, so the entire unpinned-download class is removed from the production path (any
# future binary fetch must be checksum-pinned and fail-closed — see
# docs/security/supply-chain-provenance.md).
#
# BUILD (BuildKit required — Docker >= 23, or DOCKER_BUILDKIT=1 — for the sidecar
# Dockerfile.dockerignore allowlist and the COPY heredoc below):
#   docker build -t galerina-app .
# RUN:
#   docker run --rm -p 8787:8787 galerina-app
#
# THE INVARIANTS (each enforced below with a why-comment at its enforcement point):
#   (1) FAIL-CLOSED ADMISSION AT BUILD TIME — the image build runs the same fuse gate the
#       server runs at boot (sha256 pin -> Ed25519 signature -> revocation registry verified
#       against the pinned trust anchor). Tampered/unsigned/revoked artifacts fail the BUILD.
#   (2) NO SECRET EVER ENTERS A LAYER — default-deny build context (Dockerfile.dockerignore)
#       plus an in-build secret-shape gate that refuses the build if anything slips through
#       (e.g. a legacy builder that ignores the sidecar ignore file). There are ZERO ARGs, so
#       no --build-arg can ever be baked into layer history, and no ENV carries a credential.
#   (3) NON-ROOT, TAMPER-RESISTANT RUNTIME — the process runs as the unprivileged `node`
#       user while /app stays root-owned: the app cannot rewrite its own code, wasm, public
#       keys, or revocation registry. The only writable path is /app/build (runtime ledgers).
#   (4) PINNED SUPPLY CHAIN — npm ci only (the lockfiles' SRI integrity hashes are the
#       third-party control), --ignore-scripts everywhere (zero install-script execution),
#       and the final stage runs no package manager at all.
#
# BASE-IMAGE PIN — read before changing FROM:
#   node:24-alpine = the current LTS major on the minimal official variant. A sha256 digest
#   cannot be verified from an offline working tree, and a fabricated digest would be worse
#   than a tag, so the tag is pinned here and the DIGEST is applied as a deploy-time step:
#   follow docs/security/supply-chain-provenance.md § "Base-image digest pinning" to resolve
#   the digest over two independent channels, then rewrite BOTH FROM lines to
#   `node:24-alpine@sha256:<verified-digest>` before any production push. The tag is not the
#   control; the digest is. (CI enforcement of "FROM must carry a digest" is the designated
#   twin of the existing checkActionsPinned conformance check.)

# ─────────────────────────────────────────────────────────────────────────────────────────
# Stage 1: builder — throwaway root stage; nothing ships from here except the explicitly
# enumerated runtime set copied by Stage 2.
# ─────────────────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

# COPY only what is needed: package sources, ops scripts (SBOM generation), the governance
# trust material (public keys + signed revocation registry — the fuse gate refuses to admit
# the app without it), and the build-identity/licence files. The context is already
# default-deny (Dockerfile.dockerignore), so nothing outside this set even reaches the daemon.
COPY package.json package-lock.json version.json LICENSE THIRD-PARTY-NOTICES.md ./
COPY governance/ governance/
COPY scripts/ scripts/
COPY packages-galerina/ packages-galerina/

# GATE — refuse the build if any secret-shaped file entered the context. Belt for the
# ignore-file braces: a pre-BuildKit builder silently skips Dockerfile.dockerignore, and a
# live .env.galerina-signing HAS been observed inside packages-galerina on dev machines.
# A production layer must never contain key material; on detection the build fails closed.
RUN if find . -type f \( -name ".env*" -o -name "*.signing" -o -name "*.key" -o -name "*private*.pem" \) | grep -q .; then \
      echo "FATAL: secret-shaped file(s) in build context — refusing to bake a layer:" >&2; \
      find . -type f \( -name ".env*" -o -name "*.signing" -o -name "*.key" -o -name "*private*.pem" \) >&2; \
      exit 1; \
    fi

# Install + compile the server closure in dependency (topological) order: `file:` deps are
# npm symlinks into sibling packages, so a dependent's tsc needs its dependency's dist/ (and
# tower-citizen's node_modules/@types, referenced by the app's tsconfig typeRoots) to exist
# first. `npm ci`, never `npm install`: only the lockfile's SRI-hashed, pinned versions can
# be fetched — any registry substitution fails the build. --ignore-scripts: none of these
# deps needs an install script, so none is allowed to run one (fail-closed default).
RUN cd packages-galerina/galerina-substrate-math && npm ci --ignore-scripts --no-audit --no-fund && npm run build
RUN cd packages-galerina/galerina-inference-bridge-contract && npm ci --ignore-scripts --no-audit --no-fund && npm run build
RUN cd packages-galerina/galerina-tower-citizen && npm ci --ignore-scripts --no-audit --no-fund && npm run build
RUN cd packages-galerina/galerina-core-network && npm ci --ignore-scripts --no-audit --no-fund && npm run build
RUN cd packages-galerina/galerina-framework-app-kernel && npm ci --ignore-scripts --no-audit --no-fund && npm run build
RUN cd packages-galerina/galerina-framework-api-server && npm ci --ignore-scripts --no-audit --no-fund && npm run build
RUN cd packages-galerina/galerina-framework-example-app && npm ci --ignore-scripts --no-audit --no-fund && npm run build

# Drop the toolchain (typescript, @types) AFTER all builds — pruned here in the builder so
# the runtime stage ships no compiler and never runs a package manager. Pruning must not
# happen per-package mid-build: the app's tsconfig reads types out of tower-citizen's
# node_modules, so dev deps stay until every dist/ exists.
RUN for p in galerina-substrate-math galerina-inference-bridge-contract galerina-tower-citizen \
             galerina-core-network galerina-framework-app-kernel galerina-framework-api-server \
             galerina-framework-example-app; do \
      (cd "packages-galerina/$p" && npm prune --omit=dev --ignore-scripts --no-audit --no-fund) || exit 1; \
    done

# Emit the source SBOM (deterministic CycloneDX 1.5 — scripts/generate-sbom.mjs) so the
# image carries a machine-readable inventory of the exact declared + locked dependency set
# it was built from. Fail-closed: a malformed manifest or conflicting lockfile integrity
# fails the image build, not just the report.
RUN node scripts/generate-sbom.mjs --out build/sbom/sbom.json

# GATE — admit the signed application artifact NOW, at build time: sha256 pin -> Ed25519
# signature against the committed public key -> revocation registry verified against the
# pinned trust anchor (assertRegistryTrustworthy throws on tamper / rogue or revoked signer
# / unsigned-under-pin). A bad greeting.wasm fails the IMAGE BUILD; the server re-runs this
# same gate on every boot. Verify twice, trust never.
RUN node --input-type=module -e "const m = await import('/app/packages-galerina/galerina-framework-example-app/dist/server.js'); await m.fuseGreeting(); console.log('fuse gate: ACCEPT (sha256 pin -> Ed25519 -> revocation registry)');"

# ─────────────────────────────────────────────────────────────────────────────────────────
# Stage 2: runtime — minimal, non-root, explicitly enumerated. No sources, no tests, no
# compiler, no npm run, no ops scripts, no signing-side governance code.
# ─────────────────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime

# Fail-secure environment identity: both Node and Galerina posture/env resolution must see
# production — nothing in this image may ever resolve a "development" relaxation.
ENV NODE_ENV=production \
    GALERINA_ENV=production

WORKDIR /app

# The runtime file set is ENUMERATED path by path: what ships is exactly what an auditor
# can read below — built dist/, pruned prod node_modules (symlinked @galerina siblings stay
# valid because the tree shape is preserved), the app's signed wasm package, and the
# VERIFY-side governance material. sign-revocations.mjs and key-lifecycle.mjs (signing /
# key-minting machinery) are deliberately NOT shipped: this image can verify signatures but
# can never produce one (least privilege). Everything is root-owned on purpose — see USER.
COPY --from=builder /app/version.json /app/LICENSE /app/THIRD-PARTY-NOTICES.md ./
COPY --from=builder /app/build/sbom/sbom.json build/sbom/sbom.json
COPY --from=builder /app/governance/revocation-registry.mjs governance/revocation-registry.mjs
COPY --from=builder /app/governance/revocations.json governance/revocations.json
COPY --from=builder /app/governance/trust-anchor.json governance/trust-anchor.json
COPY --from=builder /app/governance/signing-key-*.pub.pem governance/
COPY --from=builder /app/governance/signing-key-*.mldsa.pub.b64 governance/

COPY --from=builder /app/packages-galerina/galerina-substrate-math/package.json packages-galerina/galerina-substrate-math/package.json
COPY --from=builder /app/packages-galerina/galerina-substrate-math/dist packages-galerina/galerina-substrate-math/dist
COPY --from=builder /app/packages-galerina/galerina-substrate-math/node_modules packages-galerina/galerina-substrate-math/node_modules
COPY --from=builder /app/packages-galerina/galerina-inference-bridge-contract/package.json packages-galerina/galerina-inference-bridge-contract/package.json
COPY --from=builder /app/packages-galerina/galerina-inference-bridge-contract/dist packages-galerina/galerina-inference-bridge-contract/dist
COPY --from=builder /app/packages-galerina/galerina-inference-bridge-contract/node_modules packages-galerina/galerina-inference-bridge-contract/node_modules
COPY --from=builder /app/packages-galerina/galerina-tower-citizen/package.json packages-galerina/galerina-tower-citizen/package.json
COPY --from=builder /app/packages-galerina/galerina-tower-citizen/dist packages-galerina/galerina-tower-citizen/dist
COPY --from=builder /app/packages-galerina/galerina-tower-citizen/node_modules packages-galerina/galerina-tower-citizen/node_modules
COPY --from=builder /app/packages-galerina/galerina-core-network/package.json packages-galerina/galerina-core-network/package.json
COPY --from=builder /app/packages-galerina/galerina-core-network/dist packages-galerina/galerina-core-network/dist
COPY --from=builder /app/packages-galerina/galerina-core-network/node_modules packages-galerina/galerina-core-network/node_modules
COPY --from=builder /app/packages-galerina/galerina-framework-app-kernel/package.json packages-galerina/galerina-framework-app-kernel/package.json
COPY --from=builder /app/packages-galerina/galerina-framework-app-kernel/dist packages-galerina/galerina-framework-app-kernel/dist
COPY --from=builder /app/packages-galerina/galerina-framework-app-kernel/node_modules packages-galerina/galerina-framework-app-kernel/node_modules
COPY --from=builder /app/packages-galerina/galerina-framework-api-server/package.json packages-galerina/galerina-framework-api-server/package.json
COPY --from=builder /app/packages-galerina/galerina-framework-api-server/dist packages-galerina/galerina-framework-api-server/dist
COPY --from=builder /app/packages-galerina/galerina-framework-api-server/node_modules packages-galerina/galerina-framework-api-server/node_modules
COPY --from=builder /app/packages-galerina/galerina-framework-example-app/package.json packages-galerina/galerina-framework-example-app/package.json
COPY --from=builder /app/packages-galerina/galerina-framework-example-app/App.manifest packages-galerina/galerina-framework-example-app/App.manifest
COPY --from=builder /app/packages-galerina/galerina-framework-example-app/dist packages-galerina/galerina-framework-example-app/dist
COPY --from=builder /app/packages-galerina/galerina-framework-example-app/node_modules packages-galerina/galerina-framework-example-app/node_modules
COPY --from=builder /app/packages-galerina/galerina-framework-example-app/packages/greeting packages-galerina/galerina-framework-example-app/packages/greeting

# Production app config, written HERE and not copied from the repo: the committed file is
# the developer template (env=development, loopback). parseConfig() validates this file
# FAIL-CLOSED at boot — a typo stops the boot; it cannot boot half-configured. http.host is
# 0.0.0.0 *inside the container network namespace*: the container boundary plus the
# operator's published-port mapping / host firewall is the exposure control (today's
# listen() does not consume the host field; this value is correct for the day it does).
COPY <<"EOF" packages-galerina/galerina-framework-example-app/config/app.config.json
{
  "name": "galerina-framework-example-app",
  "env": "production",
  "posture": "auto",
  "http": { "host": "0.0.0.0", "port": 8787 },
  "greeting": { "message": "hello, governed world", "route": "/hello" }
}
EOF

# The ONLY writable path for the runtime user: /app/build (runtime ledgers land under
# build/ by convention). Non-recursive chown on purpose — build/sbom/sbom.json stays
# root-owned evidence. Pair with `docker run --read-only --tmpfs /tmp` so this remains the
# single persistent-write seam.
RUN chown node:node /app/build

# Runtime identity: the unprivileged `node` user (uid/gid 1000) shipped by the official
# image — closes the old tooling image's runs-as-root gap. Declared AFTER every COPY/RUN so
# the filesystem stays root-owned and the process arrives with least privilege.
USER node

# Documents the single listening port (matches the config above); actual exposure remains
# an explicit operator decision (`-p`/`-P` + host firewall).
EXPOSE 8787

# Liveness = the REAL governed pipeline, not a static ping: /hello traverses the App Kernel
# gates and invokes the fused, signature-verified wasm — its i32 result IS the HTTP status.
# Exec form + Node's built-in fetch: no shell, no curl/wget package added to the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/hello').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Boot the governed server; dist/server.js re-runs the fail-closed fuse gate on every
# start. Exec form: node is PID 1 and receives SIGTERM directly (no shell swallowing
# signals). Add `docker run --init` only if the app ever spawns child processes.
CMD ["node", "packages-galerina/galerina-framework-example-app/dist/server.js"]
