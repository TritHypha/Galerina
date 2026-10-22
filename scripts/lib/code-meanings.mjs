// Meanings read from source comments/emission sites. Never invented.
// MB literals stay in ACK'd units; canonical form is FUNGI-MB-NN.
export const MB_MEANINGS = Object.freeze({
  "FUNGI-MB-06": Object.freeze({
    kind: "alias-of-MB-06",
    meaning: "listed cleanup after admit-to-handoff; post never packed 100",
    source: "packages/fungi/memory/evidence/34-secret-gate/parity.md:36",
  }),
  "FUNGI-MB-07": Object.freeze({
    kind: "alias-of-MB-07",
    meaning: "real adapter rows; pre-begin output paths",
    source: "packages/fungi/memory/src/adapter-profile.fungi:3",
  }),
  "FUNGI-MB-11": Object.freeze({
    kind: "alias-of-MB-11",
    meaning: "LINEAR_SECRET; WebAssembly zeroing is best effort; no erase claim",
    source: "packages/fungi/memory/evidence/34-secret-gate/parity.md:69",
  }),
  "FUNGI-MB-12": Object.freeze({
    kind: "alias-of-MB-12",
    meaning: "OUT_OF_PROCESS_UNBOUND; passed or inherited descriptors cannot be revoked",
    source: "packages/fungi/memory/evidence/44-adapter-profile/parity.md:73",
  }),
  "FUNGI-MB-13": Object.freeze({
    kind: "alias-of-MB-13",
    meaning: "invoke ToInt32 wrap; captured JS intrinsics",
    source: "packages/fungi/memory/evidence/45-host-adapter-audit/audit.md:24",
  }),
  "FUNGI-MB-14": Object.freeze({
    kind: "alias-of-MB-14",
    meaning: "WebAssembly zeroing is best effort; no erase claim",
    source: "packages/fungi/memory/evidence/43-cleanup-evidence/parity.md:51",
  }),
  "FUNGI-MB-15": Object.freeze({
    kind: "alias-of-MB-15",
    meaning: "compare compiled to WebAssembly is CT UNKNOWN",
    source: "packages/fungi/memory/evidence/33-u2-serve-gate/parity.md:36",
  }),
  "FUNGI-MB-16": Object.freeze({
    kind: "alias-of-MB-16",
    meaning: ".fungi reads no clock; caller supplies typed reading",
    source: "packages/fungi/memory/src/monotonic-time.fungi:3",
  }),
  "FUNGI-MB-17": Object.freeze({
    kind: "alias-of-MB-17",
    meaning: "live versus captured JS intrinsics",
    source: "packages/fungi/memory/evidence/45-host-adapter-audit/audit.md:56",
  }),
  "FUNGI-MB-19": Object.freeze({
    kind: "alias-of-MB-19",
    meaning: "reserve then commit or cancel; no retry after dispatch",
    source: "packages/fungi/memory/src/kernel-ports.fungi:6",
  }),
});

export const NATIVE_MEANINGS = Object.freeze({
  "FUNGI-NATIVE-001": "proposed mapping of Galerina_NATIVE_INPUT_INVALID; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-002": "proposed mapping of Galerina_NATIVE_TARGET_FIELD_REQUIRED; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-003": "proposed mapping of Galerina_NATIVE_TARGET_TRIPLE_INVALID; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-004": "proposed mapping of Galerina_NATIVE_TARGET_TRIPLE_ARCHITECTURE_MISMATCH; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-005": "proposed mapping of Galerina_NATIVE_TARGET_TRIPLE_OS_MISMATCH; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-006": "proposed mapping of Galerina_NATIVE_TARGET_ABI_INVALID; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-007": "proposed mapping of Galerina_NATIVE_TARGET_EXECUTION_MODE_INVALID; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-008": "proposed mapping of Galerina_NATIVE_SCHEMA_INVALID; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-009": "proposed mapping of Galerina_NATIVE_ARTIFACT_PATH_REQUIRED; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-010": "proposed mapping of Galerina_NATIVE_ARTIFACT_PATH_ESCAPES; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-011": "proposed mapping of Galerina_NATIVE_ARTIFACT_FORMAT_INVALID; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-012": "proposed mapping of Galerina_NATIVE_DIGEST_INVALID; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-013": "proposed mapping of Galerina_NATIVE_BYTES_REQUIRED; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-014": "proposed mapping of Galerina_NATIVE_DIGEST_MISMATCH; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-015": "proposed mapping of Galerina_NATIVE_VOK_RECEIPT_REQUIRED; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-016": "proposed mapping of Galerina_NATIVE_VOK_SUBJECT_MISMATCH; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-017": "proposed mapping of Galerina_NATIVE_ABI_MISMATCH; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-018": "proposed mapping of Galerina_NATIVE_PROFILE_PATH_COLLIDES; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-019": "proposed mapping of Galerina_NATIVE_DIGEST_DUPLICATE; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-020": "proposed mapping of Galerina_NATIVE_PROFILE_PATH_REQUIRED; source status PROPOSED_NOT_ADMITTED",
  "FUNGI-NATIVE-021": "proposed mapping of Galerina_NATIVE_PROFILE_PATH_ESCAPES; source status PROPOSED_NOT_ADMITTED",
});

export function meaningOf(code) {
  if (MB_MEANINGS[code]) return MB_MEANINGS[code].meaning;
  if (NATIVE_MEANINGS[code]) return NATIVE_MEANINGS[code];
  return "UNKNOWN";
}
