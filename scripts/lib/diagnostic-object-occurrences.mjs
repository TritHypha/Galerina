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
  const ambientGlobalNames = new Set(["globalThis", "window", "self", "global"]);
  let ambientAliasesAdded = true;
  while (ambientAliasesAdded) {
    ambientAliasesAdded = false;
    for (const node of allNodes) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const initializer = unwrap(node.initializer);
        if (initializer && ts.isIdentifier(initializer) && ambientGlobalNames.has(initializer.text)
          && !ambientGlobalNames.has(node.name.text)) {
          ambientGlobalNames.add(node.name.text);
          ambientAliasesAdded = true;
        }
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isIdentifier(node.left)) {
        const value = unwrap(node.right);
        if (ts.isIdentifier(value) && ambientGlobalNames.has(value.text)
          && !ambientGlobalNames.has(node.left.text)) {
          ambientGlobalNames.add(node.left.text);
          ambientAliasesAdded = true;
        }
      }
    }
  }
  const exposesAmbientObject = allNodes.some((node) => {
    if (ts.isPropertyAccessExpression(node) && node.name.text === "Object") {
      const target = unwrap(node.expression);
      return ts.isIdentifier(target) && ambientGlobalNames.has(target.text);
    }
    if (ts.isElementAccessExpression(node)) {
      const target = unwrap(node.expression);
      return ts.isIdentifier(target) && ambientGlobalNames.has(target.text);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && identifier(node.expression.expression, "Object")
      && node.expression.name.text === "getOwnPropertyDescriptor") {
      const target = unwrap(node.arguments[0]);
      return ts.isIdentifier(target) && ambientGlobalNames.has(target.text);
    }
    return false;
  });
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
  const functionOwner = (node) => {
    for (let parent = node?.parent; parent; parent = parent.parent) {
      if (ts.isFunctionLike(parent)) return parent;
    }
    return undefined;
  };
  const lexicalBlock = (node) => {
    for (let parent = node; parent; parent = parent.parent) {
      if (ts.isBlock(parent)) return parent;
    }
    return sf;
  };
  const isNullRecord = (node) => {
    node = unwrap(node);
    return ts.isCallExpression(node) && node.arguments.length === 1
      && ts.isPropertyAccessExpression(node.expression)
      && identifier(node.expression.expression, "Object") && node.expression.name.text === "create"
      && unwrap(node.arguments[0]).kind === ts.SyntaxKind.NullKeyword;
  };
  function safeSnapshotValue(node, owner, propertyKey) {
    node = unwrap(node);
    if (ts.isIdentifier(node)) return true;
    if (!ts.isCallExpression(node) || !identifier(node.expression, "parseShape")
      || node.arguments.length !== 2 || !ts.isNumericLiteral(unwrap(node.arguments[1]))
      || unwrap(node.arguments[1]).text !== "0") return false;
    const input = unwrap(node.arguments[0]);
    if (!ts.isElementAccessExpression(input) || !identifier(input.expression, "exportsRecord")
      || key(input.argumentExpression) !== key(propertyKey)) return false;
    const declarations = allNodes.filter((n) => ts.isVariableDeclaration(n) && identifier(n.name, "parseShape"));
    if (declarations.length !== 1 || functionOwner(declarations[0]) !== owner
      || !ts.isVariableDeclarationList(declarations[0].parent)
      || !(declarations[0].parent.flags & ts.NodeFlags.Const)
      || !ts.isArrowFunction(unwrap(declarations[0].initializer))) return false;
    const refs = allNodes.filter((n) => identifier(n, "parseShape"));
    return refs.includes(declarations[0].name) && refs.every((n) => n === declarations[0].name
      || (ts.isCallExpression(n.parent) && n.parent.expression === n));
  }
  // Permit only the runtime's local null-prototype snapshot construction:
  // one const owner, a single data-property definition, a computed data write,
  // and the final freeze. Any alias, escape, extra use, or descriptor feature
  // keeps the normal diagnostic treatment in place.
  function safeSnapshotDefinition(call) {
    if (call.arguments.length !== 3 || !ts.isIdentifier(call.arguments[0])) return false;
    const name = call.arguments[0].text;
    const owner = functionOwner(call);
    if (!owner || !(ts.isIdentifier(call.arguments[1]) || ts.isStringLiteral(call.arguments[1]))) return false;
    const declarations = allNodes.filter((n) => ts.isVariableDeclaration(n) && identifier(n.name, name)
      && functionOwner(n) === owner);
    if (declarations.length !== 1) return false;
    const decl = declarations[0];
    if (!ts.isVariableDeclarationList(decl.parent) || !(decl.parent.flags & ts.NodeFlags.Const)
      || !isNullRecord(decl.initializer)) return false;
    const isWithinOwner = (node) => {
      const nearest = functionOwner(node);
      if (nearest === owner) return true;
      for (let parent = nearest?.parent; parent; parent = parent.parent) {
        if (parent === owner) return true;
      }
      return false;
    };
    // Include nested closures: a captured reference is an escape/use of this
    // owner even though its nearest function is not the declaration function.
    const refs = allNodes.filter((n) => identifier(n, name) && isWithinOwner(n));
    if (refs.length !== 3 || !refs.includes(decl.name)) return false;
    const freezeUse = refs.find((n) => ts.isCallExpression(n.parent) && n.parent.expression
      && ts.isPropertyAccessExpression(n.parent.expression) && n.parent.expression.name.text === "freeze"
      && identifier(n.parent.expression.expression, "Object") && n.parent.arguments[0] === n);
    if (!freezeUse || !refs.includes(call.arguments[0])) return false;
    if (!refs.every((n) => n === decl.name || n === call.arguments[0]
      || n === freezeUse)) return false;
    const descriptor = unwrap(call.arguments[2]);
    return ts.isObjectLiteralExpression(descriptor) && descriptor.properties.length === 2
      && descriptor.properties.every(ts.isPropertyAssignment)
      && descriptor.properties.some((p) => key(p.name) === "value"
        && safeSnapshotValue(p.initializer, owner, call.arguments[1]))
      && descriptor.properties.some((p) => key(p.name) === "enumerable" && unwrap(p.initializer).kind === ts.SyntaxKind.TrueKeyword);
  }
  const capturedFreezeNames = new Set(allNodes.filter((n) => ts.isVariableDeclaration(n)
    && ts.isIdentifier(n.name) && n.initializer && ts.isPropertyAccessExpression(unwrap(n.initializer))
    && identifier(unwrap(n.initializer).expression, "Object")
    && unwrap(n.initializer).name.text === "freeze"
    && ts.isVariableDeclarationList(n.parent) && (n.parent.flags & ts.NodeFlags.Const)
    && ts.isVariableStatement(n.parent.parent) && n.parent.parent.parent === sf)
    .map((n) => n.name.text));
  function safeCapturedArrayPropertyDefinition(call) {
    if (call.arguments.length !== 3 || !ts.isIdentifier(call.arguments[0])) return false;
    const targetName = call.arguments[0].text;
    const owner = functionOwner(call);
    if (!owner || !ts.isCallExpression(unwrap(call.arguments[1]))) return false;
    const keyCall = unwrap(call.arguments[1]);
    if (!identifier(keyCall.expression, "String") || keyCall.arguments.length !== 1
      || !ts.isIdentifier(keyCall.arguments[0])) return false;
    const declarations = allNodes.filter((n) => ts.isVariableDeclaration(n)
      && identifier(n.name, targetName) && functionOwner(n) === owner);
    if (declarations.length !== 1) return false;
    const decl = declarations[0];
    if (!ts.isVariableDeclarationList(decl.parent) || !(decl.parent.flags & ts.NodeFlags.Const)
      || !ts.isArrayLiteralExpression(unwrap(decl.initializer))) return false;
    const refs = allNodes.filter((n) => identifier(n, targetName) && functionOwner(n) === owner);
    if (refs.length !== 3 || !refs.includes(decl.name) || !refs.includes(call.arguments[0])) return false;
    const freezeUse = refs.find((n) => ts.isCallExpression(n.parent)
      && !n.parent.questionDotToken && n.parent.arguments.length === 1
      && n.parent.arguments[0] === n && ts.isIdentifier(n.parent.expression)
      && capturedFreezeNames.has(n.parent.expression.text));
    if (!freezeUse) return false;
    const descriptor = unwrap(call.arguments[2]);
    if (safeDataPropertyDescriptorFactoryCall(descriptor)) return true;
    if (!ts.isObjectLiteralExpression(descriptor) || descriptor.properties.length !== 4
      || !descriptor.properties.every(ts.isPropertyAssignment)) return false;
    const fields = new Map(descriptor.properties.map((p) => [key(p.name), unwrap(p.initializer)]));
    const value = fields.get("value");
    return fields.size === 4 && fields.has("value") && fields.has("enumerable")
      && fields.has("configurable") && fields.has("writable")
      && ts.isCallExpression(value) && identifier(value.expression, "visit")
      && value.arguments.length === 3 && !value.arguments.some(ts.isSpreadElement)
      && fields.get("enumerable").kind === ts.SyntaxKind.TrueKeyword
      && fields.get("configurable").kind === ts.SyntaxKind.FalseKeyword
      && fields.get("writable").kind === ts.SyntaxKind.FalseKeyword;
  }
  function safeCapturedIntrinsicCall(method, call) {
    if (!ts.isCallExpression(call) || call.questionDotToken
      || call.arguments.some(ts.isSpreadElement)) return false;
    if (method === "freeze") return call.arguments.length === 1
      && !identifier(unwrap(call.arguments[0]), "Object");
    return method === "defineProperty" && safeCapturedArrayPropertyDefinition(call);
  }
  function safeCapturedReflectApply(call) {
    if (!ts.isCallExpression(call) || call.questionDotToken
      || !ts.isIdentifier(call.expression) || call.arguments.some(ts.isSpreadElement)) return false;
    const name = call.expression.text;
    const declarations = allNodes.filter((node) => ts.isVariableDeclaration(node) && identifier(node.name, name));
    if (declarations.length !== 1) return false;
    const declaration = declarations[0];
    if (!ts.isVariableDeclarationList(declaration.parent) || !(declaration.parent.flags & ts.NodeFlags.Const)
      || !ts.isVariableStatement(declaration.parent.parent) || declaration.parent.parent.parent !== sf) return false;
    const initializer = unwrap(declaration.initializer);
    if (!ts.isPropertyAccessExpression(initializer) || initializer.name.text !== "apply"
      || !identifier(initializer.expression, "Reflect")) return false;
    // A lexical Reflect binding would make the captured spelling ambiguous.
    if (allNodes.some((node) => (ts.isVariableDeclaration(node) || ts.isParameter(node)
      || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && identifier(node.name, "Reflect"))) return false;
    const references = allNodes.filter((node) => identifier(node, name));
    return references.includes(declaration.name) && references.every((node) => node === declaration.name
      || (ts.isCallExpression(node.parent) && node.parent.expression === node));
  }
  function safeCapturedReflectApplyShape(call, method) {
    if (!safeCapturedReflectApply(call) || call.arguments.length !== 3
      || !ts.isIdentifier(call.arguments[0]) || !identifier(call.arguments[1], "Object")) return false;
    const array = unwrap(call.arguments[2]);
    if (!ts.isArrayLiteralExpression(array) || array.elements.some(ts.isSpreadElement)) return false;
    const containsObject = (node) => {
      if (identifier(node, "Object")) return true;
      let found = false;
      ts.forEachChild(node, (child) => { if (containsObject(child)) found = true; });
      return found;
    };
    if (array.elements.some(containsObject)) return false;
    if (method === "freeze") return array.elements.length === 1;
    if (method === "create") return array.elements.length === 1
      && unwrap(array.elements[0]).kind === ts.SyntaxKind.NullKeyword;
    return method === "defineProperty" && array.elements.length === 3;
  }
  function safeDataPropertyDescriptorFactoryCall(node) {
    node = unwrap(node);
    if (!ts.isCallExpression(node) || !identifier(node.expression, "safeDataPropertyDescriptor")
      || node.arguments.length !== 4 || node.arguments.some(ts.isSpreadElement)) return false;
    const declarations = allNodes.filter((entry) => ts.isFunctionDeclaration(entry)
      && identifier(entry.name, "safeDataPropertyDescriptor"));
    if (declarations.length !== 1) return false;
    const declaration = declarations[0];
    if (declaration.parent !== sf || declaration.modifiers?.length || declaration.asteriskToken
      || declaration.typeParameters?.length || declaration.parameters.length !== 4
      || !declaration.parameters.every(ts.isParameter)) return false;
    const parameterNames = declaration.parameters.map((parameter) => key(parameter.name));
    if (parameterNames.join(",") !== "value,writable,enumerable,configurable"
      || declaration.parameters.some((parameter) => parameter.initializer || parameter.dotDotDotToken)) return false;
    const body = declaration.body;
    if (!body || body.statements.length !== 6) return false;
    const creation = body.statements[0];
    if (!ts.isVariableStatement(creation) || !(creation.declarationList.flags & ts.NodeFlags.Const)
      || creation.declarationList.declarations.length !== 1) return false;
    const descriptor = creation.declarationList.declarations[0];
    if (!ts.isIdentifier(descriptor.name) || !safeCapturedReflectApplyShape(unwrap(descriptor.initializer), "create")) return false;
    const fields = ["value", "writable", "enumerable", "configurable"];
    for (let index = 0; index < fields.length; index += 1) {
      const statement = body.statements[index + 1];
      if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)
        || statement.expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken
        || !ts.isPropertyAccessExpression(statement.expression.left)
        || !identifier(statement.expression.left.expression, descriptor.name.text)
        || statement.expression.left.name.text !== fields[index]
        || !identifier(statement.expression.right, parameterNames[index])) return false;
    }
    const returned = body.statements[5];
    if (!ts.isReturnStatement(returned) || !identifier(returned.expression, descriptor.name.text)) return false;
    const references = allNodes.filter((entry) => identifier(entry, "safeDataPropertyDescriptor"));
    return references.includes(declaration.name) && references.every((entry) => entry === declaration.name
      || (ts.isCallExpression(entry.parent) && entry.parent.expression === entry
        && entry.parent.arguments.length === 4 && !entry.parent.arguments.some(ts.isSpreadElement)));
  }
  function capturedObjectIntrinsic(access, method) {
    if (!ts.isPropertyAccessExpression(access) || !["freeze", "create", "defineProperty"].includes(method)) return false;
    const decl = access.parent;
    if (!ts.isVariableDeclaration(decl) || decl.initializer !== access || !ts.isIdentifier(decl.name)
      || !ts.isVariableDeclarationList(decl.parent) || !(decl.parent.flags & ts.NodeFlags.Const)
      || !ts.isVariableStatement(decl.parent.parent) || decl.parent.parent.parent !== sf) return false;
    const name = decl.name.text;
    const declarations = allNodes.filter((n) => ts.isVariableDeclaration(n) && identifier(n.name, name));
    if (declarations.length !== 1 || declarations[0] !== decl) return false;
    const refs = allNodes.filter((n) => identifier(n, name));
    return refs.length > 1 && refs.includes(decl.name)
      && refs.every((n) => n === decl.name || (ts.isCallExpression(n.parent)
        && n.parent.expression === n && safeCapturedIntrinsicCall(method, n.parent))
        || (ts.isCallExpression(n.parent) && n.parent.arguments[0] === n
          && safeCapturedReflectApplyShape(n.parent, method)));
  }
  function safeCapturedObjectReceiver(node) {
    const call = node.parent;
    if (!ts.isCallExpression(call) || call.arguments[1] !== node
      || !ts.isIdentifier(call.arguments[0])) return false;
    const name = call.arguments[0].text;
    const declarations = allNodes.filter((entry) => ts.isVariableDeclaration(entry) && identifier(entry.name, name));
    if (declarations.length !== 1) return false;
    const declaration = declarations[0];
    const initializer = unwrap(declaration.initializer);
    if (!ts.isVariableDeclarationList(declaration.parent) || !(declaration.parent.flags & ts.NodeFlags.Const)
      || !ts.isVariableStatement(declaration.parent.parent) || declaration.parent.parent.parent !== sf
      || !ts.isPropertyAccessExpression(initializer) || !identifier(initializer.expression, "Object")) return false;
    const method = initializer.name.text;
    return ["freeze", "create", "defineProperty"].includes(method)
      && safeCapturedReflectApplyShape(call, method)
      && capturedObjectIntrinsic(initializer, method);
  }
  function safeLocalMethodDefinition(call) {
    if (call.arguments.length !== 3 || !ts.isIdentifier(call.arguments[0])
      || !(ts.isIdentifier(call.arguments[1]) || ts.isStringLiteral(call.arguments[1]))) return false;
    const targetName = call.arguments[0].text;
    const owner = functionOwner(call);
    if (!owner) return false;
    const bindingNames = (name, output = []) => {
      if (ts.isIdentifier(name)) output.push(name.text);
      else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
        for (const element of name.elements) {
          if (ts.isBindingElement(element)) bindingNames(element.name, output);
        }
      }
      return output;
    };
    const declarations = allNodes.filter((n) => ts.isVariableDeclaration(n)
      && functionOwner(n) === owner && bindingNames(n.name).includes(targetName));
    if (declarations.length !== 1 || !ts.isVariableDeclarationList(declarations[0].parent)
      || !(declarations[0].parent.flags & ts.NodeFlags.Const)
      || !ts.isObjectLiteralExpression(unwrap(declarations[0].initializer))) return false;
    // A loop-initializer binding ends with its loop, even though its nearest
    // Block node is often the containing function body. Support only ordinary
    // variable statements in this bounded recognizer.
    if (!ts.isVariableStatement(declarations[0].parent.parent)) return false;
    const enclosingBlocks = new Set();
    for (let parent = call; parent; parent = parent.parent) {
      if (ts.isBlock(parent)) enclosingBlocks.add(parent);
      if (parent === owner) break;
    }
    if (!enclosingBlocks.has(lexicalBlock(declarations[0]))) return false;
    const descriptor = unwrap(call.arguments[2]);
    if (!ts.isObjectLiteralExpression(descriptor) || descriptor.properties.length !== 4
      || !descriptor.properties.every(ts.isPropertyAssignment)) return false;
    const fields = new Map(descriptor.properties.map((p) => [key(p.name), unwrap(p.initializer)]));
    const value = fields.get("value");
    return fields.size === 4 && value && ts.isArrowFunction(value)
      && fields.get("enumerable")?.kind === ts.SyntaxKind.TrueKeyword
      && fields.get("configurable")?.kind === ts.SyntaxKind.FalseKeyword
      && fields.get("writable")?.kind === ts.SyntaxKind.FalseKeyword;
  }
  // Conservative local binding check: shadowing, aliasing or writes to Object
  // disqualify freeze wrappers. This does not prove ambient builtins unmodified.
  const ordinaryObject = !exposesAmbientObject && allNodes.filter((n) => identifier(n, "Object"))
    .every((n) => {
      if (safeCapturedObjectReceiver(n)) return true;
      // Only these local call shapes are supported. In particular, a getter or
      // setter replacement must not become safe merely because it is a call.
      let access = n;
      const parts = [];
      while (ts.isPropertyAccessExpression(access.parent) && access.parent.expression === access) {
        access = access.parent;
        if (access.questionDotToken) return false;
        parts.push(access.name.text);
      }
      const method = parts.join(".");
      if (method === "prototype" && ts.isBinaryExpression(access.parent)
        && (access.parent.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
          || access.parent.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)
        && (access.parent.left === access || access.parent.right === access)) return true;
      if (capturedObjectIntrinsic(access, method)) return true;
      const call = access.parent;
      if (!ts.isCallExpression(call) || call.expression !== access || call.questionDotToken
        || call.arguments.some(ts.isSpreadElement)) return false;
      if (["freeze", "entries", "getPrototypeOf", "create", "keys", "values"].includes(method)) return call.arguments.length === 1;
      if (method === "getOwnPropertyDescriptor") {
        if (call.arguments.length !== 2) return false;
        const target = unwrap(call.arguments[0]);
        if (ts.isIdentifier(target) && ambientGlobalNames.has(target.text)) {
          const property = literal(call.arguments[1]);
          return property !== undefined && property !== "Object";
        }
        return true;
      }
      if (["hasOwn", "is"].includes(method)) return call.arguments.length === 2;
      if (method === "prototype.hasOwnProperty.call") return call.arguments.length === 2;
      if (method === "assign") return call.arguments.length === 2 && isNullRecord(call.arguments[0]);
      if (method === "defineProperty" && (safeSnapshotDefinition(call)
        || safeLocalMethodDefinition(call))) return true;
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
