export type RuntimeMode = "checked" | "compiled";

export type RuntimeEnvironment =
  | "development"
  | "test"
  | "staging"
  | "production";

export type RuntimeDiagnosticSeverity = "warning" | "error";

export interface RuntimeContext {
  readonly mode: RuntimeMode;
  readonly projectRoot: string;
  readonly environment: RuntimeEnvironment;
  readonly entryFile?: string;
  readonly timeoutMs?: number;
}

export interface RuntimeDiagnostic {
  readonly code: string;
  readonly severity: RuntimeDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

export interface RuntimeError {
  readonly code: string;
  readonly safeMessage: string;
  readonly sourceLocation?: string;
}

export interface RuntimeResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly error?: RuntimeError;
}

export type RuntimeEffectKind =
  | "filesystem"
  | "network"
  | "environment"
  | "clock"
  | "random"
  | "process";

export interface RuntimeEffect {
  readonly kind: RuntimeEffectKind;
  readonly name: string;
  readonly resource: string;
}

export interface RuntimeEffectPolicy {
  readonly allowedEffects: readonly RuntimeEffectKind[];
  readonly denyProcessEffects: boolean;
  readonly requireExplicitNetworkPermission: boolean;
}

export interface RuntimeEffectDecision {
  readonly effect: RuntimeEffect;
  readonly allowed: boolean;
  readonly reason: string;
}

export interface RuntimeReport {
  readonly mode: RuntimeMode;
  readonly durationMs: number;
  readonly diagnostics: readonly RuntimeDiagnostic[];
  readonly warnings: readonly string[];
  readonly effects: readonly RuntimeEffect[];
  readonly cancelled: boolean;
  readonly timedOut: boolean;
}

export const DEFAULT_RUNTIME_EFFECT_POLICY: RuntimeEffectPolicy = {
  allowedEffects: ["clock", "random"],
  denyProcessEffects: true,
  requireExplicitNetworkPermission: true,
};

export function createRuntimeContext(
  input: RuntimeContext,
): RuntimeContext {
  const diagnostics = validateRuntimeContext(input);
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );

  if (errors.length > 0) {
    throw new Error(errors.map((diagnostic) => diagnostic.message).join(" "));
  }

  return input;
}

export function validateRuntimeContext(
  context: RuntimeContext,
): readonly RuntimeDiagnostic[] {
  const diagnostics: RuntimeDiagnostic[] = [];

  if (context.projectRoot.trim().length === 0) {
    diagnostics.push(createRuntimeDiagnostic(
      "Galerina_RUNTIME_PROJECT_ROOT_REQUIRED",
      "error",
      "Runtime context requires a project root.",
      "projectRoot",
    ));
  }

  if (context.timeoutMs !== undefined && context.timeoutMs <= 0) {
    diagnostics.push(createRuntimeDiagnostic(
      "Galerina_RUNTIME_TIMEOUT_INVALID",
      "error",
      "Runtime timeout must be positive when declared.",
      "timeoutMs",
    ));
  }

  if (context.environment === "production" && context.mode === "checked") {
    diagnostics.push(createRuntimeDiagnostic(
      "Galerina_RUNTIME_PRODUCTION_CHECKED_MODE",
      "warning",
      "Production checked mode should be explicitly justified.",
      "mode",
    ));
  }

  return diagnostics;
}

export function okRuntimeResult<T>(value: T): RuntimeResult<T> {
  return { ok: true, value };
}

export function errorRuntimeResult<T = never>(
  error: RuntimeError,
): RuntimeResult<T> {
  return { ok: false, error };
}

export function decideRuntimeEffect(
  effect: RuntimeEffect,
  policy: RuntimeEffectPolicy = DEFAULT_RUNTIME_EFFECT_POLICY,
): RuntimeEffectDecision {
  if (policy.denyProcessEffects && effect.kind === "process") {
    return {
      effect,
      allowed: false,
      reason: "Process effects are denied by runtime policy.",
    };
  }

  if (
    policy.requireExplicitNetworkPermission &&
    effect.kind === "network" &&
    !policy.allowedEffects.includes("network")
  ) {
    return {
      effect,
      allowed: false,
      reason: "Network effects require explicit runtime permission.",
    };
  }

  const allowed = policy.allowedEffects.includes(effect.kind);

  return {
    effect,
    allowed,
    reason: allowed
      ? "Runtime effect is explicitly allowed."
      : "Runtime effect is not listed in the allow policy.",
  };
}

export function createRuntimeReport(input: {
  readonly context: RuntimeContext;
  readonly durationMs: number;
  readonly effects?: readonly RuntimeEffect[];
  readonly diagnostics?: readonly RuntimeDiagnostic[];
  readonly cancelled?: boolean;
  readonly timedOut?: boolean;
}): RuntimeReport {
  const diagnostics = [
    ...validateRuntimeContext(input.context),
    ...(input.diagnostics ?? []),
  ];

  return {
    mode: input.context.mode,
    durationMs: input.durationMs,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
    effects: input.effects ?? [],
    cancelled: input.cancelled ?? false,
    timedOut: input.timedOut ?? false,
  };
}

function createRuntimeDiagnostic(
  code: string,
  severity: RuntimeDiagnosticSeverity,
  message: string,
  path?: string,
): RuntimeDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}
