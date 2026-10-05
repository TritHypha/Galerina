// Agent declaration syntax and the compiler-facing contract.
//
// This module defines the canonical `agent Name { ... }` source form and the
// AgentDeclarationNode a compiler front end produces for it, plus a reference
// parser and the lowering into AgentDefinition. core-compiler grammar wiring is
// not part of this module: a compiler hands its parsed node to
// lowerAgentDeclaration, which applies the same checks as validateAgentDefinition.
//
// Zero-trust defaults (Grok Bot 2026-10-05, standing permission; owner may revisit):
// - input, output and limits { timeout, memory, max_tool_calls } are required.
// - Tools not listed are denied. An allow scope must be an exact relative scope:
//   no wildcards, absolute paths, drive letters or `..` segments.
// - failure defaults to fail_group, the most conservative behaviour.
// - Unknown or duplicate clauses and limit keys are refused. The docs/MULTI_AGENT_RUNTIME
//   form's `model`, `visibility` and `deny [...]` clauses are not admitted in v1.
// - A declaration with any error is left out of the result (fail closed).
// - Diagnostics carry line numbers and codes only; source text is never echoed.
//
// Canonical form:
//
//   agent DocumentationAgent {
//     input ProjectReviewRequest
//     output AgentResult
//     tools {
//       repo.read allow "./src"
//       security.scan allow
//       shell deny
//     }
//     effects [filesystem_read]
//     permissions [project.read]
//     failure return_typed_error
//     limits {
//       timeout 30s
//       memory 128mb
//       max_tool_calls 50
//       max_tokens 12000
//       rate_limit_per_minute 60
//     }
//   }

import {
  validateAgentDefinition,
  type AgentDefinition,
  type AgentDiagnostic,
  type AgentFailureBehaviour,
  type AgentLimits,
  type AgentToolPermission,
} from "./index.js";

export const AGENT_DECLARATION_SCHEMA = "galerina.ai-agent.declaration.v1";
export const MAX_AGENT_SOURCE_BYTES = 65_536;
export const MAX_AGENT_DECLARATIONS = 64;
export const MAX_AGENT_TOOLS = 128;
export const MAX_AGENT_LINE_LENGTH = 1_024;

export interface AgentSourceSpan {
  /** 1-based line of `agent Name {`. */
  readonly line: number;
  /** 1-based line of the closing `}`. */
  readonly endLine: number;
}

/** The node a compiler front end emits for one `agent` declaration. */
export interface AgentDeclarationNode {
  readonly kind: "AgentDeclaration";
  readonly schema: typeof AGENT_DECLARATION_SCHEMA;
  readonly name: string;
  readonly span: AgentSourceSpan;
  readonly inputType: string;
  readonly outputType: string;
  readonly tools: readonly AgentToolPermission[];
  readonly effects: readonly string[];
  readonly permissions: readonly string[];
  readonly limits: AgentLimits;
  readonly failureBehaviour: AgentFailureBehaviour;
}

export interface AgentDeclarationParseResult {
  readonly declarations: readonly AgentDeclarationNode[];
  readonly diagnostics: readonly AgentDiagnostic[];
}

export interface AgentDeclarationLowering {
  /** Present only when the node lowers without an error diagnostic. */
  readonly definition?: AgentDefinition;
  readonly diagnostics: readonly AgentDiagnostic[];
}

const TYPE_NAME = /^[A-Z][A-Za-z0-9_]{0,63}$/;
const TOOL_NAME = /^[a-z][a-z0-9_]{0,31}(?:\.[a-z][a-z0-9_]{0,31}){0,3}$/;
const LIST_ITEM = TOOL_NAME;
const FAILURE_BEHAVIOURS: readonly AgentFailureBehaviour[] = Object.freeze([
  "fail_group",
  "return_typed_error",
  "cancel_dependents",
  "continue_with_warning",
]);
const TIME_UNITS: Readonly<Record<string, number>> = Object.freeze({ ms: 1, s: 1_000, m: 60_000 });
const SIZE_UNITS: Readonly<Record<string, number>> = Object.freeze({ kb: 1_024, mb: 1_048_576, gb: 1_073_741_824 });
const LIMIT_KEYS = ["timeout", "memory", "max_tool_calls", "max_tokens", "rate_limit_per_minute"] as const;
type LimitKey = (typeof LIMIT_KEYS)[number];

function diag(code: string, message: string, line: number): AgentDiagnostic {
  return Object.freeze({ code, severity: "error" as const, message, path: `line:${line}` });
}

/** Remove a trailing `//` comment that is not inside a double-quoted string. */
function stripComment(text: string): string {
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === "\"") quoted = !quoted;
    else if (!quoted && ch === "/" && text[index + 1] === "/") return text.slice(0, index);
  }
  return text;
}

function isSafeScope(scope: string): boolean {
  if (scope.length === 0 || scope.length > 256) return false;
  if (/[\u0000-\u001f\u007f*?]/.test(scope)) return false;
  const normal = scope.replace(/\\/g, "/");
  if (normal.startsWith("/") || /^[A-Za-z]:/.test(normal) || normal.includes("://")) return false;
  return !normal.split("/").some((part) => part === "..");
}

function parseQuantity(text: string, units: Readonly<Record<string, number>>, unitRequired: boolean): number | undefined {
  const match = /^([0-9]{1,12})([a-z]{0,2})$/.exec(text);
  if (match === null) return undefined;
  const amount = Number(match[1]);
  const unit = match[2] ?? "";
  if (unit === "") return unitRequired ? undefined : amount;
  const factor = units[unit];
  if (factor === undefined) return undefined;
  const value = amount * factor;
  return Number.isSafeInteger(value) ? value : undefined;
}

/**
 * Parse the rows of an `effects [...]` / `permissions [...]` list. The first row is
 * the text after `[`; the last row holds `]` with nothing after it. Each row is a
 * comma-separated run of names, and a row may end with one trailing comma.
 */
function parseListRows(rows: readonly string[]): readonly string[] | undefined {
  const last = rows.at(-1) ?? "";
  const close = last.indexOf("]");
  if (close < 0 || last.slice(close + 1).trim() !== "") return undefined;
  const bodies = [...rows.slice(0, -1), last.slice(0, close)];
  const items: string[] = [];
  for (const body of bodies) {
    let row = body.trim();
    if (row.length === 0) continue;
    if (row.endsWith(",")) row = row.slice(0, -1);
    for (const item of row.split(",").map((part) => part.trim())) {
      if (!LIST_ITEM.test(item)) return undefined;
      items.push(item);
    }
  }
  return new Set(items).size === items.length ? items : undefined;
}

interface Draft {
  readonly name: string;
  readonly line: number;
  inputType?: string;
  outputType?: string;
  failureBehaviour?: AgentFailureBehaviour;
  effects?: readonly string[];
  permissions?: readonly string[];
  tools?: AgentToolPermission[];
  limits?: Partial<Record<LimitKey, number>>;
  failed: boolean;
}

/**
 * Reference parser for agent declaration source. Returns only declarations that
 * parsed and lowered without an error; everything else is a diagnostic.
 */
export function parseAgentDeclarations(source: string): AgentDeclarationParseResult {
  const diagnostics: AgentDiagnostic[] = [];
  const declarations: AgentDeclarationNode[] = [];

  if (new TextEncoder().encode(source).length > MAX_AGENT_SOURCE_BYTES) {
    return {
      declarations: [],
      diagnostics: [diag("Galerina_AGENT_DECL_LIMIT_EXCEEDED", `Agent source exceeds ${MAX_AGENT_SOURCE_BYTES} bytes.`, 0)],
    };
  }

  const lines = source.split(/\r?\n/);
  const names = new Set<string>();
  let index = 0;
  let blocks = 0;

  const next = (): { text: string; line: number } | undefined => {
    while (index < lines.length) {
      const line = index + 1;
      const raw = lines[index] ?? "";
      index += 1;
      if (raw.length > MAX_AGENT_LINE_LENGTH) return { text: "\u0000too-long", line };
      const text = stripComment(raw).trim();
      if (text.length > 0) return { text, line };
    }
    return undefined;
  };

  for (let current = next(); current !== undefined; current = next()) {
    const header = /^agent\s+(\S+)\s*\{$/.exec(current.text);
    if (header === null) {
      diagnostics.push(diag("Galerina_AGENT_DECL_SYNTAX_INVALID", `Line ${current.line} is not an agent declaration.`, current.line));
      continue;
    }
    blocks += 1;
    if (blocks > MAX_AGENT_DECLARATIONS) {
      diagnostics.push(diag("Galerina_AGENT_DECL_LIMIT_EXCEEDED", `At most ${MAX_AGENT_DECLARATIONS} agent declarations are allowed.`, current.line));
      break;
    }
    const name = header[1] ?? "";
    const draft: Draft = { name, line: current.line, failed: false };
    const fail = (code: string, message: string, line: number): void => {
      draft.failed = true;
      diagnostics.push(diag(code, message, line));
    };
    if (!TYPE_NAME.test(name)) fail("Galerina_AGENT_DECL_NAME_INVALID", `Agent name on line ${current.line} must be an UpperCamel identifier.`, current.line);
    else if (names.has(name)) fail("Galerina_AGENT_DECL_NAME_DUPLICATE", `Agent on line ${current.line} reuses an earlier agent name.`, current.line);
    names.add(name);

    let endLine: number | undefined;
    const seen = new Set<string>();
    const once = (clause: string, line: number): boolean => {
      if (seen.has(clause)) {
        fail("Galerina_AGENT_DECL_CLAUSE_DUPLICATE", `Clause on line ${line} is declared more than once.`, line);
        return false;
      }
      seen.add(clause);
      return true;
    };

    for (let entry = next(); entry !== undefined; entry = next()) {
      const { text, line } = entry;
      if (text === "}") {
        endLine = line;
        break;
      }
      if (text === "\u0000too-long") {
        fail("Galerina_AGENT_DECL_LIMIT_EXCEEDED", `Line ${line} exceeds ${MAX_AGENT_LINE_LENGTH} characters.`, line);
        continue;
      }
      const typed = /^(input|output)\s+(\S+)$/.exec(text);
      if (typed !== null) {
        const clause = typed[1] as "input" | "output";
        const value = typed[2] ?? "";
        if (!once(clause, line)) continue;
        if (!TYPE_NAME.test(value)) {
          fail("Galerina_AGENT_DECL_TYPE_INVALID", `The ${clause} type on line ${line} must be an UpperCamel type name.`, line);
          continue;
        }
        if (clause === "input") draft.inputType = value;
        else draft.outputType = value;
        continue;
      }
      const failure = /^failure\s+(\S+)$/.exec(text);
      if (failure !== null) {
        if (!once("failure", line)) continue;
        const value = failure[1] as AgentFailureBehaviour;
        if (!FAILURE_BEHAVIOURS.includes(value)) {
          fail("Galerina_AGENT_DECL_FAILURE_INVALID", `Failure behaviour on line ${line} must be one of: ${FAILURE_BEHAVIOURS.join(", ")}.`, line);
          continue;
        }
        draft.failureBehaviour = value;
        continue;
      }
      const list = /^(effects|permissions)\s*\[(.*)$/.exec(text);
      if (list !== null) {
        const clause = list[1] as "effects" | "permissions";
        const rows: string[] = [list[2] ?? ""];
        while (!(rows.at(-1) ?? "").includes("]")) {
          const more = next();
          if (more === undefined) break;
          rows.push(more.text);
        }
        if (!once(clause, line)) continue;
        const items = parseListRows(rows);
        if (items === undefined) {
          fail("Galerina_AGENT_DECL_LIST_INVALID", `The ${clause} list starting on line ${line} must be [a, b.c] with unique lower-case names.`, line);
          continue;
        }
        if (clause === "effects") draft.effects = Object.freeze([...items]);
        else draft.permissions = Object.freeze([...items]);
        continue;
      }
      if (/^tools\s*\{$/.test(text)) {
        if (!once("tools", line)) continue;
        const tools: AgentToolPermission[] = [];
        let toolsClosed = false;
        for (let toolEntry = next(); toolEntry !== undefined; toolEntry = next()) {
          if (toolEntry.text === "}") {
            toolsClosed = true;
            break;
          }
          const tool = /^(\S+)\s+(allow|deny)(?:\s+"([^"]*)")?$/.exec(toolEntry.text);
          if (tool === null || !TOOL_NAME.test(tool[1] ?? "")) {
            fail("Galerina_AGENT_DECL_TOOL_INVALID", `Tool line ${toolEntry.line} must be: tool.name allow "scope" | tool.name allow | tool.name deny.`, toolEntry.line);
            continue;
          }
          const decision = tool[2] as "allow" | "deny";
          const scope = tool[3];
          if (scope !== undefined && (decision === "deny" || !isSafeScope(scope))) {
            fail("Galerina_AGENT_DECL_TOOL_SCOPE_INVALID", `Tool scope on line ${toolEntry.line} must be an exact relative scope on an allow (no wildcard, absolute path or "..").`, toolEntry.line);
            continue;
          }
          if (tools.length >= MAX_AGENT_TOOLS) {
            fail("Galerina_AGENT_DECL_LIMIT_EXCEEDED", `At most ${MAX_AGENT_TOOLS} tool lines are allowed per agent.`, toolEntry.line);
            break;
          }
          tools.push(Object.freeze({ tool: tool[1] ?? "", decision, ...(scope === undefined ? {} : { scope }) }));
        }
        if (!toolsClosed) fail("Galerina_AGENT_DECL_UNTERMINATED", `The tools block on line ${line} is not closed.`, line);
        draft.tools = tools;
        continue;
      }
      if (/^limits\s*\{$/.test(text)) {
        if (!once("limits", line)) continue;
        const limits: Partial<Record<LimitKey, number>> = {};
        let limitsClosed = false;
        for (let limitEntry = next(); limitEntry !== undefined; limitEntry = next()) {
          if (limitEntry.text === "}") {
            limitsClosed = true;
            break;
          }
          const limit = /^([a-z_]+)\s+(\S+)$/.exec(limitEntry.text);
          const key = limit?.[1] as LimitKey | undefined;
          if (limit === null || key === undefined || !(LIMIT_KEYS as readonly string[]).includes(key)) {
            fail("Galerina_AGENT_DECL_LIMIT_UNKNOWN", `Limit on line ${limitEntry.line} must be one of: ${LIMIT_KEYS.join(", ")}.`, limitEntry.line);
            continue;
          }
          if (limits[key] !== undefined) {
            fail("Galerina_AGENT_DECL_CLAUSE_DUPLICATE", `Limit on line ${limitEntry.line} is declared more than once.`, limitEntry.line);
            continue;
          }
          const raw = limit[2] ?? "";
          const value = key === "timeout"
            ? parseQuantity(raw, TIME_UNITS, true)
            : key === "memory"
              ? parseQuantity(raw, SIZE_UNITS, true)
              : parseQuantity(raw, {}, false);
          if (value === undefined || value <= 0) {
            fail("Galerina_AGENT_DECL_LIMIT_INVALID", `Limit on line ${limitEntry.line} needs a positive whole number${key === "timeout" ? " with ms, s or m" : key === "memory" ? " with kb, mb or gb" : ""}.`, limitEntry.line);
            continue;
          }
          limits[key] = value;
        }
        if (!limitsClosed) fail("Galerina_AGENT_DECL_UNTERMINATED", `The limits block on line ${line} is not closed.`, line);
        draft.limits = limits;
        continue;
      }
      fail("Galerina_AGENT_DECL_CLAUSE_UNKNOWN", `Line ${line} is not an admitted agent clause (input, output, tools, effects, permissions, failure, limits).`, line);
    }

    if (endLine === undefined) {
      fail("Galerina_AGENT_DECL_UNTERMINATED", `Agent declared on line ${draft.line} is not closed.`, draft.line);
      continue;
    }
    for (const clause of ["input", "output", "limits"] as const) {
      if (!seen.has(clause)) fail("Galerina_AGENT_DECL_CLAUSE_REQUIRED", `Agent on line ${draft.line} must declare ${clause}.`, draft.line);
    }
    const limits = draft.limits ?? {};
    for (const key of ["timeout", "memory", "max_tool_calls"] as const) {
      if (draft.limits !== undefined && limits[key] === undefined) {
        fail("Galerina_AGENT_DECL_CLAUSE_REQUIRED", `Agent on line ${draft.line} must set limits.${key}.`, draft.line);
      }
    }
    if (draft.failed) continue;

    const node: AgentDeclarationNode = Object.freeze({
      kind: "AgentDeclaration",
      schema: AGENT_DECLARATION_SCHEMA,
      name: draft.name,
      span: Object.freeze({ line: draft.line, endLine }),
      inputType: draft.inputType ?? "",
      outputType: draft.outputType ?? "",
      tools: Object.freeze([...(draft.tools ?? [])]),
      effects: draft.effects ?? Object.freeze([]),
      permissions: draft.permissions ?? Object.freeze([]),
      limits: Object.freeze({
        timeoutMs: limits.timeout ?? 0,
        memoryBytes: limits.memory ?? 0,
        maxToolCalls: limits.max_tool_calls ?? 0,
        ...(limits.max_tokens === undefined ? {} : { maxTokens: limits.max_tokens }),
        ...(limits.rate_limit_per_minute === undefined ? {} : { rateLimitPerMinute: limits.rate_limit_per_minute }),
      }),
      failureBehaviour: draft.failureBehaviour ?? "fail_group",
    });
    const lowered = lowerAgentDeclaration(node);
    if (lowered.definition === undefined) {
      diagnostics.push(...lowered.diagnostics.map((d) => Object.freeze({ ...d, path: `line:${draft.line}.${d.path ?? ""}` })));
      continue;
    }
    declarations.push(node);
  }

  return Object.freeze({ declarations: Object.freeze(declarations), diagnostics: Object.freeze(diagnostics) });
}

/**
 * Lower a compiler-produced AgentDeclarationNode into an AgentDefinition. The
 * node is untrusted input: the kind and schema are checked and the result goes
 * through validateAgentDefinition. No definition is returned on any error.
 */
export function lowerAgentDeclaration(node: AgentDeclarationNode): AgentDeclarationLowering {
  if (node.kind !== "AgentDeclaration" || node.schema !== AGENT_DECLARATION_SCHEMA) {
    return {
      diagnostics: [Object.freeze({
        code: "Galerina_AGENT_DECL_SCHEMA_INVALID",
        severity: "error" as const,
        message: `Agent declaration node must be kind AgentDeclaration with schema ${AGENT_DECLARATION_SCHEMA}.`,
        path: "kind",
      })],
    };
  }
  const extra: AgentDiagnostic[] = [];
  if (!TYPE_NAME.test(node.name)) {
    extra.push({ code: "Galerina_AGENT_DECL_NAME_INVALID", severity: "error", message: "Agent name must be an UpperCamel identifier.", path: "name" });
  }
  if (!FAILURE_BEHAVIOURS.includes(node.failureBehaviour)) {
    extra.push({ code: "Galerina_AGENT_DECL_FAILURE_INVALID", severity: "error", message: `Failure behaviour must be one of: ${FAILURE_BEHAVIOURS.join(", ")}.`, path: "failureBehaviour" });
  }
  node.tools.forEach((tool, position) => {
    if (tool.scope !== undefined && (tool.decision !== "allow" || !isSafeScope(tool.scope))) {
      extra.push({ code: "Galerina_AGENT_DECL_TOOL_SCOPE_INVALID", severity: "error", message: "Tool scope must be an exact relative scope on an allow.", path: `tools.${position}.scope` });
    }
  });
  const definition: AgentDefinition = Object.freeze({
    name: node.name,
    inputType: node.inputType,
    outputType: node.outputType,
    tools: Object.freeze(node.tools.map((tool) => Object.freeze({ ...tool }))),
    effects: Object.freeze([...node.effects]),
    permissions: Object.freeze([...node.permissions]),
    limits: Object.freeze({ ...node.limits }),
    failureBehaviour: node.failureBehaviour,
  });
  const diagnostics = [...extra, ...validateAgentDefinition(definition)];
  return diagnostics.some((d) => d.severity === "error")
    ? { diagnostics: Object.freeze(diagnostics) }
    : { definition, diagnostics: Object.freeze(diagnostics) };
}
