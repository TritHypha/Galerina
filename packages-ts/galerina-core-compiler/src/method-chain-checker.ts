interface SourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

interface CompilerDiagnostic {
  readonly code: string;
  readonly name: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly location?: SourceLocation;
  readonly suggestedFix?: string;
}

export interface MethodChainStage {
  readonly methodName: string;
  readonly receiverType: string | undefined;
  readonly argumentTypes: readonly string[] | undefined;
  readonly returnType: string | undefined;
  readonly effects: readonly string[] | undefined;
  readonly location: SourceLocation | undefined;
  readonly resultConsumed: boolean | undefined;
}

export interface MethodChainInput {
  readonly receiver: string;
  readonly receiverType: string | undefined;
  readonly receiverBindingKind: "let" | "mut" | "readonly" | undefined;
  readonly declaredEffects: readonly string[] | undefined;
  readonly calls: readonly { readonly methodName: string }[] | readonly MethodChainStage[];
  readonly location: SourceLocation;
}

const RESULT_CONSUMERS = new Set(["map", "mapErr", "flatMap", "unwrapOr", "isOk", "isErr", "isSome", "isNone"]);
const PERSISTENT_TRANSFORMS = new Set(["push", "append"]);
const IN_PLACE_MUTATORS = new Set(["set", "clear", "insert"]);

const VALIDATE_GATES = new Set([
  "email", "emails", "patientId", "nhsNumber", "userId", "orderId", "merchantId",
  "recordId", "offerId", "accountId", "positiveInt", "medicationCode", "creditScore",
  "searchQuery", "name", "date", "id", "text", "status", "message", "input",
]);

const METHODS_BY_RECEIVER: Readonly<Record<string, ReadonlySet<string>>> = {
  Array: new Set(["empty", "of", "range", "length", "count", "isEmpty", "first", "last", "get", "push", "append", "filter", "map", "reduce", "contains", "includes", "reverse", "slice", "join", "sort", "find", "partition"]),
  Option: new Set(["sequence", "fromNullable", "isSome", "isNone", "unwrapOr", "map", "flatMap"]),
  Result: new Set(["sequence", "fromNullable", "all", "ok", "isOk", "isErr", "unwrapOr", "map", "mapErr", "flatMap"]),
  String: new Set(["length", "charCount", "concat", "trim", "slice", "split", "startsWith", "endsWith", "contains", "includes", "indexOf", "toString", "toStr", "toLower", "toUpper", "charAt", "encode", "toInt", "parse"]),
  Decimal: new Set(["parse", "fromInt", "divide", "remainder", "toString", "toStr"]),
  Map: new Set(["empty", "size", "length", "has", "isEmpty", "get", "keys", "values", "entries", "set", "delete", "remove", "merge", "insert"]),
  Set: new Set(["empty", "from", "size", "length", "contains", "isEmpty", "toList", "toArray", "add", "remove", "union", "intersection", "difference"]),
  Bytes: new Set(["empty", "of", "from", "fromHex", "length", "size", "isEmpty", "get", "getInt", "append", "slice", "toHex", "toBase64", "sha256Hex", "sha256", "decode", "toString", "encode"]),
  Json: new Set(["decode", "parse", "encode", "string"]),
  json: new Set(["decode", "parse", "encode", "string"]),
  Int: new Set(["toString", "toStr", "abs", "clamp", "min", "max", "toInt", "parse", "bitAnd", "bitOr", "bitXor"]),
  Float: new Set(["toString", "toStr", "abs", "floor", "ceil", "round", "isFinite", "isPositive"]),
  Char: new Set(["isDigit", "isLetter", "codePoint", "toInt", "toString", "fromCode"]),
  Duration: new Set(["ofMs", "ofSeconds", "ofHours", "ofMinutes", "add", "subtract", "toString"]),
  Money: new Set(["gbp", "usd", "eur", "jpy", "of", "fromInt", "money", "multiply", "add", "subtract", "toString"]),
  File: new Set(["readText", "readBytes", "writeText", "writeBytes", "read", "write"]),
  FileSystem: new Set(["readText", "readBytes", "writeText", "writeBytes", "read", "write"]),
  fs: new Set(["readText", "readBytes", "writeText", "writeBytes", "read", "write"]),
  Http: new Set(["get", "post", "put", "patch", "delete", "fetch", "serve", "connect"]),
  http: new Set(["get", "post", "put", "patch", "delete", "fetch", "serve", "connect"]),
  https: new Set(["get", "post", "put", "patch", "delete", "fetch", "serve", "connect"]),
  AuditLog: new Set(["write", "log"]),
  audit: new Set(["write", "log"]),
  Secrets: new Set(["get", "secret"]),
  Env: new Set(["get", "secret"]),
  env: new Set(["get", "secret"]),
  vault: new Set(["get", "secret"]),
  Clock: new Set(["now", "fromContext"]),
  Random: new Set(["secureBytes", "bytes", "fromSeed"]),
  Hash: new Set(["sha256", "sha512"]),
  Crypto: new Set(["constantTimeEquals", "verify", "sign"]),
  crypto: new Set(["verify", "sign"]),
  Password: new Set(["verify", "hash", "needsMigration", "migrate"]),
  BCrypt: new Set(["verify", "hash"]),
  Argon2: new Set(["verify", "hash"]),
  Console: new Set(["write", "log", "print", "println"]),
  Response: new Set(["created", "ok", "okJson", "badRequest", "text", "json", "status"]),
  Request: new Set(["body"]),
  Database: new Set(["find", "get", "query", "insert", "update", "delete", "findById", "findByCode", "findByUser", "search"]),
  database: new Set(["find", "get", "query", "insert", "update", "delete", "findById", "findByCode", "findByUser", "search"]),
  EmailService: new Set(["send"]),
  email: new Set(["send"]),
  AI: new Set(["infer", "inference", "embed", "score"]),
  ai: new Set(["inference", "embed", "score"]),
  Model: new Set(["run", "load", "forward"]),
  Classifier: new Set(["classify", "classifyWithKey"]),
  Tensor: new Set(["matmul", "dot", "transpose", "normalize", "relu", "softmax", "add", "sub", "mul", "scale", "quantize", "dequantize", "reshape", "slice", "concat", "mean", "sum", "toDevice", "fromDevice", "vecMul", "getZeroVector"]),
  validate: VALIDATE_GATES,
  Validate: VALIDATE_GATES,
};

/** True when `name` is a stdlib type/module identifier, not a lexical binding. */
export function knownReceiverTypeName(name: string | undefined): string | undefined {
  if (name === undefined || name === "") return undefined;
  return METHODS_BY_RECEIVER[name] === undefined ? undefined : name;
}

function diag(
  code: string,
  name: string,
  message: string,
  location: SourceLocation | undefined,
): CompilerDiagnostic {
  return {
    code,
    name,
    severity: "error",
    message,
    ...(location === undefined ? {} : { location }),
  };
}

function receiverBase(type: string | undefined): string | undefined {
  if (type === undefined || type === "") return undefined;
  const trimmed = type.trim();
  const lt = trimmed.indexOf("<");
  return (lt === -1 ? trimmed : trimmed.slice(0, lt)).trim();
}

function knownMethodsFor(type: string | undefined): ReadonlySet<string> | "open" | undefined {
  const base = receiverBase(type);
  if (base === undefined) return undefined;
  if (base === "validate" || base === "Validate") return "open";
  return METHODS_BY_RECEIVER[base];
}

function allKnownMethods(): Set<string> {
  const all = new Set<string>();
  for (const methods of Object.values(METHODS_BY_RECEIVER)) {
    for (const name of methods) all.add(name);
  }
  return all;
}

const GLOBAL_METHODS = allKnownMethods();

function isResultType(type: string | undefined): boolean {
  const base = receiverBase(type);
  return base === "Result";
}

/**
 * Owner-frozen C03 pipeline checker. Missing receiver type defers 002-005.
 * Method names that are not in the stdlib catalog still refuse as PIPELINE-001
 * so an empty `[]` cannot masquerade as a valid unknown chain.
 */
export function checkMethodChain(input: MethodChainInput): readonly CompilerDiagnostic[] {
  const out: CompilerDiagnostic[] = [];
  if (input.calls.length === 0) return out;

  let currentType = input.receiverType;
  const declared = new Set(input.declaredEffects ?? []);

  for (let i = 0; i < input.calls.length; i++) {
    const stage = input.calls[i]!;
    const method = stage.methodName;
    const stageLoc = "location" in stage ? stage.location ?? input.location : input.location;
    const stageType = "receiverType" in stage ? stage.receiverType ?? currentType : currentType;
    const catalog = knownMethodsFor(stageType);

    if (catalog === "open") {
      // validate.<gate> is admitted by type-checker as protected Field; this
      // checker does not invent a closed gate list that would desync from it.
    } else if (catalog !== undefined) {
      if (!catalog.has(method)) {
        out.push(diag(
          "FUNGI-PIPELINE-001",
          "UNKNOWN_PIPELINE_METHOD",
          `Unknown method '${method}' on receiver type '${stageType}'.`,
          stageLoc,
        ));
      }
    } else if (!GLOBAL_METHODS.has(method)) {
      if (stageType === undefined || stageType === "") {
        out.push(diag(
          "FUNGI-PIPELINE-001",
          "UNKNOWN_PIPELINE_METHOD",
          `Unknown pipeline method '${method}'.`,
          stageLoc,
        ));
      }
      // A named receiver type with no stdlib catalog is a user type constructor
      // or variant (ApiError.notFound). Missing catalogs defer 001 here so C03
      // cannot forbid declared type construction. Unknown value receivers still
      // refuse above.
    }

    const next = input.calls[i + 1];
    const stageReturn = "returnType" in stage ? stage.returnType : undefined;
    if (next !== undefined && stageReturn !== undefined && "receiverType" in next && next.receiverType !== undefined) {
      const outBase = receiverBase(stageReturn);
      const inBase = receiverBase(next.receiverType);
      if (outBase !== undefined && inBase !== undefined && outBase !== inBase) {
        out.push(diag(
          "FUNGI-PIPELINE-002",
          "PIPELINE_TYPE_MISMATCH",
          `Pipeline stage '${method}' yields '${stageReturn}' but the next stage expects '${next.receiverType}'.`,
          stageLoc,
        ));
      }
    }

    const consumed = "resultConsumed" in stage ? stage.resultConsumed === true : false;
    const nextConsumes = next !== undefined && RESULT_CONSUMERS.has(next.methodName);
    if (isResultType(stageReturn) && !consumed && !nextConsumes && i < input.calls.length - 1) {
      out.push(diag(
        "FUNGI-PIPELINE-003",
        "UNHANDLED_FALLIBLE_PIPELINE",
        `Pipeline stage '${method}' produces a Result that is not handled before the next stage.`,
        stageLoc,
      ));
    }

    const effects = "effects" in stage ? stage.effects ?? [] : [];
    for (const effect of effects) {
      if (!declared.has(effect)) {
        out.push(diag(
          "FUNGI-PIPELINE-004",
          "PIPELINE_UNDECLARED_EFFECT",
          `Pipeline stage '${method}' requires effect '${effect}' which is not declared on the enclosing flow.`,
          stageLoc,
        ));
      }
    }

    if (IN_PLACE_MUTATORS.has(method) && input.receiverBindingKind === "readonly") {
      out.push(diag(
        "FUNGI-PIPELINE-005",
        "PIPELINE_READONLY_MUTATION",
        `Pipeline stage '${method}' mutates readonly receiver '${input.receiver}'.`,
        stageLoc,
      ));
    }
    if (PERSISTENT_TRANSFORMS.has(method) && input.receiverBindingKind === "readonly") {
      // Persistent push/append return a replacement value; not PIPELINE-005.
    }

    currentType = stageReturn ?? currentType;
  }

  return out;
}
