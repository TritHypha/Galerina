import type { AstNode } from "./parser.js";

export type Found<T> = { readonly kind: "found"; readonly value: T };
export type None = { readonly kind: "none"; readonly reason: string };
export type Lookup<T> = Found<T> | None;
export function found<T>(value: T): Found<T> {
  return { kind: "found", value };
}
export function none(reason: string): None {
  return { kind: "none", reason };
}

export interface WASMSIMDCapability {
  readonly available: boolean;
  readonly supportedOps: readonly ("v128.add" | "v128.mul" | "f32x4.add" | "f32x4.mul" | "i8x16.add")[];
  readonly laneWidth: 128;
}

export const DEFAULT_WASM_SIMD: WASMSIMDCapability = {
  available: false,
  supportedOps: [],
  laneWidth: 128,
} as const;

export type WATSIMDInstruction =
  | "f32x4.add"
  | "f32x4.mul"
  | "f32x4.sqrt"
  | "i8x16.add"
  | "v128.load"
  | "v128.store";

export const WAT_SIMD_OPS = {
  f32x4_add:   "f32x4.add",
  f32x4_mul:   "f32x4.mul",
  v128_load:   "v128.load",
  v128_store:  "v128.store",
} as const;

export type WAT_SIMD_OPS = typeof WAT_SIMD_OPS;

export interface WATFuncType {
  readonly params: readonly WATValType[];
  readonly results: readonly WATValType[];
}

export type WATValType = "i32" | "i64" | "f32" | "f64" | "externref" | "funcref";

export interface WATImport {
  readonly module: string;
  readonly name: string;
  readonly type: WATFuncType;
  readonly effect: string;
}

export interface WATExport {
  readonly name: string;
  readonly index: number;
}

export interface WATParamDef {
  readonly name: string;
  readonly type: WATValType;
}

export interface FlattenStep {
  readonly srcOffset: number;
  readonly nested?: readonly FlattenStep[];
  readonly zero?: true;
}

export interface WATFunction {
  readonly name: string;
  readonly type: WATFuncType;
  readonly body: string;
  readonly isPure: boolean;
  readonly isEntryPoint: boolean;
  readonly handlesSecrets?: boolean;
  readonly returnType?: string;
  readonly returnWordCount?: number;
  readonly flattenPlan?: readonly FlattenStep[];
  readonly namedParams?: readonly WATParamDef[];
}

export interface WATMemory {
  readonly minPages: number;
  readonly maxPages: number;
}

export interface WATModule {
  readonly schemaVersion: "fungi.wat.v1";
  readonly sourceHash: string;
  readonly girHash: string;
  readonly imports: readonly WATImport[];
  readonly exports: readonly WATExport[];
  readonly functions: readonly WATFunction[];
  readonly memory: WATMemory;
  readonly target: "wasm-standalone" | "wasm-hybrid";
}

export interface WATEmitResult {
  readonly module: WATModule;
  readonly wat: string;
  readonly diagnostics: readonly { code: string; message: string }[];
}

export interface WATRecordFieldLayout {
  readonly name: string;
  readonly type: string;
  readonly watType: "i32" | "i64" | "f64";
  readonly offset: number;
  readonly size: 4 | 8;
}

export interface WATRecordLayout {
  readonly fields: readonly WATRecordFieldLayout[];
  readonly size: number;
  readonly alignment: 4 | 8;
}

export interface WATFlowInput {
  readonly name: string;
  readonly qualifier: string;
  readonly declaredEffects?: readonly string[];
  readonly effects?: { readonly declared: readonly string[] };
  readonly paramTypes?: readonly string[];
  readonly executionPlan?: { readonly steps: ReadonlyArray<{ readonly kind: string }> };
  readonly tensors?: readonly { readonly elementType: string }[];
}

export interface WATGIRInput {
  readonly flows: readonly WATFlowInput[];
  readonly entryPoints: readonly string[];
  readonly girHash?: string;
  readonly sourceHash?: string;
  readonly schemaVersion?: string;
  readonly ast?: AstNode;
  readonly exportAllPure?: boolean;
}

export type ArrayHofHelper = { readonly kind: "map" | "filter" | "reduce"; readonly fnName: string };

export type InformalShape = { readonly fields: readonly string[]; readonly arrayFields: readonly string[] };

export type WatJobCacheState = {
  hofProgramAst: Lookup<AstNode>;
  internedLayouts: Lookup<Map<string, string[]>>;
  internedFieldTypes: Lookup<Map<string, Map<string, string>>>;
  autoAppendShapes: Lookup<string[][]>;
  informalShapes: Lookup<InformalShape[]>;
  autoSomeBindMemberFields: Lookup<Set<string>>;
};

export function galerinaTypeToWAT(typeName: string): WATValType {
  switch (typeName) {
    case "Bool": case "Verdict": case "Int": case "Int8": case "Int16": case "Int32": case "Byte": return "i32";
    case "Int64": case "UInt64": return "i64";
    case "Float16": case "Float32": return "f32";
    case "Float64": case "Double": case "Float": return "f64";
    case "Decimal": return "i32";
    default: {
      if (typeName.trim() === "" || !/^[A-Za-z_]/.test(typeName)) {
        throw new Error(
          `galerinaTypeToWAT: refusing to lower malformed type name ${JSON.stringify(typeName)} to i32 — ` +
          `FAIL CLOSED (BK-2; a malformed type reached codegen — ensure type-checking ran before emit).`,
        );
      }
      return "i32";
    }
  }
}

export const DEFAULT_WAT_MEMORY: WATMemory = {
  minPages: 2,
  maxPages: 2048,
};
