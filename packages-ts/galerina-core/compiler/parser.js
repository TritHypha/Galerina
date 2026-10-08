"use strict";

// Dedicated prototype parser for Galerina .fungi (TODO L987, SuperGrok 2026-10-08i).
// Regex/brace parser extracted from compiler/galerina.js. Fail closed on
// await-outside-async and unknown vectorize column bindings. Does not invent
// task/queue/stream syntax beyond docs/vectorised-dataset-syntax.md and the
// existing async flow qualifier.

const TARGET_BLOCKS = ["binary", "wasm", "browser", "server", "native", "gpu", "photonic", "ternary", "omni"];

const BANNED_COMPUTE_OPS = [
  "readFile",
  "writeFile",
  "database.",
  "env.",
  "secret",
  "fetch(",
  "http.",
  "network."
];

const STRICT_COMMENT_TAGS = new Set([
  "ai-note",
  "ai-risk",
  "ai-todo",
  "effects",
  "errors",
  "fallback",
  "idempotency",
  "input",
  "json-policy",
  "max-body-size",
  "output",
  "owner",
  "permissions",
  "precision",
  "purpose",
  "request",
  "response",
  "rollback",
  "rollback-risk",
  "route",
  "security",
  "since",
  "source",
  "summary",
  "target",
  "test",
  "timeout",
  "verify"
]);



function parseFile(source, diagnostics) {
  const content = stripComments(source.content);
  const lines = linesOf(source.content);
  const ast = {
    project: null,
    entry: null,
    imports: [],
    targets: [],
    security: {},
    permissions: {},
    globals: [],
    jsonPolicies: [],
    runtime: null,
    documentation: null,
    aiGuide: null,
    manifests: {},
    buildContract: {},
    types: [],
    enums: [],
    flows: [],
    apis: [],
    webhooks: [],
    computeBlocks: [],
    vectorizeBlocks: [],
    strictComments: []
  };

  scanForbiddenTokens(source, diagnostics);
  ast.strictComments = extractStrictComments(source, diagnostics);

  const projectMatch = content.match(/\bproject\s+"([^"]+)"/);
  if (projectMatch) ast.project = projectMatch[1];

  const entryMatch = content.match(/\bentry\s+"([^"]+)"/);
  if (entryMatch) ast.entry = entryMatch[1];

  ast.logic = parseLogicDirective(source, content);

  ast.imports = matches(content, /\b(?:use|import)\s+([A-Za-z_][A-Za-z0-9_.]*)/g).map((m) => ({
    module: m[1],
    ...loc(source, m.index)
  }));

  const targetsBlock = findNamedBlock(content, "targets");
  if (targetsBlock) {
    for (const section of TARGET_BLOCKS) {
      const block = findNamedBlock(targetsBlock.body, section);
      if (block) {
        ast.targets.push(parseTargetDeclaration(source, section, block.body, targetsBlock.index + block.index));
      }
    }
  }

  for (const block of findBlocks(content, /\btarget\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/g)) {
    ast.targets.push(parseTargetDeclaration(source, block.name, block.body, block.index));
  }

  const capabilities = findNamedBlock(content, "capabilities");
  if (capabilities) ast.capabilities = parseCapabilitiesBlock(source, capabilities.body, capabilities.index);

  const security = findNamedBlock(content, "security");
  if (security) ast.security = parseSettings(security.body);

  const permissions = findNamedBlock(content, "permissions");
  if (permissions) ast.permissions = parseSettings(permissions.body);

  const globals = findNamedBlock(source.content, "globals");
  if (globals) ast.globals = parseGlobalRegistryBlock(source, globals);

  const runtime = findNamedBlock(content, "runtime");
  if (runtime) ast.runtime = parseRuntimeBlock(runtime.body);

  const documentation = findNamedBlock(content, "documentation");
  if (documentation) ast.documentation = parseDocumentationBlock(documentation.body);

  const aiGuide = findNamedBlock(content, "ai_guide");
  if (aiGuide) ast.aiGuide = parseAiGuideBlock(aiGuide.body);

  const manifests = findNamedBlock(content, "manifests");
  if (manifests) ast.manifests = parseManifestsBlock(manifests.body);

  const buildContract = findNamedBlock(content, "build");
  if (buildContract) ast.buildContract = parseBuildContractBlock(buildContract.body);

  for (const block of findBlocks(content, /\bjson_policy\s*\{/g)) {
    ast.jsonPolicies.push({ settings: parseSettings(block.body), ...loc(source, block.index) });
  }

  for (const block of findBlocks(content, /\brecord\s+([A-Z][A-Za-z0-9_]*)\s*\{/g)) {
    ast.types.push({
      name: block.name,
      fields: parseFields(block.body),
      ...loc(source, block.index)
    });
  }

  for (const match of matches(content, /\btype\s+([A-Z][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_<>, ]*)/g)) {
    const lineStart = content.lastIndexOf("\n", match.index) + 1;
    if (match.index - lineStart > 0) continue;
    ast.types.push({ name: match[1], alias: match[2].trim(), fields: [], ...loc(source, match.index) });
  }

  for (const block of findBlocks(content, /\benum\s+([A-Z][A-Za-z0-9_]*)\s*\{/g)) {
    ast.enums.push({
      name: block.name,
      cases: block.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      ...loc(source, block.index)
    });
  }

  for (const match of matches(content, /\b(async\s+)?(?:(secure|pure(?:\s+vector(?:\s+required)?)?)\s+)?flow\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*->\s*([A-Za-z_][A-Za-z0-9_<>, ]*)/g)) {
    const qualifier = flowQualifier(match[1], match[2]);
    ast.flows.push({
      name: match[3],
      qualifier,
      vectorMode: flowVectorMode(qualifier),
      async: qualifier.includes("async"),
      params: parseParams(match[4]),
      returns: match[5].trim(),
      effects: parseEffects(content.slice(match.index, match.index + 300)),
      ...loc(source, match.index)
    });
  }

  for (const block of findBlocks(content, /\bapi\s+([A-Z][A-Za-z0-9_]*)\s*\{/g)) {
    ast.apis.push({
      name: block.name,
      routes: parseRoutes(block.body),
      ...loc(source, block.index)
    });
  }

  for (const block of findBlocks(content, /\bwebhook\s+([A-Z][A-Za-z0-9_]*)\s*\{/g)) {
    ast.webhooks.push({
      name: block.name,
      path: stringSetting(block.body, "path"),
      method: wordSetting(block.body, "method"),
      hmacHeader: stringSetting(block.body, "hmac_header"),
      maxAge: wordSetting(block.body, "max_age"),
      maxBodySize: wordSetting(block.body, "max_body_size"),
      replayProtection: wordSetting(block.body, "replay_protection"),
      idempotencyKey: expressionSetting(block.body, "idempotency_key"),
      handler: wordSetting(block.body, "handler"),
      ...loc(source, block.index)
    });
  }

  for (const block of findBlocks(content, /\bcompute\s+target\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+verify\s+([A-Za-z_][A-Za-z0-9_]*))?\s*\{/g)) {
    const target = block.name.trim();
    const banned = BANNED_COMPUTE_OPS.filter((op) => block.body.includes(op));
    ast.computeBlocks.push({
      target,
      verify: block.extra || null,
      prefers: matches(block.body, /\bprefer\s+([A-Za-z_][A-Za-z0-9_]*)/g).map((m) => m[1]),
      fallbacks: matches(block.body, /\bfallback\s+([A-Za-z_][A-Za-z0-9_]*)/g).map((m) => m[1]),
      bannedOperations: banned,
      ...loc(source, block.index)
    });

    for (const op of banned) {
      diagnostics.push(diagnostic("error", "TargetCompatibilityError", source, block.index, `${op} cannot run inside a compute block.`, "Move I/O, secrets and environment access outside the compute block, then pass typed values in."));
    }

    if ((target.includes("photonic") || block.body.includes("prefer photonic")) && !/\bfallback\s+cpu\b|\bfallback\s+binary\b/.test(block.body)) {
      diagnostics.push(diagnostic("warning", "TargetFallbackWarning", source, block.index, "Photonic compute block has no explicit CPU or binary fallback.", "Add fallback cpu or fallback binary to preserve backwards compatibility."));
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const truthy = line.match(/\bif\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\{/);
    if (truthy) {
      diagnostics.push({
        severity: "warning",
        errorType: "TruthyFalsyCheck",
        file: source.relativePath,
        line: i + 1,
        column: line.indexOf(truthy[1]) + 1,
        problem: `if ${truthy[1]} uses an implicit truthy/falsy check.`,
        suggestedFix: "Compare a Bool explicitly or use match for Option, Result and enum values."
      });
    }
  }

  applyStrictCommentChecks(source, ast, diagnostics);
  attachFlowBodies(source, ast);
  parseVectorizeBlocks(source, ast, diagnostics);
  diagnoseAwaitOutsideAsync(source, ast, diagnostics);
  return ast;
}


function parseTargetDeclaration(source, name, body, index) {
  const target = name === "cpu" ? "binary" : name;
  return {
    name: target,
    enabled: !/\benabled\s+false\b/.test(body),
    mode: stringSetting(body, "mode") || targetModeDefault(target, body),
    fallback: stringSetting(body, "fallback") || wordSetting(body, "fallback"),
    output: stringSetting(body, "output") || wordSetting(body, "output"),
    wasm: wordSetting(body, "wasm"),
    sourceMaps: wordSetting(body, "source_maps"),
    ...loc(source, index)
  };
}


function targetModeDefault(target, body) {
  if (target === "browser") return wordSetting(body, "output") || "js";
  if (target === "server") return "runtime";
  if (target === "native") return "output";
  if (target === "photonic" || target === "gpu") return "plan";
  if (target === "ternary" || target === "omni") return "simulation";
  return "output";
}


function parseCapabilitiesBlock(source, body, blockIndex) {
  const output = { aLOw: [], block: [], entries: [] };
  for (const match of matches(body, /\b(aLOw|block)\s+([A-Za-z_][A-Za-z0-9_.]*)/g)) {
    const entry = {
      action: match[1],
      capability: match[2],
      ...loc(source, blockIndex + match.index)
    };
    output.entries.push(entry);
    output[entry.action].push(entry.capability);
  }
  output.allow = Array.from(new Set(output.aLOw));
  output.block = Array.from(new Set(output.block));
  return output;
}


function scanForbiddenTokens(source, diagnostics) {
  const lines = linesOf(source.content);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].replace(/\/\/.*$/, "");
    if (/\bundefined\b/.test(line)) {
      if (/^\s*undefined\s+"deny"/.test(line)) continue;
      diagnostics.push(lineDiagnostic("error", "UndefinedDenied", source, i, line.indexOf("undefined"), "Galerina does not allow undefined.", "Use Option<T> with Some(value) or None."));
    }
    if (/\bnull\b/.test(line) && !/\bJsonNull\b/.test(line)) {
      if (/^\s*null\s+"deny"/.test(line)) continue;
      diagnostics.push(lineDiagnostic("error", "SilentNullDenied", source, i, line.indexOf("null"), "Galerina does not allow silent null in normal source.", "Use Option<T> or configure JSON null handling explicitly."));
    }
  }
}


function extractStrictComments(source, diagnostics) {
  const lines = linesOf(source.content);
  const comments = [];
  let index = 0;

  while (index < lines.length) {
    const first = lines[index];
    if (!/^\s*\/\/\//.test(first)) {
      index += 1;
      continue;
    }

    const startLine = index + 1;
    const raw = [];
    const tags = {};
    const unknownTags = [];

    while (index < lines.length && /^\s*\/\/\//.test(lines[index])) {
      const value = lines[index].replace(/^\s*\/\/\/\s?/, "");
      raw.push(value);
      const tag = value.match(/^@([A-Za-z][A-Za-z0-9_-]*)\s*(.*)$/);
      if (tag) {
        const name = tag[1];
        const tagValue = tag[2].trim();
        tags[name] = tags[name] || [];
        tags[name].push(tagValue);
        if (!STRICT_COMMENT_TAGS.has(name)) unknownTags.push(name);
      }
      index += 1;
    }

    let next = index;
    while (next < lines.length && lines[next].trim() === "") next += 1;
    const subject = next < lines.length ? strictCommentSubject(lines[next].trim(), next + 1) : null;
    const comment = {
      file: source.relativePath,
      line: startLine,
      column: first.indexOf("///") + 1,
      tags,
      raw,
      summary: tags.purpose?.[0] || tags.summary?.[0] || raw.find((line) => line && !line.startsWith("@")) || null,
      subject
    };
    comments.push(comment);

    for (const tag of Array.from(new Set(unknownTags))) {
      diagnostics.push(lineDiagnostic("warning", "StrictCommentUnknownTag", source, startLine - 1, first.indexOf("///"), `Strict comment tag @${tag} is not in the v0.1 recognised tag set.`, "Use a documented strict comment tag or add the tag to the language rules before relying on it."));
    }

    const combined = raw.join("\n");
    if (containsSecretLikeValue(combined)) {
      diagnostics.push(lineDiagnostic("error", "StrictCommentSecretError", source, startLine - 1, first.indexOf("///"), "Strict comments must not contain literal secret values.", "Replace the secret value with an env.secret(\"NAME\") reference or a non-sensitive description."));
    }
  }

  return comments;
}


function strictCommentSubject(line, lineNumber) {
  const cleaned = line.replace(/^export\s+/, "");
  const flow = cleaned.match(/^(?:async\s+)?(?:(secure|pure(?:\s+vector(?:\s+required)?)?)\s+)?flow\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (flow) return { kind: "flow", name: flow[2], line: lineNumber };
  const api = cleaned.match(/^api\s+([A-Z][A-Za-z0-9_]*)/);
  if (api) return { kind: "api", name: api[1], line: lineNumber };
  const webhook = cleaned.match(/^webhook\s+([A-Z][A-Za-z0-9_]*)/);
  if (webhook) return { kind: "webhook", name: webhook[1], line: lineNumber };
  const global = cleaned.match(/^(const|config|secret|state)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (global) return { kind: "global", globalKind: global[1], name: global[2], line: lineNumber };
  const compute = cleaned.match(/^compute\s+target\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+verify\s+([A-Za-z_][A-Za-z0-9_]*))?/);
  if (compute) return { kind: "compute", name: compute[1], verify: compute[2] || null, line: lineNumber };
  const record = cleaned.match(/^record\s+([A-Z][A-Za-z0-9_]*)/);
  if (record) return { kind: "type", name: record[1], line: lineNumber };
  const type = cleaned.match(/^type\s+([A-Z][A-Za-z0-9_]*)\s*=/);
  if (type) return { kind: "type", name: type[1], line: lineNumber };
  const enumMatch = cleaned.match(/^enum\s+([A-Z][A-Za-z0-9_]*)/);
  if (enumMatch) return { kind: "enum", name: enumMatch[1], line: lineNumber };
  return { kind: "unknown", name: null, line: lineNumber };
}


function containsSecretLikeValue(text) {
  return /\b(sk_live|pk_live|ghp_|xox[baprs]-|AKIA[0-9A-Z]{16})[A-Za-z0-9_-]*/.test(text)
    || /\b(api[_-]?key|token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,}/i.test(text);
}


function applyStrictCommentChecks(source, ast, diagnostics) {
  for (const comment of ast.strictComments) {
    if (!comment.subject || comment.subject.kind === "unknown") continue;
    if (comment.subject.kind === "flow") {
      const flow = nearestSubject(ast.flows, comment);
      if (flow) checkStrictFlowComment(source, comment, flow, diagnostics);
    }
    if (comment.subject.kind === "api") {
      const api = nearestSubject(ast.apis, comment);
      if (api) checkStrictApiComment(source, comment, api, diagnostics);
    }
    if (comment.subject.kind === "webhook") {
      const webhook = nearestSubject(ast.webhooks, comment);
      if (webhook) checkStrictWebhookComment(source, comment, webhook, diagnostics);
    }
    if (comment.subject.kind === "compute") {
      const block = ast.computeBlocks
        .filter((item) => item.target === comment.subject.name)
        .sort((a, b) => Math.abs(a.line - comment.subject.line) - Math.abs(b.line - comment.subject.line))[0];
      if (block) checkStrictComputeComment(source, comment, block, diagnostics);
    }
  }
}


function nearestSubject(items, comment) {
  return items
    .filter((item) => item.name === comment.subject.name)
    .sort((a, b) => Math.abs(a.line - comment.subject.line) - Math.abs(b.line - comment.subject.line))[0];
}


function checkStrictFlowComment(source, comment, flow, diagnostics) {
  const output = firstTag(comment, "output");
  if (output && output !== flow.returns) {
    strictMismatch(source, comment, "@output", `@output says ${output}. Flow returns ${flow.returns}.`, diagnostics);
  }

  const effects = parseTagList(firstTag(comment, "effects"));
  if (effects.length > 0 && !sameList(effects, flow.effects)) {
    strictMismatch(source, comment, "@effects", `@effects says [${effects.join(", ")}]. Flow declares [${flow.effects.join(", ")}].`, diagnostics);
  }
}


function checkStrictApiComment(source, comment, api, diagnostics) {
  const route = api.routes[0];
  if (!route) return;
  compareTag(source, comment, "@request", firstTag(comment, "request"), route.request, "API route request", diagnostics);
  compareTag(source, comment, "@response", firstTag(comment, "response"), route.response, "API route response", diagnostics);
  compareTag(source, comment, "@timeout", firstTag(comment, "timeout"), route.timeout, "API route timeout", diagnostics);
  compareTag(source, comment, "@max-body-size", firstTag(comment, "max-body-size"), route.maxBodySize, "API route max_body_size", diagnostics);
}


function checkStrictWebhookComment(source, comment, webhook, diagnostics) {
  const security = firstTag(comment, "security") || "";
  if (/\bhmac\b/i.test(security) && !webhook.hmacHeader) {
    strictMismatch(source, comment, "@security", "@security requires HMAC verification, but the webhook has no hmac_header.", diagnostics);
  }
  const idempotency = firstTag(comment, "idempotency") || "";
  if (/\brequired\b/i.test(idempotency) && !webhook.idempotencyKey) {
    strictMismatch(source, comment, "@idempotency", "@idempotency is required, but the webhook has no idempotency_key.", diagnostics);
  }
  compareTag(source, comment, "@max-body-size", firstTag(comment, "max-body-size"), webhook.maxBodySize, "webhook max_body_size", diagnostics);
}


function checkStrictComputeComment(source, comment, block, diagnostics) {
  compareTag(source, comment, "@verify", firstTag(comment, "verify"), block.verify, "compute verify mode", diagnostics);
  const fallbackText = firstTag(comment, "fallback");
  if (fallbackText) {
    const fallbacks = parseTagList(fallbackText);
    const missing = fallbacks.filter((target) => !block.fallbacks.includes(target));
    if (missing.length > 0) {
      strictMismatch(source, comment, "@fallback", `@fallback mentions [${missing.join(", ")}], but the compute block does not declare those fallbacks.`, diagnostics);
    }
  }
}


function firstTag(comment, name) {
  return comment.tags[name]?.[0] || null;
}


function parseTagList(value) {
  if (!value) return [];
  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^fallback\s+/, "").replace(/^prefer\s+/, ""));
}


function sameList(left, right) {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}


function compareTag(source, comment, tag, actualTagValue, declaredValue, declaredName, diagnostics) {
  if (!actualTagValue || !declaredValue || actualTagValue === declaredValue) return;
  strictMismatch(source, comment, tag, `${tag} says ${actualTagValue}. ${declaredName} declares ${declaredValue}.`, diagnostics);
}


function strictMismatch(source, comment, tag, problem, diagnostics) {
  diagnostics.push(lineDiagnostic("warning", "StrictCommentMismatch", source, comment.line - 1, comment.column - 1, problem, `Update ${tag} or correct the declaration it describes.`));
}


function parseLogicDirective(source, content) {
  const widthMatch = content.match(/\blogic\s+width\s+([0-9]+|dynamic|n)\b/);
  if (widthMatch) {
    const rawWidth = widthMatch[1];
    return {
      mode: rawWidth === "dynamic" || rawWidth === "n" ? "dynamic" : `width-${rawWidth}`,
      width: rawWidth === "dynamic" || rawWidth === "n" ? "dynamic" : Number(rawWidth),
      ...loc(source, widthMatch.index)
    };
  }

  const modeMatch = content.match(/\blogic\s+mode\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
  if (!modeMatch) return null;
  const mode = modeMatch[1];
  return {
    mode,
    width: logicModeWidth(mode),
    ...loc(source, modeMatch.index)
  };
}


function logicModeWidth(mode) {
  if (mode === "binary") return 2;
  if (mode === "ternary") return 3;
  if (mode === "quaternary") return 4;
  if (mode === "omni" || mode === "dynamic") return "dynamic";
  return null;
}


function parseStringListSetting(body, key) {
  const regex = new RegExp(`\\b${key}\\s*\\[([\\s\\S]*?)\\]`);
  const match = body.match(regex);
  if (!match) return [];
  return matches(match[1], /"([^"]+)"/g).map((item) => item[1]);
}


function booleanSetting(body, key, fallback) {
  const value = wordSetting(body, key);
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}


function parseFields(body) {
  return body.split(/\r?\n/).map((line) => {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/);
    if (!match) return null;
    return { name: match[1], type: match[2].trim().replace(/,$/, "") };
  }).filter(Boolean);
}


function parseParams(text) {
  if (!text.trim()) return [];
  return splitTopLevel(text).map((item) => {
    const [name, type] = item.split(":").map((value) => value.trim());
    return { name, type };
  }).filter((param) => param.name && param.type);
}


function flowQualifier(asyncMarker, qualifierMarker) {
  const parts = [];
  if (asyncMarker) parts.push("async");
  if (qualifierMarker) parts.push(qualifierMarker.trim());
  return parts.join(" ") || "normal";
}


function flowVectorMode(qualifier) {
  if (qualifier.includes("pure vector required")) return "required";
  if (qualifier.includes("pure vector")) return "preferred";
  return "scalar";
}


function splitTopLevel(text) {
  const output = [];
  let current = "";
  let depth = 0;

  for (const char of text) {
    if (char === "<") depth += 1;
    if (char === ">") depth -= 1;
    if (char === "," && depth === 0) {
      output.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) output.push(current.trim());
  return output;
}


function parseEffects(text) {
  const match = text.match(/\beffects\s+\[([^\]]+)\]/);
  if (!match) return [];
  return match[1].split(",").map((value) => value.trim()).filter(Boolean);
}


function parseRoutes(body) {
  return matches(body, /\b(GET|POST|PUT|PATCH|DELETE)\s+"([^"]+)"\s*\{([\s\S]*?)\n\s*\}/g).map((match) => ({
    method: match[1],
    path: match[2],
    request: wordSetting(match[3], "request"),
    response: wordSetting(match[3], "response"),
    handler: wordSetting(match[3], "handler"),
    timeout: wordSetting(match[3], "timeout"),
    maxBodySize: wordSetting(match[3], "max_body_size")
  }));
}


function stringSetting(body, key) {
  const regex = new RegExp(`\\b${key}\\s+"([^"]+)"`);
  const match = body.match(regex);
  return match ? match[1] : null;
}


function wordSetting(body, key) {
  const regex = new RegExp(`\\b${key}\\s+([^\\s\\n]+)`);
  const match = body.match(regex);
  return match ? cleanValue(match[1]) : null;
}


function expressionSetting(body, key) {
  const regex = new RegExp(`\\b${key}\\s+([^\\n]+)`);
  const match = body.match(regex);
  return match ? match[1].trim() : null;
}


function cleanValue(value) {
  const trimmed = value.trim().replace(/,$/, "");
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed.replace(/^"|"$/g, "");
}


function loc(source, index) {
  const before = source.content.slice(0, index);
  const line = before.split(/\r?\n/).length;
  const lastNewline = before.lastIndexOf("\n");
  return {
    file: source.relativePath,
    line,
    column: index - lastNewline
  };
}


function locFromContent(content, index) {
  const before = content.slice(0, index);
  const line = before.split(/\r?\n/).length;
  const lastNewline = before.lastIndexOf("\n");
  return {
    line,
    column: index - lastNewline
  };
}


function stripComments(content) {
  return content.replace(/\/\/.*$/gm, "");
}


function linesOf(content) {
  return content.split(/\r?\n/);
}


function matches(content, regex) {
  const output = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    output.push(match);
  }
  return output;
}


function findNamedBlock(content, name) {
  const regex = new RegExp(`\\b${name}\\s*\\{`, "g");
  const found = findBlocks(content, regex);
  return found[0] || null;
}


function findBlocks(content, regex) {
  const output = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    const open = content.indexOf("{", match.index);
    const close = findMatchingBrace(content, open);
    if (close === -1) continue;
    output.push({
      name: match[1] || null,
      extra: match[2] || null,
      index: match.index,
      bodyStart: open + 1,
      body: content.slice(open + 1, close)
    });
    regex.lastIndex = close + 1;
  }
  return output;
}


function findMatchingBrace(content, open) {
  let depth = 0;
  for (let i = open; i < content.length; i += 1) {
    if (content[i] === "{") depth += 1;
    if (content[i] === "}") depth -= 1;
    if (depth === 0) return i;
  }
  return -1;
}


function parseSettings(body) {
  const settings = {};
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.includes("{") || trimmed.includes("}")) continue;
    const parts = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/);
    if (!parts) continue;
    settings[parts[1]] = cleanValue(parts[2]);
  }
  return settings;
}


function parseRuntimeBlock(body) {
  const memory = findNamedBlock(body, "memory");
  return {
    runMode: stringSetting(body, "run_mode") || wordSetting(body, "run_mode") || "checked",
    cacheIr: booleanSetting(body, "cache_ir", false),
    hotReload: booleanSetting(body, "hot_reload", false),
    memory: memory ? parseRuntimeMemoryBlock(memory.body) : null
  };
}


function parseGlobalRegistryBlock(source, block) {
  const globals = [];
  const declaration = /^\s*(const|config|secret)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^=\n]+?)\s*=\s*(.+?)\s*$/gm;
  let match;
  while ((match = declaration.exec(block.body)) !== null) {
    const absoluteIndex = block.bodyStart + match.index;
    const valueExpression = match[4].trim();
    globals.push({
      kind: match[1],
      name: match[2],
      type: match[3].trim(),
      value: match[1] === "secret" ? "[redacted]" : redactSecretLikeExpression(valueExpression),
      valueExpression: match[1] === "secret" ? "[redacted]" : valueExpression,
      env: environmentName(valueExpression),
      mutable: false,
      ...loc(source, absoluteIndex)
    });
  }

  for (const stateBlock of findBlocks(block.body, /\bstate\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^{\n]+)\{/g)) {
    const absoluteIndex = block.bodyStart + stateBlock.index;
    globals.push({
      kind: "state",
      name: stateBlock.name,
      type: (stateBlock.extra || "").trim(),
      value: null,
      valueExpression: null,
      env: null,
      mutable: true,
      access: stringSetting(stateBlock.body, "access"),
      maxSize: wordSetting(stateBlock.body, "max_size"),
      ttl: wordSetting(stateBlock.body, "ttl"),
      ...loc(source, absoluteIndex)
    });
  }

  return globals;
}


function environmentName(expression) {
  const match = expression.match(/\benv\.(?:secret|int|string|bool|duration|size)\s*\(\s*"([^"]+)"/);
  return match ? match[1] : null;
}


function redactSecretLikeExpression(expression) {
  if (/\benv\.secret\s*\(/.test(expression)) return "[redacted]";
  return expression;
}


function parseRuntimeMemoryBlock(body) {
  const spill = findNamedBlock(body, "spill");
  return {
    softLimit: wordSetting(body, "soft_limit"),
    hardLimit: wordSetting(body, "hard_limit"),
    onPressure: parseStringListSetting(body, "on_pressure"),
    spill: spill ? parseRuntimeSpillBlock(spill.body) : null
  };
}


function parseRuntimeSpillBlock(body) {
  return {
    enabled: booleanSetting(body, "enabled", false),
    path: stringSetting(body, "path"),
    maxDisk: wordSetting(body, "max_disk"),
    ttl: wordSetting(body, "ttl"),
    encryption: booleanSetting(body, "encryption", false),
    redactSecrets: booleanSetting(body, "redact_secrets", true),
    aLOw: parseStringListSetting(body, "aLOw"),
    deny: parseStringListSetting(body, "deny")
  };
}


function parseDocumentationBlock(body) {
  const rules = findNamedBlock(body, "rules");
  return {
    enabled: booleanSetting(body, "enabled", false),
    required: booleanSetting(body, "required", false),
    output: stringSetting(body, "output") || "./build/docs",
    formats: parseStringListSetting(body, "formats"),
    generate: parseStringListSetting(body, "generate"),
    sources: parseStringListSetting(body, "sources"),
    rules: rules ? parseSettings(rules.body) : {}
  };
}


function parseAiGuideBlock(body) {
  const rules = findNamedBlock(body, "rules");
  return {
    enabled: booleanSetting(body, "enabled", false),
    updateOnSuccessfulCompile: booleanSetting(body, "update_on_successful_compile", true),
    output: stringSetting(body, "output") || "./build/app.ai-guide.md",
    jsonOutput: stringSetting(body, "json_output") || "./build/app.ai-context.json",
    include: parseStringListSetting(body, "include"),
    rules: rules ? parseSettings(rules.body) : {}
  };
}


function parseManifestsBlock(body) {
  const manifests = {};
  for (const block of findBlocks(body, /\b([A-Za-z_][A-Za-z0-9_]*)\s*\{/g)) {
    manifests[block.name] = {
      required: booleanSetting(block.body, "required", false),
      output: stringSetting(block.body, "output")
    };
  }
  return manifests;
}


function parseBuildContractBlock(body) {
  return {
    mode: stringSetting(body, "mode") || wordSetting(body, "mode") || "debug",
    deterministic: booleanSetting(body, "deterministic", false),
    sourceMaps: booleanSetting(body, "source_maps", true),
    reports: booleanSetting(body, "reports", true),
    mapManifest: booleanSetting(body, "map_manifest", true),
    aiContext: booleanSetting(body, "ai_context", true),
    aiGuide: booleanSetting(body, "ai_guide", true),
    documentation: booleanSetting(body, "documentation", false),
    requireOutputs: parseStringListSetting(body, "require_outputs"),
    failOnMissingOutput: booleanSetting(body, "fail_on_missing_output", false),
    failOnDocError: booleanSetting(body, "fail_on_doc_error", false)
  };
}


function diagnostic(severity, errorType, source, index, problem, suggestedFix) {
  return {
    severity,
    errorType,
    ...loc(source, index),
    problem,
    suggestedFix
  };
}

function lineDiagnostic(severity, errorType, source, lineIndex, columnIndex, problem, suggestedFix) {
  return {
    severity,
    errorType,
    file: source.relativePath,
    line: lineIndex + 1,
    column: Math.max(1, columnIndex + 1),
    problem,
    suggestedFix
  };
}
function attachFlowBodies(source, ast) {
  const content = stripComments(source.content);
  for (const flow of ast.flows) {
    const span = findFlowBodySpan(content, flow.name);
    if (!span) continue;
    flow.body = span.body;
    flow.bodyIndex = span.start;
    flow.bodyEnd = span.end;
  }
}

function skipWs(text, index) {
  let i = index;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  return i;
}

function skipTypeRef(text, index) {
  let i = skipWs(text, index);
  while (i < text.length && /[A-Za-z0-9_<>, \[\]&]/.test(text[i])) i += 1;
  return i;
}

function findFlowBodySpan(content, name) {
  const header = new RegExp(
    "\\b(?:async\\s+)?(?:(?:secure|pure(?:\\s+vector(?:\\s+required)?)?)\\s+)?flow\\s+" +
      name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "\\s*\\("
  );
  const match = header.exec(content);
  if (!match) return null;
  const arrow = content.indexOf("->", match.index);
  if (arrow === -1) return null;
  let pos = skipTypeRef(content, arrow + 2);
  pos = skipWs(content, pos);
  if (content.startsWith("effects", pos)) {
    const open = content.indexOf("[", pos);
    const close = content.indexOf("]", open);
    if (close === -1) return null;
    pos = skipWs(content, close + 1);
  }
  if (content.startsWith("contract", pos)) {
    const open = content.indexOf("{", pos);
    if (open === -1) return null;
    const close = findMatchingBrace(content, open);
    if (close === -1) return null;
    pos = skipWs(content, close + 1);
  }
  const open = content.indexOf("{", pos);
  if (open === -1) return null;
  const close = findMatchingBrace(content, open);
  if (close === -1) return null;
  return { start: open + 1, end: close, body: content.slice(open + 1, close) };
}

function parseVectorizeBlocks(source, ast, diagnostics) {
  const content = stripComments(source.content);
  ast.vectorizeBlocks = ast.vectorizeBlocks || [];
  for (const block of findBlocks(content, /\bvectorize\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\{/g)) {
    const columns = [];
    const lines = linesOf(block.body);
    let offset = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      const lineIndex = block.bodyStart + offset;
      offset += line.length + 1;
      if (!trimmed) continue;
      const typed = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_<>, ]*)\s*=\s*(.+)$/);
      const plain = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
      const binding = typed || plain;
      if (!binding) {
        diagnostics.push(diagnostic(
          "error",
          "VectorizeParseError",
          source,
          lineIndex,
          "vectorize column binding is not 'name = .field' or 'name: Type = expr': " + trimmed,
          "Use the documented vectorize column form from docs/vectorised-dataset-syntax.md."
        ));
        continue;
      }
      columns.push({
        name: binding[1],
        type: typed ? typed[2].trim() : null,
        expression: (typed ? typed[3] : plain[2]).trim().replace(/,$/, ""),
        ...loc(source, lineIndex)
      });
    }
    ast.vectorizeBlocks.push({
      source: block.name,
      columns,
      ...loc(source, block.index)
    });
  }
}

function diagnoseAwaitOutsideAsync(source, ast, diagnostics) {
  const content = stripComments(source.content);
  const awaitRe = /\bawait\b/g;
  let match;
  while ((match = awaitRe.exec(content)) !== null) {
    const flow = enclosingFlow(ast, match.index);
    if (!flow) {
      diagnostics.push(diagnostic(
        "error",
        "AwaitOutsideAsync",
        source,
        match.index,
        "await is not aLOwed outside a flow body.",
        "Move await into an async flow, or remove it."
      ));
      continue;
    }
    if (flow.async === true || String(flow.qualifier || "").includes("async")) continue;
    diagnostics.push(diagnostic(
      "error",
      "AwaitOutsideAsync",
      source,
      match.index,
      "await is not aLOwed outside an async flow (flow " + flow.name + ").",
      "Mark flow " + flow.name + " as async, or remove await."
    ));
  }
}

function enclosingFlow(ast, index) {
  let found = null;
  for (const flow of ast.flows) {
    if (typeof flow.bodyIndex !== "number" || typeof flow.bodyEnd !== "number") continue;
    if (index >= flow.bodyIndex && index <= flow.bodyEnd) found = flow;
  }
  return found;
}

function coverExampleSources(files) {
  const coverage = {
    schema: "galerina.core.parser-coverage.v1",
    files: files.length,
    parsed: 0,
    withParserErrors: 0,
    declarations: { types: 0, enums: 0, flows: 0, apis: 0, webhooks: 0, vectorizeBlocks: 0 }
  };
  for (const source of files) {
    const diagnostics = [];
    const ast = parseFile(source, diagnostics);
    coverage.parsed += 1;
    const parserErrors = diagnostics.filter((item) =>
      item.severity === "error" && (
        item.errorType === "VectorizeParseError" ||
        item.errorType === "AwaitOutsideAsync" ||
        item.errorType === "LexError"
      )
    );
    if (parserErrors.length > 0) coverage.withParserErrors += 1;
    coverage.declarations.types += ast.types.length;
    coverage.declarations.enums += ast.enums.length;
    coverage.declarations.flows += ast.flows.length;
    coverage.declarations.apis += ast.apis.length;
    coverage.declarations.webhooks += ast.webhooks.length;
    coverage.declarations.vectorizeBlocks += (ast.vectorizeBlocks || []).length;
  }
  return coverage;
}


module.exports = {
  parseFile,
  parseVectorizeBlocks,
  diagnoseAwaitOutsideAsync,
  coverExampleSources,
  parseParams,
  findBlocks,
  findMatchingBrace,
  stripComments,
  loc
};
