/**
 * Named K3 wire constants for compiler byte-boundary emission.
 * Single unsigned-read codec: 0x01 = +1, 0xFF = -1, 0x80 = UNKNOWN, anything else fails closed.
 * No raw-byte arithmetic at call sites; use these names.
 */
export const K3_WIRE_ADMIT = 1 as const;
export const K3_WIRE_DENY = -1 as const;
export const K3_WIRE_UNKNOWN = -128 as const;
export const K3_BYTE_ADMIT = 0x01 as const;
export const K3_BYTE_DENY = 0xff as const;
export const K3_BYTE_UNKNOWN = 0x80 as const;
