// =============================================================================
// Galerina Stage A — top-level runtime pipeline
//
// Chains all compiler passes and execution in the correct order:
//   Parse → Symbol Resolve → Type Check → Value-State Check → Effect Check
//   → Governance Verify → GIR Emit → Execute → Audit → Proof Chain
// =============================================================================

import { parseProgram, type ParseResult } from "./parser.js";
import { resolveSymbols } from "./symbol-resolver.js";
import { checkTypes } from "./type-checker.js";
import { checkValueStates } from "./value-state-checker.js";
import { checkEffects, type EffectCheckResult } from "./effect-checker.js";
import type { GovernanceDiagnostic, DeploymentProfile } from "./governance-verifier.js";
import {
  evaluateProductPolicy,
  GALERINA_SELECTION,
  requireAdmittedProductProfile,
} from "./product-policy.js";
import { emitGIR, buildSemanticGraph, buildAiGraph, buildExecutionPlan } from "./gir-emitter.js";
import type { SemanticGraph, GalerinaAiGraph, PassiveExecutionPlan } from "./gir-emitter.js";
import {
  executeFlow,
  resolveRuntimeFlowNode,
  type FlowExecutionResult,
  type GalerinaValue,
} from "./interpreter.js";
import type { CryptoProvider } from "./stdlib.js";
import { buildFlowAuditEvent, createAuditWriter } from "./audit-writer.js";
import { buildProofChain, type ExecutionProofChain } from "./proof-chain.js";
import { startServer, type RunningServer, type ServerConfig } from "./route-dispatcher.js";
import { buildRouteRegistry } from "./route-registry.js";
import { buildAttestation, signAttestation, type GalerinaAttestation, type AttestationKeyPair } from "./attestation.js";
import { createContractEnforcer, compileContract, type ContractEnforcer } from "./runtime/contractEnforcer.js";
import { createCapabilityHost, type CapabilityHost } from "./runtime/capabilityHost.js";
import type { ContractEnforcementRecord } from "./runtime/runtimeReport.js";
import { checkSourceEscapes, type EscapeDiagnostic } from "./source-escape-checker.js";
import { canonicalHash } from "./runtime/canonicalHash.js";
import { checkNamingPolicy, type NamingPolicyDiagnostic } from "./naming-policy-checker.js";

export type RuntimeMode = "check-only" | "dev" | "production" | "deterministic";

export interface RuntimeOptions {
  readonly mode?: RuntimeMode;
  readonly auditFilePath?: string;
  readonly traceId?: string;
  readonly port?: number;
  readonly host?: string;
  readonly flowName?: string;
  readonly attestation?: {
    readonly keyPair?: AttestationKeyPair;
    readonly includeSource?: boolean;
  };
  /** Optional deadline for execution in milliseconds from now. */
  readonly deadlineMs?: number;
  /** When true, include the SemanticGraph in the RuntimeResult. */
  readonly emitSemanticGraph?: boolean;
  /** When true, include a JSON serialisation of the AI graph (version 2) in the RuntimeResult. */
  readonly emitAiGraph?: boolean;
  /** When true, build a PassiveExecutionPlan for the target flow and include it in the result. */
  readonly emitExecutionPlan?: boolean;
  /** When true, naming policy violations are included in the ok=false condition. Default: false. */
  readonly enforceNamingPolicy?: boolean;
  /** Injected Password/BCrypt/Argon2 provider. Absent providers refuse closed. */
  readonly cryptoProvider?: CryptoProvider;
  /** Host-owned effect grants. When set, only the intersection with source-declared effects is authorized. */
  readonly grantedEffects?: readonly string[];
}

export interface RuntimeResult {
  readonly ok: boolean;
  readonly value?: GalerinaValue;
  readonly execution?: FlowExecutionResult;
  readonly diagnostics: readonly { code: string; severity: string; message: string }[];
  readonly governanceDiagnostics: readonly GovernanceDiagnostic[];
  readonly escapeDiagnostics: readonly EscapeDiagnostic[];
  readonly namingDiagnostics?: readonly NamingPolicyDiagnostic[];
  readonly proofChain?: ExecutionProofChain;
  readonly attestation?: GalerinaAttestation;
  readonly mode: RuntimeMode;
  readonly enforcementRecord?: ContractEnforcementRecord;
  readonly semanticGraph?: SemanticGraph;
  readonly aiGraphJson?: string;
  /** Phase 15: pre-verified passive execution plan. Present when emitExecutionPlan option is set. */
  readonly executionPlan?: PassiveExecutionPlan;
  /** Phase 16A: canonical hash of the semantic graph. Present when emitSemanticGraph or emitAiGraph is set. */
  readonly semanticGraphHash?: string;
}

interface RuntimeAdmission {
  readonly mode: RuntimeMode;
  readonly parseResult: ParseResult;
  readonly effectResults: readonly EffectCheckResult[];
  readonly diagnostics: readonly { code: string; severity: string; message: string }[];
  readonly governanceDiagnostics: readonly GovernanceDiagnostic[];
  readonly escapeDiagnostics: readonly EscapeDiagnostic[];
  readonly namingDiagnostics: readonly NamingPolicyDiagnostic[];
  readonly denied: boolean;
}

function decodeRuntimeMode(value: unknown): RuntimeMode {
  if (value === "check-only" || value === "dev" || value === "production" || value === "deterministic") {
    return value;
  }
  throw new Error(`Galerina: unknown runtime mode '${String(value)}'`);
}

function admitRuntime(
  source: string,
  file: string,
  mode: RuntimeMode,
  enforceNamingPolicy: boolean,
): RuntimeAdmission {
  const allDiagnostics: Array<{ code: string; severity: string; message: string }> = [];

  const appendDiagnostics = (
    diagnostics: readonly { readonly code: string; readonly severity: string; readonly message: string }[],
  ): void => {
    for (const diagnostic of diagnostics) {
      allDiagnostics.push({
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
      });
    }
  };

  const parseResult = parseProgram(source, file);
  appendDiagnostics(parseResult.diagnostics);

  const symbolResult = resolveSymbols(parseResult.ast);
  appendDiagnostics(symbolResult.diagnostics);

  const namingResult = checkNamingPolicy(parseResult.ast);
  const typeResult = checkTypes(parseResult.ast);
  appendDiagnostics(typeResult.diagnostics);

  const valueStateResult = checkValueStates(parseResult.ast);
  appendDiagnostics(valueStateResult.diagnostics);

  const effectResults = checkEffects(parseResult.flows, parseResult.ast);
  for (const result of effectResults) appendDiagnostics(result.diagnostics);

  const escapeResult = checkSourceEscapes(parseResult.ast);
  appendDiagnostics(escapeResult.diagnostics);

  const flowNames = new Set(parseResult.flows.map((flow) => flow.name));
  const effectFlowNames = new Set(effectResults.map((result) => result.flowName));
  const checkerStateIsTotal =
    flowNames.size === parseResult.flows.length &&
    effectFlowNames.size === effectResults.length &&
    effectResults.length === parseResult.flows.length &&
    parseResult.flows.every((flow) => effectFlowNames.has(flow.name));
  if (!checkerStateIsTotal) {
    throw new Error("Galerina: runtime admission checker state is incomplete");
  }

  const profile: DeploymentProfile = mode === "check-only" ? "dev" : mode;
  const product = requireAdmittedProductProfile(GALERINA_SELECTION);
  const policyResult = evaluateProductPolicy(product, {
    ast: parseResult.ast,
    flows: parseResult.flows,
    effectResults,
    deploymentProfile: profile,
  });
  const governanceDiagnostics: readonly GovernanceDiagnostic[] = policyResult.ok
    ? policyResult.diagnostics
    : Object.freeze([{
        code: policyResult.code,
        name: "PRODUCT_POLICY_NOT_ADMITTED",
        severity: "error",
        message: "The selected product policy is not admitted for runtime execution.",
      }]);

  const namingDenied =
    enforceNamingPolicy &&
    namingResult.diagnostics.some((diagnostic) =>
      diagnostic.severity === "error" || diagnostic.severity === "warning"
    );
  const denied =
    allDiagnostics.some((diagnostic) => diagnostic.severity === "error") ||
    governanceDiagnostics.some((diagnostic) => diagnostic.severity === "error") ||
    namingDenied;

  return {
    mode,
    parseResult,
    effectResults,
    diagnostics: allDiagnostics,
    governanceDiagnostics,
    escapeDiagnostics: escapeResult.diagnostics,
    namingDiagnostics: namingResult.diagnostics,
    denied,
  };
}

export async function run(
  source: string,
  file: string,
  flowName: string,
  args: ReadonlyMap<string, GalerinaValue> = new Map(),
  options: RuntimeOptions = {},
): Promise<RuntimeResult> {
  const mode = decodeRuntimeMode((options as { readonly mode?: unknown }).mode ?? "dev");
  const admission = admitRuntime(source, file, mode, options.enforceNamingPolicy === true);
  const { parseResult, effectResults } = admission;
  const allDiagnostics = [...admission.diagnostics];
  const hasNamingErrors =
    options.enforceNamingPolicy === true &&
    admission.namingDiagnostics.some((diagnostic) =>
      diagnostic.severity === "error" || diagnostic.severity === "warning"
    );

  if (mode === "check-only" || admission.denied) {
    return {
      ok: !admission.denied,
      diagnostics: allDiagnostics,
      governanceDiagnostics: admission.governanceDiagnostics,
      escapeDiagnostics: admission.escapeDiagnostics,
      namingDiagnostics: admission.namingDiagnostics,
      mode,
    };
  }

  // Pass 8: GIR emission (on clean AST)
  const girResult = emitGIR(parseResult.ast, parseResult.flows, effectResults);

  // Phase 15: Passive Execution Plan emission
  let executionPlanResult: PassiveExecutionPlan | undefined;
  if (options.emitExecutionPlan === true) {
    const targetMeta = parseResult.flows.find((f) => f.name === flowName);
    if (targetMeta !== undefined) {
      try {
        executionPlanResult = buildExecutionPlan(parseResult.ast, targetMeta);
      } catch {
        // Non-fatal: plan building failure does not abort execution
      }
    }
  }

  // Phase 13A: Semantic graph emission
  let semanticGraph: SemanticGraph | undefined;
  let aiGraphJson: string | undefined;
  let semanticGraphHash: string | undefined;
  if (options.emitSemanticGraph === true || options.emitAiGraph === true) {
    semanticGraph = buildSemanticGraph(parseResult.ast, parseResult.flows);
    // Phase 16A: compute canonical hash of the semantic graph
    semanticGraphHash = canonicalHash(semanticGraph);
    if (options.emitAiGraph === true) {
      const aiGraph: GalerinaAiGraph = buildAiGraph(parseResult.ast, parseResult.flows, file);
      aiGraphJson = JSON.stringify(aiGraph, null, 2);
    }
    if (options.emitSemanticGraph !== true) {
      semanticGraph = undefined;
    }
  }

  // Pass 10: Set up contract enforcement, then execute
  //
  // Find the contractDecl node attached to the target flow (if any).
  // The flow node lives inside the AST; contractDecl is a direct child of its
  // admitted declaration. The shared runtime resolver includes only valid
  // flagged governed-secure declarations beyond the ordinary flow kinds.
  const targetFlowNode = resolveRuntimeFlowNode(parseResult.ast, flowName);

  const contractNode = (targetFlowNode?.children ?? []).find((c) => c.kind === "contractDecl");

  // Pre-compile contract config once — avoids O(children) AST walks on every invocation.
  // compileContract(undefined) returns default configs (same behaviour as before when no contract).
  const compiledContract = compileContract(contractNode);

  // Build the enforcer — pass the pre-compiled config to skip inline parsing.
  // opts.deadlineMs takes priority over the contract's own timeout when both are present.
  const finalEnforcer: ContractEnforcer = createContractEnforcer(
    contractNode,
    flowName,
    {
      compiled: compiledContract,
      ...(options.traceId !== undefined ? { traceId: options.traceId } : {}),
      ...(options.deadlineMs !== undefined
        ? { deadlineMs: Date.now() + options.deadlineMs }
        : {}),
    },
  );

  // Collect declared effects for the target flow from the FlowMeta list.
  const flowMeta = parseResult.flows.find((f) => f.name === flowName);
  const declaredEffects = new Set<string>(flowMeta?.declaredEffects ?? []);

  const grantedEffects = options.grantedEffects === undefined
    ? undefined
    : new Set(options.grantedEffects);
  const capabilityHost: CapabilityHost = createCapabilityHost({
    declaredEffects,
    ...(grantedEffects !== undefined ? { grantedEffects } : {}),
    enforcer: finalEnforcer,
  });

  const execution = await executeFlow(
    flowName,
    args,
    parseResult.ast,
    parseResult.flows,
    finalEnforcer,
    capabilityHost,
    options.cryptoProvider === undefined
      ? undefined
      : { cryptoProvider: options.cryptoProvider },
  );
  for (const diagnostic of execution.diagnostics) {
    allDiagnostics.push({
      code: diagnostic.code,
      severity: "error",
      message: diagnostic.message,
    });
  }
  // A statement-local runtime error can be followed by a later return value.
  // The returned value must never erase the earlier refusal: any execution
  // diagnostic denies the whole run and records a failed audit outcome.
  const executionFailed =
    execution.value.__tag === "runtimeError" ||
    execution.value.__tag === "error" ||
    execution.diagnostics.length > 0;

  // Audit + proof chain
  // SECURITY (F4 fixed — Audit Pass 2): failClosed=true in production/deterministic.
  // The audit writer previously silently dropped file-write failures; in any
  // non-dev deployment mode that is an integrity failure — we must know.
  const isStrictMode = mode === "production" || mode === "deterministic";
  const writer = createAuditWriter(
    options.auditFilePath !== undefined ? "file" : "memory",
    options.auditFilePath,
    /* failClosed */ isStrictMode,
  );
  const auditEvent = buildFlowAuditEvent(
    flowName,
    execution.audit.qualifier,
    executionFailed ? "Failed" : "Success",
    options.traceId ?? `trace_${Date.now()}`,
    execution.auditEntries,
  );
  writer.append(auditEvent);
  writer.flush();

  // Build proof chain in production / deterministic modes
  let proofChain: ExecutionProofChain | undefined;
  if (mode === "production" || mode === "deterministic") {
    proofChain = buildProofChain({
      source,
      gir: girResult.gir,
      auditEvents: writer.getEvents(),
      evidence: [writer.getEvidenceRecord()],
      denials: writer.getDenials(),
    });
  }

  // Build attestation if requested
  let attestationResult: GalerinaAttestation | undefined;
  if (options.attestation !== undefined) {
    const includeSource = options.attestation.includeSource !== false;
    const attestInputs: import("./attestation.js").AttestationInputs = {
      flowName: options.flowName ?? flowName,
      ...(includeSource ? { sourceText: source } : {}),
      ...(girResult !== undefined ? { girJson: JSON.stringify(girResult) } : {}),
      ...(proofChain !== undefined ? { auditProofJson: JSON.stringify(proofChain) } : {}),
      ...(executionPlanResult !== undefined ? { executionPlanHash: executionPlanResult.planHash } : {}),
    };
    let att = await buildAttestation(attestInputs);
    if (options.attestation.keyPair !== undefined) {
      att = signAttestation(att, options.attestation.keyPair);
    }
    attestationResult = att;
  }

  return {
    ok: !executionFailed && !hasNamingErrors,
    value: execution.value,
    execution,
    diagnostics: allDiagnostics,
    governanceDiagnostics: admission.governanceDiagnostics,
    escapeDiagnostics: admission.escapeDiagnostics,
    namingDiagnostics: admission.namingDiagnostics,
    ...(proofChain !== undefined ? { proofChain } : {}),
    ...(attestationResult !== undefined ? { attestation: attestationResult } : {}),
    mode,
    enforcementRecord: finalEnforcer.enforcementRecord,
    ...(semanticGraph !== undefined ? { semanticGraph } : {}),
    ...(aiGraphJson !== undefined ? { aiGraphJson } : {}),
    ...(executionPlanResult !== undefined ? { executionPlan: executionPlanResult } : {}),
    ...(semanticGraphHash !== undefined ? { semanticGraphHash } : {}),
  };
}

export async function serve(
  source: string,
  file: string,
  serverConfig: ServerConfig,
  options: RuntimeOptions = {},
): Promise<RunningServer> {
  const optionMode = (options as { readonly mode?: unknown }).mode;
  const configMode = (serverConfig as { readonly mode?: unknown }).mode;
  if (optionMode !== undefined && configMode !== undefined && optionMode !== configMode) {
    throw new Error(`Galerina: conflicting runtime modes '${String(optionMode)}' and '${String(configMode)}'`);
  }
  const mode = decodeRuntimeMode(optionMode ?? configMode ?? "dev");
  if (mode === "check-only") {
    throw new Error("Galerina: check-only mode cannot open a listener");
  }

  const admission = admitRuntime(source, file, mode, options.enforceNamingPolicy === true);
  if (admission.denied) {
    const governanceErrors = admission.governanceDiagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    );
    const compilerErrors = admission.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    );
    const namingErrors = admission.namingDiagnostics.filter((diagnostic) =>
      diagnostic.severity === "error" || diagnostic.severity === "warning"
    );
    const category = governanceErrors.length > 0
      ? "governance errors"
      : namingErrors.length > 0 && options.enforceNamingPolicy === true
        ? "naming policy errors"
        : "compiler errors";
    const codes = [...compilerErrors, ...governanceErrors, ...namingErrors]
      .map((diagnostic) => diagnostic.code)
      .join(", ");
    throw new Error(`Galerina: cannot serve - ${category}: ${codes}`);
  }

  const registry = buildRouteRegistry(admission.parseResult.ast);
  if (registry.routes.length === 0) {
    throw new Error("Galerina: no routes declared - nothing to serve");
  }

  const flowNames = new Set(admission.parseResult.flows.map((flow) => flow.name));
  const unresolvedRoutes = registry.routes.filter((route) => !flowNames.has(route.flowName));
  if (unresolvedRoutes.length > 0) {
    throw new Error("Galerina: route admission references an unknown flow");
  }

  return startServer(
    admission.parseResult.ast,
    { ...serverConfig, mode },
    async (flowName, args) => {
      const result = await run(source, file, flowName, args, { ...options, mode });
      if (result.execution === undefined || result.value === undefined) {
        throw new Error(`Galerina: admitted route '${flowName}' refused during execution`);
      }
      if (!result.ok && result.value.__tag !== "runtimeError" && result.value.__tag !== "error") {
        return {
          __tag: "runtimeError",
          message: `Galerina: route '${flowName}' failed closed after an execution diagnostic`,
        };
      }
      return result.value;
    },
  );
}
