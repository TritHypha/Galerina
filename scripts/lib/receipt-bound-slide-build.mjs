import { createHash, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { types as utilTypes } from "node:util";

const require = createRequire(import.meta.url);
const { runOwnedProcess: defaultRunOwnedProcess } = require("./owned-process-tree.cjs");

const REQUEST_KEYS = Object.freeze([
  "rootDirectory",
  "sourceManifestPath",
  "outputDirectory",
  "slideToolRoot",
  "slideToolManifestPath",
  "expectedSlideToolManifestDigest",
  "expectedRuntimeDigest",
]);
const TOOL_MANIFEST_KEYS = Object.freeze([
  "schema", "toolId", "profileId", "entrypoint", "files", "referenceOnly", "authorityReleased",
]);
const TOOL_FILE_KEYS = Object.freeze(["path", "byteLength", "sha256"]);
const CHILD_KEYS = Object.freeze([
  "verdict", "status", "failureId", "sourceManifestDigest", "packageSetDigest",
  "outputName", "artifactCount", "outputFiles", "powerLossDurability",
  "referenceOnly", "authorityReleased",
]);
const RECEIPT_KEYS = Object.freeze([
  "schema", "packageSetDigest", "topologicalIdentities", "descriptors", "artifacts",
  "publicationMode", "powerLossDurability", "referenceOnly", "authorityReleased",
]);
const DESCRIPTOR_KEYS = Object.freeze(["packageIdentity", "descriptorDigest", "canonicalBase64"]);
const ARTIFACT_V1_KEYS = Object.freeze([
  "packageIdentity", "exportName", "sourceFlowName", "compilerProfileId", "sourceDigest",
  "fileName", "slideBundleDigest", "packageDescriptorDigest", "parameterTypeIds",
  "resultTypeId", "byteLength",
]);
const ARTIFACT_V2_KEYS = Object.freeze([
  "packageIdentity", "exportName", "sourceFlowName", "compilerProfileId", "sourceDigest",
  "fileName", "slideBundleDigest", "registrySetId", "registrySetDigest",
  "packageDescriptorDigest", "parameterTypeIds", "resultTypeId", "byteLength",
]);
const ENTRYPOINT = "src/checked-fungi-package-manifest-cli.mjs";
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const BARE_DIGEST = /^[0-9a-f]{64}$/u;
const TOOL_PATH = /^src\/(?:[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/)*[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.mjs$/u;
const ARTIFACT_NAME = /^package-[0-9a-f]{16}-[0-9a-f]{16}\.slide$/u;
const PACKAGE_IDENTITY = /^@[a-z][a-z0-9-]{0,31}\/[a-z][a-z0-9-]{0,31}$/u;
const SYMBOL = /^[a-z][A-Za-z0-9]{0,63}$/u;
const PROFILE = /^slide\.[a-z][a-z0-9-]{0,31}\.v[1-9][0-9]{0,8}$/u;
const SOURCE_PATH = /^(?:[A-Za-z0-9][A-Za-z0-9._-]{0,63}\/)*[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.fungi$/u;
const VERSION = /^(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})(?:-[0-9A-Za-z][0-9A-Za-z.-]{0,63})?$/u;
const RESOURCE = /^[a-z][a-z0-9-]{0,63}$/u;
const MEDIA_TYPE = /^[a-z0-9][a-z0-9.+-]{0,31}\/[a-z0-9][a-z0-9.+-]{0,63}$/u;
const TYPE_IDS = new Set(Array.from({ length: 13 }, (_, index) => index + 1));
const TOOL_FILE_LIMIT = 512;
const TOOL_FILE_BYTES = 4 * 1024 * 1024;
const MANIFEST_BYTES = 4 * 1024 * 1024;
const RUNTIME_BYTES = 256 * 1024 * 1024;
const ARTIFACT_BYTES = 1024 * 1024;
const DESCRIPTOR_BYTES = 64 * 1024;
const DESCRIPTOR_MEMBERS = 128;
const SOURCE_BYTES = 1024 * 1024;
const RECEIPT_NAME = "package-set.receipt.json";
const MAGIC = Uint8Array.of(0x53, 0x4c, 0x49, 0x44, 0x45, 0x0d, 0x0a, 0x1a);
const SUCCESSOR_REGISTRIES = new Map([
  ["slide.registry.executable-gir.v2c-immutable-value-ops.v1", "956e5f12ea00599f67fc4892774c01b78bedcc5d630df70f0164730ee8a25703"],
  ["slide.registry.executable-gir.v2c-immutable-array-option.v1", "0ca2e25be48aab5d5e3355069144e79b33888345c8771bffc5afbaab59c8dfbc"],
  ["slide.registry.executable-gir.v2c-checked-subtraction.v1", "b362701177580e4cefae36a5bf863f4f3e791881f3a4dfcad81b8540b9533422"],
  ["slide.registry.executable-gir.v2c-checked-multiplication.v1", "f602ce3bd84872a86b910b75ff88dbff4bbbcbdaefd52da5a36edb6fbe50a03a"],
  ["slide.registry.executable-gir.v2c-checked-division.v1", "64b05c2094afe4767e1229be3d7a09c8662a0168919c06cc3b680238eedcd4cd"],
  ["slide.registry.executable-gir.v2c-checked-remainder.v1", "aa7f2c9f890dc92bd0cee93385871d9c16b5c33bff53e536138f84224ed140f9"],
  ["slide.registry.executable-gir.v2c-bounded-wide-function-graph.v1", "69747391f450ed0d1250e20ee8fe259a8482f1cf29aadf5eb90be8a5deff8b3f"],
  ["slide.registry.executable-gir.v2c-bounded-transitive-call-work.v1", "6121be7c1e279d8a28eeeaa31e46889e4fd8450aa9383bb40de80d2484bf855e"],
  ["slide.registry.executable-gir.v2c-immutable-array-contains.v1", "679f28399d3ff87809fdee4a535abbf393fcfebac5da73c4f729bf05a12bf337"],
  ["slide.registry.executable-gir.v2c-immutable-text-prefix.v1", "a461bdcb44e52d8c37e28731992d5fc2d0bed482fae966ec50c8bde1be987a4f"],
  ["slide.registry.executable-gir.v2c-immutable-text-suffix.v1", "0548c1b0202f3586ac7ef61e1d849dee422940407eff6c4e89a96d0d2ab80713"],
  ["slide.registry.executable-gir.v2c-immutable-text-contains.v1", "fbed63b8b647a301dac16867e0f2497d78a4cf165535b9fc093ba61934ac1f84"],
  ["slide.registry.executable-gir.v2c-bounded-wide-control-flow.v1", "d805dae4b822392e5092126ce4f0fb27e8bfa6aa2de8862ee88e09e23eed43cc"],
]);

function refusal() {
  return Object.freeze({
    verdict: -1,
    status: "REFUSED",
    failureId: "GALERINA-SLIDE-TOOL-001",
    toolManifestDigest: "",
    runtimeDigest: "",
    sourceManifestDigest: "",
    packageSetDigest: "",
    outputName: "",
    artifactCount: 0,
    outputFiles: Object.freeze([]),
    powerLossDurability: 0,
    referenceOnly: true,
    authorityReleased: false,
  });
}

function exactRecord(value, keys) {
  try {
    if (
      value === null
      || typeof value !== "object"
      || Array.isArray(value)
      || utilTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== keys.length) return null;
    const output = Object.create(null);
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined
        || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, "value")
        || descriptor.get !== undefined
        || descriptor.set !== undefined
      ) return null;
      output[key] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function orderedRecord(value, keys) {
  const record = exactRecord(value, keys);
  try {
    return record !== null && JSON.stringify(Object.keys(value)) === JSON.stringify(keys) ? record : null;
  } catch {
    return null;
  }
}

function exactArray(value, maximum) {
  try {
    if (
      !Array.isArray(value)
      || utilTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Array.prototype
      || value.length > maximum
    ) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) return null;
    const output = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined
        || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, "value")
        || descriptor.get !== undefined
        || descriptor.set !== undefined
      ) return null;
      output.push(descriptor.value);
    }
    return output;
  } catch {
    return null;
  }
}

function sameMetadata(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

async function stableRegularFile(path, minimum, maximum) {
  let first;
  let second;
  try {
    const before = await lstat(path, { bigint: true });
    if (
      !before.isFile()
      || before.isSymbolicLink()
      || before.size < BigInt(minimum)
      || before.size > BigInt(maximum)
    ) return null;
    first = await open(path, "r");
    const firstMetadata = await first.stat({ bigint: true });
    const firstBytes = await first.readFile();
    await first.close();
    first = undefined;
    second = await open(path, "r");
    const secondMetadata = await second.stat({ bigint: true });
    const secondBytes = await second.readFile();
    await second.close();
    second = undefined;
    const after = await lstat(path, { bigint: true });
    if (
      !sameMetadata(before, firstMetadata)
      || !sameMetadata(firstMetadata, secondMetadata)
      || !sameMetadata(secondMetadata, after)
      || !firstBytes.equals(secondBytes)
    ) return null;
    return Uint8Array.from(firstBytes);
  } catch {
    return null;
  } finally {
    await first?.close().catch(() => undefined);
    await second?.close().catch(() => undefined);
  }
}

function contained(root, candidate, allowRoot = false) {
  const local = relative(root, candidate);
  if (local === "") return allowRoot ? candidate : null;
  return local !== ".."
    && !local.startsWith("../")
    && !local.startsWith("..\\")
    && !isAbsolute(local)
    ? candidate
    : null;
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function typedDigest(domain, parts) {
  const hash = createHash("sha256").update(domain, "utf8").update(Uint8Array.of(0));
  for (const part of parts) hash.update(part);
  return `sha256:${hash.digest("hex")}`;
}

function framedDigest(domain, parts) {
  const hash = createHash("sha256").update(domain, "utf8").update(Uint8Array.of(0));
  for (const part of parts) {
    hash.update(Uint8Array.of(
      (part.length >>> 24) & 0xff,
      (part.length >>> 16) & 0xff,
      (part.length >>> 8) & 0xff,
      part.length & 0xff,
    ));
    hash.update(part);
  }
  return `sha256:${hash.digest("hex")}`;
}

function equalText(left, right) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function parseCanonical(bytes, maximum = MANIFEST_BYTES) {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > maximum) return null;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.startsWith("\uFEFF") || text.includes("\r")) return null;
    const parsed = JSON.parse(text);
    return `${JSON.stringify(parsed, null, 2)}\n` === text ? parsed : null;
  } catch {
    return null;
  }
}

async function validatePathSegments(root, relativePath) {
  const segments = relativePath.split("/");
  let cursor = root;
  for (let index = 0; index < segments.length; index += 1) {
    cursor = join(cursor, segments[index]);
    const metadata = await lstat(cursor);
    if (metadata.isSymbolicLink()) return null;
    if (index < segments.length - 1 && !metadata.isDirectory()) return null;
    if (index === segments.length - 1 && !metadata.isFile()) return null;
  }
  return await realpath(cursor) === cursor ? cursor : null;
}

function sourceDigestForProfile(profileId, bytes) {
  if (profileId === "slide.checked-decision.v1") return sha256(bytes);
  if (profileId === "slide.pure-routing.v1") {
    return typedDigest("slide.checked-fungi.pure-routing.source.v1", [bytes]);
  }
  if (profileId === "slide.pure-scalar.v1") {
    return typedDigest("slide.checked-fungi.pure-scalar.source.v1", [bytes]);
  }
  return "";
}

async function inspectSourceManifest(root, bytes) {
  try {
    const parsed = parseCanonical(bytes, SOURCE_BYTES);
    const manifest = parsed === null ? null : orderedRecord(parsed, ["schema", "context", "packages"]);
    const context = manifest === null ? null : orderedRecord(
      manifest.context,
      ["targetDigest", "policyDigest", "verifierDigest"],
    );
    const packages = manifest === null ? null : exactArray(manifest.packages, 64);
    if (
      manifest === null
      || manifest.schema !== "slide.checked-fungi.source-manifest.v1"
      || context === null
      || packages === null
      || packages.length < 1
      || !DIGEST.test(context.targetDigest)
      || !DIGEST.test(context.policyDigest)
      || !DIGEST.test(context.verifierDigest)
    ) return null;
    const packageMap = new Map();
    const exportMap = new Map();
    const closureParts = [bytes];
    for (const candidate of packages) {
      const entry = orderedRecord(candidate, ["identity", "version", "exports", "dependencies", "resources"]);
      const exports = entry === null ? null : exactArray(entry.exports, DESCRIPTOR_MEMBERS);
      const dependencies = entry === null ? null : exactArray(entry.dependencies, DESCRIPTOR_MEMBERS);
      const resources = entry === null ? null : exactArray(entry.resources, DESCRIPTOR_MEMBERS);
      if (
        entry === null
        || exports === null
        || exports.length < 1
        || dependencies === null
        || resources === null
        || !PACKAGE_IDENTITY.test(entry.identity)
        || !VERSION.test(entry.version)
        || packageMap.has(entry.identity)
      ) return null;
      const normalizedDependencies = dependencies.map((candidateDependency) => {
        const dependency = orderedRecord(candidateDependency, ["identity", "exactVersion"]);
        if (
          dependency === null
          || !PACKAGE_IDENTITY.test(dependency.identity)
          || dependency.identity === entry.identity
          || !VERSION.test(dependency.exactVersion)
        ) throw new Error("source dependency");
        return { ...dependency };
      });
      const normalizedResources = resources.map((candidateResource) => {
        const resource = orderedRecord(candidateResource, ["name", "mediaType", "contentDigest", "byteLength"]);
        if (
          resource === null
          || !RESOURCE.test(resource.name)
          || !MEDIA_TYPE.test(resource.mediaType)
          || !DIGEST.test(resource.contentDigest)
          || !Number.isSafeInteger(resource.byteLength)
          || resource.byteLength < 1
          || resource.byteLength > 0xffff_ffff
        ) throw new Error("source resource");
        return { ...resource };
      });
      const dependencyNames = normalizedDependencies.map((dependency) => dependency.identity);
      const resourceNames = normalizedResources.map((resource) => resource.name);
      if (new Set(dependencyNames).size !== dependencyNames.length || new Set(resourceNames).size !== resourceNames.length) return null;
      packageMap.set(entry.identity, {
        identity: entry.identity,
        version: entry.version,
        dependencies: normalizedDependencies,
        resources: normalizedResources,
      });
      for (const candidateExport of exports) {
        const exported = orderedRecord(candidateExport, ["name", "sourceFlowName", "source"]);
        if (
          exported === null
          || !SYMBOL.test(exported.name)
          || (exported.sourceFlowName !== null && !SYMBOL.test(exported.sourceFlowName))
          || typeof exported.source !== "string"
          || !SOURCE_PATH.test(exported.source)
          || exported.source.split("/").some((segment) => segment === "." || segment === "..")
        ) return null;
        const key = `${entry.identity}\0${exported.name}`;
        if (exportMap.has(key)) return null;
        const sourcePath = await validatePathSegments(root, exported.source);
        const sourceBytes = sourcePath === null ? null : await stableRegularFile(sourcePath, 1, SOURCE_BYTES);
        if (sourceBytes === null) return null;
        exportMap.set(key, {
          packageIdentity: entry.identity,
          exportName: exported.name,
          sourceFlowName: exported.sourceFlowName,
          sourceBytes,
        });
        closureParts.push(Buffer.from(exported.source, "utf8"), sourceBytes);
      }
    }
    for (const entry of packageMap.values()) {
      if (entry.dependencies.some((dependency) => {
        const peer = packageMap.get(dependency.identity);
        return peer === undefined || peer.version !== dependency.exactVersion;
      })) return null;
    }
    return {
      context,
      packageMap,
      exportMap,
      closureDigest: typedDigest("galerina.slide.source-closure.v1", closureParts),
    };
  } catch {
    return null;
  }
}

export function slideToolManifestDigest(bytes) {
  return typedDigest("slide.reference-tool-manifest.v1", [bytes]);
}

export async function digestRuntimeFile(runtimePath) {
  try {
    const canonical = await realpath(runtimePath);
    const bytes = await stableRegularFile(canonical, 1, RUNTIME_BYTES);
    return bytes === null ? "" : sha256(bytes);
  } catch {
    return "";
  }
}

async function toolInventory(toolRoot) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new TypeError("redirected tool source");
      const absolute = join(directory, entry.name);
      if (contained(toolRoot, absolute) === null) throw new TypeError("escaped tool source");
      if (entry.isDirectory()) {
        if (await realpath(absolute) !== absolute) throw new TypeError("redirected tool directory");
        await visit(absolute);
      } else if (entry.isFile() && entry.name.endsWith(".mjs")) {
        const path = relative(toolRoot, absolute).replaceAll("\\", "/");
        if (!TOOL_PATH.test(path)) throw new TypeError("tool path");
        files.push({ path, absolute });
      } else if (!entry.isFile()) {
        throw new TypeError("tool entry");
      }
    }
  }
  const sourceRoot = join(toolRoot, "src");
  const sourceMetadata = await lstat(sourceRoot);
  if (!sourceMetadata.isDirectory() || sourceMetadata.isSymbolicLink() || await realpath(sourceRoot) !== sourceRoot) {
    throw new TypeError("tool source root");
  }
  await visit(sourceRoot);
  files.sort((left, right) => left.path.localeCompare(right.path, "en"));
  return files;
}

async function inspectTool(toolRoot, manifestBytes) {
  const parsed = parseCanonical(manifestBytes);
  const manifest = parsed === null ? null : exactRecord(parsed, TOOL_MANIFEST_KEYS);
  if (
    manifest === null
    || manifest.schema !== "slide.reference-tool-manifest.v1"
    || manifest.toolId !== "slide.checked-fungi-package-compiler.v1"
    || manifest.profileId !== "slide.checked-fungi.source-manifest.v1"
    || manifest.entrypoint !== ENTRYPOINT
    || manifest.referenceOnly !== true
    || manifest.authorityReleased !== false
  ) return null;
  const candidateFiles = exactArray(manifest.files, TOOL_FILE_LIMIT);
  if (candidateFiles === null || candidateFiles.length < 1) return null;
  const records = candidateFiles.map((candidate) => exactRecord(candidate, TOOL_FILE_KEYS));
  if (records.some((record) => record === null)) return null;
  const paths = records.map((record) => record.path);
  if (
    JSON.stringify(paths) !== JSON.stringify([...paths].sort((left, right) => left.localeCompare(right, "en")))
    || new Set(paths).size !== paths.length
    || !paths.includes(ENTRYPOINT)
  ) return null;
  const inventory = await toolInventory(toolRoot);
  if (JSON.stringify(paths) !== JSON.stringify(inventory.map((file) => file.path))) return null;
  const files = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (
      !TOOL_PATH.test(record.path)
      || !Number.isSafeInteger(record.byteLength)
      || record.byteLength < 1
      || record.byteLength > TOOL_FILE_BYTES
      || !DIGEST.test(record.sha256)
    ) return null;
    const bytes = await stableRegularFile(inventory[index].absolute, 1, TOOL_FILE_BYTES);
    if (bytes === null || bytes.length !== record.byteLength || !equalText(sha256(bytes), record.sha256)) return null;
    files.push({ path: record.path, bytes });
  }
  return { files, fileCount: records.length };
}

async function stageVerifiedTool(files) {
  const stagingRoot = await mkdtemp(join(tmpdir(), "slide-pinned-tool-"));
  for (const file of files) {
    const dest = join(stagingRoot, ...file.path.split("/"));
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, file.bytes, { flag: "wx" });
  }
  return stagingRoot;
}

function inspectBundle(bytes) {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.length < 190 || bytes.length > ARTIFACT_BYTES) return null;
    if (!MAGIC.every((value, index) => bytes[index] === value)) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const artifactLength = view.getUint16(16, false);
    const girLength = view.getUint32(24, false);
    if (
      view.getUint16(8, false) !== 1
      || view.getUint16(10, false) !== 0
      || view.getUint32(12, false) !== bytes.length
      || artifactLength < 1
      || view.getUint16(18, false) !== 0
      || view.getUint32(20, false) < 1
      || girLength < 1
      || 188 + artifactLength + girLength !== bytes.length
    ) return null;
    const artifact = bytes.subarray(188, 188 + artifactLength);
    const gir = bytes.subarray(188 + artifactLength);
    const artifactId = new TextDecoder("utf-8", { fatal: true }).decode(artifact);
    if (!/^[a-z][a-z0-9-]{0,31}(?:\.[a-z0-9][a-z0-9-]{0,31}){0,3}$/u.test(artifactId)) return null;
    const expectedGir = Buffer.from(bytes.subarray(124, 156));
    const actualGir = Buffer.from(typedDigest("slide.bundle.gir.v1", [gir]).slice(7), "hex");
    const expectedDescriptor = Buffer.from(bytes.subarray(156, 188));
    const actualDescriptor = Buffer.from(typedDigest("slide.bundle.descriptor.v1", [bytes.subarray(0, 156), artifact]).slice(7), "hex");
    if (!timingSafeEqual(expectedGir, actualGir) || !timingSafeEqual(expectedDescriptor, actualDescriptor)) return null;
    return {
      artifactId,
      targetDigest: `sha256:${Buffer.from(bytes.subarray(28, 60)).toString("hex")}`,
      policyDigest: `sha256:${Buffer.from(bytes.subarray(60, 92)).toString("hex")}`,
      verifierDigest: `sha256:${Buffer.from(bytes.subarray(92, 124)).toString("hex")}`,
      bundleDigest: typedDigest("slide.bundle.v1", [bytes]),
    };
  } catch {
    return null;
  }
}

function parseChild(stdout) {
  try {
    if (typeof stdout !== "string" || stdout.length < 2 || stdout.length > MANIFEST_BYTES || !stdout.endsWith("\n")) return null;
    const text = stdout.slice(0, -1);
    if (text.includes("\n") || text.includes("\r")) return null;
    return exactRecord(JSON.parse(text), CHILD_KEYS);
  } catch {
    return null;
  }
}

function validStringArray(value, maximum, pattern) {
  const array = exactArray(value, maximum);
  return array !== null
    && array.every((entry) => typeof entry === "string" && pattern.test(entry))
    && new Set(array).size === array.length
    ? array
    : null;
}

function expectedArtifactId(packageIdentity, exportName) {
  const identityHash = createHash("sha256").update(packageIdentity, "utf8").digest("hex").slice(0, 16);
  const exportHash = createHash("sha256").update(exportName, "utf8").digest("hex").slice(0, 16);
  return `pkg.${identityHash}.${exportHash}`;
}

function expectedArtifactFileName(packageIdentity, exportName) {
  const identityHash = createHash("sha256").update(packageIdentity, "utf8").digest("hex").slice(0, 16);
  const exportHash = createHash("sha256").update(exportName, "utf8").digest("hex").slice(0, 16);
  return `package-${identityHash}-${exportHash}.slide`;
}

class DescriptorReader {
  #offset = 0;

  constructor(bytes) {
    this.bytes = bytes;
  }

  #byte() {
    const byte = this.bytes[this.#offset];
    if (byte === undefined) throw new Error("truncated descriptor");
    this.#offset += 1;
    return byte;
  }

  #head(major) {
    const first = this.#byte();
    if ((first >>> 5) !== major) throw new Error("wrong descriptor type");
    const additional = first & 31;
    if (additional < 24) return additional;
    if (additional === 24) {
      const value = this.#byte();
      if (value < 24) throw new Error("non-canonical descriptor integer");
      return value;
    }
    if (additional === 25) {
      const value = (this.#byte() * 256) + this.#byte();
      if (value <= 0xff) throw new Error("non-canonical descriptor integer");
      return value;
    }
    if (additional === 26) {
      const value = (this.#byte() * 0x1000000)
        + (this.#byte() << 16)
        + (this.#byte() << 8)
        + this.#byte();
      if (value <= 0xffff) throw new Error("non-canonical descriptor integer");
      return value;
    }
    throw new Error("unsupported descriptor integer");
  }

  uint() {
    return this.#head(0);
  }

  arrayLength(maximum) {
    const length = this.#head(4);
    if (length > maximum) throw new Error("descriptor array ceiling");
    return length;
  }

  text(maximumBytes) {
    const length = this.#head(3);
    if (length < 1 || length > maximumBytes || this.#offset + length > this.bytes.length) {
      throw new Error("descriptor text ceiling");
    }
    const bytes = Buffer.from(this.bytes.subarray(this.#offset, this.#offset + length));
    const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!Buffer.from(value, "utf8").equals(bytes)) throw new Error("descriptor text encoding");
    this.#offset += length;
    return value;
  }

  done() {
    return this.#offset === this.bytes.length;
  }
}

function strictlyOrdered(records, field) {
  for (let index = 1; index < records.length; index += 1) {
    if (records[index - 1][field] >= records[index][field]) return false;
  }
  return true;
}

function inspectFlatDescriptor(bytes) {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > DESCRIPTOR_BYTES) return null;
    const reader = new DescriptorReader(bytes);
    if (reader.arrayLength(7) !== 7 || reader.text(64) !== "slide.flat-package.v1") return null;
    const identity = reader.text(66);
    const version = reader.text(96);
    const contentDigest = reader.text(71);
    if (!PACKAGE_IDENTITY.test(identity) || !VERSION.test(version) || !DIGEST.test(contentDigest)) return null;
    const exports = [];
    for (let index = 0, length = reader.arrayLength(DESCRIPTOR_MEMBERS); index < length; index += 1) {
      if (reader.arrayLength(4) !== 4) return null;
      const name = reader.text(64);
      const moduleDigest = reader.text(71);
      const parameterTypeIds = [];
      for (let parameter = 0, count = reader.arrayLength(64); parameter < count; parameter += 1) {
        parameterTypeIds.push(reader.uint());
      }
      const resultTypeId = reader.uint();
      if (
        !SYMBOL.test(name)
        || !DIGEST.test(moduleDigest)
        || parameterTypeIds.some((typeId) => !TYPE_IDS.has(typeId))
        || !TYPE_IDS.has(resultTypeId)
      ) return null;
      exports.push({ name, moduleDigest, parameterTypeIds, resultTypeId });
    }
    const dependencies = [];
    for (let index = 0, length = reader.arrayLength(DESCRIPTOR_MEMBERS); index < length; index += 1) {
      if (reader.arrayLength(3) !== 3) return null;
      const dependency = {
        identity: reader.text(66),
        exactVersion: reader.text(96),
        descriptorDigest: reader.text(71),
      };
      if (
        !PACKAGE_IDENTITY.test(dependency.identity)
        || dependency.identity === identity
        || !VERSION.test(dependency.exactVersion)
        || !DIGEST.test(dependency.descriptorDigest)
      ) return null;
      dependencies.push(dependency);
    }
    const resources = [];
    for (let index = 0, length = reader.arrayLength(DESCRIPTOR_MEMBERS); index < length; index += 1) {
      if (reader.arrayLength(4) !== 4) return null;
      const resource = {
        name: reader.text(64),
        mediaType: reader.text(96),
        contentDigest: reader.text(71),
        byteLength: reader.uint(),
      };
      if (
        !RESOURCE.test(resource.name)
        || !MEDIA_TYPE.test(resource.mediaType)
        || !DIGEST.test(resource.contentDigest)
        || resource.byteLength < 1
        || resource.byteLength > 0xffff_ffff
      ) return null;
      resources.push(resource);
    }
    if (
      !reader.done()
      || !strictlyOrdered(exports, "name")
      || !strictlyOrdered(dependencies, "identity")
      || !strictlyOrdered(resources, "name")
    ) return null;
    return {
      identity,
      version,
      contentDigest,
      exports,
      dependencies,
      resources,
      descriptorDigest: framedDigest("slide.flat-package.descriptor.v1", [bytes]),
    };
  } catch {
    return null;
  }
}

function packageContentDigest(descriptor, artifacts) {
  const parts = [Buffer.from(descriptor.identity, "utf8"), Buffer.from(descriptor.version, "utf8")];
  for (const dependency of descriptor.dependencies) {
    parts.push(Buffer.from(dependency.identity, "utf8"), Buffer.from(dependency.exactVersion, "utf8"));
  }
  for (const exported of descriptor.exports) {
    const artifact = artifacts.find((candidate) => candidate.exportName === exported.name);
    if (
      artifact === undefined
      || artifact.slideBundleDigest !== exported.moduleDigest
      || artifact.parameterTypeIds.length !== exported.parameterTypeIds.length
      || artifact.parameterTypeIds.some((typeId, index) => typeId !== exported.parameterTypeIds[index])
      || artifact.resultTypeId !== exported.resultTypeId
    ) return "";
    parts.push(
      Buffer.from(exported.name, "utf8"),
      Buffer.from(artifact.sourceFlowName, "utf8"),
      Buffer.from(artifact.compilerProfileId, "utf8"),
      Buffer.from(artifact.sourceDigest, "utf8"),
      Buffer.from(artifact.slideBundleDigest, "utf8"),
      Uint8Array.from([...artifact.parameterTypeIds, artifact.resultTypeId]),
    );
    if (artifact.registrySetId !== "" && artifact.registrySetId !== undefined) {
      parts.push(
        Buffer.from(artifact.registrySetId, "utf8"),
        Buffer.from(artifact.registrySetDigest, "utf8"),
      );
    }
  }
  if (artifacts.length !== descriptor.exports.length) return "";
  for (const resource of descriptor.resources) {
    parts.push(
      Buffer.from(resource.name, "utf8"),
      Buffer.from(resource.mediaType, "utf8"),
      Buffer.from(resource.contentDigest, "utf8"),
      Uint8Array.of(
        (resource.byteLength >>> 24) & 0xff,
        (resource.byteLength >>> 16) & 0xff,
        (resource.byteLength >>> 8) & 0xff,
        resource.byteLength & 0xff,
      ),
    );
  }
  return framedDigest("slide.checked-fungi.package-content.v1", parts);
}

function deriveTopologicalIdentities(descriptorMap) {
  const states = new Map();
  const output = [];
  const visit = (identity) => {
    const state = states.get(identity) ?? 0;
    if (state === 1) throw new Error("dependency cycle");
    if (state === 2) return;
    const descriptor = descriptorMap.get(identity);
    if (descriptor === undefined) throw new Error("missing descriptor");
    states.set(identity, 1);
    for (const dependency of descriptor.dependencies) {
      const peer = descriptorMap.get(dependency.identity);
      if (
        peer === undefined
        || peer.version !== dependency.exactVersion
        || peer.descriptorDigest !== dependency.descriptorDigest
      ) throw new Error("dependency mismatch");
      visit(dependency.identity);
    }
    states.set(identity, 2);
    output.push(identity);
  };
  for (const identity of [...descriptorMap.keys()].sort()) visit(identity);
  return output;
}

async function inspectPublication(outputDirectory, child, sourceBinding) {
  const before = await lstat(outputDirectory, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink() || await realpath(outputDirectory) !== outputDirectory) return null;
  const names = (await readdir(outputDirectory)).sort((left, right) => left.localeCompare(right, "en"));
  const outputFiles = validStringArray(child.outputFiles, TOOL_FILE_LIMIT, /^(?:package-[0-9a-f]{16}-[0-9a-f]{16}\.slide|package-set\.receipt\.json)$/u);
  if (
    outputFiles === null
    || JSON.stringify(outputFiles) !== JSON.stringify(names)
    || outputFiles.at(-1) !== RECEIPT_NAME
    || child.artifactCount !== outputFiles.length - 1
  ) return null;
  const receiptBytes = await stableRegularFile(join(outputDirectory, RECEIPT_NAME), 1, MANIFEST_BYTES);
  const parsed = receiptBytes === null ? null : parseCanonical(receiptBytes);
  const receipt = parsed === null ? null : exactRecord(parsed, RECEIPT_KEYS);
  const successorReceipt = receipt !== null
    && receipt.schema === "slide.checked-fungi.package-publication.v2";
  if (
    receipt === null
    || (receipt.schema !== "slide.checked-fungi.package-publication.v1" && !successorReceipt)
    || receipt.packageSetDigest !== child.packageSetDigest
    || receipt.publicationMode !== "exclusive-directory-receipt-last.v1"
    || receipt.powerLossDurability !== child.powerLossDurability
    || receipt.referenceOnly !== true
    || receipt.authorityReleased !== false
  ) return null;
  const identities = validStringArray(receipt.topologicalIdentities, TOOL_FILE_LIMIT, PACKAGE_IDENTITY);
  const descriptorCandidates = exactArray(receipt.descriptors, TOOL_FILE_LIMIT);
  const artifactCandidates = exactArray(receipt.artifacts, TOOL_FILE_LIMIT);
  if (
    identities === null
    || identities.length < 1
    || descriptorCandidates === null
    || artifactCandidates === null
    || artifactCandidates.length !== child.artifactCount
  ) return null;
  const descriptors = descriptorCandidates.map((entry) => exactRecord(entry, DESCRIPTOR_KEYS));
  if (descriptors.some((entry) => entry === null) || descriptors.length !== identities.length) return null;
  const descriptorMap = new Map();
  for (const descriptor of descriptors) {
    if (
      !PACKAGE_IDENTITY.test(descriptor.packageIdentity)
      || !DIGEST.test(descriptor.descriptorDigest)
      || typeof descriptor.canonicalBase64 !== "string"
      || descriptor.canonicalBase64.length < 4
      || descriptor.canonicalBase64.length > MANIFEST_BYTES
    ) return null;
    const decoded = Buffer.from(descriptor.canonicalBase64, "base64");
    const inspectedDescriptor = inspectFlatDescriptor(decoded);
    if (
      decoded.length < 1
      || decoded.toString("base64") !== descriptor.canonicalBase64
      || inspectedDescriptor === null
      || inspectedDescriptor.identity !== descriptor.packageIdentity
      || inspectedDescriptor.descriptorDigest !== descriptor.descriptorDigest
      || descriptorMap.has(descriptor.packageIdentity)
    ) return null;
    descriptorMap.set(descriptor.packageIdentity, inspectedDescriptor);
  }
  if (JSON.stringify([...descriptorMap.keys()]) !== JSON.stringify(identities)) return null;
  if (descriptorMap.size !== sourceBinding.packageMap.size) return null;
  for (const [identity, descriptor] of descriptorMap) {
    const sourcePackage = sourceBinding.packageMap.get(identity);
    if (sourcePackage === undefined || sourcePackage.version !== descriptor.version) return null;
    const sourceDependencies = [...sourcePackage.dependencies]
      .sort((left, right) => left.identity.localeCompare(right.identity, "en"));
    const sourceResources = [...sourcePackage.resources]
      .sort((left, right) => left.name.localeCompare(right.name, "en"));
    if (
      JSON.stringify(descriptor.dependencies.map(({ identity: dependencyIdentity, exactVersion }) => ({
        identity: dependencyIdentity,
        exactVersion,
      }))) !== JSON.stringify(sourceDependencies)
      || JSON.stringify(descriptor.resources) !== JSON.stringify(sourceResources)
    ) return null;
  }
  const artifactNames = [];
  const inspectedArtifacts = [];
  for (const candidate of artifactCandidates) {
    const artifact = exactRecord(candidate, successorReceipt ? ARTIFACT_V2_KEYS : ARTIFACT_V1_KEYS);
    const parameters = artifact === null ? null : exactArray(artifact.parameterTypeIds, 64);
    const validRegistry = !successorReceipt || (
      typeof artifact?.registrySetId === "string"
      && typeof artifact?.registrySetDigest === "string"
      && (
        (artifact.registrySetId === "" && artifact.registrySetDigest === "")
        || (
          BARE_DIGEST.test(artifact.registrySetDigest)
          && SUCCESSOR_REGISTRIES.get(artifact.registrySetId) === artifact.registrySetDigest
        )
      )
    );
    if (
      artifact === null
      || !validRegistry
      || parameters === null
      || !PACKAGE_IDENTITY.test(artifact.packageIdentity)
      || !SYMBOL.test(artifact.exportName)
      || !SYMBOL.test(artifact.sourceFlowName)
      || !PROFILE.test(artifact.compilerProfileId)
      || !DIGEST.test(artifact.sourceDigest)
      || !ARTIFACT_NAME.test(artifact.fileName)
      || !DIGEST.test(artifact.slideBundleDigest)
      || descriptorMap.get(artifact.packageIdentity)?.descriptorDigest !== artifact.packageDescriptorDigest
      || parameters.some((value) => !Number.isSafeInteger(value) || value < 1 || value > 0xffff)
      || !Number.isSafeInteger(artifact.resultTypeId)
      || artifact.resultTypeId < 1
      || artifact.resultTypeId > 0xffff
      || !Number.isSafeInteger(artifact.byteLength)
      || artifact.byteLength < 1
      || artifact.byteLength > ARTIFACT_BYTES
    ) return null;
    const sourceExport = sourceBinding.exportMap.get(`${artifact.packageIdentity}\0${artifact.exportName}`);
    const expectedSourceDigest = sourceExport === undefined
      ? ""
      : sourceDigestForProfile(artifact.compilerProfileId, sourceExport.sourceBytes);
    if (
      sourceExport === undefined
      || expectedSourceDigest === ""
      || artifact.sourceDigest !== expectedSourceDigest
      || (sourceExport.sourceFlowName !== null && artifact.sourceFlowName !== sourceExport.sourceFlowName)
      || artifact.fileName !== expectedArtifactFileName(artifact.packageIdentity, artifact.exportName)
    ) return null;
    const bytes = await stableRegularFile(join(outputDirectory, artifact.fileName), 1, ARTIFACT_BYTES);
    const inspected = bytes === null ? null : inspectBundle(bytes);
    if (
      bytes === null
      || bytes.length !== artifact.byteLength
      || inspected === null
      || inspected.bundleDigest !== artifact.slideBundleDigest
      || inspected.artifactId !== expectedArtifactId(artifact.packageIdentity, artifact.exportName)
      || inspected.targetDigest !== sourceBinding.context.targetDigest
      || inspected.policyDigest !== sourceBinding.context.policyDigest
      || inspected.verifierDigest !== sourceBinding.context.verifierDigest
    ) return null;
    artifactNames.push(artifact.fileName);
    inspectedArtifacts.push({ ...artifact, parameterTypeIds: parameters });
  }
  if (
    JSON.stringify([...artifactNames].sort()) !== JSON.stringify(outputFiles.slice(0, -1))
    || new Set(artifactNames).size !== artifactNames.length
    || new Set(inspectedArtifacts.map((artifact) => `${artifact.packageIdentity}\0${artifact.exportName}`)).size !== inspectedArtifacts.length
    || (successorReceipt && !inspectedArtifacts.some((artifact) => artifact.registrySetId !== ""))
    || inspectedArtifacts.length !== sourceBinding.exportMap.size
  ) return null;
  for (const descriptor of descriptorMap.values()) {
    const packageArtifacts = inspectedArtifacts.filter((artifact) => artifact.packageIdentity === descriptor.identity);
    if (packageContentDigest(descriptor, packageArtifacts) !== descriptor.contentDigest) return null;
  }
  const derivedIdentities = deriveTopologicalIdentities(descriptorMap);
  const derivedPackageSetDigest = framedDigest(
    "slide.flat-package.set.v1",
    derivedIdentities.map((identity) => Buffer.from(descriptorMap.get(identity).descriptorDigest, "utf8")),
  );
  if (
    JSON.stringify(derivedIdentities) !== JSON.stringify(identities)
    || derivedPackageSetDigest !== receipt.packageSetDigest
  ) return null;
  const afterNames = (await readdir(outputDirectory)).sort((left, right) => left.localeCompare(right, "en"));
  const after = await lstat(outputDirectory, { bigint: true });
  if (JSON.stringify(names) !== JSON.stringify(afterNames) || !sameMetadata(before, after)) return null;
  return { outputFiles, artifactCount: artifactCandidates.length };
}

function minimalEnvironment() {
  const environment = Object.create(null);
  for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP", "LANG", "LC_ALL"]) {
    if (typeof process.env[key] === "string" && process.env[key].length > 0) environment[key] = process.env[key];
  }
  return environment;
}

async function absent(path) {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    return error?.code === "ENOENT";
  }
}

export async function buildReceiptBoundSlidePackage(candidate, options = {}) {
  try {
    const request = exactRecord(candidate, REQUEST_KEYS);
    if (request === null || Object.values(request).some((value) => typeof value !== "string" || value.length < 1 || value.includes("\0"))) {
      return refusal();
    }
    if (!DIGEST.test(request.expectedSlideToolManifestDigest) || !DIGEST.test(request.expectedRuntimeDigest)) return refusal();
    const rootMetadata = await lstat(request.rootDirectory);
    const toolMetadata = await lstat(request.slideToolRoot);
    if (
      !rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()
      || !toolMetadata.isDirectory() || toolMetadata.isSymbolicLink()
    ) return refusal();
    const root = await realpath(request.rootDirectory);
    const toolRoot = await realpath(request.slideToolRoot);
    const sourceManifestPath = contained(root, resolve(request.sourceManifestPath));
    const outputDirectory = contained(root, resolve(request.outputDirectory));
    const toolManifestPath = contained(toolRoot, resolve(request.slideToolManifestPath));
    if (sourceManifestPath === null || outputDirectory === null || toolManifestPath === null || !await absent(outputDirectory)) return refusal();
    const outputParent = dirname(outputDirectory);
    const parentMetadata = await lstat(outputParent);
    if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink() || await realpath(outputParent) !== outputParent) return refusal();
    const sourceManifestBytes = await stableRegularFile(sourceManifestPath, 1, MANIFEST_BYTES);
    const toolManifestBytes = await stableRegularFile(toolManifestPath, 1, MANIFEST_BYTES);
    if (sourceManifestBytes === null || toolManifestBytes === null) return refusal();
    const sourceBindingBefore = await inspectSourceManifest(root, sourceManifestBytes);
    if (sourceBindingBefore === null) return refusal();
    const sourceManifestDigest = typedDigest("slide.checked-fungi.source-manifest.v1", [sourceManifestBytes]);
    const toolManifestDigest = slideToolManifestDigest(toolManifestBytes);
    if (!equalText(toolManifestDigest, request.expectedSlideToolManifestDigest)) return refusal();
    const tool = await inspectTool(toolRoot, toolManifestBytes);
    if (tool === null) return refusal();
    const runtimePath = await realpath(process.execPath);
    const runtimeDigest = await digestRuntimeFile(runtimePath);
    if (runtimeDigest === "" || !equalText(runtimeDigest, request.expectedRuntimeDigest)) return refusal();
    const runOwnedProcess = options.runOwnedProcess ?? defaultRunOwnedProcess;
    if (typeof runOwnedProcess !== "function") return refusal();
    let stagingRoot = "";
    let childResult;
    try {
      stagingRoot = await stageVerifiedTool(tool.files);
      childResult = await runOwnedProcess({
        command: runtimePath,
        args: [
          join(stagingRoot, ...ENTRYPOINT.split("/")),
          "--root", root,
          "--manifest", sourceManifestPath,
          "--out", outputDirectory,
        ],
        cwd: root,
        env: minimalEnvironment(),
        timeoutMs: 120_000,
        cleanupGraceMs: 1_000,
        maxOutputBytes: MANIFEST_BYTES,
        windowsHide: true,
      });
    } catch {
      return refusal();
    } finally {
      if (stagingRoot !== "") {
        try { await rm(stagingRoot, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    }
    if (
      childResult === null
      || typeof childResult !== "object"
      || childResult.status !== 0
      || childResult.signal !== null
      || childResult.stderr !== ""
      || childResult.timedOut !== false
      || childResult.outputLimitExceeded !== false
      || childResult.spawnError !== null
    ) return refusal();
    const child = parseChild(childResult.stdout);
    const outputFiles = child === null ? null : validStringArray(child.outputFiles, TOOL_FILE_LIMIT, /^(?:package-[0-9a-f]{16}-[0-9a-f]{16}\.slide|package-set\.receipt\.json)$/u);
    if (
      child === null
      || outputFiles === null
      || child.verdict !== 1
      || child.status !== "PUBLISHED_SOURCE_MANIFEST_REFERENCE_ONLY"
      || child.failureId !== "NONE"
      || child.sourceManifestDigest !== sourceManifestDigest
      || !DIGEST.test(child.packageSetDigest)
      || child.outputName !== basename(outputDirectory)
      || !Number.isSafeInteger(child.artifactCount)
      || child.artifactCount < 1
      || child.artifactCount > TOOL_FILE_LIMIT - 1
      || ![0, 1].includes(child.powerLossDurability)
      || child.referenceOnly !== true
      || child.authorityReleased !== false
    ) return refusal();
    const sourceManifestAfter = await stableRegularFile(sourceManifestPath, 1, MANIFEST_BYTES);
    const toolManifestAfter = await stableRegularFile(toolManifestPath, 1, MANIFEST_BYTES);
    const sourceBindingAfter = sourceManifestAfter === null
      ? null
      : await inspectSourceManifest(root, sourceManifestAfter);
    if (
      sourceManifestAfter === null
      || toolManifestAfter === null
      || sourceBindingAfter === null
      || !Buffer.from(sourceManifestBytes).equals(Buffer.from(sourceManifestAfter))
      || !Buffer.from(toolManifestBytes).equals(Buffer.from(toolManifestAfter))
      || !equalText(sourceBindingBefore.closureDigest, sourceBindingAfter.closureDigest)
    ) return refusal();
    const publication = await inspectPublication(outputDirectory, child, sourceBindingAfter);
    if (publication === null) return refusal();
    return Object.freeze({
      verdict: 1,
      status: "GALERINA_SLIDE_PACKAGE_VERIFIED_REFERENCE_ONLY",
      failureId: "NONE",
      toolManifestDigest,
      runtimeDigest,
      sourceManifestDigest,
      packageSetDigest: child.packageSetDigest,
      outputName: child.outputName,
      artifactCount: publication.artifactCount,
      outputFiles: Object.freeze([...publication.outputFiles]),
      powerLossDurability: child.powerLossDurability,
      referenceOnly: true,
      authorityReleased: false,
    });
  } catch {
    return refusal();
  }
}
