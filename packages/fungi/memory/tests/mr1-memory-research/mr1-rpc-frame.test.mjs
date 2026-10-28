// MEM-R1 gap 3.5 / H11: malformed custodian frames fail closed and quarantine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linuxOnly, loadProvider } from "./mr1-harness.mjs";
import {
  followUpAfterFrameFaultIsQuarantined,
  oversizeFrameFailsClosed,
  truncatedFrameFailsClosed,
  zeroFrameFailsClosed,
} from "./mr1-scenarios.mjs";

test("MR1 frame: truncated response body refuses, callback never runs, provider quarantined", async (t) => {
  if (!linuxOnly(t)) return;
  assert.equal(truncatedFrameFailsClosed(await loadProvider()), true);
});

test("MR1 frame: zero-length response header refuses as invalid frame", async (t) => {
  if (!linuxOnly(t)) return;
  assert.equal(zeroFrameFailsClosed(await loadProvider()), true);
});

test("MR1 frame: response header above MAX_FRAME refuses before any body read", async (t) => {
  if (!linuxOnly(t)) return;
  assert.equal(oversizeFrameFailsClosed(await loadProvider()), true);
});

test("MR1 frame: has and put after a frame fault throw SecretArenaQuarantined", async (t) => {
  if (!linuxOnly(t)) return;
  assert.equal(followUpAfterFrameFaultIsQuarantined(await loadProvider()), true);
});
