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
} from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const cloneRoot = join(pkgRoot, "..", "..");
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

function triPipeSrcPorcelain() {
  const result = spawnSync(
    "git",
    ["status", "--porcelain", "--", "packages-ts/galerina-tri-pipe/src", "packages-ts/galerina-tri-pipe/dist"],
    { cwd: cloneRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
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
  const raw = createHash("sha256").update(wasm).digest();
  const fromRaw = artifactDigestFromRaw32(raw);
  assert.equal(fromRaw.kind, "BOUND");
  if (fromRaw.kind !== "BOUND") return;
  assert.equal(fromRaw.digest, hashed.digest);
  const proposal = createTriPipeEngine({ targetId: "cpu", attestationVerified: true });
  const request = prepareSlideAdmissionRequest(proposal, hashed.digest);
  assert.equal(request.kind, "SLIDE_ADMISSION_REQUEST");
  if (request.kind !== "SLIDE_ADMISSION_REQUEST") return;
  const bound = bindExactArtifactDigest({
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
    const refused = bindExactArtifactDigest(hops);
    assert.equal(refused.kind, "REFUSED");
    assert.equal(refused.code, "ARTIFACT_DIGEST_MISMATCH");
  }
});

test("missing hop refuses", () => {
  for (const name of ["slideAdmission", "wamrLoaded", "vokReceipt", "lythProducer", "towerProducer"]) {
    const hops = allPresent(ARTIFACT);
    hops[name] = { kind: "missing" };
    const refused = bindExactArtifactDigest(hops);
    assert.equal(refused.kind, "REFUSED");
    assert.equal(refused.code, "ARTIFACT_DIGEST_MISSING");
  }
});

test("unknown hop refuses", () => {
  const hops = allPresent(ARTIFACT);
  hops.towerProducer = { kind: "unknown", reason: "Tower package field not located" };
  const refused = bindExactArtifactDigest(hops);
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
    const refused = bindExactArtifactDigest(hops);
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

test("F1 flipping digest accessor refuses and never returns the unvalidated value", () => {
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
  const refused = bindExactArtifactDigest(hops);
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "ARTIFACT_DIGEST_MALFORMED");
  assert.notEqual(refused.kind, "BOUND");
});

test("F1 own-data hop with flipping digest accessor refuses", () => {
  const hops = allPresent(ARTIFACT);
  hops.wamrLoaded = {
    kind: "present",
    get digest() {
      return ARTIFACT;
    },
  };
  const refused = bindExactArtifactDigest(hops);
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "ARTIFACT_DIGEST_MALFORMED");
});

test("F1 Proxy hops object refuses", () => {
  const refused = bindExactArtifactDigest(new Proxy(allPresent(ARTIFACT), {}));
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "ARTIFACT_DIGEST_MISSING");
});

test("F1 Proxy hop nested in a plain hops object refuses", () => {
  const hops = allPresent(ARTIFACT);
  hops.wamrLoaded = new Proxy(present(ARTIFACT), {});
  const refused = bindExactArtifactDigest(hops);
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
  const refused = bindExactArtifactDigest(hops);
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
    const refused = bindExactArtifactDigest(hops);
    assert.equal(refused.kind, "REFUSED");
    assert.equal(refused.code, "ARTIFACT_DIGEST_MALFORMED");
  }
});

test("F3 M5 unknown hop kind refuses (default arm must not admit)", () => {
  const refused = bindExactArtifactDigest(allBogusKind(ARTIFACT));
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "ARTIFACT_DIGEST_UNKNOWN");
});

test("F3 M6 omitted hop key refuses MISSING without throwing", () => {
  const refused = bindExactArtifactDigest(omitTower(ARTIFACT));
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "ARTIFACT_DIGEST_MISSING");
});

test("F3 M9 null array and primitive hops objects refuse without throwing", () => {
  const cases = [null, undefined, 0, "hops", [], allPresent(ARTIFACT).slideAdmission];
  for (const hops of cases) {
    const refused = bindExactArtifactDigest(hops);
    assert.equal(refused.kind, "REFUSED");
    assert.equal(refused.code, "ARTIFACT_DIGEST_MISSING");
  }
});

test("mutant N2: dropping a hop mismatch check goes red in a temp tree then restores green", async () => {
  const before = triPipeSrcPorcelain();
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
  assert.equal(triPipeSrcPorcelain(), before, "killed or finished mutant must leave src/dist clean");
  const green = bindExactArtifactDigest(hops);
  assert.equal(green.kind, "REFUSED");
  assert.equal(green.code, "ARTIFACT_DIGEST_MISMATCH");
});

test("mutant F3 M5: default arm returning ok goes red in a temp tree", async () => {
  const before = triPipeSrcPorcelain();
  const originalText = srcText();
  const mutated = originalText.replace(
    "return refuseUnknownHopKind();",
    'return { kind: "ok", digest: "sha256:" + "b".repeat(64) };',
  );
  assert.notEqual(mutated, originalText, "M5 mutant is a real edit");
  const { bindExactArtifactDigest: mutatedBind } = await bindFromMutatedSource(mutated);
  const red = mutatedBind(allBogusKind(ARTIFACT));
  assert.equal(red.kind, "BOUND", "M5 must go red by accepting an unknown hop kind");
  assert.equal(triPipeSrcPorcelain(), before);
  const green = bindExactArtifactDigest(allBogusKind(ARTIFACT));
  assert.equal(green.kind, "REFUSED");
  assert.equal(green.code, "ARTIFACT_DIGEST_UNKNOWN");
});

test("mutant F3 M6: dropping the omitted-key absent arm goes red in a temp tree", async () => {
  const before = triPipeSrcPorcelain();
  const originalText = srcText();
  const mutated = originalText.replace(
    '      case "absent":\n        return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MISSING" };\n',
    "",
  );
  assert.notEqual(mutated, originalText, "M6 mutant is a real edit");
  const { bindExactArtifactDigest: mutatedBind } = await bindFromMutatedSource(mutated);
  const red = mutatedBind(omitTower(ARTIFACT));
  assert.notEqual(red.code, "ARTIFACT_DIGEST_MISSING", "M6 must go red by losing the omitted-key MISSING refusal");
  assert.equal(triPipeSrcPorcelain(), before);
  const green = bindExactArtifactDigest(omitTower(ARTIFACT));
  assert.equal(green.kind, "REFUSED");
  assert.equal(green.code, "ARTIFACT_DIGEST_MISSING");
});

test("mutant F3 M9: dropping the hops-object guard goes red in a temp tree", async () => {
  const before = triPipeSrcPorcelain();
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
  assert.equal(triPipeSrcPorcelain(), before);
  const green = bindExactArtifactDigest(null);
  assert.equal(green.kind, "REFUSED");
  assert.equal(green.code, "ARTIFACT_DIGEST_MISSING");
});
