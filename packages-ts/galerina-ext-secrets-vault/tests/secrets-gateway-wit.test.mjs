import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { SECRETS_GATEWAY_WIT } from "../dist/types.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const generatorPath = resolve(repoRoot, "scripts/generate-secrets-gateway-wit.mjs");
const fungiPath = resolve(packageRoot, "src/self-hosted/secrets-gateway-wit.fungi");
const productFungiPath = resolve(repoRoot, "packages/fungi/products/galerina-ext-secrets-vault/secrets-gateway-wit.fungi");

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
    assert.match(SECRETS_GATEWAY_WIT, /use secrets-gateway\.\{authenticated-request, release-receipt, refusal\};/);
    assert.match(SECRETS_GATEWAY_WIT, /request: authenticated-request/);
    assert.match(SECRETS_GATEWAY_WIT, /-> result<release-receipt, refusal>/);
    assert.doesNotMatch(SECRETS_GATEWAY_WIT, /secrets-gateway\.(?:authenticated-request|release-receipt|refusal)/);
    assert.match(SECRETS_GATEWAY_WIT, /resource authenticated-request\s*;/);
    assert.match(SECRETS_GATEWAY_WIT, /resource signet-grant\s*;/);
    assert.match(SECRETS_GATEWAY_WIT, /resource secret-lease\s*\{/);
    assert.match(SECRETS_GATEWAY_WIT, /resource verification-result\s*;/);
    assert.match(SECRETS_GATEWAY_WIT, /resource cleanup-receipt\s*;/);
    assert.match(SECRETS_GATEWAY_WIT, /enum lifecycle-state\s*\{/);
    const lifecycle = SECRETS_GATEWAY_WIT.match(/enum lifecycle-state\s*\{([^}]*)\}/)?.[1];
    assert.ok(lifecycle, "lifecycle status must be represented by the closed enum");
    assert.deepEqual(
      lifecycle.split(",").map((state) => state.trim()).filter(Boolean),
      ["admitted", "active", "cleanup-pending", "cleanup-failed", "retired", "invalid"],
    );
    assert.doesNotMatch(lifecycle, /\b(?:null|none|nan|float|f32|f64)\b/i);
    assert.match(
      SECRETS_GATEWAY_WIT,
      /verify-password:\s*func\([\s\S]*?request:\s*borrow<authenticated-request>[\s\S]*?grant:\s*borrow<signet-grant>[\s\S]*?\)\s*->\s*result<verification-result, refusal>/,
    );
    const close = findTopLevelWitFunction(SECRETS_GATEWAY_WIT, "galerina:secrets-vault@0.1.0", "secrets-gateway", "close-secret-lease");
    assert.ok(close, "cleanup must consume an owned lease through a free function");
    assert.equal(normalizedWitTokens(close.parameters)?.replace(/ ,$/, ""), "lease : secret-lease");
    assert.equal(normalizedWitTokens(close.returnType), "-> result < cleanup-receipt , refusal >");
    assert.match(SECRETS_GATEWAY_WIT, /issue-password-verification-grant:/);
    assert.match(SECRETS_GATEWAY_WIT, /acquire-password-lease:/);
    assert.match(SECRETS_GATEWAY_WIT, /release-verification-result:/);
    const release = SECRETS_GATEWAY_WIT.match(/release-verification-result:\s*func\(([^)]*)\)/)?.[1];
    assert.ok(release, "release must have an explicit contract");
    assert.match(release, /proof:\s*verification-result/);
    assert.match(release, /cleanup:\s*cleanup-receipt/);
    assert.doesNotMatch(release, /verified\s*:\s*bool/);
    assert.doesNotMatch(SECRETS_GATEWAY_WIT, /\blist\s*<\s*u8\s*>/);
    assert.doesNotMatch(SECRETS_GATEWAY_WIT, /type\s+secret-handle\s*=\s*u32/);
  });

  it("keeps the verification outcome opaque to guest code", () => {
    assert.match(SECRETS_GATEWAY_WIT, /resource verification-result\s*;/);
    assert.doesNotMatch(SECRETS_GATEWAY_WIT, /enum verification-state|verification-result\s*\{/);
    assert.match(
      SECRETS_GATEWAY_WIT,
      /resource release-receipt\s*\{\s*state:\s*func\(\)\s*->\s*release-state;/,
    );
    assert.doesNotMatch(SECRETS_GATEWAY_WIT, /record release-receipt\s*\{/);
    assert.match(
      SECRETS_GATEWAY_WIT,
      /release-verification-result:\s*func\([\s\S]*?proof:\s*verification-result[\s\S]*?cleanup:\s*cleanup-receipt[\s\S]*?\)\s*->\s*result<release-receipt, refusal>/,
    );
  });

  it("reuses one host-bound request and grant for admission, verification, and release", () => {
    const issue = SECRETS_GATEWAY_WIT.match(
      /issue-password-verification-grant:\s*func\(([\s\S]*?)\)\s*->/,
    )?.[1];
    assert.ok(issue, "grant issuance must have an explicit request binding");
    assert.match(issue, /request:\s*borrow<authenticated-request>/);
    assert.doesNotMatch(issue, /credential-id|expected-version/);

    const verify = SECRETS_GATEWAY_WIT.match(
      /verify-password:\s*func\(([\s\S]*?)\)\s*->/,
    )?.[1];
    assert.ok(verify, "verification must have an explicit request binding");
    assert.match(verify, /request:\s*borrow<authenticated-request>/);
    assert.match(verify, /grant:\s*borrow<signet-grant>/);

    const release = SECRETS_GATEWAY_WIT.match(
      /release-verification-result:\s*func\(([\s\S]*?)\)\s*->/,
    )?.[1];
    assert.ok(release, "release must preserve the original request binding");
    assert.match(release, /request:\s*borrow<authenticated-request>/);
    assert.match(release, /grant:\s*borrow<signet-grant>/);
    assert.match(release, /proof:\s*verification-result/);
    assert.match(release, /cleanup:\s*cleanup-receipt/);
    assert.doesNotMatch(release, /recipient\s*:/);
  });

  it("keeps charge reservation distinct from allocation, retention, and unresolved cleanup", () => {
    const accounting = SECRETS_GATEWAY_WIT.match(/record memory-accounting\s*\{([^}]*)\}/)?.[1];
    assert.ok(accounting, "the lease must expose a closed memory-accounting record");
    assert.match(accounting, /state:\s*accounting-state/);
    for (const field of ["reserved-bytes", "allocated-bytes", "retained-bytes", "unresolved-bytes"]) {
      assert.match(accounting, new RegExp(`\\b${field}:\\s*u64\\b`));
    }
    assert.match(SECRETS_GATEWAY_WIT, /enum accounting-state\s*\{[^}]*accounted,[^}]*unknown,[^}]*inconsistent/);
    assert.match(SECRETS_GATEWAY_WIT, /accounting:\s*func\(\)\s*->\s*memory-accounting/);
    assert.match(SECRETS_GATEWAY_WIT, /block stays quarantined until a complete full-extent wipe is proven by a terminal cleanup receipt/i);
    assert.doesNotMatch(accounting, /\b(?:option|float|f32|f64|null|nan)\b/i);
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
