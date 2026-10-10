// Syntax-only ownership for JS/TS diagnostic object occurrences. This is not
// call-graph or execution evidence. Unsupported wrappers retain normal code-field
// treatment; they never acquire a registry exemption because of a filename.
import { createRequire } from "node:module";
import { CODE_TEST, extractCodes } from "./codes.mjs";
import { classifyDescriptiveDiagnosticIdentities } from "./descriptive-diagnostic-identities.mjs";

// Same installed compiler-package dependency used by audit-syntax.mjs, resolved
// from this module, NOT the fixture cwd. Lazy loading preserves --help/flag refusal.
let parser;
function typescript() {
  if (!parser) {
    const require = createRequire(new URL("../../packages-ts/galerina-core-compiler/package.json", import.meta.url));
    parser = require("typescript");
  }
  return parser;
}

export function diagnosticObjectOccurrences(source, file, { testOnly = false } = {}) {
  const ts = typescript();
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  // A recovered AST is not sufficient to justify suppressing an emission.
  if (sf.parseDiagnostics.length) {
    return { source, descriptiveSource: source, occurrences: [], unsupported: "syntax errors; no structural exemptions applied" };
  }
  const occurrences = [];
  const masks = [];
  const handled = new Set();
  const registryObjects = new Set();
  const allNodes = [];
  function gather(node) { allNodes.push(node); ts.forEachChild(node, gather); }
  gather(sf);
  const unwrap = (node) => {
    while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)
      || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
    return node;
  };
  const key = (node) => node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : undefined;
  const literal = (node) => {
    node = unwrap(node);
    return node && ts.isStringLiteral(node) ? node.text : undefined;
  };
  const identifier = (node, name) => node && ts.isIdentifier(node) && node.text === name;
  const exportedConst = (node) => {
    let outer = node;
    while (outer.parent && unwrap(outer.parent) === node) outer = outer.parent;
    const decl = outer.parent;
    const list = decl?.parent;
    const statement = list?.parent;
    return decl && ts.isVariableDeclaration(decl) && decl.initializer === outer
      && ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const)
      && ts.isVariableStatement(statement) && statement.parent === sf
      && statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  };
  const isFreeze = (node) => node && ts.isCallExpression(node) && node.arguments.length === 1
    && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "freeze"
    && identifier(node.expression.expression, "Object");
  // Conservative local binding check: shadowing, aliasing or writes to Object
  // disqualify freeze wrappers. This does not prove ambient builtins unmodified.
  const ordinaryObject = allNodes.filter((n) => identifier(n, "Object"))
    .every((n) => {
      // Only these local call shapes are supported. In particular, a getter or
      // setter replacement must not become safe merely because it is a call.
      let access = n;
      const parts = [];
      while (ts.isPropertyAccessExpression(access.parent) && access.parent.expression === access) {
        access = access.parent;
        if (access.questionDotToken) return false;
        parts.push(access.name.text);
      }
      const call = access.parent;
      if (!ts.isCallExpression(call) || call.expression !== access || call.questionDotToken
        || call.arguments.some(ts.isSpreadElement)) return false;
      const method = parts.join(".");
      if (["freeze", "entries", "getPrototypeOf", "create"].includes(method)) return call.arguments.length === 1;
      if (method === "prototype.hasOwnProperty.call") return call.arguments.length === 2;
      // The runtime's error-cause decoration is a literal data descriptor, not
      // permission for arbitrary property replacement or accessor installation.
      if (method !== "defineProperty" || call.arguments.length !== 3 || literal(call.arguments[1]) !== "cause") return false;
      const descriptor = unwrap(call.arguments[2]);
      return ts.isObjectLiteralExpression(descriptor) && descriptor.properties.length === 2
        && descriptor.properties.every(ts.isPropertyAssignment)
        && descriptor.properties.some((p) => key(p.name) === "value")
        && descriptor.properties.some((p) => key(p.name) === "configurable" && p.initializer.kind === ts.SyntaxKind.TrueKeyword);
    });
  const frozenDefinitions = new Map();
  for (const node of allNodes) {
    if (!ordinaryObject || !isFreeze(node) || !exportedConst(node)) continue;
    const object = unwrap(node.arguments[0]);
    if (!ts.isObjectLiteralExpression(object)) continue;
    let outer = node;
    while (outer.parent && unwrap(outer.parent) === node) outer = outer.parent;
    const decl = outer.parent;
    if (ts.isIdentifier(decl.name)) frozenDefinitions.set(object, decl);
  }
  const simpleArrow = (node) => node && ts.isArrowFunction(node) && node.parameters.length === 1
    && ts.isIdentifier(node.parameters[0].name) && !node.parameters[0].initializer
    && !node.parameters[0].dotDotDotToken && !node.modifiers?.length;
  function safeHelper(name) {
    const declarations = allNodes.filter((n) => ts.isVariableDeclaration(n) && identifier(n.name, name));
    if (declarations.length !== 1) return false;
    const decl = declarations[0];
    if (!ts.isVariableDeclarationList(decl.parent) || !(decl.parent.flags & ts.NodeFlags.Const)
      || !ts.isVariableStatement(decl.parent.parent) || decl.parent.parent.parent !== sf) return false;
    // No unresolved aliases or shadowing: every other use must be the callee of
    // a top-level exported initializer. Helper functions with block bodies,
    // default arguments, additional statements or nested arbitrary calls refuse.
    if (!allNodes.filter((n) => identifier(n, name)).every((n) => n === decl.name
      || (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)
      || (ts.isCallExpression(n.parent) && n.parent.expression === n && exportedConst(n.parent)))) return false;
    const fn = unwrap(decl.initializer);
    if (!ordinaryObject || !simpleArrow(fn)) return false;
    const body = unwrap(fn.body);
    if (!isFreeze(body)) return false;
    const input = unwrap(body.arguments[0]);
    const parameter = fn.parameters[0].name.text;
    if (identifier(input, parameter)) return true;
    if (!ts.isCallExpression(input) || input.arguments.length !== 1
      || !ts.isPropertyAccessExpression(input.expression) || input.expression.name.text !== "map"
      || !identifier(input.expression.expression, parameter)) return false;
    const mapper = unwrap(input.arguments[0]);
    if (!simpleArrow(mapper)) return false;
    const mapped = unwrap(mapper.body);
    if (!isFreeze(mapped)) return false;
    const copy = unwrap(mapped.arguments[0]);
    return ts.isObjectLiteralExpression(copy) && copy.properties.length === 1
      && ts.isSpreadAssignment(copy.properties[0])
      && identifier(copy.properties[0].expression, mapper.parameters[0].name.text);
  }
  function registryRecord(node) {
    node = unwrap(node);
    if (!ts.isObjectLiteralExpression(node) || node.properties.length !== 2) return false;
    const fields = new Map();
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop) || !["code", "meaning"].includes(key(prop.name))
        || literal(prop.initializer) === undefined) return false;
      fields.set(key(prop.name), literal(prop.initializer));
    }
    return fields.size === 2;
  }
  for (const node of allNodes) {
    if (!exportedConst(node)) continue;
    let array = node;
    if (ts.isCallExpression(array) && array.arguments.length === 1
      && ((ordinaryObject && isFreeze(array))
        || (ts.isIdentifier(array.expression) && safeHelper(array.expression.text)))) array = unwrap(array.arguments[0]);
    if (!ts.isArrayLiteralExpression(array) || !array.elements.every(registryRecord)) continue;
    for (const record of array.elements) registryObjects.add(unwrap(record));
  }
  const lineAt = (offset) => sf.getLineAndCharacterOfPosition(offset).line + 1;
  const sourceLines = source.split(/\r?\n/);
  const markedReference = (offset) => {
    const line = lineAt(offset) - 1;
    return /code-catalog-reference\b/.test(`${sourceLines[line - 1] ?? ""}\n${sourceLines[line]}`);
  };
  function identity(value) {
    if (CODE_TEST.test(value) && extractCodes(value).includes(value)) return true;
    return classifyDescriptiveDiagnosticIdentities(`({code: ${JSON.stringify(value)}})`)
      .identities.some((entry) => entry.code === value);
  }
  function mask(start, end, comment = false) { masks.push({ start, end, comment }); }
  function references(start, end, comment = false) {
    mask(start, end, comment);
    let offset = start;
    for (const line of source.slice(start, end).split(/\n/)) {
      for (const code of extractCodes(line)) occurrences.push({ code, start: offset, line: lineAt(offset), role: testOnly ? "test" : "ref" });
      offset += line.length + 1;
    }
  }
  for (const node of allNodes) {
    if (!ts.isPropertyAssignment(node) || !["code", "errorCode"].includes(key(node.name))
      || !ts.isObjectLiteralExpression(node.parent)) continue;
    const value = literal(node.initializer);
    if (value === undefined || !identity(value)) continue;
    const token = unwrap(node.initializer);
    const start = token.getStart(sf);
    const object = node.parent;
    // Preserve the existing descriptive-only annotation contract; it must not
    // become a new way to suppress numeric runtime diagnostics.
    const ref = registryObjects.has(object) || (!CODE_TEST.test(value) && markedReference(start));
    const role = testOnly ? "test" : ref ? "ref" : exportedConst(object) || frozenDefinitions.has(object) ? "def" : "emit";
    const entry = { code: value, start, line: lineAt(start), role, catalogIdentity: !CODE_TEST.test(value) };
    // Metadata is explicit, literal and local to this object. Dynamic/duplicate
    // keys and spreads leave it unknown; meaning is never a diagnostic name.
    const fields = new Map();
    const plain = object.properties.every((p) => {
      const name = key(p.name);
      if (!ts.isPropertyAssignment(p) || !name || fields.has(name)) return false;
      fields.set(name, literal(p.initializer));
      return true;
    });
    if (plain && !ref && !testOnly) {
      entry.name = fields.get("name");
      const severity = fields.get("severity");
      if (["error", "warning", "info"].includes(severity)) entry.severity = severity;
    }
    occurrences.push(entry);
    handled.add(token);
    mask(start, token.end);
  }
  // Resolve only local frozen owners, not a project-global spelling map. Every
  // use of that spelling must be the declaration or a direct property read;
  // shadowing, aliases and writes conservatively disable sink resolution.
  const readOnlyProperty = (node) => {
    const access = node.parent;
    if (!ts.isPropertyAccessExpression(access) || access.expression !== node) return false;
    let target = access;
    let container = false;
    while (target.parent) {
      const parent = target.parent;
      if (unwrap(parent) === unwrap(target)
        || (ts.isNonNullExpression(parent) && parent.expression === target)) {
        target = parent;
        continue;
      }
      if (ts.isBinaryExpression(parent) && parent.left === target
        && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return false;
      if ((ts.isForInStatement(parent) || ts.isForOfStatement(parent)) && parent.initializer === target) return false;
      if (!container && (ts.isDeleteExpression(parent) || ts.isPrefixUnaryExpression(parent)
        || ts.isPostfixUnaryExpression(parent))) return false;
      // Follow only potential target edges, not computed keys, default-value
      // expressions, assignment RHSs or loop iterables. A container is a write
      // target only when a containing assignment/loop actually uses it as one.
      if ((ts.isPropertyAssignment(parent) && parent.initializer === target)
        || (ts.isObjectLiteralExpression(parent) && parent.properties.includes(target))
        || (ts.isArrayLiteralExpression(parent) && parent.elements.includes(target))
        || ((ts.isSpreadAssignment(parent) || ts.isSpreadElement(parent)) && parent.expression === target)) {
        container = true;
        target = parent;
        continue;
      }
      return true;
    }
    return true;
  };
  const ordinaryError = allNodes.filter((n) => identifier(n, "Error"))
    .every((n) => (ts.isNewExpression(n.parent) && n.parent.expression === n)
      || ts.isTypeReferenceNode(n.parent)
      || (ts.isBinaryExpression(n.parent) && n.parent.right === n
        && n.parent.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword));
  for (const [object, decl] of frozenDefinitions) {
    const fields = object.properties;
    if (!fields.every((p) => ts.isPropertyAssignment(p) && key(p.name))) continue;
    if (new Set(fields.map((p) => key(p.name))).size !== fields.length) continue;
    const value = literal(fields.find((p) => key(p.name) === "code")?.initializer);
    if (!value || !identity(value) || !ordinaryError) continue;
    const uses = allNodes.filter((n) => identifier(n, decl.name.text));
    if (!uses.every((n) => n === decl.name || readOnlyProperty(n))) continue;
    for (const node of allNodes) {
      if (!ts.isNewExpression(node) || !identifier(node.expression, "Error") || !node.arguments?.length) continue;
      // Only the message expression can establish this sink, and only direct
      // code reads or direct template substitutions (not arbitrary callbacks).
      const message = unwrap(node.arguments[0]);
      const parts = ts.isTemplateExpression(message)
        ? message.templateSpans.map((span) => unwrap(span.expression)) : [message];
      if (!parts.some((part) => ts.isPropertyAccessExpression(part) && part.name.text === "code"
        && identifier(part.expression, decl.name.text))) continue;
      const start = node.getStart(sf);
      occurrences.push({ code: value, start, line: lineAt(start), role: testOnly ? "test" : "emit", catalogIdentity: !CODE_TEST.test(value) });
    }
  }
  // Only inert text is removed from the legacy numeric scan. Do not blank a
  // whole template: executable substitutions are separate AST children.
  function inExecutableUse(node) {
    for (let parent = node.parent; parent && !ts.isFunctionLike(parent); parent = parent.parent) {
      if (ts.isCallExpression(parent) || ts.isNewExpression(parent) || ts.isThrowStatement(parent)) return true;
    }
    return false;
  }
  for (const node of allNodes) {
    if (handled.has(node) || !node.parent) continue;
    const isText = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
    const meaning = ts.isPropertyAssignment(node.parent) && key(node.parent.name) === "meaning";
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral
      || (isText && (meaning || (extractCodes(node.text ?? "").length > 0
        && !inExecutableUse(node) && !identity(node.text ?? ""))))) references(node.getStart(sf), node.end);
  }
  // Ask the parser for trivia ranges, rather than recognizing comment markers
  // inside strings, regexes or templates with another regular expression.
  const comments = new Set();
  function trivia(node) {
    for (const range of [...(ts.getLeadingCommentRanges(source, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(source, node.end) ?? [])]) {
      const id = `${range.pos}:${range.end}`;
      if (!comments.has(id)) { comments.add(id); references(range.pos, range.end, true); }
    }
    for (const child of node.getChildren(sf)) trivia(child);
  }
  trivia(sf);
  function masked(includeComments) {
    const chars = source.split("");
    for (const { start, end, comment } of masks) {
      if (comment && !includeComments) continue;
      for (let i = start; i < end; i++) if (chars[i] !== "\r" && chars[i] !== "\n") chars[i] = " ";
    }
    return chars.join("");
  }
  return { source: masked(true), descriptiveSource: masked(false), occurrences: occurrences.sort((a, b) => a.start - b.start) };
}
