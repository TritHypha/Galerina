// MEM-R2 scenarios. Each returns true when the provider upholds the property,
// so the same function backs the green test and the killing mutant test.
import {
  ALLOWED_MESSAGES,
  CANARY,
  NAME,
  allZero,
  bytes,
  capture,
  open,
  windows,
} from "./mr2-harness.mjs";

function withProvider(mod, mode, fn) {
  const p = open(mod, mode);
  try {
    return fn(p);
  } finally {
    p.dispose();
  }
}

function leaks(text, secret) {
  return windows(secret).some((w) => String(text).includes(w));
}

// H11: a has() reply byte that is neither 0 nor 1 must never read as present.
export function hasByteTwoNeverPresent(mod) {
  return withProvider(mod, "has-two", (p) => {
    p.put(NAME, bytes(CANARY));
    let seen;
    const r = capture(() => { seen = p.has(NAME); });
    return r.thrown || seen !== true;
  });
}

// H11: an unlisted has() status must never read as present.
export function hasUnlistedNeverPresent(mod) {
  return withProvider(mod, "has-unlisted", (p) => {
    p.put(NAME, bytes(CANARY));
    let seen;
    const r = capture(() => { seen = p.has(NAME); });
    return r.thrown || seen !== true;
  });
}

// H11: an unlisted status() status quarantines.
export function statusUnlistedQuarantines(mod) {
  return withProvider(mod, "status-unlisted", (p) => p.status().state === "quarantined");
}

// H11: an epoch frame whose length is not exactly 8 is refused.
export function epochWrongLengthRefused(mod, mode = "epoch-long") {
  return withProvider(mod, mode, (p) => {
    const r = capture(() => p.revocationEpoch());
    return r.thrown && r.error instanceof mod.SecretArenaUnavailable;
  });
}

// An epoch above Number.MAX_SAFE_INTEGER is refused and quarantines.
export function epochHugeQuarantines(mod) {
  return withProvider(mod, "epoch-huge", (p) => {
    const r = capture(() => p.revocationEpoch());
    return r.thrown && p.status().state === "quarantined";
  });
}

// A get reply with an unlisted status never reaches the callback.
export function getUnlistedNeverCallsBack(mod) {
  return withProvider(mod, "get-unlisted-echo", (p) => {
    p.put(NAME, bytes(CANARY));
    let called = 0;
    const r = capture(() => p.use(NAME, () => { called += 1; }));
    return called === 0 && r.thrown && !leaks(r.error?.message, CANARY);
  });
}

// 1.6: a nested lease on the same name gets its own buffer, is wiped when the
// inner callback returns while the outer view is still live, and both views
// are all-zero once the outer callback returns.
export function nestedLeasesAreWipedIndependently(mod) {
  return withProvider(mod, "ok", (p) => {
    p.put(NAME, bytes(CANARY));
    let outer;
    let inner;
    let distinct = false;
    let innerWipedFirst = false;
    p.use(NAME, (v1) => {
      outer = v1;
      p.use(NAME, (v2) => {
        inner = v2;
        distinct = v2.buffer !== v1.buffer;
      });
      innerWipedFirst = allZero(inner) && !allZero(outer);
    });
    return distinct && innerWipedFirst && allZero(outer) && allZero(inner);
  });
}

// H4: the escape-channel refusal names neither the secret nor its value.
export function escapeRefusalIsGeneric(mod) {
  return withProvider(mod, "ok", (p) => {
    p.put(NAME, bytes(CANARY));
    const r = capture(() => p.use(NAME, () => 1));
    if (!r.thrown) return false;
    const text = `${r.error.message}\n${r.error.stack ?? ""}`;
    return ALLOWED_MESSAGES.has(r.error.message) && !leaks(text, NAME) && !leaks(text, CANARY);
  });
}
