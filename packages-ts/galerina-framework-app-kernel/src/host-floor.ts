/**
 * App-kernel host-floor import seam.
 *
 * This is the only app-kernel module allowed to name host modules. Every
 * exported loader has a fixed, least-authority module set; callers cannot pass
 * a specifier or widen the floor at runtime. Governed modules receive frozen
 * module handles and remain responsible for validating all host-derived data.
 */

const importHostModule = (specifier: string): Promise<unknown> =>
  (Function("specifier", "return import(specifier)") as
    (value: string) => Promise<unknown>)(specifier);

type HostRecord = Record<PropertyKey, unknown>;

function requireHostRecord(value: unknown, label: string): HostRecord {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    throw new TypeError(`${label} host module is unavailable`);
  }
  return value as HostRecord;
}

function callableSlice(
  value: unknown,
  label: string,
  names: readonly string[],
): Readonly<Record<string, (...args: readonly unknown[]) => unknown>> {
  const source = requireHostRecord(value, label);
  const slice: Record<string, (...args: readonly unknown[]) => unknown> = {};
  for (const name of names) {
    const callable = source[name];
    if (typeof callable !== "function") {
      throw new TypeError(`${label}.${name} host primitive is unavailable`);
    }
    slice[name] = (...args: readonly unknown[]): unknown =>
      Reflect.apply(callable, source, args);
  }
  return Object.freeze(slice);
}

function dataField(value: unknown, label: string, name: string): unknown {
  const source = requireHostRecord(value, label);
  const descriptor = Object.getOwnPropertyDescriptor(source, name);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new TypeError(`${label}.${name} host data is unavailable`);
  }
  return descriptor.value;
}

export async function loadFuseHostFloor(): Promise<{
  readonly crypto: unknown;
  readonly fs: unknown;
  readonly path: unknown;
}> {
  const [crypto, fs, path] = await Promise.all([
    importHostModule("node:crypto"),
    importHostModule("node:fs"),
    importHostModule("node:path"),
  ]);
  return Object.freeze({
    crypto: callableSlice(crypto, "crypto", ["createHash", "createPublicKey", "verify"]),
    fs: callableSlice(fs, "fs", ["readFileSync", "existsSync", "readdirSync"]),
    path: callableSlice(path, "path", ["join", "basename"]),
  });
}

export async function loadDurabilityArtifactHostFloor(): Promise<{
  readonly crypto: unknown;
  readonly fs: unknown;
  readonly path: unknown;
}> {
  const [crypto, fs, path] = await Promise.all([
    importHostModule("node:crypto"),
    importHostModule("node:fs"),
    importHostModule("node:path"),
  ]);
  const constants = dataField(fs, "fs", "constants");
  const constantSource = requireHostRecord(constants, "fs.constants");
  const narrowedConstants = Object.freeze({
    O_RDONLY: constantSource.O_RDONLY,
    O_NOFOLLOW: constantSource.O_NOFOLLOW,
  });
  return Object.freeze({
    crypto: callableSlice(crypto, "crypto", ["createHash"]),
    fs: Object.freeze({
      ...callableSlice(fs, "fs", [
        "closeSync",
        "fstatSync",
        "lstatSync",
        "openSync",
        "readFileSync",
      ]),
      constants: narrowedConstants,
    }),
    path: Object.freeze({
      ...callableSlice(path, "path", ["dirname", "isAbsolute", "resolve"]),
      sep: dataField(path, "path", "sep"),
    }),
  });
}

export async function loadRegistryGenerationHostFloor(): Promise<{
  readonly fs: unknown;
  readonly path: unknown;
  readonly process: unknown;
}> {
  const [fs, fsSync, path, processModule] = await Promise.all([
    importHostModule("node:fs/promises"),
    importHostModule("node:fs"),
    importHostModule("node:path"),
    importHostModule("node:process"),
  ]);
  const hostProcess = (processModule as { readonly default?: unknown }).default;
  const processSource = requireHostRecord(hostProcess, "process");
  const processSlice: Record<PropertyKey, unknown> = {
    execPath: dataField(processSource, "process", "execPath"),
  };
  const linkedBinding = Object.getOwnPropertyDescriptor(
    processSource,
    "_galerinaLinkedBinding",
  );
  if (linkedBinding !== undefined && "value" in linkedBinding) {
    Object.defineProperty(processSlice, "_galerinaLinkedBinding", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: linkedBinding.value,
    });
  }
  const constantSource = requireHostRecord(
    dataField(fsSync, "fs", "constants"),
    "fs.constants",
  );
  const calls = callableSlice(fs, "fs/promises", ["chmod", "link", "lstat", "open", "realpath", "unlink"]);
  return Object.freeze({
    fs: Object.freeze({
      chmod: calls.chmod,
      link: calls.link,
      lstat: calls.lstat,
      open: calls.open,
      realpath: calls.realpath,
      unlink: calls.unlink,
      constants: Object.freeze({
        O_RDONLY: constantSource.O_RDONLY,
        O_NONBLOCK: constantSource.O_NONBLOCK,
      }),
    }),
    path: callableSlice(path, "path", ["isAbsolute", "join", "resolve"]),
    process: Object.freeze(processSlice),
  });
}

export async function loadRegistryRuntimeHostFloor(): Promise<{
  readonly fs: unknown;
  readonly crypto: unknown;
  readonly url: unknown;
}> {
  const [fs, crypto, url] = await Promise.all([
    importHostModule("node:fs"),
    importHostModule("node:crypto"),
    importHostModule("node:url"),
  ]);
  return Object.freeze({
    fs: callableSlice(fs, "fs", ["lstatSync", "readFileSync", "readdirSync"]),
    crypto: callableSlice(crypto, "crypto", ["createHash", "createPublicKey"]),
    url: callableSlice(url, "url", ["fileURLToPath"]),
  });
}

export function instantiateWasmHostFloor(
  bytes: BufferSource,
  imports: WebAssembly.Imports,
): Promise<WebAssembly.WebAssemblyInstantiatedSource> {
  return WebAssembly.instantiate(bytes, imports);
}

export function loadTrustedRevocationAuthorityHostFloor(
  repositoryRoot: URL,
): Promise<unknown> {
  const moduleUrl = new URL(
    "governance/revocation-registry.mjs",
    repositoryRoot,
  );
  return importHostModule(moduleUrl.href);
}
