// Minimal ambient declarations for fungi-secret-gate-loader.ts (no @types/node in this package).
declare module "node:fs" {
  export function readFileSync(path: URL | string): Uint8Array;
}
declare module "node:crypto" {
  export function createHash(algorithm: "sha256"): {
    update(data: Uint8Array): { digest(encoding: "hex"): string };
  };
}