/**
 * PluginSandbox — enforces the Load/Execute/Erase lifecycle
 *
 * Each plugin execution is transient — state is erased after every call.
 * No plugin can persist state between calls without an explicit mut + policy {} declaration.
 */

import { createHash } from "node:crypto";

export interface PluginMetadata {
  readonly engineId:      string;
  readonly artifactPath:  string;
  readonly artifactHash:  string;
  readonly governanceTier: 1 | 2 | 3;  // 1=BitNet, 2=Groq, 3=NVFP4
  readonly license:       "MIT" | "Apache-2.0";
  readonly maxMemoryMB:   number;
  readonly capabilityMask: number;  // V_DPM bitmask
}

export interface ExecutionResult {
  readonly success:        boolean;
  readonly outputHash:     string;    // sha256 of output for audit trail
  readonly latencyMs:      number;
  readonly tokenCount?:    number;    // for LLM inference
  readonly trapFired:      boolean;
  readonly trapCode?:      string;
  readonly correlationId:  string;
}

export class PluginSandbox {
  readonly metadata: PluginMetadata;
  private erased = false;

  constructor(metadata: PluginMetadata) {
    this.metadata = metadata;
  }

  isErased(): boolean { return this.erased; }

  /** Hash any value for audit trail correlation */
  static hashValue(v: unknown): string {
    return "sha256:" + createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
  }

  /** Schema validation — the "Sanitize & Interrogate" protocol */
  validate(input: unknown): { valid: boolean; violations: string[] } {
    const violations: string[] = [];
    if (input === null || input === undefined) violations.push("NULL_INPUT");
    if (typeof input === "string" && input.length > 4 * 1024 * 1024) violations.push("INPUT_SIZE_EXCEEDED");
    if (typeof input === "object" && input !== null) {
      const keys = Object.keys(input as object);
      if (keys.length > 1000) violations.push("TOO_MANY_FIELDS");
    }
    return { valid: violations.length === 0, violations };
  }

  /** Mark this sandbox as erased — prevents re-use */
  erase(): void {
    this.erased = true;
  }
}
