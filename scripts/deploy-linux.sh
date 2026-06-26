#!/usr/bin/env bash
# Galerina Linux Deployment Script
# Usage: ./scripts/deploy-linux.sh <app.spore> [--port <N>]
#
# Builds .spore -> .wasm, verifies governance manifest, runs a
# health-check probe, then prints the commands needed to start
# the governed runtime under Wasmtime (available in Phase 9+).
#
# Requires:
#   - Node.js >= 18  (galerina CLI runs on the Stage A interpreter today)
#   - wasmtime       (optional — used at runtime when DRCM Phase 9 lands)
#
# Examples:
#   ./scripts/deploy-linux.sh examples/auth-service/createSession.spore
#   ./scripts/deploy-linux.sh examples/auth-service/createSession.spore --port 9000

set -euo pipefail

# ── args ──────────────────────────────────────────────────────────────────────
SPORE_FILE="${1:-examples/auth-service/createSession.spore}"
PORT="8080"
if [[ "${2:-}" == "--port" && -n "${3:-}" ]]; then
  PORT="$3"
fi

BUILD_DIR="build"
BASE_NAME="$(basename "${SPORE_FILE%.spore}")"
WASM_FILE="${BUILD_DIR}/${BASE_NAME}.wasm"
MANIFEST_FILE="${BUILD_DIR}/${BASE_NAME}.lmanifest"
MANIFEST_JSON="${BUILD_DIR}/${BASE_NAME}.lmanifest.json"
HEALTH_LLN="examples/deployment/health-check.spore"

echo "Galerina Governed Runtime -- Deployment"
echo "   File:    ${SPORE_FILE}"
echo "   Port:    ${PORT}"
echo ""

# ── step 1: governance check ─────────────────────────────────────────────────
echo "Checking governance..."
if ! node galerina.mjs check "${SPORE_FILE}" 2>&1; then
  echo "Governance check failed: ${SPORE_FILE}"
  exit 1
fi
echo ""

# ── step 2: build WASM ───────────────────────────────────────────────────────
echo "Building .wasm..."
node galerina.mjs build "${SPORE_FILE}"
echo ""

if [ ! -f "${WASM_FILE}" ]; then
  echo "Build failed: ${WASM_FILE} not found"
  exit 1
fi
echo "Built: ${WASM_FILE}"

# ── step 3: verify manifest ───────────────────────────────────────────────────
echo "Verifying governance manifest..."
if node galerina.mjs verify "${SPORE_FILE}" 2>&1; then
  echo "Manifest verified"
else
  echo "Manifest verification returned non-zero -- review ${MANIFEST_JSON}"
  # Non-fatal in Stage A (placeholder signing); will be fatal in Phase 9+
fi
echo ""

# ── step 4: verify sourceHash present ────────────────────────────────────────
if [ -f "${MANIFEST_JSON}" ]; then
  SOURCE_HASH="$(node -e "const m=JSON.parse(require('fs').readFileSync('${MANIFEST_JSON}','utf8')); process.stdout.write(m.sourceHash||'')")"
  if [ -n "${SOURCE_HASH}" ]; then
    echo "Manifest sourceHash: ${SOURCE_HASH}"
  else
    echo "Warning: manifest has no sourceHash -- rebuild may be needed"
  fi
fi

# ── step 5: health check probe ───────────────────────────────────────────────
echo ""
echo "Running health check flow..."
if [ -f "${HEALTH_LLN}" ]; then
  if node galerina.mjs check "${HEALTH_LLN}" 2>&1 | grep -q "0 errors"; then
    echo "Health check flow: ACCEPT (0 errors)"
  else
    echo "Health check flow: governance warning -- review ${HEALTH_LLN}"
  fi
else
  echo "Health check flow not found at ${HEALTH_LLN} -- skipping"
fi
echo ""

# ── step 6: deployment summary ───────────────────────────────────────────────
echo "Deployment complete"
echo ""
echo "Artefacts:"
echo "   WASM:            ${WASM_FILE}"
echo "   Manifest (CBOR): ${MANIFEST_FILE}"
echo "   Manifest (JSON): ${MANIFEST_JSON}"
echo "   Audit log:       ${BUILD_DIR}/audit-log/audit-log.jsonl"
echo ""
echo "To run with Wasmtime (available from Phase 9 / DRCM DSS.wasm):"
echo "   wasmtime --invoke main ${WASM_FILE}"
echo ""
echo "To check Tower logs:"
echo "   node galerina.mjs tower-log list"
echo "   node galerina.mjs tower-log audit-log"
echo ""
echo "Stage note: Stage A (Phase 5-7 DRCM) -- Stage B + DSS.wasm supervision in Phase 9"
