// =============================================================================
// Galerina Stage A — top-level runtime pipeline
//
// Chains all compiler passes and execution in the correct order:
//   Parse → Symbol Resolve → Type Check → Value-State Check → Effect Check
//   → Governance Verify → GIR Emit → Execute → Audit → Proof Chain
// =============================================================================

import { parseProgram } from "./parser.js";
import { resolveSymbols } from "./symbol-resolver.js";
import { checkTypes } from "./type-checker.js";
import { checkValueStates } from "./value-state-checker.js";
import { checkEffects } from "./effect-checker.js";
import { verifyGovernance, type GovernanceDiagnostic, type DeploymentProfile } from "./governance-verifier.js";
import { emitGIR, buildSemanticGraph, buildAiGraph, buildExecutionPlan } from "./gir-emitter.js";
import type { SemanticGraph, GalerinaAiGraph, PassiveExecutionPlan } from "./gir-emitter.js";
import { executeFlow, type FlowExecutionResult, type GalerinaValue } from "./interpreter.js";
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

export async function run(
  source: string,
  file: string,
  flowName: string,
  args: ReadonlyMap<string, GalerinaValue> = new Map(),
  options: RuntimeOptions = {},
): Promise<RuntimeResult> {
  const mode = options.mode ?? "dev";
  const allDiagnostics: Array<{ code: string; severity: string; message: string }> = [];

  const parseResult = parseProgram(source, file);
  for (const diagnostic of parseResult.diagnostics) {
    allDiagnostics.push({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
    });
  }

  const symbolResult = resolveSymbols(parseResult.ast);
  for (const diagnostic of symbolResult.diagnostics) {
    allDiagnostics.push({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
    });
  }

  // Phase 17A: Naming policy checker (runs after symbol resolver)
  const namingResult = checkNamingPolicy(parseResult.ast);
  const namingDiags = namingResult.diagnostics;

  const typeResult = checkTypes(parseResult.ast);
  for (const diagnostic of typeResult.diagnostics) {
    allDiagnostics.push({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
    });
  }

  const valueStateResult = checkValueStates(parseResult.ast);
  for (const diagnostic of valueStateResult.diagnostics) {
    allDiagnostics.push({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
    });
  }

  const effectResults = checkEffects(parseResult.flows, parseResult.ast);
  for (const result of effectResults) {
    for (const diagnostic of result.diagnostics) {
      allDiagnostics.push({
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
      });
    }
  }

  // Phase 12A: Source escape checker (runs after effect checker)
  const escapeResult = checkSourceEscapes(parseResult.ast);
  for (const diagnostic of escapeResult.diagnostics) {
    allDiagnostics.push({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
    });
  }

  const hasErrors = allDiagnostics.some((diagnostic) => diagnostic.severity === "error");
  const hasNamingErrors =
    options.enforceNamingPolicy === true &&
    namingDiags.some((d) => d.severity === "error" || d.severity === "warning");

  // Pass 7: Governance verification (runs even in check-only, uses profile to adjust severity)
  const profile = (mode === "check-only" ? "dev" : mode) as DeploymentProfile;
  const govResult = verifyGovernance(parseResult.ast, parseResult.flows, effectResults, profile);

  if (mode === "check-only" || hasErrors) {
    return {
      ok: !hasErrors && !hasNamingErrors,
      diagnostics: allDiagnostics,
      governanceDiagnostics: govResult.diagnostics,
      escapeDiagnostics: escapeResult.diagnostics,
      namingDiagnostics: namingDiags,
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
  // The flow node lives inside the AST; contractDecl is a direct child of the
  // flowDecl / secureFlowDecl / pureFlowDecl / guardedFlowDecl node.
  const FLOW_KINDS_RT = new Set(["flowDecl", "secureFlowDecl", "pureFlowDecl", "guardedFlowDecl"]);
  let targetFlowNode: import("./parser.js").AstNode | undefined;
  function findFlowNode(node: import("./parser.js").AstNode): void {
    if (FLOW_KINDS_RT.has(node.kind) && node.value === flowName) {
      targetFlowNode = node;
      return;
    }
    for (const child of node.children ?? []) {
      if (targetFlowNode === undefined) findFlowNode(child);
    }
  }
  findFlowNode(parseResult.ast);

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

  const capabilityHost: CapabilityHost = createCapabilityHost({
    declaredEffects,
    enforcer: finalEnforcer,
  });

  const execution = await executeFlow(
    flowName,
    args,
    parseResult.ast,
    parseResult.flows,
    finalEnforcer,
    capabilityHost,
  );
  for (const diagnostic of execution.diagnostics) {
    allDiagnostics.push({
      code: diagnostic.code,
      severity: "error",
      message: diagnostic.message,
    });
  }

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
    execution.value.__tag === "runtimeError" || execution.value.__tag === "error" ? "Failed" : "Success",
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

  const isError = execution.value.__tag === "runtimeError" || execution.value.__tag === "error";
  return {
    ok: !isError && !hasNamingErrors,
    value: execution.value,
    execution,
    diagnostics: allDiagnostics,
    governanceDiagnostics: govResult.diagnostics,
    escapeDiagnostics: escapeResult.diagnostics,
    namingDiagnostics: namingDiags,
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
  const _mode = options.mode ?? "dev";
  void _mode;

  const parseResult = parseProgram(source, file);
  const symbolResult = resolveSymbols(parseResult.ast);
  const typeResult = checkTypes(parseResult.ast);
  const valueStateResult = checkValueStates(parseResult.ast);
  const effectResults = checkEffects(parseResult.flows, parseResult.ast);

  const allDiagnostics = [
    ...parseResult.diagnostics,
    ...symbolResult.diagnostics,
    ...typeResult.diagnostics,
    ...valueStateResult.diagnostics,
    ...effectResults.flatMap((result) => result.diagnostics),
  ];

  const hasErrors = allDiagnostics.some((diagnostic) => diagnostic.severity === "error");
  if (hasErrors) {
    const codes = allDiagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.code)
      .join(", ");
    throw new Error(`Galerina: cannot serve - compiler errors: ${codes}`);
  }

  const registry = buildRouteRegistry(parseResult.ast);
  if (registry.routes.length === 0) {
    throw new Error("Galerina: no routes declared - nothing to serve");
  }

  return startServer(parseResult.ast, parseResult.flows, serverConfig);
}
