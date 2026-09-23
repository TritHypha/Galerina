import assert from "node:assert/strict";
import { test } from "node:test";

import {
  loadDurabilityArtifactHostFloor,
  loadFuseHostFloor,
  loadRegistryGenerationHostFloor,
  loadRegistryRuntimeHostFloor,
} from "../dist/host-floor.js";

const keys = (value) => Object.keys(value).sort();

test("host floor exposes only each consumer's fixed primitive slice", async () => {
  const fuse = await loadFuseHostFloor();
  assert.deepEqual(keys(fuse), ["crypto", "fs", "path"]);
  assert.deepEqual(keys(fuse.crypto), ["createHash", "createPublicKey", "verify"]);
  assert.deepEqual(keys(fuse.fs), ["existsSync", "readFileSync", "readdirSync"]);
  assert.deepEqual(keys(fuse.path), ["basename", "join"]);

  const artifact = await loadDurabilityArtifactHostFloor();
  assert.deepEqual(keys(artifact.crypto), ["createHash"]);
  assert.deepEqual(keys(artifact.fs), [
    "closeSync",
    "constants",
    "fstatSync",
    "lstatSync",
    "openSync",
    "readFileSync",
  ]);
  assert.deepEqual(keys(artifact.path), ["dirname", "isAbsolute", "resolve", "sep"]);

  const generation = await loadRegistryGenerationHostFloor();
  assert.deepEqual(keys(generation.fs), ["chmod", "constants", "link", "lstat", "open", "realpath", "unlink"]);
  assert.deepEqual(keys(generation.fs.constants), ["O_NONBLOCK", "O_RDONLY"]);
  assert.deepEqual(keys(generation.path), ["isAbsolute", "join", "resolve"]);
  assert.equal(keys(generation.process).includes("execPath"), true);

  const runtime = await loadRegistryRuntimeHostFloor();
  assert.deepEqual(keys(runtime.fs), ["lstatSync", "readFileSync", "readdirSync"]);
  assert.deepEqual(keys(runtime.crypto), ["createHash", "createPublicKey"]);
  assert.deepEqual(keys(runtime.url), ["fileURLToPath"]);
});
