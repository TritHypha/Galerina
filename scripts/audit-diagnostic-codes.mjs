#!/usr/bin/env node
// Fail-closed diagnostic taxonomy audit:
// one code = one fault = one name, with an exact declared severity set.
import {
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { CODE_TEST } from "./lib/codes.mjs";
import { parseRustRuntimeErrorDefinitions } from "./lib/rust-runtime-error-codes.mjs";

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const rootIndex = argv.indexOf("--root");
const root = rootIndex >= 0 && typeof argv[rootIndex + 1] === "string"
  ? resolve(argv[rootIndex + 1])
  : process.cwd();
const sourceRoot = join(root, "packages-ts");
const canonicalSeverities = new Set(["error", "warning", "info"]);

function walk(directory) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry === "tests") {
      continue;
    }
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) files.push(...walk(path));
    else if ((entry.endsWith(".ts") && !entry.endsWith(".d.ts")) || entry.endsWith(".rs")) files.push(path);
  }
  return files;
}

function add(map, key, value) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

function sameSet(left, right) {
  return left.size === right.size
    && [...left].every((item) => right.has(item));
}

function sortedSet(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function parseAllowedSeverities(lines, start) {
  for (let index = start; index < Math.min(start + 12, lines.length); index += 1) {
    const match = lines[index].match(
      /allowedSeverities:\s*\[((?:\s*"[^"]+"\s*,?)+)\]/,
    );
    if (!match) continue;
    return new Set(
      [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]),
    );
  }
  return null;
}

const codeToNames = new Map();
const nameToCodes = new Map();
const codeToSeverities = new Map();
const codeToAllowedSets = new Map();
const violations = [];

for (const file of walk(sourceRoot)) {
  const source = readFileSync(file, "utf8");
  if (file.endsWith(".rs")) {
    for (const definition of parseRustRuntimeErrorDefinitions(source)) {
      const missing = ["code", "name", "severity", "message"]
        .filter((field) => typeof definition[field] !== "string" || definition[field].length === 0);
      if (missing.length > 0 || !/^ERR_[A-Z0-9_]+$/.test(definition.code ?? "")) {
        violations.push({
          code: "V6_RUNTIME_METADATA_INVALID",
          subject: definition.constant,
          detail: missing.length > 0
            ? `Missing or empty fields: ${missing.join(", ")}`
            : `Invalid runtime code: ${definition.code}`,
        });
      }
    }
  }
  const lines = source.split(/\r?\n/);
  const registryEntry = /["']([^"']+)["']\s*:\s*\[((?:\s*"[^"]+"\s*,?)+)\]/g;
  for (const match of source.matchAll(registryEntry)) {
    if (!CODE_TEST.test(match[1])) continue;
    const allowed = new Set(
      [...match[2].matchAll(/"([^"]+)"/g)].map((item) => item[1]),
    );
    if (!codeToAllowedSets.has(match[1])) codeToAllowedSets.set(match[1], []);
    codeToAllowedSets.get(match[1]).push(allowed);
  }
  for (let index = 0; index < lines.length; index += 1) {
    const codeMatch = lines[index].match(/code:\s*"([^"]+)"/);
    if (codeMatch && CODE_TEST.test(codeMatch[1])) {
      const code = codeMatch[1];
      let name;
      let severity;
      for (let cursor = index; cursor < Math.min(index + 8, lines.length); cursor += 1) {
        const nameMatch = lines[cursor].match(/name:\s*"([^"]+)"/);
        const severityMatch = lines[cursor].match(/severity:\s*"([^"]+)"/);
        if (name === undefined && nameMatch) name = nameMatch[1];
        if (severity === undefined && severityMatch) severity = severityMatch[1];
      }
      if (name !== undefined) {
        add(codeToNames, code, name);
        add(nameToCodes, name, code);
      }
      if (severity !== undefined) add(codeToSeverities, code, severity);
      const allowed = parseAllowedSeverities(lines, index);
      if (allowed !== null) {
        if (!codeToAllowedSets.has(code)) codeToAllowedSets.set(code, []);
        codeToAllowedSets.get(code).push(allowed);
      }
    }

    const callIndex = lines[index].search(/make\w*Diag\(/);
    if (callIndex < 0) continue;
    const window = lines[index].slice(callIndex)
      + " "
      + lines.slice(index + 1, Math.min(index + 4, lines.length)).join(" ");
    const args = [...window.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    if (args.length < 2
        || !CODE_TEST.test(args[0])
        || !/^[A-Za-z][A-Za-z0-9_]*$/.test(args[1])) {
      continue;
    }
    add(codeToNames, args[0], args[1]);
    add(nameToCodes, args[1], args[0]);
    for (const argument of args.slice(2)) {
      if (canonicalSeverities.has(argument)) {
        add(codeToSeverities, args[0], argument);
      }
    }
  }
}

for (const [code, names] of codeToNames) {
  if (names.size > 1) {
    violations.push({
      code: "V1_CODE_OVERLOAD",
      subject: code,
      detail: `Observed names: ${sortedSet(names).join(", ")}`,
    });
  }
}
for (const [name, codes] of nameToCodes) {
  if (codes.size > 1) {
    violations.push({
      code: "V2_NAME_COLLISION",
      subject: name,
      detail: `Observed codes: ${sortedSet(codes).join(", ")}`,
    });
  }
}
for (const [code, severities] of codeToSeverities) {
  const invalid = sortedSet(severities)
    .filter((severity) => !canonicalSeverities.has(severity));
  if (invalid.length > 0) {
    violations.push({
      code: "V3_SEVERITY_VOCAB",
      subject: code,
      detail: `Invalid severities: ${invalid.join(", ")}`,
    });
  }

  const declaredSets = codeToAllowedSets.get(code) ?? [];
  const declared = declaredSets[0] ?? null;
  if (declaredSets.some((candidate) => !sameSet(candidate, declared))) {
    violations.push({
      code: "V4_POLICY_CONFLICT",
      subject: code,
      detail: "Multiple diagnostic definitions declare different allowedSeverities sets.",
    });
    continue;
  }
  if (severities.size > 1 && declared === null) {
    violations.push({
      code: "V4_MULTI_SEVERITY",
      subject: code,
      detail: `Observed undeclared severities: ${sortedSet(severities).join(", ")}`,
    });
  } else if (declared !== null && !sameSet(severities, declared)) {
    violations.push({
      code: "V4_POLICY_STALE",
      subject: code,
      detail: `Observed ${sortedSet(severities).join(", ")}; declared ${sortedSet(declared).join(", ")}`,
    });
  }
}
for (const [name, codes] of nameToCodes) {
  if (/^[A-Z]/.test(name) && /[a-z]/.test(name)) {
    violations.push({
      code: "V5_NAME_CASE",
      subject: name,
      detail: `Diagnostic name for ${sortedSet(codes).join(", ")} is not UPPER_SNAKE.`,
    });
  }
}

violations.sort((left, right) =>
  left.code.localeCompare(right.code)
  || left.subject.localeCompare(right.subject));

const report = {
  tool: "diagnostic-code-audit",
  schemaVersion: 1,
  root,
  counts: {
    codesWithNames: codeToNames.size,
    names: nameToCodes.size,
    violations: violations.length,
  },
  violations,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("# Galerina diagnostic-code conformance");
  console.log(
    `codes-with-names: ${report.counts.codesWithNames}`
    + ` | names: ${report.counts.names}`,
  );
  for (const item of violations) {
    console.log(`${item.code} ${item.subject}: ${item.detail}`);
  }
  console.log(`VIOLATIONS: ${violations.length}`);
}

process.exit(Math.min(violations.length, 250));
