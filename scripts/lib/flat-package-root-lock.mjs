import { createHash } from "node:crypto";

const SCHEMA = "galerina.flat-package-root-lock.v1";
const ASSURANCE = "REFERENCE_NON_AUTHORIZING";
const SHA256 = /^[0-9a-f]{64}$/;
const IDENTITY = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const DIRECTORY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SCOPES = new Set(["runtime", "optional", "peer", "development"]);
const verifiedHandles = new WeakMap();
const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function refuse(message) {
  throw new Error(`REFUSED: ${message}`);
}

function exactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    refuse(`${label} must be an exact object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    refuse(`${label} has an unexpected or missing field`);
  }
}

function string(value, label) {
  if (typeof value !== "string" || value.length === 0) refuse(`${label} must be a non-empty string`);
  return value;
}

function digest(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) refuse(`${label} must be a lowercase sha256`);
  return value;
}

function canonical(value) {
  return JSON.stringify(value);
}

function hashDomain(domain, value) {
  return createHash("sha256")
    .update(domain, "utf8")
    .update("\0", "utf8")
    .update(canonical(value), "utf8")
    .digest("hex");
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function decodedDuplicateKeys(text) {
  const duplicates = [];
  const stack = [];
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (character === '"') {
      let end = index + 1;
      while (end < text.length) {
        if (text[end] === "\\") {
          end += 2;
          continue;
        }
        if (text[end] === '"') break;
        end += 1;
      }
      if (end >= text.length) refuse("JSON has an unterminated string");
      const top = stack.at(-1);
      if (top?.kind === "object" && top.expectKey) {
        let key;
        try {
          key = JSON.parse(text.slice(index, end + 1));
        } catch {
          refuse("JSON contains a malformed object key");
        }
        if (top.keys.has(key)) refuse(`JSON repeats decoded key ${JSON.stringify(key)}`);
        top.keys.add(key);
        top.expectKey = false;
      }
      index = end + 1;
      continue;
    }
    if (character === "{") stack.push({ kind: "object", keys: new Set(), expectKey: true });
    else if (character === "[") stack.push({ kind: "array" });
    else if (character === "}" || character === "]") stack.pop();
    else if (character === ",") {
      const top = stack.at(-1);
      if (top?.kind === "object") top.expectKey = true;
    }
    index += 1;
  }
  return duplicates;
}

export function parseStrictJsonObject(text, label = "JSON input") {
  if (typeof text !== "string" || text.startsWith("\uFEFF")) refuse(`${label} is not canonical UTF-8 JSON text`);
  decodedDuplicateKeys(text);
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    refuse(`${label} is malformed JSON: ${error.message}`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    refuse(`${label} must contain one JSON object`);
  }
  return value;
}

function normalizeDependency(value, owner) {
  exactKeys(value, ["identity", "scope", "specifier"], `${owner} dependency`);
  const identity = string(value.identity, `${owner} dependency identity`);
  if (!IDENTITY.test(identity)) refuse(`${owner} dependency identity is malformed`);
  const scope = string(value.scope, `${owner} dependency scope`);
  if (!SCOPES.has(scope)) refuse(`${owner} dependency scope is unsupported`);
  const specifier = string(value.specifier, `${owner} dependency specifier`);
  if (/\0|[\r\n]/.test(specifier)) refuse(`${owner} dependency specifier contains a control boundary`);
  return { identity, scope, specifier };
}

function normalizePackage(value) {
  exactKeys(
    value,
    ["identity", "version", "directory", "contentDigest", "manifestDigests", "dependencies"],
    "package record",
  );
  const identity = string(value.identity, "package identity");
  if (!IDENTITY.test(identity)) refuse("package identity is malformed");
  const directory = string(value.directory, `${identity} directory`);
  if (!DIRECTORY.test(directory) || directory === "." || directory === "..") {
    refuse(`${identity} directory is not one canonical direct peer`);
  }
  const version = string(value.version, `${identity} version`);
  if (/\0|[\r\n]/.test(version)) refuse(`${identity} version contains a control boundary`);
  const contentDigest = digest(value.contentDigest, `${identity} content digest`);
  if (!Array.isArray(value.manifestDigests) || value.manifestDigests.length === 0) {
    refuse(`${identity} must have at least one manifest digest`);
  }
  const manifestDigests = value.manifestDigests.map((entry) => {
    exactKeys(entry, ["path", "digest"], `${identity} manifest digest`);
    const path = string(entry.path, `${identity} manifest path`);
    if (path !== "package.json" && path !== "package.fungi.json") {
      refuse(`${identity} manifest path is not admitted`);
    }
    return { path, digest: digest(entry.digest, `${identity} ${path} digest`) };
  }).sort((a, b) => ordinal(a.path, b.path));
  for (let index = 1; index < manifestDigests.length; index += 1) {
    if (manifestDigests[index - 1].path === manifestDigests[index].path) {
      refuse(`${identity} has a duplicate manifest path`);
    }
  }
  if (!Array.isArray(value.dependencies)) refuse(`${identity} dependencies must be an array`);
  const dependencies = value.dependencies
    .map((entry) => normalizeDependency(entry, identity))
    .sort((a, b) => ordinal(`${a.identity}\0${a.scope}\0${a.specifier}`, `${b.identity}\0${b.scope}\0${b.specifier}`));
  for (let index = 1; index < dependencies.length; index += 1) {
    const before = dependencies[index - 1];
    const current = dependencies[index];
    if (before.identity === current.identity) {
      refuse(`${identity} repeats dependency ${current.identity} across dependency scopes`);
    }
  }
  return { identity, version, directory, contentDigest, manifestDigests, dependencies };
}

function dependencyOrder(packages, byIdentity) {
  const outgoing = new Map(packages.map((entry) => [entry.identity, []]));
  const indegree = new Map(packages.map((entry) => [entry.identity, 0]));
  for (const owner of packages) {
    for (const dependency of owner.dependencies) {
      const target = byIdentity.get(dependency.identity);
      if (target === undefined || dependency.scope === "development") continue;
      outgoing.get(target.identity).push(owner.identity);
      indegree.set(owner.identity, indegree.get(owner.identity) + 1);
    }
  }
  for (const values of outgoing.values()) values.sort();
  const ready = packages.filter((entry) => indegree.get(entry.identity) === 0).map((entry) => entry.identity).sort();
  const order = [];
  while (ready.length > 0) {
    const identity = ready.shift();
    order.push(identity);
    for (const dependent of outgoing.get(identity)) {
      const next = indegree.get(dependent) - 1;
      indegree.set(dependent, next);
      if (next === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }
  if (order.length !== packages.length) refuse("internal dependency cycle prevents a complete order");
  return order;
}

export function buildFlatPackageRootLock(records) {
  if (!Array.isArray(records) || records.length === 0) refuse("package records must be a non-empty array");
  const packages = records.map(normalizePackage).sort((a, b) => ordinal(a.identity, b.identity));
  const byIdentity = new Map();
  const byDirectory = new Map();
  for (const entry of packages) {
    if (byIdentity.has(entry.identity)) refuse(`duplicate package identity ${entry.identity}`);
    if (byDirectory.has(entry.directory)) refuse(`duplicate package directory ${entry.directory}`);
    byIdentity.set(entry.identity, entry);
    byDirectory.set(entry.directory, entry);
  }

  const external = [];
  const externalSpecs = new Map();
  for (const owner of packages) {
    for (const dependency of owner.dependencies) {
      const target = byIdentity.get(dependency.identity);
      if (target !== undefined) {
        const expected = `file:../${target.directory}`;
        if (dependency.specifier !== expected) {
          refuse(`${owner.identity} dependency ${dependency.identity} is not the canonical direct peer ${expected}`);
        }
        continue;
      }
      if (dependency.identity.startsWith("@galerina/")) {
        refuse(`${owner.identity} names missing internal package ${dependency.identity}`);
      }
      external.push({
        identity: dependency.identity,
        owner: owner.identity,
        scope: dependency.scope,
        specifier: dependency.specifier,
      });
      const key = `${dependency.identity}\0${dependency.scope === "development" ? "development" : "runtime"}`;
      const specifiers = externalSpecs.get(key) ?? new Set();
      specifiers.add(dependency.specifier);
      externalSpecs.set(key, specifiers);
    }
  }
  external.sort((a, b) => ordinal(`${a.identity}\0${a.owner}\0${a.scope}\0${a.specifier}`, `${b.identity}\0${b.owner}\0${b.scope}\0${b.specifier}`));

  const developmentVersionDrift = [];
  for (const [key, specifiers] of [...externalSpecs].sort((a, b) => ordinal(a[0], b[0]))) {
    const [identity, className] = key.split("\0");
    if (specifiers.size < 2) continue;
    if (className === "runtime") refuse(`conflicting external runtime dependency ${identity}`);
    developmentVersionDrift.push({ identity, specifiers: [...specifiers].sort() });
  }

  const unsigned = {
    schema: SCHEMA,
    assurance: ASSURANCE,
    authorityReleased: false,
    packages,
    topologicalOrder: dependencyOrder(packages, byIdentity),
    externalBootstrapDependencies: external,
    developmentVersionDrift,
  };
  return deepFreeze({
    ...unsigned,
    rootDigest: hashDomain("galerina.flat-package-root-lock.root.v1", unsigned),
  });
}

export function verifyFlatPackageRootLock(lock) {
  exactKeys(
    lock,
    [
      "schema",
      "assurance",
      "authorityReleased",
      "packages",
      "topologicalOrder",
      "externalBootstrapDependencies",
      "developmentVersionDrift",
      "rootDigest",
    ],
    "flat package root lock",
  );
  if (lock.schema !== SCHEMA || lock.assurance !== ASSURANCE || lock.authorityReleased !== false) {
    refuse("flat package root lock authority or schema is not admitted");
  }
  const rebuilt = buildFlatPackageRootLock(lock.packages);
  if (canonical(rebuilt) !== canonical(lock)) refuse("flat package root lock root digest mismatch or derived fields differ");
  const handle = Object.freeze({ schema: "galerina.verified-flat-package-root-lock-handle.v1", rootDigest: lock.rootDigest });
  verifiedHandles.set(handle, {
    packages: new Map(rebuilt.packages.map((entry) => [entry.identity, entry])),
  });
  return handle;
}

export function resolveFlatPackagePeer(handle, callerIdentity, requestedIdentity) {
  const state = verifiedHandles.get(handle);
  if (state === undefined) refuse("a verified flat package lock handle is required");
  const caller = state.packages.get(callerIdentity);
  if (caller === undefined) refuse("caller is not present in the verified flat package lock");
  const dependency = caller.dependencies.find((entry) => entry.identity === requestedIdentity && state.packages.has(entry.identity));
  if (dependency === undefined) refuse(`${callerIdentity} has an undeclared peer dependency on ${requestedIdentity}`);
  return state.packages.get(requestedIdentity);
}
