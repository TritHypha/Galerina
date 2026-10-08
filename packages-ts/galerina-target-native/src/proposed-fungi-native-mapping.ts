// PROPOSED FUNGI-NATIVE-001..021 mapping of the live Galerina_NATIVE_* set.
// Not owner-approved FUNGI-CATEGORY-NNN registry ownership. Source still emits
// the legacy names. isNativeDiagnosticCode("FUNGI-NATIVE-001") stays false.

export const PROPOSED_FUNGI_NATIVE_MAPPING_SCHEMA =
  "galerina.target-native.proposed-fungi-native-mapping.v1" as const;

export const PROPOSED_FUNGI_NATIVE_STATUS = "PROPOSED_NOT_ADMITTED" as const;

export interface ProposedFungiNativeRow {
  readonly fungi: string;
  readonly legacy: string;
}

export const PROPOSED_FUNGI_NATIVE_MAPPING: readonly ProposedFungiNativeRow[] = Object.freeze([
  Object.freeze({ fungi: "FUNGI-NATIVE-001", legacy: "Galerina_NATIVE_INPUT_INVALID" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-002", legacy: "Galerina_NATIVE_TARGET_FIELD_REQUIRED" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-003", legacy: "Galerina_NATIVE_TARGET_TRIPLE_INVALID" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-004", legacy: "Galerina_NATIVE_TARGET_TRIPLE_ARCHITECTURE_MISMATCH" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-005", legacy: "Galerina_NATIVE_TARGET_TRIPLE_OS_MISMATCH" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-006", legacy: "Galerina_NATIVE_TARGET_ABI_INVALID" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-007", legacy: "Galerina_NATIVE_TARGET_EXECUTION_MODE_INVALID" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-008", legacy: "Galerina_NATIVE_SCHEMA_INVALID" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-009", legacy: "Galerina_NATIVE_ARTIFACT_PATH_REQUIRED" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-010", legacy: "Galerina_NATIVE_ARTIFACT_PATH_ESCAPES" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-011", legacy: "Galerina_NATIVE_ARTIFACT_FORMAT_INVALID" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-012", legacy: "Galerina_NATIVE_DIGEST_INVALID" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-013", legacy: "Galerina_NATIVE_BYTES_REQUIRED" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-014", legacy: "Galerina_NATIVE_DIGEST_MISMATCH" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-015", legacy: "Galerina_NATIVE_VOK_RECEIPT_REQUIRED" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-016", legacy: "Galerina_NATIVE_VOK_SUBJECT_MISMATCH" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-017", legacy: "Galerina_NATIVE_ABI_MISMATCH" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-018", legacy: "Galerina_NATIVE_PROFILE_PATH_COLLIDES" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-019", legacy: "Galerina_NATIVE_DIGEST_DUPLICATE" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-020", legacy: "Galerina_NATIVE_PROFILE_PATH_REQUIRED" }),
  Object.freeze({ fungi: "FUNGI-NATIVE-021", legacy: "Galerina_NATIVE_PROFILE_PATH_ESCAPES" }),
]);
