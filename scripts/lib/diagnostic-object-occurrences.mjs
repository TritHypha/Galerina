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
    .every((n) => ts.isPropertyAccessExpression(n.parent) && n.parent.expression === n
      && isFreeze(n.parent.parent) && n.parent.parent.expression === n.parent);
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
    const role = testOnly ? "test" : ref ? "ref" : exportedConst(object) ? "def" : "emit";
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
