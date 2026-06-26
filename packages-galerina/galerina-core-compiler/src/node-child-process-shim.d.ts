declare module "node:child_process" {
  export interface SpawnSyncOptions {
    readonly encoding?: "utf8" | "buffer";
    readonly timeout?: number;
    readonly cwd?: string;
  }

  export interface SpawnSyncResult {
    readonly status: number | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly error?: Error;
  }

  export function spawnSync(
    command: string,
    args?: readonly string[],
    options?: SpawnSyncOptions,
  ): SpawnSyncResult;

  export function execSync(
    command: string,
    options?: { readonly encoding?: "utf8"; readonly timeout?: number },
  ): string;
}
