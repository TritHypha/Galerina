"use strict";

const BUILTIN_TYPES = new Set([
  "ApiError",
  "Array",
  "Bool",
  "Bytes",
  "Channel",
  "Char",
  "Decimal",
  "Duration",
  "EmailError",
  "Error",
  "Float",
  "Float16",
  "Float32",
  "Float64",
  "Int",
  "Int8",
  "Int16",
  "Int32",
  "Int64",
  "Json",
  "JsonArray",
  "JsonBool",
  "JsonNull",
  "JsonNumber",
  "JsonObject",
  "JsonString",
  "Map",
  "Matrix",
  "Money",
  "Option",
  "PaymentError",
  "Request",
  "Response",
  "Result",
  "SecureString",
  "Set",
  "String",
  "Tensor",
  "Timestamp",
  "UInt8",
  "UInt16",
  "UInt32",
  "UInt64",
  "ValidationError",
  "Vector",
  "Void",
  "WebhookError",
  "GBP",
  "USD",
  "EUR",
  "JPY"
]);

const GENERIC_ARITY = new Map([
  ["Option", 1],
  ["Result", 2],
  ["Array", 1],
  ["Set", 1],
  ["Map", 2],
  ["Channel", 1],
  ["Vector", 2],
  ["Matrix", 3],
  ["Money", 1]
]);

function validateTypes(project, ast) {
  const diagnostics = [];
  const knownTypes = new Set(BUILTIN_TYPES);
  const enumCases = new Map();

  for (const type of ast.types) knownTypes.add(type.name);
  for (const item of ast.enums) {
    knownTypes.add(item.name);
    enumCases.set(item.name, item.cases.map((name) => cleanCaseName(name)));
  }

  for (const type of ast.types) {
    if (type.alias) {
      validateTypeRef(type.alias, type, `Type alias ${type.name}`, knownTypes, diagnostics);
    }
    for (const field of type.fields || []) {
      validateTypeRef(field.type, type, `Field ${type.name}.${field.name}`, knownTypes, diagnostics);
    }
  }

  for (const flow of ast.flows) {
    for (const param of flow.params || []) {
      validateTypeRef(param.type, flow, `Parameter ${flow.name}.${param.name}`, knownTypes, diagnostics);
    }
    validateTypeRef(flow.returns, flow, `Return type for flow ${flow.name}`, knownTypes, diagnostics);
  }

  for (const api of ast.apis) {
    for (const route of api.routes || []) {
      if (route.request) validateTypeRef(route.request, api, `Request type for ${route.method} ${route.path}`, knownTypes, diagnostics);
      if (route.response) validateTypeRef(route.response, api, `Response type for ${route.method} ${route.path}`, knownTypes, diagnostics);
    }
  }

  for (const source of project.files) {
    diagnostics.push(...validateMatches(source, enumCases));
  }

  ast.typeCheck = {
    knownTypes: Array.from(knownTypes).sort(),
    enumCount: ast.enums.length,
    flowCount: ast.flows.length
  };

  return diagnostics;
}

function validateTypeRef(typeRef, node, context, knownTypes, diagnostics) {
  if (!typeRef || typeof typeRef !== "string") return;
  const refs = collectTypeRefs(typeRef);

  for (const ref of refs) {
    if (/^\d+$/.test(ref.name)) continue;
    if (!knownTypes.has(ref.name)) {
      diagnostics.push({
        severity: "error",
        errorType: "UnknownType",
        file: node.file,
        line: node.line,
        column: node.column,
        problem: `${context} references unknown type ${ref.name}.`,
        suggestedFix: `Define type ${ref.name}, import it, or use an existing Galerina/built-in type.`
      });
    }

    if (GENERIC_ARITY.has(ref.name) && ref.args !== null && ref.args.length !== GENERIC_ARITY.get(ref.name)) {
      diagnostics.push({
        severity: "error",
        errorType: "GenericArityError",
        file: node.file,
        line: node.line,
        column: node.column,
        problem: `${context} uses ${ref.name} with ${ref.args.length} type arguments; expected ${GENERIC_ARITY.get(ref.name)}.`,
        suggestedFix: `Use ${ref.name}<${Array.from({ length: GENERIC_ARITY.get(ref.name) }, (_, index) => `T${index + 1}`).join(", ")}> with the required number of arguments.`
      });
    }
  }
}

function collectTypeRefs(typeRef) {
  const refs = [];
  parseType(typeRef.trim());
  return refs;

  function parseType(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const genericStart = trimmed.indexOf("<");
    if (genericStart === -1) {
      const name = trimmed.replace(/[^A-Za-z0-9_].*$/, "");
      if (name) refs.push({ name, args: null });
      return;
    }

    const name = trimmed.slice(0, genericStart).trim();
    const genericEnd = findMatchingAngle(trimmed, genericStart);
    const argsText = genericEnd === -1 ? trimmed.slice(genericStart + 1) : trimmed.slice(genericStart + 1, genericEnd);
    const args = splitTopLevel(argsText);
    refs.push({ name, args });
    for (const arg of args) {
      parseType(arg);
    }
  }
}

function validateMatches(source, enumCases) {
  const diagnostics = [];
  const content = source.content;

  for (const flow of findFlowBlocks(content)) {
    const variables = new Map();
    for (const param of parseParams(flow.params)) {
      variables.set(param.name, param.type);
    }
    for (const variable of findTypedLets(flow.body)) {
      variables.set(variable.name, variable.type);
    }

    for (const matchBlock of findMatchBlocks(flow.body)) {
      const subject = matchBlock.subject.trim();
      const subjectType = variables.get(subject);
      if (!subjectType) continue;

      const expected = expectedCasesForType(subjectType, enumCases);
      if (!expected) continue;

      const actual = parseMatchCases(matchBlock.body);
      const missing = expected.filter((name) => !actual.includes(name));
      if (missing.length > 0) {
        const location = offsetLocation(source.content, flow.bodyOffset + matchBlock.index);
        diagnostics.push({
          severity: "error",
          errorType: "ExhaustiveMatchError",
          file: source.relativePath,
          line: location.line,
          column: location.column,
          problem: `Match on ${subject} is missing cases: ${missing.join(", ")}.`,
          suggestedFix: `Add match cases for ${missing.join(", ")}.`
        });
      }
    }
  }

  return diagnostics;
}

function expectedCasesForType(typeRef, enumCases) {
  const refs = collectTypeRefs(typeRef);
  const root = refs[0];
  if (!root) return null;
  if (root.name === "Option") return ["Some", "None"];
  if (root.name === "Result") return ["Ok", "Err"];
  if (enumCases.has(root.name)) return enumCases.get(root.name);
  return null;
}

function parseMatchCases(body) {
  const cases = [];
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s*\(|\s*=>)/);
    if (match) cases.push(match[1]);
  }
  return cases;
}

function findFlowBlocks(content) {
  const blocks = [];
  const regex = /\b((?:secure|pure)\s+)?flow\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*->\s*[A-Za-z_][A-Za-z0-9_<>, ]*(?:\s*\n\s*effects\s+\[[^\]]+\])?\s*\{/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const open = content.indexOf("{", match.index);
    const close = findMatching(content, open, "{", "}");
    if (close === -1) continue;
    blocks.push({
      name: match[2],
      params: match[3],
      body: content.slice(open + 1, close),
      bodyOffset: open + 1
    });
    regex.lastIndex = close + 1;
  }
  return blocks;
}

function findMatchBlocks(content) {
  const blocks = [];
  const regex = /\bmatch\s+([^{]+)\{/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const open = content.indexOf("{", match.index);
    const close = findMatching(content, open, "{", "}");
    if (close === -1) continue;
    blocks.push({
      subject: match[1],
      body: content.slice(open + 1, close),
      index: match.index
    });
    regex.lastIndex = close + 1;
  }
  return blocks;
}

function findTypedLets(content) {
  const output = [];
  const regex = /\b(?:let|mut)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_<>, ]*)\s*=/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    output.push({ name: match[1], type: match[2].trim() });
  }
  return output;
}

function parseParams(text) {
  if (!text.trim()) return [];
  return splitTopLevel(text).map((item) => {
    const index = item.indexOf(":");
    if (index === -1) return null;
    return {
      name: item.slice(0, index).trim(),
      type: item.slice(index + 1).trim()
    };
  }).filter(Boolean);
}

function splitTopLevel(text) {
  const output = [];
  let depth = 0;
  let current = "";
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

function findMatchingAngle(text, open) {
  return findMatching(text, open, "<", ">");
}

function findMatching(text, open, left, right) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === left) depth += 1;
    if (text[i] === right) depth -= 1;
    if (depth === 0) return i;
  }
  return -1;
}

function cleanCaseName(value) {
  return value.trim().replace(/\(.+$/, "").replace(/[^A-Za-z0-9_].*$/, "");
}

function offsetLocation(content, offset) {
  const before = content.slice(0, offset);
  const lines = before.split(/\r?\n/);
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1
  };
}

module.exports = {
  validateTypes
};
