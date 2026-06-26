// Minimal ambient for node:module — the compiler ships hand-written node: shims (no @types/node).
// Only the slice used is declared: createRequire(import.meta.url), which yields a working CommonJS
// require() in the ESM dist (the raw `require` is undefined at runtime under "type":"module"). The
// returned require is typed `=> any` because callers cast it to the precise builtin slice they use
// (e.g. `require("node:dns/promises") as { lookup(...) }`).
declare module "node:module" {
  export function createRequire(path: string): (id: string) => any;
}
