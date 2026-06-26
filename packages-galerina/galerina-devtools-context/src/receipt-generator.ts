// =============================================================================
// @galerina/devtools-context — Receipt Generator
//
// Core logic: walks the AST produced by parseProgram to extract the structural
// skeleton of each flow, stripped of body implementation.
//
// Token reduction goal: 92–98% (body is the dominant cost).
// =============================================================================

import {
  parseProgram,
  checkEffects,
  verifyGovernance,
  type AstNode,
  type FlowMeta,
  type ParseResult,
} from "@galerina/core-compiler";

import type {
  FlowContextReceipt,
  FileContextReceipts,
  ReceiptOptions,
} from "./types.js";

// ---------------------------------------------------------------------------
// Governance codes that should appear in receipts when triggered
// ---------------------------------------------------------------------------

const KNOWN_GOV_CODES: ReadonlyArray<{ pattern: RegExp; code: string }> = [
  { pattern: /\bsecret\b/i,             code: "GOV-010" },   // secure flow missing intent → flag
  { pattern: /\baudit\.write\b/i,        code: "GOV-AUD" },
  { pattern: /\bdatabase\.(read|write)\b/i, code: "GOV-DB" },
  { pattern: /\bnetwork\.(outbound|inbound)\b/i, code: "GOV-NET" },
  { pattern: /\bcrypto\b/i,              code: "GOV-CRYPTO" },
];

// ---------------------------------------------------------------------------
// Sink type detection from effects
// ---------------------------------------------------------------------------

function classifySinks(effects: readonly string[]): string[] {
  const sinks: string[] = [];
  for (const e of effects) {
    if (e.startsWith("audit"))      sinks.push("AuditLog");
    if (e.startsWith("database"))   sinks.push("Database");
    if (e.startsWith("network"))    sinks.push("Network");
    if (e.startsWith("filesystem")) sinks.push("Filesystem");
    if (e.startsWith("secret"))     sinks.push("SecretStore");
    if (e.startsWith("crypto"))     sinks.push("Crypto");
  }
  // deduplicate
  return [...new Set(sinks)];
}

// ---------------------------------------------------------------------------
// AST walking helpers
// ---------------------------------------------------------------------------

function findChildrenOfKind(node: AstNode, kind: string): AstNode[] {
  const result: AstNode[] = [];
  if (!node.children) return result;
  for (const child of node.children) {
    if (child.kind === kind) result.push(child);
  }
  return result;
}

function findFirstChildOfKind(node: AstNode, kind: string): AstNode | undefined {
  return node.children?.find(c => c.kind === kind);
}

/**
 * Recursively collect all identifier values that look like flow call names
 * (callExpr children that are identifiers with UpperCase or camelCase names).
 */
function collectCallees(bodyNode: AstNode): string[] {
  const callees = new Set<string>();

  function walk(n: AstNode): void {
    if (n.kind === "callExpr") {
      // The first child (or n.value) is typically the callee name
      const callee = n.value ?? n.children?.[0]?.value;
      if (callee && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(callee) && !isBuiltin(callee)) {
        callees.add(callee);
      }
    }
    if (n.children) {
      for (const c of n.children) walk(c);
    }
  }

  walk(bodyNode);
  return [...callees];
}

// Common builtins we don't want polluting the callee list
const BUILTINS = new Set([
  "AuditLog", "Secrets", "Crypto", "Database", "Http", "File",
  "Auth", "Session", "validate", "redact", "emit", "return",
  "Ok", "Err", "Some", "None", "true", "false",
]);

function isBuiltin(name: string): boolean {
  return BUILTINS.has(name);
}

/**
 * Scan body source text for `unsafe let` bindings — these are taint sources.
 *
 * Handles both syntax forms:
 *
 *   OLD (inside-body contract):
 *     secure flow f(p): R {
 *       contract { intent { ... } effects { ... } }
 *       unsafe let x = ...      ← found here
 *     }
 *
 *   NEW (outside-body contract — canonical form):
 *     secure flow f(p) -> R
 *     contract { intent { ... } effects { ... } }
 *     {
 *       unsafe let x = ...      ← found here
 *     }
 *
 * In the outside-body form, the contract block opens and closes before the body
 * `{` is ever seen. We detect this and reset brace tracking so we continue
 * scanning into the actual body.
 */
function extractTaintSourcesFromSource(source: string, flowName: string): string[] {
  const taintSources: string[] = [];
  const lines = source.split(/\r?\n/);
  let inFlow = false;
  let braceDepth = 0;
  let flowBraceDepth = -1;
  let seenOpenBrace = false;
  // Track outside-contract form: once contract {} closes, reset so we
  // continue into the body rather than exiting prematurely.
  let outsideContractBlockActive = false;
  let outsideContractBlockClosed = false;

  for (const line of lines) {
    // Detect a new flow declaration
    const flowMatch = line.match(/^\s*(?:secure|pure|guarded|fn)?\s*flow\s+(\w+)/);
    if (flowMatch) {
      if (flowMatch[1] === flowName) {
        inFlow = true;
        flowBraceDepth = braceDepth;
        seenOpenBrace = false;
        outsideContractBlockActive = false;
        outsideContractBlockClosed = false;
      } else if (inFlow) {
        break; // next flow started, done
      }
    }

    if (!inFlow) continue;

    // Detect outside-body contract block: `contract [...]? {` before the body opens
    if (!seenOpenBrace && line.match(/^\s*contract\s*(?:\[.*?\])?\s*\{/)) {
      outsideContractBlockActive = true;
    }

    // Count braces
    const opens  = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    braceDepth += opens - closes;
    if (opens > 0) seenOpenBrace = true;

    // If the outside-contract block just closed: reset tracking so we
    // continue into the real body rather than exiting.
    if (outsideContractBlockActive && braceDepth <= flowBraceDepth) {
      outsideContractBlockActive = false;
      outsideContractBlockClosed = true;
      seenOpenBrace = false; // reset — we haven't entered the body yet
      continue;
    }

    // While inside the contract block, skip taint scanning
    if (outsideContractBlockActive) continue;

    // Detect taint sources (only when we're inside the actual body)
    const unsafeMatch = line.match(/^\s*unsafe\s+let\s+(\w+)/);
    if (unsafeMatch?.[1]) {
      taintSources.push(`unsafe let ${unsafeMatch[1]}`);
    }

    const sourceFromMatch = line.match(/\bsource_from\s+(\w+)/);
    if (sourceFromMatch?.[1]) {
      taintSources.push(`source_from: ${sourceFromMatch[1]}`);
    }

    // Exit when we've closed back to the flow's opening depth
    if (seenOpenBrace && braceDepth <= flowBraceDepth) {
      break;
    }
  }

  return taintSources;
}

// ---------------------------------------------------------------------------
// Contract extraction
// ---------------------------------------------------------------------------

interface ContractData {
  intent?: string;
  effects: string[];
  authority: string[];
  economicsHints: string[];
  hasSecrets: boolean;
  hasEpilogue: boolean;
}

function extractContract(flowNode: AstNode, source: string, flowName: string): ContractData {
  const result: ContractData = {
    effects: [],
    authority: [],
    economicsHints: [],
    hasSecrets: false,
    hasEpilogue: false,
  };

  // Find contractDecl in the flow's children
  const contractNode = findFirstChildOfKind(flowNode, "contractDecl");
  if (!contractNode?.children) return result;

  for (const child of contractNode.children) {
    // ---- Intent ----
    // The AST intentDecl node has `value` set for inline form: intent "text"
    // For braced form: intent { "text" }, value is "". We handle both.
    if (child.kind === "intentDecl") {
      if (child.value) {
        result.intent = child.value.replace(/^"|"$/g, "").trim();
      }
      // intentDecl with empty value means braced form — fall through to source scan below
      continue;
    }

    // ---- Effects block ----
    // Parser stores effects as: identifier { kind:"identifier", value:"effects:block",
    //   children: [ { value:"effect:database.read" }, ... ] }
    // OR as effectsDecl node. Handle both.
    if (child.kind === "effectsDecl") {
      if (child.value) {
        result.effects.push(...child.value.split(",").map(s => s.trim()).filter(Boolean));
      }
      if (child.children) {
        for (const e of child.children) {
          const v = e.value?.replace(/^effect:/, "").trim();
          if (v && !result.effects.includes(v)) result.effects.push(v);
        }
      }
      continue;
    }

    if (child.kind === "identifier" && child.value === "effects:block") {
      if (child.children) {
        for (const e of child.children) {
          const v = e.value?.replace(/^effect:/, "").trim();
          if (v && !result.effects.includes(v)) result.effects.push(v);
        }
      }
      continue;
    }

    // ---- Authority block ----
    if (child.kind === "authorityDecl") {
      result.authority.push(child.value ?? "authority");
      continue;
    }

    // ---- Economics sub-block ----
    if (child.kind === "identifier" && (child.value?.startsWith("economics") || child.value?.includes("economics"))) {
      if (child.children) {
        for (const ec of child.children) {
          if (ec.value) result.economicsHints.push(ec.value.replace(/^"/, "").replace(/"$/, ""));
        }
      } else if (child.value) {
        result.economicsHints.push(child.value);
      }
      continue;
    }

    // ---- Secrets / epilogue flags ----
    // Since RD-0103 (#110) the parser retains the secrets block as a dedicated
    // node `{ kind: "secretsBlock", ... }` (braced form has no value; the
    // no-brace form carries value "secrets:"). Epilogue still comes through
    // parseContractSubBlock as `{ kind: "identifier", value: "epilogue:block" }`.
    if (child.kind === "secretsBlock") { result.hasSecrets = true; continue; }
    if (child.kind === "identifier") {
      const v = child.value ?? "";
      if (v.startsWith("secrets") || v === "secrets:block") { result.hasSecrets = true; continue; }
      if (v.startsWith("epilogue") || v === "epilogue:block") { result.hasEpilogue = true; continue; }
    }
  }

  // ---- Source text fallback for intent ----
  // When intent { "..." } (braced form) produces intentDecl with value="",
  // extract it from the source text directly.
  if (!result.intent) {
    const fromSource = extractIntentFromSource(source, flowName);
    if (fromSource !== undefined) {
      result.intent = fromSource;
    }
  }

  return result;
}

/**
 * Extract intent string from source text as fallback for braced form:
 *   intent { "text" }  or  intent { "multi" "line" }
 */
function extractIntentFromSource(source: string, flowName: string): string | undefined {
  // Find the flow declaration
  const flowRe = new RegExp(`(?:secure|pure|guarded)?\\s*flow\\s+${escapeRe(flowName)}\\s*[\\(\\[]`, "m");
  const flowMatch = flowRe.exec(source);
  if (!flowMatch) return undefined;

  // Look for intent block after flow start, up to the end of the contract block
  const afterFlow = source.slice(flowMatch.index);

  // Match: intent { "text" } or intent "text" or intent { "line1" \n "line2" }
  const intentRe = /\bintent\s*\{([^}]*)\}|\bintent\s+"([^"]+)"/;
  const intentMatch = intentRe.exec(afterFlow);
  if (!intentMatch) return undefined;

  if (intentMatch[2]) {
    // Inline form: intent "text"
    return intentMatch[2].trim();
  }

  if (intentMatch[1]) {
    // Braced form: extract all quoted strings
    const inner = intentMatch[1];
    const strings: string[] = [];
    const strRe = /"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = strRe.exec(inner)) !== null) {
      if (m[1]) strings.push(m[1]);
    }
    return strings.join(" ").trim() || undefined;
  }

  return undefined;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Parameter extraction from FlowMeta + AST
// ---------------------------------------------------------------------------

function extractParams(flowNode: AstNode, meta: FlowMeta): Array<{ name: string; type: string }> {
  // Try to get richer param info from AST paramDecl nodes.
  // paramDecl.value = "name: Type" (combined), typeRef child has just the type.
  const paramNodes = findChildrenOfKind(flowNode, "paramDecl");
  if (paramNodes.length > 0) {
    return paramNodes.map(p => {
      const typeRef = findFirstChildOfKind(p, "typeRef");
      const rawValue = p.value ?? "?";
      // rawValue is "name: Type" — split on first colon
      const colonIdx = rawValue.indexOf(":");
      const name = colonIdx >= 0 ? rawValue.slice(0, colonIdx).trim() : rawValue.trim();
      const type = typeRef?.value ?? (colonIdx >= 0 ? rawValue.slice(colonIdx + 1).trim() : "?");
      return { name, type };
    });
  }

  // Fall back to meta.params (same "name: Type" format)
  return meta.params.map(p => {
    const colonIdx = p.indexOf(":");
    if (colonIdx >= 0) {
      return { name: p.slice(0, colonIdx).trim(), type: p.slice(colonIdx + 1).trim() };
    }
    return { name: p, type: "?" };
  });
}

// ---------------------------------------------------------------------------
// Governance code inference
// ---------------------------------------------------------------------------

function inferGovernanceCodes(
  qualifier: string,
  contract: ContractData,
  source: string,
  flowName: string,
): string[] {
  const codes: string[] = [];

  // GOV-010: secure flow without intent
  if ((qualifier === "secure" || qualifier === "guarded") && !contract.intent) {
    codes.push("SPORE-GOV-010");
  }

  // Effect-based codes
  for (const effect of contract.effects) {
    for (const known of KNOWN_GOV_CODES) {
      if (known.pattern.test(effect) && !codes.includes(known.code)) {
        // These are architectural context codes, not errors — only include relevant ones
      }
    }
  }

  // Check for potential taint issues
  if (contract.effects.includes("database.read") || contract.effects.includes("database.write")) {
    codes.push("GOV-DB-SINK");
  }
  if (contract.effects.some(e => e.startsWith("audit"))) {
    codes.push("GOV-AUDIT-REQUIRED");
  }

  return codes;
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Flow node finder
// ---------------------------------------------------------------------------

function findFlowNode(ast: AstNode, flowName: string): AstNode | undefined {
  if (!ast.children) return undefined;
  const flowKinds = new Set(["flowDecl", "secureFlowDecl", "pureFlowDecl", "guardedFlowDecl", "fnDecl"]);
  for (const child of ast.children) {
    if (flowKinds.has(child.kind) && child.value === flowName) {
      return child;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Single flow receipt generation
// ---------------------------------------------------------------------------

function generateFlowReceipt(
  source: string,
  meta: FlowMeta,
  ast: AstNode,
  fileName: string,
  generatedAt: string,
): FlowContextReceipt {
  const flowNode = findFlowNode(ast, meta.name);

  // Extract contract data from AST
  const contract = flowNode ? extractContract(flowNode, source, meta.name) : {
    effects: [...meta.declaredEffects],
    authority: [],
    economicsHints: [],
    hasSecrets: false,
    hasEpilogue: false,
  };

  // If effects is empty, fall back to meta.declaredEffects
  if (contract.effects.length === 0 && meta.declaredEffects.length > 0) {
    contract.effects.push(...meta.declaredEffects);
  }

  // Extract params
  const params = flowNode
    ? extractParams(flowNode, meta)
    : meta.params.map(p => {
        const ci = p.indexOf(":");
        return ci >= 0
          ? { name: p.slice(0, ci).trim(), type: p.slice(ci + 1).trim() }
          : { name: p, type: "?" };
      });

  // Taint sources from source text (body scan)
  const taintSources = extractTaintSourcesFromSource(source, meta.name);

  // Sink classification from effects
  const sinkTypes = classifySinks(contract.effects);

  // Callee extraction from body node
  const callees: string[] = [];
  if (flowNode?.children) {
    // body is typically the last child (block node)
    const children = flowNode.children as AstNode[];
    const bodyNode = children.slice().reverse().find((c: AstNode) => c.kind === "block");
    if (bodyNode) {
      callees.push(...collectCallees(bodyNode));
    }
  }

  // Governance codes
  const governanceCodes = inferGovernanceCodes(meta.qualifier, contract, source, meta.name);

  // Token estimates
  const fullSourceTokens = estimateTokens(source);

  // Build receipt object (without tokenEstimate yet)
  const contractBlock: FlowContextReceipt["contract"] = contract.intent !== undefined
    ? {
        intent: contract.intent,
        effects: contract.effects,
        authority: contract.authority,
        economicsHints: contract.economicsHints,
        hasSecrets: contract.hasSecrets,
        hasEpilogue: contract.hasEpilogue,
      }
    : {
        effects: contract.effects,
        authority: contract.authority,
        economicsHints: contract.economicsHints,
        hasSecrets: contract.hasSecrets,
        hasEpilogue: contract.hasEpilogue,
      };

  const partialReceipt = {
    flowName: meta.name,
    qualifier: meta.qualifier,
    params,
    returnType: meta.returnType,
    contract: contractBlock,
    governance: {
      taintSources,
      sinkTypes,
      governanceCodes,
    },
    callees,
    sourceFile: fileName,
    generatedAt,
  };

  const receiptTokens = estimateTokens(JSON.stringify(partialReceipt));
  const reductionPct = fullSourceTokens > 0
    ? Math.round(((fullSourceTokens - receiptTokens) / fullSourceTokens) * 100)
    : 0;

  return {
    ...partialReceipt,
    tokenEstimate: {
      fullSourceTokens,
      receiptTokens,
      reductionPct,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate Context Receipts for all flows in a .spore source file.
 *
 * Receipts omit the function body, preserving only:
 *   - signature, contract metadata, governance summary, call structure
 *
 * @param source  - Galerina source text (.spore file content)
 * @param options - Optional filter / file name override
 */
export function generateReceipts(
  source: string,
  options: ReceiptOptions = {},
): FileContextReceipts {
  const fileName = options.fileName ?? "source.spore";
  const generatedAt = new Date().toISOString();

  const parsed: ParseResult = parseProgram(source, fileName);
  const ast = parsed.ast;

  let flows = parsed.flows;
  if (options.flowFilter) {
    flows = flows.filter(f => f.name === options.flowFilter);
  }

  const receipts: FlowContextReceipt[] = flows.map(meta =>
    generateFlowReceipt(source, meta, ast, fileName, generatedAt),
  );

  const totalFullSourceTokens = estimateTokens(source);
  const totalReceiptTokens = receipts.reduce((sum, r) => sum + r.tokenEstimate.receiptTokens, 0);
  const overallReductionPct = totalFullSourceTokens > 0
    ? Math.round(((totalFullSourceTokens - totalReceiptTokens) / totalFullSourceTokens) * 100)
    : 0;

  return {
    schemaVersion: "spore.context-receipt.v1",
    sourceFile: fileName,
    flowCount: receipts.length,
    receipts,
    totalFullSourceTokens,
    totalReceiptTokens,
    overallReductionPct,
    generatedAt,
  };
}

/**
 * Generate a Context Receipt for a single named flow.
 * Returns undefined if the flow is not found.
 */
export function generateFlowReceiptByName(
  source: string,
  flowName: string,
  fileName?: string,
): FlowContextReceipt | undefined {
  const opts: ReceiptOptions = fileName !== undefined
    ? { flowFilter: flowName, fileName }
    : { flowFilter: flowName };
  const result = generateReceipts(source, opts);
  return result.receipts[0];
}

export type { ReceiptOptions };
