import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createTriPipeEngine,
  prepareSlideAdmissionRequest,
  bindExactArtifactDigest,
  hashWasmArtifact,
  artifactDigestFromRaw32,
  isArtifactDigest,
} from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const srcPath = join(pkgRoot, "src", "artifact-digest-binding.ts");
const tscPath = join(pkgRoot, "node_modules", "typescript", "bin", "tsc");
const ARTIFACT = `sha256:${"b".repeat(64)}`;
const OTHER = `sha256:${"c".repeat(64)}`;

function present(digest) {
  return { kind: "present", digest };
}

function allPresent(digest) {
  return {
    slideAdmission: present(digest),
    wamrLoaded: present(digest),
    vokReceipt: present(digest),
    lythProducer: present(digest),
    towerProducer: present(digest),
  };
}

function allBogusKind(digest) {
  return {
    slideAdmission: { kind: "not-a-hop", digest },
    wamrLoaded: { kind: "not-a-hop", digest },
    vokReceipt: { kind: "not-a-hop", digest },
    lythProducer: { kind: "not-a-hop", digest },
    towerProducer: { kind: "not-a-hop", digest },
  };
}

function omitTower(digest) {
  return {
    slideAdmission: present(digest),
    wamrLoaded: present(digest),
    vokReceipt: present(digest),
    lythProducer: present(digest),
  };
}

function srcText() {
  return readFileSync(srcPath, "utf8").replaceAll("\r\n", "\n");
}

function fileSha(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function srcDistDigests() {
  return {
    src: fileSha(srcPath),
    dist: fileSha(join(pkgRoot, "dist", "artifact-digest-binding.js")),
  };
}

function bindChecked(hops) {
  const result = bindExactArtifactDigest(hops);
  if (result.kind === "BOUND") {
    assert.equal(typeof result.digest, "string", "BOUND digest must be a string");
  }
  return result;
}

async function bindFromMutatedSource(mutatedSource) {
  const dir = mkdtempSync(join(tmpdir(), "u6-digest-mutant-"));
  try {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "artifact-digest-binding.ts"), mutatedSource);
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          lib: ["ES2022"],
          strict: true,
          skipLibCheck: true,
          outDir: "dist",
          rootDir: "src",
        },
        include: ["src/**/*.ts"],
      }),
    );
    const built = spawnSync(process.execPath, [tscPath, "-p", "tsconfig.json", "--noCheck", "--skipLibCheck"], {
      cwd: dir,
      encoding: "utf8",
    });
    assert.equal(built.status, 0, `${built.stderr}${built.stdout}`);
    const url = `${pathToFileURL(join(dir, "dist", "artifact-digest-binding.js")).href}?mutant=${Date.now()}`;
    return await import(url);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("end-to-end synthetic artifact binds the same digest across every hop", () => {
  const wasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const hashed = hashWasmArtifact(wasm);
  assert.equal(hashed.kind, "BOUND");
  if (hashed.kind !== "BOUND") return;
  assert.equal(typeof hashed.digest, "string");
  const raw = createHash("sha256").update(wasm).digest();
  const fromRaw = artifactDigestFromRaw32(raw);
  assert.equal(fromRaw.kind, "BOUND");
  if (fromRaw.kind !== "BOUND") return;
  assert.equal(fromRaw.digest, hashed.digest);
  const proposal = createTriPipeEngine({ targetId: "cpu", attestationVerified: true });
  const request = prepareSlideAdmissionRequest(proposal, hashed.digest);
  assert.equal(request.kind, "SLIDE_ADMISSION_REQUEST");
  if (request.kind !== "SLIDE_ADMISSION_REQUEST") return;
  const bound = bindChecked({
    slideAdmission: present(request.artifactDigest),
    wamrLoaded: present(fromRaw.digest),
    vokReceipt: present(hashed.digest),
    lythProducer: present(hashed.digest),
    towerProducer: present(hashed.digest),
  });
  assert.equal(bound.kind, "BOUND");
  if (bound.kind !== "BOUND") return;
  assert.equal(bound.digest, hashed.digest);
  assert.equal(bound.digest, request.artifactDigest);
});

test("per-hop mismatch refuses before secret access", () => {
  for (const name of ["slideAdmission", "wamrLoaded", "vokReceipt", "lythProducer", "towerProducer"]) {
    const hops = allPresent(ARTIFACT);
    hops[name] = present(OTHER);
    const refused = bindChecked(hops);
    assert.equal(refused.kind, "REFUSED");
    assert.equal(refused.code, "ARTIFACT_DIGEST_MISMATCH");
  }
});

test("missing hop refuses", () => {
  for (const name of ["slideAdmission", "wamrLoaded", "vokReceipt", "lythProducer", "towerProducer"]) {
    const hops = allPresent(ARTIFACT);
    hops[name] = { kind: "missing" };
    const refused = bindChecked(hops);
    assert.equal(refused.kind, "REFUSED");
    assert.equal(refused.code, "ARTIFACT_DIGEST_MISSING");
  }
});

test("unknown hop refuses", () => {
  const hops = allPresent(ARTIFACT);
  hops.towerProducer = { kind: "unknown", reason: "Tower package field not located" };
  const refused = bindChecked(hops);
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "ARTIFACT_DIGEST_UNKNOWN");
});

test("wrong-length and malformed digest refuse", () => {
  const malformed = [
    `sha256:${"b".repeat(63)}`,
    `sha256:${"b".repeat(65)}`,
    `sha256:${"B".repeat(64)}`,
    `md5:${"b".repeat(64)}`,
    "",
    "b".repeat(64),
  ];
  for (const digest of malformed) {
    const hops = allPresent(ARTIFACT);
    hops.vokReceipt = present(digest);
    const refused = bindChecked(hops);
    assert.equal(refused.kind, "REFUSED");
    assert.equal(refused.code, "ARTIFACT_DIGEST_MALFORMED");
  }
  const raw = artifactDigestFromRaw32(new Uint8Array(31));
  assert.equal(raw.kind, "REFUSED");
  assert.equal(raw.code, "ARTIFACT_DIGEST_MALFORMED");
  const empty = hashWasmArtifact(new Uint8Array(0));
  assert.equal(empty.kind, "REFUSED");
  assert.equal(empty.code, "ARTIFACT_DIGEST_MISSING");
});

test("F1 hops-key accessor refuses before inner digest getter", () => {
  let reads = 0;
  const hops = allPresent(ARTIFACT);
  Object.defineProperty(hops, "wamrLoaded", {
    configurable: true,
    enumerable: true,
    get() {
      reads += 1;
      return {
        kind: "present",
        get digest() {
          return reads < 3 ? ARTIFACT : "evil-not-a-digest";
        },
      };
    },
  });
  const refused = bindChecked(hops);
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "ARTIFACT_DIGEST_MALFORMED");
  assert.notEqual(refused.kind, "BOUND");
});

test("F1 own-data hop with flipping digest accessor refuses", () => {
  let n = 0;
  const hops = allPresent(ARTIFACT);
  hops.wamrLoaded = {
    kind: "present",
    get digest() {
      n += 1;
      return n === 1 ? ARTIFACT : "evil-not-a-digest";
    },
  };
  const refused = bindChecked(hops);
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "ARTIFACT_DIGEST_MALFORMED");
});

test("F1 shared String object digest on all hops refuses MALFORMED", () => {
  const boxed = new String(ARTIFACT);
  const refused = bindChecked(allPresent(boxed));
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "ARTIFACT_DIGEST_MALFORMED");
  assert.equal(isArtifactDigest(boxed), false);
});

test("F1 shared stateful toString digest on all hops refuses MALFORMED", () => {
  let n = 0;
  const stateful = {
    toString() {
      n += 1;
      return n <= 5 ? ARTIFACT : "evil-not-a-digest";
    },
  };
  const refused = bindChecked(allPresent(stateful));
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "ARTIFACT_DIGEST_MALFORMED");
  assert.equal(isArtifactDigest(stateful), false);
});

test("F1 Proxy hops object refuses", () => {
  const refused = bindChecked(new Proxy(allPresent(ARTIFACT), {}));
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "ARTIFACT_DIGEST_MISSING");
});

test("F1 Proxy hop nested in a plain hops object refuses", () => {
  const hops = allPresent(ARTIFACT);
  hops.wamrLoaded = new Proxy(present(ARTIFACT), {});
  const refused = bindChecked(hops);
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "ARTIFACT_DIGEST_MALFORMED");
});

test("F1 class-instance hop refuses", () => {
  class PresentHop {
    constructor() {
      this.kind = "present";
      this.digest = ARTIFACT;
    }
  }
  const hops = allPresent(ARTIFACT);
  hops.wamrLoaded = new PresentHop();
  const refused = bindChecked(hops);
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "ARTIFACT_DIGEST_MALFORMED");
});

test("F2 null primitive and array hops refuse without throwing", () => {
  const hopsNull = allPresent(ARTIFACT);
  hopsNull.wamrLoaded = null;
  const hopsUndef = allPresent(ARTIFACT);
  hopsUndef.wamrLoaded = undefined;
  const hopsPrim = allPresent(ARTIFACT);
  hopsPrim.wamrLoaded = "present";
  const hopsArr = allPresent(ARTIFACT);
  hopsArr.wamrLoaded = [present(ARTIFACT)];
  const cases = [hopsNull, hopsUndef, hopsPrim, hopsArr];
  for (const hops of cases) {
    const refused = bindChecked(hops);
    assert.equal(refused.kind, "REFUSED");
    assert.equal(refused.code, "ARTIFACT_DIGEST_MALFORMED");
  }
});

test("F3 M5 unknown hop kind refuses (default arm must not admit)", () => {
  const refused = bindChecked(allBogusKind(ARTIFACT));
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "ARTIFACT_DIGEST_UNKNOWN");
});

test("F3 M6 omitted hop key refuses MISSING without throwing", () => {
  const refused = bindChecked(omitTower(ARTIFACT));
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "ARTIFACT_DIGEST_MISSING");
});

test("F3 M9 null array and primitive hops objects refuse without throwing", () => {
  const cases = [null, undefined, 0, "hops", [], allPresent(ARTIFACT).slideAdmission];
  for (const hops of cases) {
    const refused = bindChecked(hops);
    assert.equal(refused.kind, "REFUSED");
    assert.equal(refused.code, "ARTIFACT_DIGEST_MISSING");
  }
});

test("mutant N2: dropping a hop mismatch check goes red in a temp tree then restores green", async () => {
  const before = srcDistDigests();
  const originalText = srcText();
  const mutated = originalText.replace(
    "parsed.digest !== expected.digest",
    "false && parsed.digest !== expected.digest",
  );
  assert.notEqual(mutated, originalText, "mismatch-check mutant is a real edit");
  const hops = allPresent(ARTIFACT);
  hops.lythProducer = present(OTHER);
  const { bindExactArtifactDigest: mutatedBind } = await bindFromMutatedSource(mutated);
  const red = mutatedBind(hops);
  assert.equal(red.kind, "BOUND", "mutant must go red by accepting a mismatch");
  assert.deepEqual(srcDistDigests(), before, "killed or finished mutant must leave src/dist clean");
  const green = bindChecked(hops);
  assert.equal(green.kind, "REFUSED");
  assert.equal(green.code, "ARTIFACT_DIGEST_MISMATCH");
});

test("mutant F3 M5: default arm returning ok goes red in a temp tree", async () => {
  const before = srcDistDigests();
  const originalText = srcText();
  const mutated = originalText.replace(
    "return refuseUnknownHopKind();",
    'return { kind: "ok", digest: "sha256:" + "b".repeat(64) };',
  );
  assert.notEqual(mutated, originalText, "M5 mutant is a real edit");
  const { bindExactArtifactDigest: mutatedBind } = await bindFromMutatedSource(mutated);
  const red = mutatedBind(allBogusKind(ARTIFACT));
  assert.equal(red.kind, "BOUND", "M5 must go red by accepting an unknown hop kind");
  assert.deepEqual(srcDistDigests(), before);
  const green = bindChecked(allBogusKind(ARTIFACT));
  assert.equal(green.kind, "REFUSED");
  assert.equal(green.code, "ARTIFACT_DIGEST_UNKNOWN");
});

test("mutant F3 M6: dropping the omitted-key absent arm goes red in a temp tree", async () => {
  const before = srcDistDigests();
  const originalText = srcText();
  const mutated = originalText.replace(
    '      case "absent":\n        return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MISSING" };\n',
    "",
  );
  assert.notEqual(mutated, originalText, "M6 mutant is a real edit");
  const { bindExactArtifactDigest: mutatedBind } = await bindFromMutatedSource(mutated);
  const red = mutatedBind(omitTower(ARTIFACT));
  assert.notEqual(red.code, "ARTIFACT_DIGEST_MISSING", "M6 must go red by losing the omitted-key MISSING refusal");
  assert.deepEqual(srcDistDigests(), before);
  const green = bindChecked(omitTower(ARTIFACT));
  assert.equal(green.kind, "REFUSED");
  assert.equal(green.code, "ARTIFACT_DIGEST_MISSING");
});

test("mutant F3 M9: dropping the hops-object guard goes red in a temp tree", async () => {
  const before = srcDistDigests();
  const originalText = srcText();
  const mutated = originalText.replace(
    "if (!isPlainDataObject(hops)) {\n    return refuseNonObjectHops();\n  }",
    "if (false && !isPlainDataObject(hops)) {\n    return refuseNonObjectHops();\n  }",
  );
  assert.notEqual(mutated, originalText, "M9 mutant is a real edit");
  const { bindExactArtifactDigest: mutatedBind } = await bindFromMutatedSource(mutated);
  let threw = false;
  try {
    mutatedBind(null);
  } catch {
    threw = true;
  }
  assert.equal(threw, true, "M9 must go red by throwing on a null hops object");
  assert.deepEqual(srcDistDigests(), before);
  const green = bindChecked(null);
  assert.equal(green.kind, "REFUSED");
  assert.equal(green.code, "ARTIFACT_DIGEST_MISSING");
});

test("F2 exported values cannot disable the binder regex", async () => {
  const bindingUrl = `${pathToFileURL(join(pkgRoot, "dist", "artifact-digest-binding.js")).href}?exp=${Date.now()}`;
  const binding = await import(bindingUrl);
  assert.equal(Object.hasOwn(binding, "ARTIFACT_DIGEST_RE"), false);
  assert.equal(typeof binding.isArtifactDigest, "function");
  assert.equal(binding.isArtifactDigest(ARTIFACT), true);
  assert.equal(binding.isArtifactDigest("evil"), false);
  assert.equal(binding.isArtifactDigest(new String(ARTIFACT)), false);
  for (const value of Object.values(binding)) {
    if (value instanceof RegExp) {
      try {
        value.compile("^");
      } catch {
        /* compile may throw */
      }
      try {
        value.test = () => true;
      } catch {
        /* assignment may throw */
      }
    } else if (value !== null && typeof value === "object") {
      try {
        Object.assign(value, { test: () => true });
      } catch {
        /* assignment may throw */
      }
    } else if (typeof value === "function") {
      try {
        value.test = () => true;
      } catch {
        /* assignment may throw */
      }
    }
  }
  const idx = await import(`${pathToFileURL(join(pkgRoot, "dist", "index.js")).href}?exp=${Date.now()}`);
  assert.equal(Object.hasOwn(idx, "ARTIFACT_DIGEST_RE"), false);
  const refused = bindChecked(allPresent("evil"));
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "ARTIFACT_DIGEST_MALFORMED");
});

test("mutant M14: dropping the digest string-type guard goes red in a temp tree", async () => {
  const before = srcDistDigests();
  const originalText = srcText();
  const mutated = originalText.replace(
    'digestSnap.kind !== "value" || typeof digestSnap.value !== "string"',
    'digestSnap.kind !== "value" || false',
  );
  assert.notEqual(mutated, originalText, "M14 mutant is a real edit");
  const { bindExactArtifactDigest: mutatedBind } = await bindFromMutatedSource(mutated);
  const boxed = new String(ARTIFACT);
  const redBoxed = mutatedBind(allPresent(boxed));
  assert.equal(redBoxed.kind, "BOUND", "M14 must go red by accepting a String object digest");
  assert.notEqual(typeof redBoxed.digest, "string");
  let n = 0;
  const stateful = {
    toString() {
      n += 1;
      return n <= 5 ? ARTIFACT : "evil-not-a-digest";
    },
  };
  const redState = mutatedBind(allPresent(stateful));
  assert.equal(redState.kind, "BOUND", "M14 must go red by accepting a toString object");
  assert.equal(String(redState.digest), "evil-not-a-digest");
  assert.deepEqual(srcDistDigests(), before);
  const greenBoxed = bindChecked(allPresent(new String(ARTIFACT)));
  assert.equal(greenBoxed.kind, "REFUSED");
  assert.equal(greenBoxed.code, "ARTIFACT_DIGEST_MALFORMED");
  const greenState = bindChecked(allPresent({
    toString() {
      return ARTIFACT;
    },
  }));
  assert.equal(greenState.kind, "REFUSED");
  assert.equal(greenState.code, "ARTIFACT_DIGEST_MALFORMED");
});
