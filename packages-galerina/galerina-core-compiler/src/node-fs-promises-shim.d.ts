declare module "node:fs/promises" {
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function readFile(path: string): Promise<Uint8Array>;
  export function writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
  export function writeFile(path: string, data: Uint8Array): Promise<void>;
}
