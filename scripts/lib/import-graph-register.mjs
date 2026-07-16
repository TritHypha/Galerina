// lib/import-graph-register.mjs — `node --import` shim that arms the resolution logger (W1 --graph).
// Reads the log destination from GALERINA_IMPORT_GRAPH_LOG so the spawning tool controls the file;
// absent env = no-op (safe to leave in a command line).
import { register } from "node:module";

const logPath = process.env.GALERINA_IMPORT_GRAPH_LOG;
if (logPath) {
  register("./import-graph-hooks.mjs", { parentURL: import.meta.url, data: { logPath } });
}
