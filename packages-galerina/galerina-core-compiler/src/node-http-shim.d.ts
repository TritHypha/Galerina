declare module "node:http" {
  export const createServer: (
    handler: (req: any, res: any) => void,
  ) => {
    listen(port: number, host: string, cb: () => void): void;
    address(): { port: number } | string | null;
    close(cb: (err?: unknown) => void): void;
    on(event: "error", handler: (err: unknown) => void): void;
  };
}
