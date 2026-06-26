// =============================================================================
// Phase 23D — StringView, BytesView, TensorView Tests
//
// Tests for:
//   createStringView — bounds checking and descriptor creation
//   createBytesView  — bounds checking and descriptor creation
//   sliceStringView  — sub-view creation and clamping
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createStringView,
  createBytesView,
  sliceStringView,
} from "../../dist/index.js";

// ---------------------------------------------------------------------------
// createStringView
// ---------------------------------------------------------------------------

describe("createStringView: descriptor creation", () => {
  it("creates a StringView with correct fields for a valid range", () => {
    const buf = new ArrayBuffer(100);
    const view = createStringView(buf, 0, 20, "utf8");
    assert.equal(view.startOffset, 0);
    assert.equal(view.byteLength, 20);
    assert.equal(view.encoding, "utf8");
  });

  it("defaults encoding to utf8 when not specified", () => {
    const buf = new ArrayBuffer(64);
    const view = createStringView(buf, 0, 10);
    assert.equal(view.encoding, "utf8");
  });

  it("accepts utf16 encoding", () => {
    const buf = new ArrayBuffer(64);
    const view = createStringView(buf, 10, 20, "utf16");
    assert.equal(view.startOffset, 10);
    assert.equal(view.encoding, "utf16");
  });

  it("throws RangeError when offset + byteLength exceeds buffer size", () => {
    const buf = new ArrayBuffer(16);
    assert.throws(
      () => createStringView(buf, 10, 10),
      { name: "RangeError" },
      "Must throw RangeError for out-of-bounds access",
    );
  });

  it("throws RangeError for negative offset", () => {
    const buf = new ArrayBuffer(32);
    assert.throws(
      () => createStringView(buf, -1, 10),
      { name: "RangeError" },
    );
  });
});

// ---------------------------------------------------------------------------
// createBytesView
// ---------------------------------------------------------------------------

describe("createBytesView: descriptor creation", () => {
  it("creates a BytesView with correct fields", () => {
    const buf = new ArrayBuffer(256);
    const view = createBytesView(buf, 64, 32);
    assert.equal(view.startOffset, 64);
    assert.equal(view.byteLength, 32);
  });

  it("allows zero-length BytesView at buffer start", () => {
    const buf = new ArrayBuffer(8);
    const view = createBytesView(buf, 0, 0);
    assert.equal(view.byteLength, 0);
  });

  it("throws RangeError when bounds are exceeded", () => {
    const buf = new ArrayBuffer(8);
    assert.throws(
      () => createBytesView(buf, 4, 8),
      { name: "RangeError" },
    );
  });
});

// ---------------------------------------------------------------------------
// sliceStringView
// ---------------------------------------------------------------------------

describe("sliceStringView: sub-view slicing", () => {
  it("slices a sub-view from [startChar, endChar)", () => {
    const buf = new ArrayBuffer(100);
    const view = createStringView(buf, 10, 20, "utf8");
    const sliced = sliceStringView(view, 5, 10);
    assert.equal(sliced.startOffset, 15); // 10 + 5
    assert.equal(sliced.byteLength, 5);   // 10 - 5
    assert.equal(sliced.encoding, "utf8");
  });

  it("omitting endChar slices to end of view", () => {
    const buf = new ArrayBuffer(50);
    const view = createStringView(buf, 0, 20, "utf8");
    const sliced = sliceStringView(view, 5);
    assert.equal(sliced.byteLength, 15); // 20 - 5
  });

  it("clamping: startChar beyond byteLength gives empty view", () => {
    const buf = new ArrayBuffer(30);
    const view = createStringView(buf, 0, 10, "utf8");
    const sliced = sliceStringView(view, 20); // beyond end
    assert.equal(sliced.byteLength, 0);
  });

  it("preserves encoding from source view", () => {
    const buf = new ArrayBuffer(50);
    const view = createStringView(buf, 0, 40, "utf16");
    const sliced = sliceStringView(view, 2, 6);
    assert.equal(sliced.encoding, "utf16");
  });

  it("endChar clamped to view length if too large", () => {
    const buf = new ArrayBuffer(50);
    const view = createStringView(buf, 0, 10, "utf8");
    const sliced = sliceStringView(view, 0, 1000);
    assert.equal(sliced.byteLength, 10); // clamped to view length
  });
});
