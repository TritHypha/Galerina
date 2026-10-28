// MEM-R1 scenario checks. Each returns true when the landed fail-closed
// behaviour holds; mutants are expected to make the same check return false.
import { CANARY, allZero, assertNoCanary, bytes, capture, open } from "./mr1-harness.mjs";

function safe(fn) {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}

function frameFault(mod, mode, messagePattern) {
  const p = open(mod, mode);
  try {
    p.put("mr1", bytes(CANARY));
    let called = 0;
    const r = capture(() => p.use("mr1", () => { called += 1; }));
    if (!r.thrown) return false;
    if (!(r.error instanceof mod.SecretArenaUnavailable)) return false;
    if (!messagePattern.test(String(r.error.message))) return false;
    assertNoCanary(r.error.message, mode);
    if (called !== 0) return false;
    if (p.status().state !== "quarantined") return false;
    const after = capture(() => p.has("mr1"));
    return after.thrown && after.error instanceof mod.SecretArenaQuarantined;
  } finally {
    p.dispose();
  }
}

export const truncatedFrameFailsClosed = (mod) =>
  safe(() => frameFault(mod, "trunc-get", /stdout closed/));
export const zeroFrameFailsClosed = (mod) =>
  safe(() => frameFault(mod, "zero-get", /invalid frame/));
export const oversizeFrameFailsClosed = (mod) =>
  safe(() => frameFault(mod, "huge-get", /invalid frame/));
export const killedCustodianFailsClosed = (mod) =>
  safe(() => frameFault(mod, "kill-get", /stdout closed/));

export const followUpAfterFrameFaultIsQuarantined = (mod) =>
  safe(() => {
    const p = open(mod, "trunc-get");
    try {
      p.put("mr1", bytes(CANARY));
      capture(() => p.use("mr1", () => {}));
      const has = capture(() => p.has("mr1"));
      const put = capture(() => p.put("mr2", bytes("x")));
      return (
        has.thrown && has.error instanceof mod.SecretArenaQuarantined &&
        put.thrown && put.error instanceof mod.SecretArenaQuarantined
      );
    } finally {
      p.dispose();
    }
  });

export const borrowedViewIsWipedAfterReturn = (mod) =>
  safe(() => {
    const p = open(mod, "ok");
    try {
      p.put("mr1", bytes(CANARY));
      let seen = "";
      let kept;
      p.use("mr1", (view) => {
        seen = new TextDecoder().decode(view);
        kept = view;
      });
      return seen === CANARY && kept !== undefined && kept.length === CANARY.length && allZero(kept);
    } finally {
      p.dispose();
    }
  });

export const staleEpochQuarantines = (mod) =>
  safe(() => {
    const p = open(mod, "epoch-down");
    try {
      if (p.revocationEpoch() !== 5) return false;
      const r = capture(() => p.revocationEpoch());
      return r.thrown && /stale/.test(String(r.error.message)) && p.status().state === "quarantined";
    } finally {
      p.dispose();
    }
  });
