// Archive item, manifest, integrity and restore contracts.
//
// Contracts only — no object storage, backup system or retention engine.
// Integrity is the invariant: every content reference names a checksum
// algorithm from a known set with a digest of the right shape, archive paths
// may never traverse outside the archive, and integrity/restore status is
// DERIVED from the counts — a report can never claim "verified" while
// carrying failures.

export type ChecksumAlgorithm = "sha256" | "sha384" | "sha512" | "blake3";

export interface ChecksumRef {
  readonly algorithm: ChecksumAlgorithm;
  readonly digestHex: string;
}

export interface ContentAddressedRef {
  readonly checksum: ChecksumRef;
  readonly sizeBytes: number;
}

export interface ArchiveItem {
  readonly path: string;
  readonly content: ContentAddressedRef;
  readonly mediaType?: string;
}

export type SignatureAlgorithm = "ed25519" | "ecdsa_p256" | "rsa_pss_2048";

export interface SignatureRef {
  readonly algorithm: SignatureAlgorithm;
  readonly keyId: string;
  readonly signatureBase64: string;
}

export interface RetentionPolicyRef {
  readonly name: string;
  readonly minRetainDays: number;
}

export interface ArchiveManifest {
  readonly archive: string;
  readonly createdAt: string;
  readonly items: readonly ArchiveItem[];
  readonly checksum: ChecksumRef;
  readonly signature?: SignatureRef;
  readonly retention?: RetentionPolicyRef;
}

export type ArchiveVerificationStatus = "verified" | "failed" | "not_verified";

export interface ArchiveIntegrityReport {
  readonly archive: string;
  readonly itemCount: number;
  readonly verifiedCount: number;
  readonly failedCount: number;
  readonly status: ArchiveVerificationStatus;
  readonly diagnostics: readonly ArchiveDiagnostic[];
  readonly warnings: readonly string[];
}

export interface ArchiveRestoreReport {
  readonly archive: string;
  readonly requestedCount: number;
  readonly restoredCount: number;
  readonly failedCount: number;
  readonly verifiedCount: number;
  readonly verification: ArchiveVerificationStatus;
  readonly diagnostics: readonly ArchiveDiagnostic[];
  readonly warnings: readonly string[];
}

export type ArchiveDiagnosticSeverity = "warning" | "error";

export interface ArchiveDiagnostic {
  readonly code: string;
  readonly severity: ArchiveDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

// Only collision-resistant algorithms with a fixed digest size are accepted.
// md5/sha1 are deliberately absent: an integrity check built on a broken hash
// is not an integrity check.
const DIGEST_HEX_LENGTH: Readonly<Record<ChecksumAlgorithm, number>> = {
  sha256: 64,
  sha384: 96,
  sha512: 128,
  blake3: 64,
};

const KNOWN_SIGNATURE_ALGORITHMS: ReadonlySet<string> = new Set([
  "ed25519",
  "ecdsa_p256",
  "rsa_pss_2048",
]);

const HEX_PATTERN = /^[0-9a-f]+$/;

function archiveDiagnostic(
  code: string,
  severity: ArchiveDiagnosticSeverity,
  message: string,
  path?: string,
): ArchiveDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateChecksumRef(
  checksum: ChecksumRef,
  path = "checksum",
): readonly ArchiveDiagnostic[] {
  const diagnostics: ArchiveDiagnostic[] = [];

  const expectedLength = (DIGEST_HEX_LENGTH as Record<string, number | undefined>)[
    checksum.algorithm
  ];
  if (expectedLength === undefined) {
    diagnostics.push(archiveDiagnostic(
      "Galerina_DATA_ARCHIVE_CHECKSUM_ALGORITHM_UNKNOWN",
      "error",
      `Checksum algorithm "${String(checksum.algorithm)}" is not in the known set.`,
      `${path}.algorithm`,
    ));
    return diagnostics;
  }

  const digest = checksum.digestHex.toLowerCase();
  if (digest.length !== expectedLength || !HEX_PATTERN.test(digest)) {
    diagnostics.push(archiveDiagnostic(
      "Galerina_DATA_ARCHIVE_DIGEST_INVALID",
      "error",
      `Checksum digest must be ${expectedLength} lowercase hex characters for ${checksum.algorithm}.`,
      `${path}.digestHex`,
    ));
  }

  return diagnostics;
}

// Archive paths are logical, relative paths inside the archive. Absolute
// paths, drive-letter paths and ".." segments are rejected: a manifest must
// never be able to direct a restore outside its own root.
export function validateArchiveItem(
  item: ArchiveItem,
  path = "item",
): readonly ArchiveDiagnostic[] {
  const diagnostics: ArchiveDiagnostic[] = [];

  if (item.path.trim().length === 0) {
    diagnostics.push(archiveDiagnostic(
      "Galerina_DATA_ARCHIVE_ITEM_PATH_REQUIRED",
      "error",
      "Archive item requires a path.",
      `${path}.path`,
    ));
  } else {
    const itemPath = item.path;
    const traversal = itemPath
      .split(/[\\/]/)
      .some((segment) => segment === "..");
    if (
      itemPath.startsWith("/") ||
      itemPath.startsWith("\\") ||
      /^[A-Za-z]:/.test(itemPath) ||
      traversal
    ) {
      diagnostics.push(archiveDiagnostic(
        "Galerina_DATA_ARCHIVE_ITEM_PATH_UNSAFE",
        "error",
        `Archive item path "${itemPath}" must be relative and must not traverse upward.`,
        `${path}.path`,
      ));
    }
  }

  if (!isNonNegativeSafeInteger(item.content.sizeBytes)) {
    diagnostics.push(archiveDiagnostic(
      "Galerina_DATA_ARCHIVE_SIZE_INVALID",
      "error",
      "Archive item sizeBytes must be a non-negative integer.",
      `${path}.content.sizeBytes`,
    ));
  }

  diagnostics.push(...validateChecksumRef(item.content.checksum, `${path}.content.checksum`));

  return diagnostics;
}

export function validateArchiveManifest(
  manifest: ArchiveManifest,
): readonly ArchiveDiagnostic[] {
  const diagnostics: ArchiveDiagnostic[] = [];

  if (manifest.archive.trim().length === 0) {
    diagnostics.push(archiveDiagnostic(
      "Galerina_DATA_ARCHIVE_NAME_REQUIRED",
      "error",
      "Archive manifest requires an archive name.",
      "archive",
    ));
  }

  if (Number.isNaN(Date.parse(manifest.createdAt))) {
    diagnostics.push(archiveDiagnostic(
      "Galerina_DATA_ARCHIVE_TIMESTAMP_INVALID",
      "error",
      "Archive manifest createdAt must be a parseable timestamp.",
      "createdAt",
    ));
  }

  if (manifest.items.length === 0) {
    // Valid but almost never intended: an empty manifest archives nothing.
    diagnostics.push(archiveDiagnostic(
      "Galerina_DATA_ARCHIVE_EMPTY",
      "warning",
      "Archive manifest contains no items; the archive is valid but empty.",
      "items",
    ));
  }

  const seenPaths = new Set<string>();
  manifest.items.forEach((item, index) => {
    diagnostics.push(...validateArchiveItem(item, `items.${index}`));
    if (seenPaths.has(item.path)) {
      diagnostics.push(archiveDiagnostic(
        "Galerina_DATA_ARCHIVE_ITEM_DUPLICATE",
        "error",
        `Archive item path "${item.path}" appears more than once; restore order would be ambiguous.`,
        `items.${index}.path`,
      ));
    }
    seenPaths.add(item.path);
  });

  diagnostics.push(...validateChecksumRef(manifest.checksum, "checksum"));

  if (manifest.signature !== undefined) {
    if (!KNOWN_SIGNATURE_ALGORITHMS.has(manifest.signature.algorithm)) {
      diagnostics.push(archiveDiagnostic(
        "Galerina_DATA_ARCHIVE_SIGNATURE_ALGORITHM_UNKNOWN",
        "error",
        `Signature algorithm "${String(manifest.signature.algorithm)}" is not in the known set.`,
        "signature.algorithm",
      ));
    }
    if (
      manifest.signature.keyId.trim().length === 0 ||
      manifest.signature.signatureBase64.trim().length === 0
    ) {
      diagnostics.push(archiveDiagnostic(
        "Galerina_DATA_ARCHIVE_SIGNATURE_INVALID",
        "error",
        "Signature metadata requires a key id and a signature value.",
        "signature",
      ));
    }
  }

  if (manifest.retention !== undefined) {
    if (
      manifest.retention.name.trim().length === 0 ||
      !Number.isSafeInteger(manifest.retention.minRetainDays) ||
      manifest.retention.minRetainDays <= 0
    ) {
      diagnostics.push(archiveDiagnostic(
        "Galerina_DATA_ARCHIVE_RETENTION_INVALID",
        "error",
        "Retention policy reference requires a name and a positive minRetainDays.",
        "retention",
      ));
    }
  }

  return diagnostics;
}

function validateCount(
  value: number,
  path: string,
  diagnostics: ArchiveDiagnostic[],
): boolean {
  if (!isNonNegativeSafeInteger(value)) {
    diagnostics.push(archiveDiagnostic(
      "Galerina_DATA_ARCHIVE_COUNT_INVALID",
      "error",
      `Archive report ${path} must be a non-negative integer.`,
      path,
    ));
    return false;
  }
  return true;
}

// Integrity report builder. Status is derived, never caller-asserted:
// any failure means "failed"; everything verified means "verified"; anything
// left unchecked means "not_verified" plus a warning. This is what makes a
// dishonest report unrepresentable.
export function createArchiveIntegrityReport(input: {
  readonly archive: string;
  readonly itemCount: number;
  readonly verifiedCount: number;
  readonly failedCount: number;
}): ArchiveIntegrityReport {
  const diagnostics: ArchiveDiagnostic[] = [];

  if (input.archive.trim().length === 0) {
    diagnostics.push(archiveDiagnostic(
      "Galerina_DATA_ARCHIVE_NAME_REQUIRED",
      "error",
      "Archive integrity report requires an archive name.",
      "archive",
    ));
  }

  const countsValid =
    validateCount(input.itemCount, "itemCount", diagnostics) &&
    validateCount(input.verifiedCount, "verifiedCount", diagnostics) &&
    validateCount(input.failedCount, "failedCount", diagnostics);

  let status: ArchiveVerificationStatus = "not_verified";
  if (countsValid) {
    if (input.verifiedCount + input.failedCount > input.itemCount) {
      diagnostics.push(archiveDiagnostic(
        "Galerina_DATA_ARCHIVE_COUNTS_INCONSISTENT",
        "error",
        "verifiedCount + failedCount exceeds itemCount.",
        "itemCount",
      ));
    } else if (input.failedCount > 0) {
      status = "failed";
    } else if (input.verifiedCount === input.itemCount && input.itemCount > 0) {
      status = "verified";
    } else {
      status = "not_verified";
      if (input.itemCount > 0) {
        diagnostics.push(archiveDiagnostic(
          "Galerina_DATA_ARCHIVE_UNVERIFIED_ITEMS",
          "warning",
          `${input.itemCount - input.verifiedCount} of ${input.itemCount} items were not verified.`,
          "verifiedCount",
        ));
      }
    }
  }

  return {
    archive: input.archive,
    itemCount: input.itemCount,
    verifiedCount: input.verifiedCount,
    failedCount: input.failedCount,
    status,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}

// Restore report builder: same derived-status rule as integrity. A restore
// that verified everything it restored, and restored everything requested,
// is "verified"; any failure is "failed"; anything else is "not_verified".
export function createArchiveRestoreReport(input: {
  readonly archive: string;
  readonly requestedCount: number;
  readonly restoredCount: number;
  readonly failedCount: number;
  readonly verifiedCount: number;
}): ArchiveRestoreReport {
  const diagnostics: ArchiveDiagnostic[] = [];

  if (input.archive.trim().length === 0) {
    diagnostics.push(archiveDiagnostic(
      "Galerina_DATA_ARCHIVE_NAME_REQUIRED",
      "error",
      "Archive restore report requires an archive name.",
      "archive",
    ));
  }

  const countsValid =
    validateCount(input.requestedCount, "requestedCount", diagnostics) &&
    validateCount(input.restoredCount, "restoredCount", diagnostics) &&
    validateCount(input.failedCount, "failedCount", diagnostics) &&
    validateCount(input.verifiedCount, "verifiedCount", diagnostics);

  let verification: ArchiveVerificationStatus = "not_verified";
  if (countsValid) {
    if (
      input.restoredCount + input.failedCount > input.requestedCount ||
      input.verifiedCount > input.restoredCount
    ) {
      diagnostics.push(archiveDiagnostic(
        "Galerina_DATA_ARCHIVE_COUNTS_INCONSISTENT",
        "error",
        "Restore counts are inconsistent (restored+failed exceeds requested, or verified exceeds restored).",
        "requestedCount",
      ));
    } else if (input.failedCount > 0) {
      verification = "failed";
    } else if (
      input.requestedCount > 0 &&
      input.restoredCount === input.requestedCount &&
      input.verifiedCount === input.restoredCount
    ) {
      verification = "verified";
    } else {
      verification = "not_verified";
      if (input.requestedCount > 0) {
        diagnostics.push(archiveDiagnostic(
          "Galerina_DATA_ARCHIVE_UNVERIFIED_ITEMS",
          "warning",
          "Restore completed without verifying every restored item.",
          "verifiedCount",
        ));
      }
    }
  }

  return {
    archive: input.archive,
    requestedCount: input.requestedCount,
    restoredCount: input.restoredCount,
    failedCount: input.failedCount,
    verifiedCount: input.verifiedCount,
    verification,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
