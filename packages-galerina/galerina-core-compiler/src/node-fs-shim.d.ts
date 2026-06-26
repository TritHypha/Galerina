declare module "node:fs" {
  export function appendFileSync(path: string, data: string, encoding: string): void;
  export function appendFileSync(path: string, data: Uint8Array): void;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readFileSync(path: string): Buffer;
  export function writeFileSync(path: string, data: string, encoding: string): void;
  export function writeFileSync(path: string, data: Uint8Array): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export interface Stats { readonly size: number; isDirectory(): boolean; isFile(): boolean; }
  export function statSync(path: string): Stats;
  export function realpathSync(path: string): string;
  export interface Dirent {
    readonly name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  export function readdirSync(path: string): string[];
}
