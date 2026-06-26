// The photonic-HARDWARE switch — emulator (default) ⇄ attested real silicon. FAIL-CLOSED, KEEP-DIGITAL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectPhotonicBackend, resolvePhotonicBackend, PhotonicEmulatorBridge } from "../dist/index.js";

// A fake real-hardware backend. execute/executeExact are stubs — the switch tests SELECTION, not compute.
function fakeHardware({ nativeAvailable, attested, id = "fake-pic-v1" }) {
  return {
    nativeAvailable, attested, hardwareIdentity: id,
    execute: () => ({ value: 42, executedNatively: true, deterministic: false }),
    executeExact: () => 42,
  };
}

test("default + mode=emulator → the software emulator (real hardware is never the silent default)", () => {
  const d = selectPhotonicBackend();
  assert.equal(d.selected, "emulator");
  assert.ok(d.backend instanceof PhotonicEmulatorBridge);
  // Even when hardware is supplied, mode=emulator keeps the software backend.
  const d2 = selectPhotonicBackend({ mode: "emulator", hardware: fakeHardware({ nativeAvailable: true, attested: true }) });
  assert.equal(d2.selected, "emulator");
});

test("mode=hardware with no hardware backend FAILS CLOSED to the emulator", () => {
  const d = selectPhotonicBackend({ mode: "hardware" });
  assert.equal(d.selected, "emulator");
  assert.equal(d.code, "SPORE_PHOTONIC_NO_HARDWARE");
});

test("mode=hardware with an UNAVAILABLE backend (nativeAvailable=false) fails closed", () => {
  const d = selectPhotonicBackend({ mode: "hardware", hardware: fakeHardware({ nativeAvailable: false, attested: true }) });
  assert.equal(d.selected, "emulator");
  assert.equal(d.code, "SPORE_PHOTONIC_HW_UNAVAILABLE");
});

test("mode=hardware with an UNATTESTED backend fails closed (never run an unverified PIC)", () => {
  const d = selectPhotonicBackend({ mode: "hardware", hardware: fakeHardware({ nativeAvailable: true, attested: false }) });
  assert.equal(d.selected, "emulator");
  assert.equal(d.code, "SPORE_PHOTONIC_HW_UNATTESTED");
});

test("mode=hardware with a present + native + ATTESTED backend selects the hardware", () => {
  const hw = fakeHardware({ nativeAvailable: true, attested: true, id: "lightmatter-mars-v2" });
  const d = selectPhotonicBackend({ mode: "hardware", hardware: hw });
  assert.equal(d.selected, "hardware");
  assert.equal(d.backend, hw);
  assert.match(d.reason, /lightmatter-mars-v2/);
  assert.equal(d.code, undefined);
});

test("mode=auto: attested hardware ⇒ hardware; otherwise ⇒ emulator (no hard error)", () => {
  assert.equal(selectPhotonicBackend({ mode: "auto", hardware: fakeHardware({ nativeAvailable: true, attested: true }) }).selected, "hardware");
  assert.equal(selectPhotonicBackend({ mode: "auto" }).selected, "emulator");
  assert.equal(selectPhotonicBackend({ mode: "auto", hardware: fakeHardware({ nativeAvailable: true, attested: false }) }).selected, "emulator");
});

test("resolvePhotonicBackend always returns a usable backend (emulator computes exactly)", () => {
  const be = resolvePhotonicBackend({ mode: "hardware" }); // fails closed → emulator
  assert.ok(be instanceof PhotonicEmulatorBridge);
  // the emulator's exact path is callable (sanity — the lane never goes dark)
  assert.equal(typeof be.executeExact, "function");
});
