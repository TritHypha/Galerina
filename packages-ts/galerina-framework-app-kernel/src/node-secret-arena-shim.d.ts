/**
 * Minimal node:* slices for the SecretArena custodian binding.
 * This package ships no @types/node (see fuse-loader.ts / node-util-shim.d.ts).
 */
declare const process: {
  readonly platform: string;
  readonly env: { readonly [key: string]: string | undefined };
};

declare const WebAssembly: {
  Memory: {
    new (descriptor: { readonly initial: number }): { readonly buffer: ArrayBuffer };
  };
};

declare module "node:child_process" {
  export interface ChildProcess {
    readonly pid?: number;
    readonly stdin: { readonly fd?: number; destroy(): void } | null;
    readonly stdout: { readonly fd?: number; pause(): void; destroy(): void } | null;
    readonly stderr: { destroy(): void } | null;
    kill(): boolean;
  }
  export function spawn(
    command: string,
    args: readonly string[],
    options: {
      readonly stdio: readonly string[];
      readonly windowsHide?: boolean;
    },
  ): ChildProcess;
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function writeSync(
    fd: number,
    buffer: Uint8Array,
    offset?: number,
    length?: number,
  ): number;
  export function readSync(
    fd: number,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number | null,
  ): number;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
}
