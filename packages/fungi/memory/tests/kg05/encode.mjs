/// KG-05 host encoder. Range-check then tagged 10-byte LE buffer.
/// Remainder-and-divide only. No 64-bit wrap conversion helpers.

export const I64_MIN = -9223372036854775808n;
export const I64_MAX = 9223372036854775807n;
export const U64_MAX = 18446744073709551615n;
export const U64_ONE_PAST_MAX = 18446744073709551616n;

function writeRemainderLE(n, signed) {
  const bytes = [];
  let x = n;
  let i = 0;
  while (i < 8) {
    let rem = x % 256n;
    if (rem < 0n) {
      rem = rem + 256n;
    }
    bytes.push(Number(rem));
    x = (x - rem) / 256n;
    i = i + 1;
  }
  if (signed === true) {
    if (n >= 0n) {
      if (x !== 0n) {
        return { ok: false, reason: "RANGE", bytes: [] };
      }
    } else {
      if (x !== -1n) {
        return { ok: false, reason: "RANGE", bytes: [] };
      }
    }
  } else {
    if (x !== 0n) {
      return { ok: false, reason: "RANGE", bytes: [] };
    }
  }
  return { ok: true, reason: "OK", bytes };
}

export function encodeI64(n) {
  if (typeof n !== "bigint") {
    return { ok: false, reason: "TYPE", bytes: [] };
  }
  if (n < I64_MIN) {
    return { ok: false, reason: "RANGE", bytes: [] };
  }
  if (n > I64_MAX) {
    return { ok: false, reason: "RANGE", bytes: [] };
  }
  const payload = writeRemainderLE(n, true);
  if (payload.ok !== true) {
    return payload;
  }
  return { ok: true, reason: "OK", bytes: [0x01, 8, ...payload.bytes] };
}

export function encodeU64(n) {
  if (typeof n !== "bigint") {
    return { ok: false, reason: "TYPE", bytes: [] };
  }
  if (n < 0n) {
    return { ok: false, reason: "RANGE", bytes: [] };
  }
  if (n > U64_MAX) {
    return { ok: false, reason: "RANGE", bytes: [] };
  }
  const payload = writeRemainderLE(n, false);
  if (payload.ok !== true) {
    return payload;
  }
  return { ok: true, reason: "OK", bytes: [0x02, 8, ...payload.bytes] };
}

export function classifyLegacyI32(n) {
  if (typeof n !== "number") {
    return { classTag: 10, value: 0 };
  }
  if (Number.isFinite(n) !== true) {
    return { classTag: 8, value: 0 };
  }
  if (Number.isInteger(n) !== true) {
    return { classTag: 7, value: 0 };
  }
  if (n > 2147483647) {
    return { classTag: 8, value: 0 };
  }
  if (n < -2147483647) {
    return { classTag: 8, value: 0 };
  }
  return { classTag: 0, value: n };
}

export function invokeArgs(bufLen, bytes, domainLo, domainHi) {
  const b = bytes.slice();
  while (b.length < 10) {
    b.push(0);
  }
  return [bufLen, b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], domainLo, domainHi];
}
