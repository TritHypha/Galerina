import type { AstNode } from "./parser.js";
import { numericBaseType } from "./numeric-lowering.js";
import { galerinaTypeToWAT, type WATRecordFieldLayout, type WATRecordLayout } from "./wat-emitter-types.js";

export function buildFlowReturnTypes(ast: AstNode | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (ast === undefined) return out;
  const walk = (n: AstNode): void => {
    if (n.kind === "pureFlowDecl" || n.kind === "flowDecl" || n.kind === "secureFlowDecl") {
      const name = (n.value ?? "").trim();
      const children = n.children ?? [];
      const numParams = children.filter((c) => c.kind === "paramDecl").length;
      const retNode = children[numParams];
      const rt = retNode?.value;
      if (name !== "" && typeof rt === "string" && rt.trim() !== "") out.set(name, rt.trim());
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(ast);
  return out;
}

/** 0115: Build the flowName → [param base type, …] registry. Same flow-node shape as
 *  buildFlowReturnTypes; each paramDecl.value is "name: Type". Each entry is the numericBaseType
 *  of the declared parameter type, so a call site can detect an Int64/UInt64 parameter and thread it
 *  as the argument's expectedType (only 64-bit params change anything — every other arg is unchanged). */
export function buildFlowParamBases(ast: AstNode | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (ast === undefined) return out;
  const walk = (n: AstNode): void => {
    if (n.kind === "pureFlowDecl" || n.kind === "flowDecl" || n.kind === "secureFlowDecl") {
      const name = (n.value ?? "").trim();
      const bases = (n.children ?? [])
        .filter((c) => c.kind === "paramDecl")
        .map((c) => {
          const raw = c.value ?? "";
          const ty = raw.includes(":") ? raw.split(":")[1]!.trim() : "";
          return numericBaseType(ty);
        });
      if (name !== "") out.set(name, bases);
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(ast);
  return out;
}

export function buildEnumVariants(ast: AstNode | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const node of ast?.children ?? []) {
    if (node.kind === "enumDecl" && node.value) {
      const variants = (node.children ?? [])
        .filter((c) => c.kind === "enumVariant")
        .map((c) => c.value ?? "")
        .filter((n) => n.length > 0);
      out.set(node.value, variants);
    }
  }
  return out;
}

/** Build the typeName → field-name-list registry from a program AST's `record` decls. */
export function buildRecordLayouts(ast: AstNode | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const node of ast?.children ?? []) {
    if (node.kind === "recordDecl" && node.value) {
      const fields = (node.children ?? [])
        .filter((c) => c.kind === "paramDecl")
        .map((c) => (c.value ?? "").split(":")[0]!.trim())
        .filter((n) => n.length > 0);
      out.set(node.value, fields);
    }
  }
  return out;
}

/** Build the typeName → (fieldName → declared type) registry from a program AST's `record` decls.
 *  Sibling to buildRecordLayouts — the paramDecl value is "name: Type", so this keeps the type half
 *  that layouts discards. Powers memberExpr type inference for #160 str_eq on `a.s == b.s`. */
export function buildRecordFieldTypes(ast: AstNode | undefined): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const node of ast?.children ?? []) {
    if (node.kind === "recordDecl" && node.value) {
      const fields = new Map<string, string>();
      for (const c of node.children ?? []) {
        if (c.kind !== "paramDecl") continue;
        const raw = c.value ?? "";
        const colon = raw.indexOf(":");
        if (colon < 0) continue;
        const name = raw.slice(0, colon).trim();
        const type = raw.slice(colon + 1).trim();
        if (name.length > 0 && type.length > 0) fields.set(name, type);
      }
      out.set(node.value, fields);
    }
  }
  return out;
}

/**
 * True only when the WAT emitter has a faithful scalar representation and expression lane for a
 * record field. Decimal is an i32 host handle (C02). Float16/Float32 stay refused
 * until the scalar f32 lane is complete.
 */
export function isWATRecordFieldTypeSupported(typeName: string): boolean {
  const base = numericBaseType(typeName.trim());
  if (base === "Float16" || base === "Float32") return false;
  const watType = galerinaTypeToWAT(typeName.trim());
  return watType === "i32" || watType === "i64" || watType === "f64";
}

function alignRecordOffset(offset: number, alignment: 4 | 8): number {
  return Math.ceil(offset / alignment) * alignment;
}

/** Build the canonical natural-alignment layout used by every record load, store, copy and size. */
export function buildWATRecordLayouts(ast: AstNode | undefined): Map<string, WATRecordLayout> {
  const out = new Map<string, WATRecordLayout>();
  for (const [recordName, fields] of buildRecordFieldTypes(ast)) {
    const slots: WATRecordFieldLayout[] = [];
    let cursor = 0;
    let recordAlignment: 4 | 8 = 4;
    for (const [name, type] of fields) {
      if (!isWATRecordFieldTypeSupported(type)) continue;
      const lowered = galerinaTypeToWAT(type);
      if (lowered !== "i32" && lowered !== "i64" && lowered !== "f64") continue;
      const size: 4 | 8 = lowered === "i32" ? 4 : 8;
      cursor = alignRecordOffset(cursor, size);
      slots.push({ name, type, watType: lowered, offset: cursor, size });
      cursor += size;
      if (size === 8) recordAlignment = 8;
    }
    out.set(recordName, {
      fields: slots,
      size: alignRecordOffset(cursor, recordAlignment),
      alignment: recordAlignment,
    });
  }
  return out;
}

/**
 * #132 fail-closed guard after typed natural-alignment support. i32 handles retain their compact
 * four-byte slots; i64 and f64 fields use naturally aligned eight-byte slots. Float16/Float32 remain
 * refused until the scalar f32 expression lane is faithful. Decimal record fields lower as
 * i32 host handles (C02). The predicate is shared with the corpus audit so new unsupported
 * representations cannot enter silently.
 */
