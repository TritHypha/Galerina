// Capture typed-array intrinsics before caller callbacks can mutate Buffer/Uint8Array prototypes.
// This is a Node/bootstrap hardening measure; it does not promise erasure of native copies.
const fillBytes = Uint8Array.prototype.fill;
const setBytes = Uint8Array.prototype.set;
const applyIntrinsic = Reflect.apply;

export function copyBytes(target: Uint8Array, source: ArrayLike<number>): void {
  applyIntrinsic(setBytes, target, [source]);
}

export function wipeBytes(bytes: Uint8Array): void {
  applyIntrinsic(fillBytes, bytes, [0]);
}
