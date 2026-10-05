declare module "node:fs" {
  export const constants: {
    readonly O_WRONLY: number;
    readonly O_CREAT: number;
    readonly O_EXCL: number;
    readonly O_NOFOLLOW?: number;
  };
}

declare module "node:fs/promises" {
  export interface FileHandle {
    writeFile(data: string, encoding: string): Promise<void>;
    close(): Promise<void>;
  }
  export function open(path: string, flags: number, mode?: number): Promise<FileHandle>;
  export function realpath(path: string): Promise<string>;
  export function stat(path: string): Promise<{ isDirectory(): boolean }>;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
}
