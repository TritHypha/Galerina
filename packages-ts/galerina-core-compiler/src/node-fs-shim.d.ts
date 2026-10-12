declare module "node:fs" {
  export const constants: {
    readonly O_RDONLY: number;
    readonly O_NONBLOCK?: number;
    readonly O_NOFOLLOW?: number;
  };
  export function appendFileSync(path: string, data: string, encoding: string): void;
  export function appendFileSync(path: string, data: Uint8Array): void;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readFileSync(path: string): Buffer;
  export function writeFileSync(path: string, data: string, encoding: string): void;
  export function writeFileSync(path: string, data: Uint8Array): void;
  export function writeFileSync(path: string, data: string, options: { flag: string; encoding: string }): void;
  export function writeFileSync(path: string, data: Uint8Array, options: { flag: string }): void;
  export function writeFileSync(fd: number, data: string, encoding: string): void;
  export function writeFileSync(fd: number, data: Uint8Array): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function rmSync(path: string, options?: { force?: boolean }): void;
  export function rmdirSync(path: string): void;
  export interface Stats { readonly size: number; readonly nlink: number; readonly dev: number; readonly ino: number; readonly mtimeMs: number; readonly ctimeMs: number; isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean; }
  export function lstatSync(path: string): Stats;
  export function statSync(path: string): Stats;
  export function openSync(path: string, flags: string | number, mode?: number): number;
  export function fstatSync(fd: number): Stats;
  export function readSync(fd: number, buffer: Uint8Array, offset: number, length: number, position: number | null): number;
  export function closeSync(fd: number): void;
  export function linkSync(existingPath: string, newPath: string): void;
  export function realpathSync(path: string): string;
  export interface Dirent {
    readonly name: string;
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  }
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  export function readdirSync(path: string): string[];
}
