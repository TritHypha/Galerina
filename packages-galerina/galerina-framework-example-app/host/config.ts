// host/config.ts — typed application configuration for the example app.
//
// The app's runtime knobs live in config/app.config.json (data, not code) so an
// operator can change host/port/posture/environment without recompiling. This module
// loads + validates that file into a typed AppConfig, failing CLOSED: an unrecognised
// environment or posture is rejected, and a missing/invalid file throws rather than
// silently booting on guessed defaults. `posture` + `env` are handed to the App
// Kernel, which resolves the effective OS/HW posture via @galerina/core-config.

import { readFileSync } from "node:fs";

/** Deployment environment (mirrors @galerina/core-config EnvironmentMode). */
export type AppEnv = "development" | "test" | "staging" | "production";
/** Requested OS/HW security posture (mirrors @galerina/core-config SecurityPosture). */
export type AppPosture = "off" | "auto" | "on";

/** The fully-validated app configuration the host runs on. */
export interface AppConfig {
  readonly name: string;
  readonly env: AppEnv;
  readonly posture: AppPosture;
  readonly http: { readonly host: string; readonly port: number };
  readonly greeting: { readonly message: string; readonly route: string };
}

const ENVS: ReadonlySet<string> = new Set(["development", "test", "staging", "production"]);
const POSTURES: ReadonlySet<string> = new Set(["off", "auto", "on"]);

/** Reject an invalid config — fail-closed, with a precise reason. */
function fail(reason: string): never {
  throw new Error(`app config invalid: ${reason}`);
}

/** Validate an already-parsed config value into a typed AppConfig (fail-closed). */
export function parseConfig(raw: unknown): AppConfig {
  if (raw === null || typeof raw !== "object") fail("not an object");
  const o = raw as Record<string, unknown>;

  const name = o["name"];
  if (typeof name !== "string" || name.length === 0) fail("name must be a non-empty string");

  const env = o["env"];
  if (typeof env !== "string" || !ENVS.has(env)) fail(`env must be one of: ${[...ENVS].join(", ")}`);

  const posture = o["posture"];
  if (typeof posture !== "string" || !POSTURES.has(posture)) fail(`posture must be one of: ${[...POSTURES].join(", ")}`);

  const http = o["http"];
  if (http === null || typeof http !== "object") fail("http must be an object");
  const h = http as Record<string, unknown>;
  const host = h["host"];
  const port = h["port"];
  if (typeof host !== "string" || host.length === 0) fail("http.host must be a non-empty string");
  if (typeof port !== "number" || !Number.isInteger(port) || port < 0 || port > 65535) {
    fail("http.port must be an integer in 0..65535");
  }

  const greeting = o["greeting"];
  if (greeting === null || typeof greeting !== "object") fail("greeting must be an object");
  const g = greeting as Record<string, unknown>;
  const message = g["message"];
  const route = g["route"];
  if (typeof message !== "string" || message.length === 0) fail("greeting.message must be a non-empty string");
  if (typeof route !== "string" || !route.startsWith("/")) fail("greeting.route must be a path beginning with '/'");

  return {
    name,
    env: env as AppEnv,
    posture: posture as AppPosture,
    http: { host, port },
    greeting: { message, route },
  };
}

/** Read + validate config/app.config.json from `path`. Throws (fail-closed) if missing or invalid. */
export function loadConfig(path: string): AppConfig {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    fail(`cannot read config file: ${path}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    fail(`config file is not valid JSON (${path}): ${(e as Error).message}`);
  }
  return parseConfig(json);
}
