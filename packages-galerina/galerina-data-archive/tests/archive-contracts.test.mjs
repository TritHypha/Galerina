import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createArchiveIntegrityReport,
  createArchiveRestoreReport,
  validateArchiveItem,
  validateArchiveManifest,
  validateChecksumRef,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const sha256Digest = "a".repeat(64);
const goodChecksum = { algorithm: "sha256", digestHex: sha256Digest };
const goodItem = {
  path: "exports/events.jsonl",
  content: { checksum: goodChecksum, sizeBytes: 1024 },
};

describe("validateChecksumRef — known algorithms with well-formed digests", () => {
  it("accepts every known algorithm with a right-sized digest", () => {
    assert.deepEqual(codes(validateChecksumRef({ algorithm: "sha256", digestHex: "b".repeat(64) })), []);
    assert.deepEqual(codes(validateChecksumRef({ algorithm: "sha384", digestHex: "c".repeat(96) })), []);
    assert.deepEqual(codes(validateChecksumRef({ algorithm: "sha512", digestHex: "d".repeat(128) })), []);
    assert.deepEqual(codes(validateChecksumRef({ algorithm: "blake3", digestHex: "e".repeat(64) })), []);
  });

  it("rejects unknown algorithms, including broken ones like md5", () => {
    for (const algorithm of ["md5", "sha1", "crc32", ""]) {
      const diags = validateChecksumRef({ algorithm, digestHex: sha256Digest });
      assert.deepEqual(codes(diags), ["Galerina_DATA_ARCHIVE_CHECKSUM_ALGORITHM_UNKNOWN"]);
    }
  });

  it("rejects a digest of the wrong length or with non-hex characters", () => {
    assert.deepEqual(
      codes(validateChecksumRef({ algorithm: "sha256", digestHex: "abc" })),
      ["Galerina_DATA_ARCHIVE_DIGEST_INVALID"],
    );
    assert.deepEqual(
      codes(validateChecksumRef({ algorithm: "sha256", digestHex: "z".repeat(64) })),
      ["Galerina_DATA_ARCHIVE_DIGEST_INVALID"],
    );
  });
});

describe("validateArchiveItem — relative paths only, sized and checksummed", () => {
  it("accepts a well-formed item", () => {
    assert.deepEqual(codes(validateArchiveItem(goodItem)), []);
  });

  it("rejects absolute, drive-letter and traversal paths", () => {
    for (const path of ["/etc/passwd", "\\\\share\\x", "C:evil", "a/../../b"]) {
      const diags = validateArchiveItem({ ...goodItem, path });
      assert.deepEqual(codes(diags), ["Galerina_DATA_ARCHIVE_ITEM_PATH_UNSAFE"], path);
    }
  });

  it("rejects a negative size and an empty path", () => {
    const diags = validateArchiveItem({
      path: " ",
      content: { checksum: goodChecksum, sizeBytes: -1 },
    });
    assert.ok(codes(diags).includes("Galerina_DATA_ARCHIVE_ITEM_PATH_REQUIRED"));
    assert.ok(codes(diags).includes("Galerina_DATA_ARCHIVE_SIZE_INVALID"));
  });
});

describe("validateArchiveManifest — named, timestamped, deduplicated, checksummed", () => {
  const goodManifest = {
    archive: "app.backup",
    createdAt: "2026-07-10T00:00:00Z",
    items: [goodItem],
    checksum: goodChecksum,
  };

  it("accepts a well-formed manifest", () => {
    assert.deepEqual(codes(validateArchiveManifest(goodManifest)), []);
  });

  it("warns on an empty manifest instead of passing silently", () => {
    const diags = validateArchiveManifest({ ...goodManifest, items: [] });
    assert.deepEqual(codes(diags), ["Galerina_DATA_ARCHIVE_EMPTY"]);
    assert.equal(diags[0].severity, "warning");
  });

  it("rejects duplicate item paths", () => {
    const diags = validateArchiveManifest({
      ...goodManifest,
      items: [goodItem, goodItem],
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_ARCHIVE_ITEM_DUPLICATE"]);
  });

  it("rejects an unparseable timestamp and a missing name", () => {
    const diags = validateArchiveManifest({
      ...goodManifest,
      archive: "",
      createdAt: "yesterday-ish",
    });
    assert.ok(codes(diags).includes("Galerina_DATA_ARCHIVE_NAME_REQUIRED"));
    assert.ok(codes(diags).includes("Galerina_DATA_ARCHIVE_TIMESTAMP_INVALID"));
  });

  it("validates optional signature and retention metadata when present", () => {
    const diags = validateArchiveManifest({
      ...goodManifest,
      signature: { algorithm: "rot13", keyId: "", signatureBase64: "" },
      retention: { name: "", minRetainDays: 0 },
    });
    assert.ok(codes(diags).includes("Galerina_DATA_ARCHIVE_SIGNATURE_ALGORITHM_UNKNOWN"));
    assert.ok(codes(diags).includes("Galerina_DATA_ARCHIVE_SIGNATURE_INVALID"));
    assert.ok(codes(diags).includes("Galerina_DATA_ARCHIVE_RETENTION_INVALID"));

    const clean = validateArchiveManifest({
      ...goodManifest,
      signature: { algorithm: "ed25519", keyId: "key-1", signatureBase64: "c2ln" },
      retention: { name: "seven-year", minRetainDays: 2557 },
    });
    assert.deepEqual(codes(clean), []);
  });
});

describe("createArchiveIntegrityReport — status is derived, never asserted", () => {
  it("reports verified only when every item verified", () => {
    const report = createArchiveIntegrityReport({
      archive: "app.backup",
      itemCount: 3,
      verifiedCount: 3,
      failedCount: 0,
    });
    assert.equal(report.status, "verified");
    assert.deepEqual(report.diagnostics, []);
  });

  it("reports failed when any item failed, regardless of the rest", () => {
    const report = createArchiveIntegrityReport({
      archive: "app.backup",
      itemCount: 3,
      verifiedCount: 2,
      failedCount: 1,
    });
    assert.equal(report.status, "failed");
  });

  it("reports not_verified with a warning when items were skipped", () => {
    const report = createArchiveIntegrityReport({
      archive: "app.backup",
      itemCount: 3,
      verifiedCount: 1,
      failedCount: 0,
    });
    assert.equal(report.status, "not_verified");
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_ARCHIVE_UNVERIFIED_ITEMS"));
  });

  it("rejects inconsistent counts", () => {
    const report = createArchiveIntegrityReport({
      archive: "app.backup",
      itemCount: 2,
      verifiedCount: 2,
      failedCount: 1,
    });
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_ARCHIVE_COUNTS_INCONSISTENT"));
    assert.equal(report.status, "not_verified");
  });
});

describe("createArchiveRestoreReport — counts plus a derived verification status", () => {
  it("reports verified when everything requested was restored and verified", () => {
    const report = createArchiveRestoreReport({
      archive: "app.backup",
      requestedCount: 4,
      restoredCount: 4,
      failedCount: 0,
      verifiedCount: 4,
    });
    assert.equal(report.verification, "verified");
    assert.deepEqual(report.diagnostics, []);
  });

  it("reports failed on any restore failure", () => {
    const report = createArchiveRestoreReport({
      archive: "app.backup",
      requestedCount: 4,
      restoredCount: 3,
      failedCount: 1,
      verifiedCount: 3,
    });
    assert.equal(report.verification, "failed");
  });

  it("reports not_verified when restored items were not all verified", () => {
    const report = createArchiveRestoreReport({
      archive: "app.backup",
      requestedCount: 4,
      restoredCount: 4,
      failedCount: 0,
      verifiedCount: 2,
    });
    assert.equal(report.verification, "not_verified");
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_ARCHIVE_UNVERIFIED_ITEMS"));
  });

  it("rejects verified > restored as inconsistent", () => {
    const report = createArchiveRestoreReport({
      archive: "app.backup",
      requestedCount: 4,
      restoredCount: 2,
      failedCount: 0,
      verifiedCount: 3,
    });
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_ARCHIVE_COUNTS_INCONSISTENT"));
  });

  it("rejects non-integer counts", () => {
    const report = createArchiveRestoreReport({
      archive: "app.backup",
      requestedCount: 1.5,
      restoredCount: 0,
      failedCount: 0,
      verifiedCount: 0,
    });
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_ARCHIVE_COUNT_INVALID"));
  });
});
