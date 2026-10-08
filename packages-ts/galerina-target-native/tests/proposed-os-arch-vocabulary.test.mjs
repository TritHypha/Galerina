import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  NATIVE_DIAGNOSTIC_CODES,
  isNativeDiagnosticCode,
  validateNativeTarget,
} from "../dist/index.js";
import {
  PROPOSED_NATIVE_ARCHITECTURES,
  PROPOSED_NATIVE_OPERATING_SYSTEMS,
  PROPOSED_NATIVE_ARCHITECTURE_UNAPPROVED,
  PROPOSED_NATIVE_OS_UNAPPROVED,
  isProposedNativeArchitecture,
  isProposedNativeOperatingSystem,
  proposedNativeVocabularyDiagnostics,
} from "../dist/proposed-os-arch-vocabulary.js";

const codes = (diags) => diags.map((d) => d.code);

const fixture = {
  triple: "x86_64-unknown-linux-gnu",
  os: "linux",
  architecture: "x86_64",
  abi: "system",
  executionMode: "native-abi-boundary",
};

describe("PROPOSED native OS/architecture vocabulary", () => {
  it("is a frozen exact closed set sourced from this package's named tokens", () => {
    assert.deepEqual([...PROPOSED_NATIVE_ARCHITECTURES], ["aarch64", "x86_64"]);
    assert.deepEqual([...PROPOSED_NATIVE_OPERATING_SYSTEMS], ["linux", "windows"]);
    assert.ok(Object.isFrozen(PROPOSED_NATIVE_ARCHITECTURES));
    assert.ok(Object.isFrozen(PROPOSED_NATIVE_OPERATING_SYSTEMS));
    assert.equal(isProposedNativeArchitecture("x86_64"), true);
    assert.equal(isProposedNativeArchitecture("aarch64"), true);
    assert.equal(isProposedNativeOperatingSystem("linux"), true);
    assert.equal(isProposedNativeOperatingSystem("windows"), true);
  });

  it("refuses tokens outside the PROPOSED lists", () => {
    assert.equal(isProposedNativeArchitecture("s390x"), false);
    assert.equal(isProposedNativeArchitecture("x86_64 "), false);
    assert.equal(isProposedNativeArchitecture("X86_64"), false);
    assert.equal(isProposedNativeArchitecture("arm64"), false);
    assert.equal(isProposedNativeOperatingSystem("darwin"), false);
    assert.equal(isProposedNativeOperatingSystem("macos"), false);
    assert.equal(isProposedNativeOperatingSystem("freebsd"), false);
    assert.equal(isProposedNativeOperatingSystem("linux "), false);
    assert.equal(isProposedNativeOperatingSystem("Linux"), false);
  });

  it("proposed helper refuses out-of-list os/architecture without admitting them", () => {
    const outside = proposedNativeVocabularyDiagnostics({
      os: "haiku",
      architecture: "s390x",
    });
    assert.deepEqual(codes(outside), [
      PROPOSED_NATIVE_ARCHITECTURE_UNAPPROVED,
      PROPOSED_NATIVE_OS_UNAPPROVED,
    ]);
    assert.equal(outside[0].path, "target.architecture");
    assert.equal(outside[1].path, "target.os");
    const ok = proposedNativeVocabularyDiagnostics({ os: "linux", architecture: "x86_64" });
    assert.deepEqual(codes(ok), []);
  });

  it("today's validateNativeTarget still admits a well-formed triple outside the PROPOSED lists", () => {
    const outside = {
      triple: "s390x-ibm-linux-gnu",
      os: "linux",
      architecture: "s390x",
      abi: "system",
      executionMode: "native-abi-boundary",
    };
    assert.deepEqual(codes(validateNativeTarget(outside)), []);
    assert.deepEqual(codes(proposedNativeVocabularyDiagnostics(outside)), [
      PROPOSED_NATIVE_ARCHITECTURE_UNAPPROVED,
    ]);
  });

  it("today's validateNativeTarget still refuses malformed triples and token mismatch", () => {
    assert.deepEqual(codes(validateNativeTarget({ ...fixture, triple: "x86_64" })), [
      "Galerina_NATIVE_TARGET_TRIPLE_INVALID",
    ]);
    assert.deepEqual(codes(validateNativeTarget({ ...fixture, architecture: "aarch64" })), [
      "Galerina_NATIVE_TARGET_TRIPLE_ARCHITECTURE_MISMATCH",
    ]);
    assert.deepEqual(codes(validateNativeTarget({ ...fixture, os: "windows" })), [
      "Galerina_NATIVE_TARGET_TRIPLE_OS_MISMATCH",
    ]);
  });

  it("PROPOSED vocabulary codes are not live diagnostic registry members", () => {
    assert.equal(isNativeDiagnosticCode(PROPOSED_NATIVE_ARCHITECTURE_UNAPPROVED), false);
    assert.equal(isNativeDiagnosticCode(PROPOSED_NATIVE_OS_UNAPPROVED), false);
    assert.equal(NATIVE_DIAGNOSTIC_CODES.includes(PROPOSED_NATIVE_ARCHITECTURE_UNAPPROVED), false);
    assert.equal(NATIVE_DIAGNOSTIC_CODES.includes(PROPOSED_NATIVE_OS_UNAPPROVED), false);
  });
});
