declare const process: {
  readonly argv: readonly string[];
  readonly execPath: string;
  cwd(): string;
  exitCode?: number;
};

declare module "node:child_process" {
  interface ChildProcessLike {
    readonly stdout: {
      setEncoding(encoding: "utf8"): void;
      on(event: "data", listener: (chunk: string) => void): void;
    };
    readonly stderr: {
      setEncoding(encoding: "utf8"): void;
      on(event: "data", listener: (chunk: string) => void): void;
    };
    on(event: "error", listener: (error: Error) => void): void;
    on(event: "close", listener: (code: number | null) => void): void;
  }

  export function spawn(
    command: string,
    args: readonly string[],
    options: {
      readonly cwd: string;
      readonly windowsHide?: boolean;
      readonly stdio?: readonly ["ignore", "pipe", "pipe"];
    },
  ): ChildProcessLike;
}

declare module "node:fs/promises" {
  export interface Dirent {
    readonly name: string;
    isDirectory(): boolean;
  }

  export interface Stats {
    isDirectory(): boolean;
    isFile(): boolean;
  }

  export function mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<void>;
  export function readdir(path: string, options: { readonly withFileTypes: true }): Promise<Dirent[]>;
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function stat(path: string): Promise<Stats>;
  export function writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...paths: readonly string[]): string;
  export function resolve(...paths: readonly string[]): string;
  export function relative(from: string, to: string): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}
