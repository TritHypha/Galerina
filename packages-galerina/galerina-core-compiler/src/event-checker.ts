// =============================================================================
// Galerina Phase 9B — Event Checker
//
// Checks that events are declared before use (FUNGI-EVENT-001) and that
// declared events are emitted at least once (FUNGI-EVENT-002).
//
// Phase 9B+ additions:
//   FUNGI-EVENT-003: contract.events lists "emits X" but no global "event X" exists
//   FUNGI-EVENT-004: same event emitted more than once in a single flow body
//   FUNGI-EVENT-005: emit X in flow body but X not listed in contract.events
//
// Entry point: checkEvents(ast)
// =============================================================================

import { type AstNode, type SourceLocation } from "./parser.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EventDiagnostic {
  readonly code: string;
  readonly name: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly location?: SourceLocation;
  readonly suggestedFix?: string;
}

export interface EventCheckResult {
  readonly diagnostics: readonly EventDiagnostic[];
}

// ---------------------------------------------------------------------------
// Diagnostic constants
// ---------------------------------------------------------------------------

export const FUNGI_EVENT_001 = {
  code: "FUNGI-EVENT-001",
  name: "EventNotDeclared",
  severity: "error" as const,
  message: "Event emitted but not declared at program scope. Add a top-level 'event EventName' declaration.",
};

export const FUNGI_EVENT_002 = {
  code: "FUNGI-EVENT-002",
  name: "EventNeverEmitted",
  severity: "warning" as const,
  message: "Event declared but never emitted anywhere in the program.",
};

export const FUNGI_EVENT_003 = {
  code: "FUNGI-EVENT-003",
  name: "ContractEmitsUndeclaredEvent",
  severity: "error" as const,
  message: "Contract declares 'emits X' but no global 'event X' declaration exists. Declare the event at program scope.",
};

export const FUNGI_EVENT_004 = {
  code: "FUNGI-EVENT-004",
  name: "DuplicateEventEmission",
  severity: "warning" as const,
  message: "Event is emitted more than once in this flow. Consider whether this is intentional.",
};

export const FUNGI_EVENT_005 = {
  code: "FUNGI-EVENT-005",
  name: "EventEmittedNotInContract",
  severity: "warning" as const,
  message: "Event is emitted but not declared in contract.events. Add the event to the contract.events block.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All flow declaration kinds in the AST. */
const FLOW_DECL_KINDS = new Set([
  "flowDecl",
  "secureFlowDecl",
  "pureFlowDecl",
  "guardedFlowDecl",
  "fnDecl",
]);

/**
 * Collect all `emits:X` identifiers from a contractDecl node's events
 * sub-block (or directly from contractDecl children for flat-style contracts).
 */
function collectContractEmits(contractNode: AstNode): string[] {
  const names: string[] = [];
  for (const child of contractNode.children ?? []) {
    // Flat style: child is identifier with value "emits:X"
    if (child.kind === "identifier" && child.value?.startsWith("emits:")) {
      const name = child.value.slice("emits:".length);
      if (name !== "") names.push(name);
    }
    // Sub-block style: child is identifier with value "events:block" or "events:"
    // and its children are "emits:X" identifiers
    if (
      child.kind === "identifier" &&
      typeof child.value === "string" &&
      (child.value === "events:block" || child.value === "events:")
    ) {
      for (const grandchild of child.children ?? []) {
        if (grandchild.kind === "identifier" && grandchild.value?.startsWith("emits:")) {
          const name = grandchild.value.slice("emits:".length);
          if (name !== "") names.push(name);
        }
      }
    }
  }
  return names;
}

/**
 * Collect all `emit:X` identifiers directly in a flow body (block node),
 * but NOT inside nested flow declarations. This prevents double-counting
 * emits in nested fns.
 */
function collectBodyEmits(
  bodyNode: AstNode,
): Array<{ name: string; location: SourceLocation | undefined }> {
  const results: Array<{ name: string; location: SourceLocation | undefined }> = [];

  function walkBody(node: AstNode, depth: number): void {
    // Skip nested flow declarations (they are their own scope)
    if (depth > 0 && FLOW_DECL_KINDS.has(node.kind)) {
      return;
    }
    if (node.kind === "identifier" && node.value?.startsWith("emit:")) {
      const name = node.value.slice("emit:".length);
      if (name !== "") {
        results.push({ name, location: node.location });
      }
    }
    for (const child of node.children ?? []) {
      walkBody(child, depth + 1);
    }
  }

  walkBody(bodyNode, 0);
  return results;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Walks the AST to collect declared events and emitted events, then checks
 * for mismatches.
 *
 * - FUNGI-EVENT-001: `emit X` in a flow body with no top-level `event X` declaration
 * - FUNGI-EVENT-002: `event X` declared globally but never emitted anywhere
 * - FUNGI-EVENT-003: contract.events lists "emits X" but no global "event X" exists
 * - FUNGI-EVENT-004: same event emitted twice in a single flow without a match arm
 * - FUNGI-EVENT-005: emit X in a flow body but X not listed in contract.events
 */
export function checkEvents(ast: AstNode): EventCheckResult {
  const diagnostics: EventDiagnostic[] = [];

  // ── Step 1: Collect globally declared event names ────────────────────────
  const declaredEvents = new Set<string>();
  for (const child of ast.children ?? []) {
    if (child.kind === "intentDecl" && child.value?.startsWith("event:")) {
      const name = child.value.slice("event:".length);
      if (name !== "") declaredEvents.add(name);
    }
  }

  // ── Step 2: Walk the entire AST to collect all emitted events ────────────
  // (used for FUNGI-EVENT-001 and FUNGI-EVENT-002)
  const allEmittedEvents: Array<{ name: string; location: SourceLocation | undefined }> = [];

  function walk(node: AstNode): void {
    if (node.kind === "identifier" && node.value?.startsWith("emit:")) {
      const name = node.value.slice("emit:".length);
      if (name !== "") {
        allEmittedEvents.push({ name, location: node.location });
      }
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  }
  walk(ast);

  // ── Step 3: FUNGI-EVENT-001 — emitted name not globally declared ───────────
  for (const { name, location } of allEmittedEvents) {
    if (!declaredEvents.has(name)) {
      diagnostics.push({
        code: FUNGI_EVENT_001.code,
        name: FUNGI_EVENT_001.name,
        severity: FUNGI_EVENT_001.severity,
        message: `Event '${name}' is emitted but not declared. Add: event ${name}`,
        ...(location !== undefined ? { location } : {}),
        suggestedFix: `Add at program scope: event ${name}`,
      });
    }
  }

  // ── Step 4: FUNGI-EVENT-002 — globally declared name never emitted ─────────
  const allEmittedNames = new Set(allEmittedEvents.map((e) => e.name));
  for (const name of declaredEvents) {
    if (!allEmittedNames.has(name)) {
      diagnostics.push({
        code: FUNGI_EVENT_002.code,
        name: FUNGI_EVENT_002.name,
        severity: FUNGI_EVENT_002.severity,
        message: `Event '${name}' is declared but never emitted.`,
        suggestedFix: `Emit the event in a flow: emit ${name}`,
      });
    }
  }

  // ── Step 5: Per-flow checks (FUNGI-EVENT-003, 004, 005) ────────────────────
  for (const topLevelNode of ast.children ?? []) {
    if (!FLOW_DECL_KINDS.has(topLevelNode.kind)) continue;

    const flowChildren = topLevelNode.children ?? [];

    // Collect contract.events emits for this flow
    const contractEmitNames = new Set<string>();
    for (const child of flowChildren) {
      if (child.kind === "contractDecl") {
        for (const name of collectContractEmits(child)) {
          contractEmitNames.add(name);
        }
      }
    }

    // FUNGI-EVENT-003: contract lists emits X but no global event X
    for (const name of contractEmitNames) {
      if (!declaredEvents.has(name)) {
        diagnostics.push({
          code: FUNGI_EVENT_003.code,
          name: FUNGI_EVENT_003.name,
          severity: FUNGI_EVENT_003.severity,
          message: `Contract declares 'emits ${name}' but no global 'event ${name}' declaration exists. Declare the event at program scope.`,
          suggestedFix: `Add at program scope: event ${name}`,
        });
      }
    }

    // Find the flow body (block node — last child or first block-kind child)
    const bodyNode = flowChildren.find((c) => c.kind === "block"); // perf-allow: loop-array-find — bounded N over a flow's children (find body block)
    if (bodyNode === undefined) continue;

    // Collect emits directly in this flow body (not nested flows)
    const bodyEmits = collectBodyEmits(bodyNode);

    // FUNGI-EVENT-004: same event emitted more than once in a single flow body
    const seenInBody = new Map<string, number>();
    for (const { name } of bodyEmits) {
      seenInBody.set(name, (seenInBody.get(name) ?? 0) + 1);
    }
    for (const [name, count] of seenInBody) {
      if (count > 1) {
        diagnostics.push({
          code: FUNGI_EVENT_004.code,
          name: FUNGI_EVENT_004.name,
          severity: FUNGI_EVENT_004.severity,
          message: `Event '${name}' is emitted more than once in this flow. Consider whether this is intentional.`,
          suggestedFix: `Review the flow logic; if separate arms need to emit '${name}', use a match expression to separate the branches.`,
        });
      }
    }

    // FUNGI-EVENT-005: emit X in body but X not listed in contract.events
    // Only applies when the flow has a contract.events block at all.
    if (contractEmitNames.size > 0) {
      const reported005 = new Set<string>();
      for (const { name, location } of bodyEmits) {
        if (!contractEmitNames.has(name) && !reported005.has(name)) {
          reported005.add(name);
          diagnostics.push({
            code: FUNGI_EVENT_005.code,
            name: FUNGI_EVENT_005.name,
            severity: FUNGI_EVENT_005.severity,
            message: `Event '${name}' is emitted but not declared in contract.events. Add 'emits ${name}' to the contract.events block.`,
            ...(location !== undefined ? { location } : {}),
            suggestedFix: `Add to contract.events block: emits ${name}`,
          });
        }
      }
    }
  }

  return { diagnostics };
}
