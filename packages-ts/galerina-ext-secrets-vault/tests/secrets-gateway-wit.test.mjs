import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { SECRETS_GATEWAY_WIT } from "../dist/types.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const generatorPath = resolve(repoRoot, "scripts/generate-secrets-gateway-wit.mjs");
const fungiPath = resolve(packageRoot, "src/self-hosted/secrets-gateway-wit.fungi");
const productFungiPath = resolve(repoRoot, "packages/fungi/products/galerina-ext-secrets-vault/secrets-gateway-wit.fungi");

function createWitGeneratorFixture() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "galerina-wit-source-check-"));
  const packageRelative = "packages-ts/galerina-ext-secrets-vault";
  const packageFixture = join(fixtureRoot, packageRelative);
  const sourceRelative = `${packageRelative}/src/types.ts`;
  const fixtureSource = join(fixtureRoot, sourceRelative);
  const copyIntoFixture = (source, relative) => {
    const target = join(fixtureRoot, relative);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  };

  copyIntoFixture(generatorPath, "scripts/generate-secrets-gateway-wit.mjs");
  copyIntoFixture(resolve(packageRoot, "package.json"), `${packageRelative}/package.json`);
  copyIntoFixture(resolve(packageRoot, "dist/types.js"), `${packageRelative}/dist/types.js`);
  copyIntoFixture(resolve(packageRoot, "src/types.ts"), sourceRelative);
  copyIntoFixture(fungiPath, `${packageRelative}/src/self-hosted/secrets-gateway-wit.fungi`);
  copyIntoFixture(productFungiPath, "packages/fungi/products/galerina-ext-secrets-vault/secrets-gateway-wit.fungi");
  symlinkSync(
    resolve(packageRoot, "node_modules"),
    join(packageFixture, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  return { fixtureRoot, fixtureSource };
}

function runFixtureGeneratorCheck(fixtureRoot) {
  return spawnSync(process.execPath, [join(fixtureRoot, "scripts/generate-secrets-gateway-wit.mjs"), "--check"], {
    cwd: fixtureRoot,
    encoding: "utf8",
  });
}

function skipFungiTrivia(source, start) {
  let index = start;
  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index += 1;
    } else if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      index = newline < 0 ? source.length : newline + 1;
    } else if (source.startsWith("/*", index)) {
      const close = source.indexOf("*/", index + 2);
      assert.notEqual(close, -1, "unterminated Fungi block comment");
      index = close + 2;
    } else {
      break;
    }
  }
  return index;
}

function fungiStringEnd(source, start) {
  assert.equal(source[start], '"', "expected a Fungi string literal");
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
    } else if (source[index] === '"') {
      return index + 1;
    }
  }
  assert.fail("unterminated Fungi string literal");
}

function maskFungiCommentsAndStrings(source) {
  const chars = source.split("");
  const mask = (start, end) => {
    for (let index = start; index < end; index += 1) {
      if (chars[index] !== "\n" && chars[index] !== "\r") chars[index] = " ";
    }
  };
  for (let index = 0; index < source.length;) {
    if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      const end = newline < 0 ? source.length : newline;
      mask(index, end);
      index = end;
    } else if (source.startsWith("/*", index)) {
      const close = source.indexOf("*/", index + 2);
      assert.notEqual(close, -1, "unterminated Fungi block comment");
      const end = close + 2;
      mask(index, end);
      index = end;
    } else if (source[index] === '"') {
      const end = fungiStringEnd(source, index);
      mask(index, end);
      index = end;
    } else {
      index += 1;
    }
  }
  return chars.join("");
}

function maskWitCommentsAndStrings(source) {
  const chars = source.split("");
  const mask = (start, end) => {
    for (let index = start; index < end; index += 1) {
      if (chars[index] !== "\n" && chars[index] !== "\r") chars[index] = " ";
    }
  };

  for (let index = 0; index < source.length;) {
    if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      const end = newline < 0 ? source.length : newline;
      mask(index, end);
      index = end;
    } else if (source.startsWith("/*", index)) {
      const start = index;
      let depth = 1;
      index += 2;
      while (index < source.length && depth > 0) {
        if (source.startsWith("/*", index)) {
          depth += 1;
          index += 2;
        } else if (source.startsWith("*/", index)) {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      assert.equal(depth, 0, "unterminated WIT block comment");
      mask(start, index);
    } else if (source[index] === '"') {
      const end = fungiStringEnd(source, index);
      for (let stringIndex = index; stringIndex < end; stringIndex += 1) {
        if (chars[stringIndex] !== "\n" && chars[stringIndex] !== "\r") chars[stringIndex] = "\u0001";
      }
      index = end;
    } else {
      index += 1;
    }
  }
  return chars.join("");
}

function normalizedWitTokens(source) {
  const tokens = [];
  for (let index = 0; index < source.length;) {
    if (/\s/.test(source[index])) {
      index += 1;
    } else if (/[A-Za-z]/.test(source[index])) {
      const start = index;
      while (/[A-Za-z0-9]/.test(source[index] ?? "")) index += 1;
      while (source[index] === "-") {
        index += 1;
        if (!/[A-Za-z0-9]/.test(source[index] ?? "")) return null;
        while (/[A-Za-z0-9]/.test(source[index] ?? "")) index += 1;
      }
      tokens.push(source.slice(start, index));
    } else if (source.startsWith("->", index)) {
      tokens.push("->");
      index += 2;
    } else if ("<>{}:,;()".includes(source[index])) {
      tokens.push(source[index]);
      index += 1;
    } else {
      return null;
    }
  }
  return tokens.join(" ");
}

function findTopLevelWitBlock(source, packageName, interfaceName, kind, blockName) {
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const code = maskWitCommentsAndStrings(source);
  const packageTokens = [...code.matchAll(/(?<![A-Za-z0-9_-])package(?![A-Za-z0-9_-])/g)];
  const packageDeclaration = code.match(new RegExp(`^\\s*package\\s+${escape(packageName)}\\s*;`));
  if (packageTokens.length !== 1 || !packageDeclaration) return null;

  const packageBodyStart = packageDeclaration[0].length;
  const candidateInterfaces = [...code.slice(packageBodyStart).matchAll(
    new RegExp(`(?<![A-Za-z0-9_-])interface\\s+${escape(interfaceName)}(?![A-Za-z0-9_-])\\s*\\{`, "g"),
  )];
  const interfaces = candidateInterfaces.filter((match) => {
    let depth = 0;
    for (const character of code.slice(packageBodyStart, packageBodyStart + match.index)) {
      if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
      if (depth < 0) return false;
    }
    return depth === 0;
  });
  if (interfaces.length !== 1) return null;

  const interfaceStart = packageBodyStart + interfaces[0].index;
  const interfaceOpen = code.indexOf("{", interfaceStart);
  const interfaceClose = matchingFungiBrace(code, interfaceOpen);
  const interfaceBodyStart = interfaceOpen + 1;
  const interfaceBody = code.slice(interfaceBodyStart, interfaceClose);
  const declarations = [...interfaceBody.matchAll(
    new RegExp(`(?<![A-Za-z0-9_-])${escape(kind)}\\s+${escape(blockName)}(?![A-Za-z0-9_-])\\s*\\{`, "g"),
  )].filter((match) => {
    let depth = 0;
    for (const character of interfaceBody.slice(0, match.index)) {
      if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
    }
    return depth === 0;
  });
  if (declarations.length !== 1) return null;

  const openBrace = interfaceBodyStart + interfaceBody.indexOf("{", declarations[0].index);
  const closeBrace = matchingFungiBrace(code, openBrace);
  return code.slice(openBrace + 1, closeBrace);
}

function assertMemoryAccountingContract(source) {
  const accounting = findTopLevelWitBlock(
    source,
    "galerina:secrets-vault@0.1.0",
    "secrets-gateway",
    "record",
    "memory-accounting",
  );
  assert.ok(accounting, "the secrets-gateway interface must define exactly one live memory-accounting record");
  const fields = accounting.split(",").map((field) => field.trim()).filter(Boolean).map((field) => {
    const match = field.match(/^([A-Za-z][A-Za-z0-9-]*)\s*:\s*([A-Za-z][A-Za-z0-9-]*)$/);
    assert.ok(match, `malformed live memory-accounting field: ${field}`);
    return `${match[1]}:${match[2]}`;
  });
  assert.deepEqual(fields, [
    "state:accounting-state",
    "reserved-bytes:u64",
    "allocated-bytes:u64",
    "retained-bytes:u64",
    "unresolved-bytes:u64",
  ]);

  const states = findTopLevelWitBlock(
    source,
    "galerina:secrets-vault@0.1.0",
    "secrets-gateway",
    "enum",
    "accounting-state",
  );
  assert.ok(states, "the secrets-gateway interface must define exactly one live accounting-state enum");
  assert.deepEqual(states.split(",").map((state) => state.trim()).filter(Boolean), ["accounted", "unknown", "inconsistent", "invalid"]);

  const accountingMethod = findWitResourceMethod(
    source,
    "galerina:secrets-vault@0.1.0",
    "secrets-gateway",
    "secret-lease",
    "accounting",
  );
  assert.ok(accountingMethod, "secret-lease must expose exactly one accounting method");
  assert.equal(normalizedWitTokens(accountingMethod.parameters), "");
  assert.equal(normalizedWitTokens(accountingMethod.returnType), "-> memory-accounting");
  assert.doesNotMatch(accounting, /\b(?:option|float|f32|f64|null|nan)\b/i);
  return fields;
}

function findTopLevelWitFunction(source, packageName, interfaceName, functionName) {
  const escapedPackage = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedInterface = interfaceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedFunction = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const code = maskWitCommentsAndStrings(source);
  const packageTokens = [...code.matchAll(/(?<![A-Za-z0-9_-])package(?![A-Za-z0-9_-])/g)];
  const packageDeclaration = code.match(new RegExp(`^\\s*package\\s+${escapedPackage}\\s*;`));
  if (packageTokens.length !== 1 || !packageDeclaration) return null;

  const packageBodyStart = packageDeclaration[0].length;
  const candidateInterfaces = [...code.slice(packageBodyStart).matchAll(
    new RegExp(`(?<![A-Za-z0-9_-])interface\\s+${escapedInterface}(?![A-Za-z0-9_-])\\s*\\{`, "g"),
  )];
  const interfaceMatches = candidateInterfaces.filter((match) => {
    const beforeInterface = code.slice(packageBodyStart, packageBodyStart + match.index);
    let braceDepth = 0;
    for (const char of beforeInterface) {
      if (char === "{") braceDepth += 1;
      else if (char === "}") braceDepth -= 1;
      if (braceDepth < 0) return false;
    }
    return braceDepth === 0;
  });
  if (interfaceMatches.length !== 1) return null;

  const interfaceStart = packageBodyStart + interfaceMatches[0].index;
  const openBrace = code.indexOf("{", interfaceStart);
  const closeBrace = matchingFungiBrace(code, openBrace);
  const bodyStart = openBrace + 1;
  const bodyEnd = closeBrace;
  const body = code.slice(bodyStart, bodyEnd);
  const candidate = new RegExp(`(?<![A-Za-z0-9_-])${escapedFunction}(?![A-Za-z0-9_-])\\s*:\\s*func\\s*\\(`, "g");
  const declarations = [];

  for (const match of body.matchAll(candidate)) {
    const declarationStart = bodyStart + match.index;
    let braceDepth = 0;
    for (let index = bodyStart; index < declarationStart; index += 1) {
      if (code[index] === "{") braceDepth += 1;
      else if (code[index] === "}") braceDepth -= 1;
    }
    if (braceDepth !== 0) continue;

    const openParen = code.indexOf("(", declarationStart + match[0].lastIndexOf("("));
    let parenDepth = 0;
    let closed = false;
    for (let index = openParen; index < bodyEnd; index += 1) {
      if (code[index] === "(") parenDepth += 1;
      else if (code[index] === ")") {
        parenDepth -= 1;
        if (parenDepth === 0) {
          const semicolon = code.indexOf(";", index + 1);
          assert.notEqual(semicolon, -1, `unterminated WIT function declaration for ${functionName}`);
          declarations.push({
            parameters: code.slice(openParen + 1, index),
            returnType: code.slice(index + 1, semicolon),
          });
          closed = true;
          break;
        }
      }
    }
    if (!closed) assert.fail(`unterminated WIT function parameters for ${functionName}`);
  }

  return declarations.length === 1 ? declarations[0] : null;
}

function findWitResourceMethod(source, packageName, interfaceName, resourceName, methodName) {
  const escapedPackage = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedInterface = interfaceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedResource = resourceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedMethod = methodName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const code = maskWitCommentsAndStrings(source);
  const packageTokens = [...code.matchAll(/(?<![A-Za-z0-9_-])package(?![A-Za-z0-9_-])/g)];
  const packageDeclaration = code.match(new RegExp(`^\\s*package\\s+${escapedPackage}\\s*;`));
  if (packageTokens.length !== 1 || !packageDeclaration) return null;

  const packageBodyStart = packageDeclaration[0].length;
  const candidateInterfaces = [...code.slice(packageBodyStart).matchAll(
    new RegExp(`(?<![A-Za-z0-9_-])interface\\s+${escapedInterface}(?![A-Za-z0-9_-])\\s*\\{`, "g"),
  )];
  const interfaces = candidateInterfaces.filter((match) => {
    const beforeInterface = code.slice(packageBodyStart, packageBodyStart + match.index);
    let depth = 0;
    for (const character of beforeInterface) {
      if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
      if (depth < 0) return false;
    }
    return depth === 0;
  });
  if (interfaces.length !== 1) return null;

  const interfaceStart = packageBodyStart + interfaces[0].index;
  const interfaceOpen = code.indexOf("{", interfaceStart);
  const interfaceClose = matchingFungiBrace(code, interfaceOpen);
  const interfaceBodyStart = interfaceOpen + 1;
  const interfaceBody = code.slice(interfaceBodyStart, interfaceClose);
  const resourcePattern = new RegExp(`(?<![A-Za-z0-9_-])resource\\s+${escapedResource}(?![A-Za-z0-9_-])\\s*\\{`, "g");
  const resources = [...interfaceBody.matchAll(resourcePattern)].filter((match) => {
    let depth = 0;
    for (const character of interfaceBody.slice(0, match.index)) {
      if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
    }
    return depth === 0;
  });
  if (resources.length !== 1) return null;

  const openBrace = interfaceBodyStart + interfaceBody.indexOf("{", resources[0].index);
  const closeBrace = matchingFungiBrace(code, openBrace);
  const body = code.slice(openBrace + 1, closeBrace);
  const declarations = [];
  const candidate = new RegExp(`(?<![A-Za-z0-9_-])${escapedMethod}(?![A-Za-z0-9_-])\\s*:\\s*func\\s*\\(`, "g");
  for (const match of body.matchAll(candidate)) {
    let braceDepth = 0;
    for (const character of body.slice(0, match.index)) {
      if (character === "{") braceDepth += 1;
      else if (character === "}") braceDepth -= 1;
    }
    if (braceDepth !== 0) continue;
    const openParen = body.indexOf("(", match.index + match[0].lastIndexOf("("));
    let depth = 0;
    for (let index = openParen; index < body.length; index += 1) {
      if (body[index] === "(") depth += 1;
      else if (body[index] === ")") {
        depth -= 1;
        if (depth === 0) {
          const semicolon = body.indexOf(";", index + 1);
          assert.notEqual(semicolon, -1, `unterminated WIT resource method ${methodName}`);
          declarations.push({
            parameters: body.slice(openParen + 1, index),
            returnType: body.slice(index + 1, semicolon),
          });
          break;
        }
      }
    }
  }
  return declarations.length === 1 ? declarations[0] : null;
}

function matchingFungiBrace(source, open) {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      index = newline < 0 ? source.length : newline;
    } else if (source.startsWith("/*", index)) {
      const close = source.indexOf("*/", index + 2);
      assert.notEqual(close, -1, "unterminated Fungi block comment");
      index = close + 1;
    } else if (source[index] === '"') {
      index = fungiStringEnd(source, index) - 1;
    } else if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  assert.fail("unclosed Fungi block");
}

function decodeFungiString(token) {
  const jsonString = token.replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_escape, digits) => {
    const codepoint = Number.parseInt(digits, 16);
    assert.ok(codepoint <= 0x10ffff, "Fungi Unicode escape must be a valid code point");
    if (codepoint <= 0xffff) return `\\u${codepoint.toString(16).padStart(4, "0")}`;
    const adjusted = codepoint - 0x10000;
    const high = 0xd800 + (adjusted >> 10);
    const low = 0xdc00 + (adjusted & 0x3ff);
    return `\\u${high.toString(16)}\\u${low.toString(16)}`;
  });
  return JSON.parse(jsonString);
}

function decodeFungiReturnLiteral(source, sourcePath, flowName = "secretsGatewayWit") {
  const escapedName = flowName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declaration = new RegExp(`\\bpure\\s+flow\\s+${escapedName}\\s*\\(\\s*\\)\\s*->\\s*String\\b`, "g");
  const code = maskFungiCommentsAndStrings(source);
  const matches = [...code.matchAll(declaration)];
  assert.equal(matches.length, 1, `expected one named ${flowName} flow in ${sourcePath}`);

  let cursor = skipFungiTrivia(source, matches[0].index + matches[0][0].length);
  if (source.startsWith("contract", cursor) && !/[\\w$]/.test(source[cursor + "contract".length] ?? "")) {
    cursor = skipFungiTrivia(source, cursor + "contract".length);
    assert.equal(source[cursor], "{", "expected contract body");
    cursor = matchingFungiBrace(source, cursor) + 1;
    cursor = skipFungiTrivia(source, cursor);
  }
  assert.equal(source[cursor], "{", `expected body for ${flowName}`);
  const bodyEnd = matchingFungiBrace(source, cursor);
  const body = source.slice(cursor + 1, bodyEnd);
  const returns = [];

  for (let index = 0; index < body.length;) {
    if (body.startsWith("//", index)) {
      const newline = body.indexOf("\n", index + 2);
      index = newline < 0 ? body.length : newline + 1;
    } else if (body.startsWith("/*", index)) {
      const close = body.indexOf("*/", index + 2);
      assert.notEqual(close, -1, "unterminated Fungi block comment");
      index = close + 2;
    } else if (body[index] === '"') {
      index = fungiStringEnd(body, index);
    } else if (/[A-Za-z_$]/.test(body[index])) {
      const start = index;
      while (/[\w$]/.test(body[index] ?? "")) index += 1;
      if (body.slice(start, index) === "return") {
        const valueStart = skipFungiTrivia(body, index);
        const valueEnd = fungiStringEnd(body, valueStart);
        returns.push(decodeFungiString(body.slice(valueStart, valueEnd)));
        let trailing = skipFungiTrivia(body, valueEnd);
        if (body[trailing] === ";") trailing = skipFungiTrivia(body, trailing + 1);
        assert.equal(trailing, body.length, "expected a complete string-literal return with no expression suffix");
        index = valueEnd;
      }
    } else {
      index += 1;
    }
  }
  assert.equal(returns.length, 1, `expected exactly one literal return from ${flowName}`);
  return returns[0];
}

describe("secrets gateway WIT custody boundary", () => {
  it("finds only live top-level WIT interface functions, not comments or nested resource methods", () => {
    const wrapped = (body) => `package test:secrets; interface secrets-gateway {\n${body}\n}`;
    const commented = wrapped("  // close-secret-lease: func(lease: secret-lease);\n");
    const nestedComment = wrapped("  /* outer /* close-secret-lease: func(lease: secret-lease); */ still comment */\n");
    const nested = wrapped("  resource secret-lease {\n    close-secret-lease: func(lease: secret-lease);\n  }\n");
    const hyphenatedSuffix = wrapped("  obsolete-close-secret-lease: func(lease: secret-lease);\n");
    const liveBorrowed = wrapped("  close-secret-lease: func(lease: borrow<secret-lease>);\n");
    const duplicate = wrapped("  close-secret-lease: func(lease: secret-lease);\n  close-secret-lease: func(lease: secret-lease);\n");
    const commentedTokens = wrapped("  close-secret-lease: func( lease /* owner */ : secret-lease, ) /* fake ) -> result<cleanup-receipt, refusal>; */ -> result<cleanup-receipt, refusal>;\n");
    const missingReturn = wrapped("  close-secret-lease: func(lease: secret-lease) /* fake ) -> result<cleanup-receipt, refusal>; */;\n");
    const splitIdentifier = wrapped("  close-secret-lease: func(lease: secret- lease) -> result<cleanup-receipt, refusal>;\n");
    const extraStringToken = wrapped('  close-secret-lease: func(lease: "unexpected" secret-lease) -> result<cleanup-receipt, refusal>;\n');
    const nestedPackageDecoy = `package test:secrets;\ninterface %secrets-gateway {\n  close-secret-lease: func(lease: borrow<secret-lease>) -> result<cleanup-receipt, refusal>;\n}\npackage audit:decoy {\n  interface secrets-gateway {\n    close-secret-lease: func(lease: secret-lease) -> result<cleanup-receipt, refusal>;\n  }\n}`;

    assert.equal(findTopLevelWitFunction(commented, "test:secrets", "secrets-gateway", "close-secret-lease"), null);
    assert.equal(findTopLevelWitFunction(nestedComment, "test:secrets", "secrets-gateway", "close-secret-lease"), null);
    assert.equal(findTopLevelWitFunction(nested, "test:secrets", "secrets-gateway", "close-secret-lease"), null);
    assert.equal(findTopLevelWitFunction(hyphenatedSuffix, "test:secrets", "secrets-gateway", "close-secret-lease"), null);
    assert.equal(findTopLevelWitFunction(duplicate, "test:secrets", "secrets-gateway", "close-secret-lease"), null);
    assert.equal(
      findTopLevelWitFunction(nestedPackageDecoy, "test:secrets", "secrets-gateway", "close-secret-lease"),
      null,
      "a valid-looking nested-package declaration must not satisfy the root package contract",
    );
    assert.equal(
      findTopLevelWitFunction(liveBorrowed, "test:secrets", "secrets-gateway", "close-secret-lease")?.parameters.trim(),
      "lease: borrow<secret-lease>",
    );
    const withComments = findTopLevelWitFunction(commentedTokens, "test:secrets", "secrets-gateway", "close-secret-lease");
    assert.equal(normalizedWitTokens(withComments?.parameters ?? "")?.replace(/ ,$/, ""), "lease : secret-lease");
    assert.equal(normalizedWitTokens(withComments?.returnType ?? ""), "-> result < cleanup-receipt , refusal >");
    assert.equal(
      normalizedWitTokens(findTopLevelWitFunction(missingReturn, "test:secrets", "secrets-gateway", "close-secret-lease")?.returnType ?? ""),
      "",
    );
    assert.equal(normalizedWitTokens(findTopLevelWitFunction(splitIdentifier, "test:secrets", "secrets-gateway", "close-secret-lease")?.parameters ?? ""), null);
    assert.equal(normalizedWitTokens(findTopLevelWitFunction(extraStringToken, "test:secrets", "secrets-gateway", "close-secret-lease")?.parameters ?? ""), null);
  });

  it("binds resource methods to the requested interface and direct resource body", () => {
    const method = "verify-password: func(request: borrow<authenticated-request>) -> result<verification-result, refusal>;";
    const misplaced = `package galerina:secrets-vault@0.1.0;\ninterface secrets-gateway {}\ninterface unrelated { resource secret-lease { ${method} } }`;
    const nested = `package galerina:secrets-vault@0.1.0;\ninterface secrets-gateway { resource secret-lease { resource nested { ${method} } } }`;

    assert.equal(
      findWitResourceMethod(misplaced, "galerina:secrets-vault@0.1.0", "secrets-gateway", "secret-lease", "verify-password"),
      null,
      "a matching resource under a different interface must not satisfy the contract",
    );
    assert.equal(
      findWitResourceMethod(nested, "galerina:secrets-vault@0.1.0", "secrets-gateway", "secret-lease", "verify-password"),
      null,
      "a nested declaration must not satisfy a direct resource-method check",
    );
  });

  it("defines the authority boundary as realm-side, never as a client-relay assertion", () => {
    assert.match(SECRETS_GATEWAY_WIT, /secret-realm host/i);
    assert.match(SECRETS_GATEWAY_WIT, /separately trusted issuer/i);
    assert.match(SECRETS_GATEWAY_WIT, /client\/relay.*cannot.*authority/i);
  });

  it("can regenerate both Fungi mirrors from the built contract oracle without drift", () => {
    const checked = spawnSync(process.execPath, [generatorPath, "--check"], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 15_000,
    });
    assert.equal(checked.error, undefined, checked.error?.message);
    assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`);
  });

  it("detects source drift when compiled dist and generated mirrors are stale", () => {
    const { fixtureRoot, fixtureSource } = createWitGeneratorFixture();

    try {
      const source = readFileSync(fixtureSource, "utf8");
      const changed = source.replace("verify-password: func(", "verify-password-v2: func(");
      assert.notEqual(changed, source, "the fixture must change the source WIT declaration");
      writeFileSync(fixtureSource, changed, "utf8");

      const checked = runFixtureGeneratorCheck(fixtureRoot);
      assert.equal(checked.error, undefined, checked.error?.message);
      assert.equal(checked.status, 1, `${checked.stdout}\n${checked.stderr}`);
      assert.match(checked.stderr, /drift: .*secrets-gateway-wit\.fungi/);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("refuses mutable or duplicate SECRETS_GATEWAY_WIT declarations", () => {
    const { fixtureRoot, fixtureSource } = createWitGeneratorFixture();
    const original = readFileSync(fixtureSource, "utf8");
    const mutable = original.replace("export const SECRETS_GATEWAY_WIT", "export let SECRETS_GATEWAY_WIT");
    const duplicate = `${original}\nconst SECRETS_GATEWAY_WIT = "conflicting local declaration";\n`;
    const destructuredDuplicate = `${original}\nconst { value: SECRETS_GATEWAY_WIT } = { value: "conflicting local declaration" };\n`;
    const packageLiteral = "`\\npackage galerina:secrets-vault@0.1.0;\\ninterface secrets-gateway {}\\n`";
    const destructuredOnly = `export const { SECRETS_GATEWAY_WIT } = ${packageLiteral};`;
    const duplicateBindings = `export const { first: SECRETS_GATEWAY_WIT, second: SECRETS_GATEWAY_WIT } = ${packageLiteral};`;
    assert.notEqual(mutable, original, "the mutable-binding control must alter the declaration");

    try {
      for (const [label, source] of [
        ["mutable binding", mutable],
        ["non-exported duplicate", duplicate],
        ["destructured duplicate", destructuredDuplicate],
        ["sole destructured binding", destructuredOnly],
        ["duplicate names in destructured binding", duplicateBindings],
      ]) {
        writeFileSync(fixtureSource, source, "utf8");
        const checked = runFixtureGeneratorCheck(fixtureRoot);
        assert.equal(checked.error, undefined, `${label}: ${checked.error?.message}`);
        assert.equal(checked.status, 2, `${label}: ${checked.stdout}\n${checked.stderr}`);
        assert.match(checked.stderr, /SECRETS_GATEWAY_WIT/);
      }
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("extracts only the sole return from the named Fungi flow", () => {
    const source = `pure flow decoy() -> String {
  return "wrong flow"
}
pure flow secretsGatewayWit() -> String {
  return "selected flow"
}`;
    assert.equal(decodeFungiReturnLiteral(source, "fixture", "secretsGatewayWit"), "selected flow");

    const commented = `// return "comment decoy"
${source}`;
    assert.equal(decodeFungiReturnLiteral(commented, "fixture", "secretsGatewayWit"), "selected flow");

    const ambiguous = source.replace('  return "selected flow"', '  return "selected flow"\n  return "second return"');
    assert.throws(
      () => decodeFungiReturnLiteral(ambiguous, "fixture", "secretsGatewayWit"),
      /complete string-literal return with no expression suffix/,
    );

    const commentedDeclaration = `pure flow other() -> String {
  return "other flow"
}
// pure flow secretsGatewayWit() -> String { return "commented flow" }`;
    assert.throws(
      () => decodeFungiReturnLiteral(commentedDeclaration, "fixture", "secretsGatewayWit"),
      /expected one named secretsGatewayWit flow/,
    );

    const computedReturn = `pure flow secretsGatewayWit() -> String {
  return "selected flow" + " changed"
}`;
    assert.throws(
      () => decodeFungiReturnLiteral(computedReturn, "fixture", "secretsGatewayWit"),
      /complete string-literal return/,
    );
  });

  it("declares opaque resources without raw secret-byte types", () => {
    const liveWit = maskWitCommentsAndStrings(SECRETS_GATEWAY_WIT);
    assert.equal(
      [...liveWit.matchAll(/^\s*package\s+galerina:secrets-vault@0\.1\.0\s*;/gm)].length,
      1,
      "the contract must remain in the pinned WIT package identity",
    );
    assert.match(liveWit, /use secrets-gateway\.\{authenticated-request, release-receipt, refusal\};/);
    assert.match(liveWit, /request: authenticated-request/);
    assert.match(liveWit, /-> result<release-receipt, refusal>/);
    assert.doesNotMatch(liveWit, /secrets-gateway\.(?:authenticated-request|release-receipt|refusal)/);
    assert.match(liveWit, /resource authenticated-request\s*;/);
    assert.match(liveWit, /resource signet-grant\s*;/);
    assert.match(liveWit, /resource secret-lease\s*\{/);
    assert.match(liveWit, /resource verification-result\s*;/);
    assert.match(liveWit, /resource cleanup-receipt\s*;/);
    assert.match(liveWit, /enum lifecycle-state\s*\{/);
    const lifecycle = liveWit.match(/enum lifecycle-state\s*\{([^}]*)\}/)?.[1];
    assert.ok(lifecycle, "lifecycle status must be represented by the closed enum");
    assert.deepEqual(
      lifecycle.split(",").map((state) => state.trim()).filter(Boolean),
      ["admitted", "active", "cleanup-pending", "cleanup-failed", "retired", "invalid"],
    );
    assert.doesNotMatch(lifecycle, /\b(?:null|none|nan|float|f32|f64)\b/i);
    const verify = findWitResourceMethod(liveWit, "galerina:secrets-vault@0.1.0", "secrets-gateway", "secret-lease", "verify-password");
    assert.ok(verify, "verification must be a live secret-lease resource method");
    assert.match(verify.parameters, /request:\s*borrow<authenticated-request>/);
    assert.match(verify.parameters, /grant:\s*borrow<signet-grant>/);
    assert.equal(normalizedWitTokens(verify.returnType), "-> result < verification-result , refusal >");
    const commentOnlyVerify = SECRETS_GATEWAY_WIT.replace(
      /(^[ \t]*verify-password:\s*func\([\s\S]*?^[ \t]*\)\s*->\s*result<verification-result, refusal>;)/m,
      "  /* $1 */",
    );
    assert.notEqual(commentOnlyVerify, SECRETS_GATEWAY_WIT, "the negative control must comment out the live declaration");
    assert.match(commentOnlyVerify, /verify-password:\s*func\(/, "the decoy text remains present inside a comment");
    assert.equal(
      findWitResourceMethod(commentOnlyVerify, "galerina:secrets-vault@0.1.0", "secrets-gateway", "secret-lease", "verify-password"),
      null,
      "comment-only declaration text must not satisfy the structural check",
    );
    const close = findTopLevelWitFunction(SECRETS_GATEWAY_WIT, "galerina:secrets-vault@0.1.0", "secrets-gateway", "close-secret-lease");
    assert.ok(close, "cleanup must consume an owned lease through a free function");
    assert.equal(normalizedWitTokens(close.parameters)?.replace(/ ,$/, ""), "lease : secret-lease");
    assert.equal(normalizedWitTokens(close.returnType), "-> result < cleanup-receipt , refusal >");
    const issue = findTopLevelWitFunction(liveWit, "galerina:secrets-vault@0.1.0", "secrets-gateway", "issue-password-verification-grant");
    const acquire = findTopLevelWitFunction(liveWit, "galerina:secrets-vault@0.1.0", "secrets-gateway", "acquire-password-lease");
    const release = findTopLevelWitFunction(liveWit, "galerina:secrets-vault@0.1.0", "secrets-gateway", "release-verification-result");
    assert.ok(issue, "grant issuance must be a live top-level interface function");
    assert.ok(acquire, "lease acquisition must be a live top-level interface function");
    assert.ok(release, "release must be a live top-level interface function");
    assert.match(release.parameters, /proof:\s*verification-result/);
    assert.match(release.parameters, /cleanup:\s*cleanup-receipt/);
    assert.doesNotMatch(release.parameters, /verified\s*:\s*bool/);
    assert.doesNotMatch(liveWit, /\blist\s*<\s*u8\s*>/);
    assert.doesNotMatch(liveWit, /type\s+secret-handle\s*=\s*u32/);
  });

  it("keeps the verification outcome opaque to guest code", () => {
    const liveWit = maskWitCommentsAndStrings(SECRETS_GATEWAY_WIT);
    assert.match(liveWit, /resource verification-result\s*;/);
    assert.doesNotMatch(liveWit, /enum verification-state|verification-result\s*\{/);
    assert.match(
      liveWit,
      /resource release-receipt\s*\{\s*state:\s*func\(\)\s*->\s*release-state;/,
    );
    assert.doesNotMatch(liveWit, /record release-receipt\s*\{/);
    const release = findTopLevelWitFunction(liveWit, "galerina:secrets-vault@0.1.0", "secrets-gateway", "release-verification-result");
    assert.ok(release, "release must be a live top-level interface function");
    assert.match(release.parameters, /proof:\s*verification-result/);
    assert.match(release.parameters, /cleanup:\s*cleanup-receipt/);
    assert.equal(normalizedWitTokens(release.returnType), "-> result < release-receipt , refusal >");
  });

  it("reuses one host-bound request and grant for admission, verification, and release", () => {
    const liveWit = maskWitCommentsAndStrings(SECRETS_GATEWAY_WIT);
    const issue = findTopLevelWitFunction(liveWit, "galerina:secrets-vault@0.1.0", "secrets-gateway", "issue-password-verification-grant");
    assert.ok(issue, "grant issuance must have an explicit request binding");
    assert.match(issue.parameters, /request:\s*borrow<authenticated-request>/);
    assert.doesNotMatch(issue.parameters, /credential-id|expected-version/);

    const verify = findWitResourceMethod(liveWit, "galerina:secrets-vault@0.1.0", "secrets-gateway", "secret-lease", "verify-password");
    assert.ok(verify, "verification must have an explicit request binding");
    assert.match(verify.parameters, /request:\s*borrow<authenticated-request>/);
    assert.match(verify.parameters, /grant:\s*borrow<signet-grant>/);

    const release = findTopLevelWitFunction(liveWit, "galerina:secrets-vault@0.1.0", "secrets-gateway", "release-verification-result");
    assert.ok(release, "release must preserve the original request binding");
    assert.match(release.parameters, /request:\s*borrow<authenticated-request>/);
    assert.match(release.parameters, /grant:\s*borrow<signet-grant>/);
    assert.match(release.parameters, /proof:\s*verification-result/);
    assert.match(release.parameters, /cleanup:\s*cleanup-receipt/);
    assert.doesNotMatch(release.parameters, /recipient\s*:/);
  });

  it("keeps charge reservation distinct from allocation, retention, and unresolved cleanup", () => {
    const accounting = assertMemoryAccountingContract(SECRETS_GATEWAY_WIT);
    assert.match(SECRETS_GATEWAY_WIT, /block stays quarantined until a complete full-extent wipe is proven by a terminal cleanup receipt/i);

    const liveWit = maskWitCommentsAndStrings(SECRETS_GATEWAY_WIT);
    const liveRecord = liveWit.match(/record memory-accounting\s*\{[^}]*\}/)?.[0];
    assert.ok(liveRecord, "the source fixture must contain its live accounting record");
    const weakenedRecord = liveRecord.replace("reserved-bytes: u64", "reserved-bytes: u32");
    assert.notEqual(weakenedRecord, liveRecord, "the negative control must weaken a live accounting field");
    const commentDecoy = SECRETS_GATEWAY_WIT.replace(liveRecord, `/* ${liveRecord} */${weakenedRecord}`);
    assert.match(commentDecoy, /reserved-bytes:\s*u64/, "the stale value remains as a comment-only decoy");
    assert.throws(() => assertMemoryAccountingContract(commentDecoy), /reserved-bytes/);

    const lookalikeField = SECRETS_GATEWAY_WIT.replace("reserved-bytes: u64", "fake-reserved-bytes: u64");
    assert.notEqual(lookalikeField, SECRETS_GATEWAY_WIT, "the lookalike control must change the field name");
    assert.throws(() => assertMemoryAccountingContract(lookalikeField), /reserved-bytes/);

    const completeRecord = `record memory-accounting {
    state: accounting-state,
    reserved-bytes: u64,
    allocated-bytes: u64,
    retained-bytes: u64,
    unresolved-bytes: u64,
  }`;
    const weakenedScopeRecord = completeRecord.replace("reserved-bytes: u64", "reserved-bytes: u32");
    const wrongScope = `package galerina:secrets-vault@0.1.0;
interface unrelated {
  enum accounting-state { accounted, unknown, inconsistent }
  ${completeRecord}
}
interface secrets-gateway {
  enum accounting-state { accounted, unknown, inconsistent }
  ${weakenedScopeRecord}
  resource secret-lease { accounting: func() -> memory-accounting; }
}`;
    assert.throws(() => assertMemoryAccountingContract(wrongScope), /reserved-bytes/);
  });

  it("binds memory accounting declarations to the secrets-gateway interface", () => {
    const completeRecord = `record memory-accounting {
    state: accounting-state,
    reserved-bytes: u64,
    allocated-bytes: u64,
    retained-bytes: u64,
    unresolved-bytes: u64,
  }`;
    const weakenedRecord = completeRecord.replace("reserved-bytes: u64", "reserved-bytes: u32");
    const source = `package galerina:secrets-vault@0.1.0;
interface unrelated {
  enum accounting-state { accounted, unknown, inconsistent, invalid }
  ${completeRecord}
}
interface secrets-gateway {
  enum accounting-state { accounted, unknown, inconsistent, invalid }
  ${weakenedRecord}
  resource secret-lease { accounting: func() -> memory-accounting; }
}`;
    assert.throws(() => assertMemoryAccountingContract(source), /reserved-bytes/);
  });

  it("keeps the self-hosted Fungi contract byte-for-byte aligned with its TS oracle", () => {
    const source = readFileSync(fungiPath, "utf8");
    assert.equal(decodeFungiReturnLiteral(source, fungiPath), SECRETS_GATEWAY_WIT);

    const cli = resolve(repoRoot, "packages-ts/galerina-core/compiler/galerina.js");
    const checked = spawnSync(process.execPath, [cli, "check", fungiPath], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 15_000,
    });
    assert.equal(checked.error, undefined, checked.error?.message);
    assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`);
  });

  it("keeps the product-path Fungi source aligned with the opaque-resource oracle", () => {
    const source = readFileSync(productFungiPath, "utf8");
    assert.equal(decodeFungiReturnLiteral(source, productFungiPath), SECRETS_GATEWAY_WIT);

    const cli = resolve(repoRoot, "packages-ts/galerina-core/compiler/galerina.js");
    const checked = spawnSync(process.execPath, [cli, "check", productFungiPath, "--strict-types", "--strict-governance"], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 15_000,
    });
    assert.equal(checked.error, undefined, checked.error?.message);
    assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`);
    assert.match(checked.stdout, /0 errors, 0 warnings, 0 info/);
  });
});
