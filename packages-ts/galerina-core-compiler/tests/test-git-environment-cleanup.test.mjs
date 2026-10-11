import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createRequire } from "node:module";

const IS_WSL = process.platform === "linux"
  && existsSync("/proc/version")
  && /microsoft/iu.test(readFileSync("/proc/version", "utf8"));
const require = createRequire(import.meta.url);
const { createIsolatedGitEnvironment } = require("../../../scripts/lib/test-git-environment.cjs");
const ISOLATION_MODULE = new URL("../scripts/isolate-test-git-environment.mjs", import.meta.url).href;

test("initialization failure before the ownership marker is recorded reports the last-known allocation", () => {
  let retainedPath;
  assert.throws(() => createIsolatedGitEnvironment(process.env, {
    afterRootCreated(root) {
      retainedPath = root;
      throw new Error("injected failure before identity capture");
    },
  }), (error) => {
    assert.equal(error.code, "TEST-GIT-ENVIRONMENT-INIT-FAILED");
    assert.match(error.message, /retained path/u);
    assert.match(error.message, /ownership identity or marker was not established/u);
    assert.ok(error.message.includes(retainedPath), "the last-known allocation is recorded separately from verified ownership");
    assert.equal(existsSync(retainedPath), true, "unknown-identity allocation must be preserved");
    return true;
  });
  rmSync(retainedPath, { recursive: true, force: true });
});

test("initialization refuses a root replaced before it writes owned artifacts", () => {
  let retainedPath;
  let displacedPath;
  let sentinel;

  assert.throws(() => createIsolatedGitEnvironment(process.env, {
    afterRootCreated(root) {
      retainedPath = root;
      displacedPath = `${root}.displaced-${randomUUID()}`;
      renameSync(root, displacedPath);
      mkdirSync(root);
      sentinel = join(root, "do-not-delete.txt");
      writeFileSync(sentinel, "replacement is not owned");
    },
  }), (error) => {
    assert.equal(error.code, "TEST-GIT-ENVIRONMENT-INIT-FAILED");
    assert.match(error.message, /root identity changed before initialization/u);
    assert.ok(error.message.includes(retainedPath), "the last-known allocation path must be reported");
    return true;
  });

  try {
    assert.equal(readFileSync(sentinel, "utf8"), "replacement is not owned");
    assert.equal(existsSync(join(retainedPath, ".codex-owned")), false,
      "initialization must not write an ownership marker into a replacement directory");
    assert.equal(existsSync(join(displacedPath, "global.gitconfig")), false,
      "initialization must not write artifacts into the displaced allocation after the path changed");
  } finally {
    rmSync(retainedPath, { recursive: true, force: true });
    rmSync(displacedPath, { recursive: true, force: true });
  }
});

test("initialization refuses when rounded numeric stat IDs alias distinct BigInt identities", () => {
  const originalLstatSync = fs.lstatSync;
  const numericIdentity = {
    dev: 4228709081,
    ino: 141018963333949470,
    isDirectory: () => true,
    isFile: () => false,
    isSymbolicLink: () => false,
  };
  const originalBigIntIdentity = {
    dev: 4228709081n,
    ino: 141018963333949471n,
    isDirectory: () => true,
    isFile: () => false,
    isSymbolicLink: () => false,
  };
  const replacementBigIntIdentity = {
    dev: 4228709081n,
    ino: 141018963333949469n,
    isDirectory: () => true,
    isFile: () => false,
    isSymbolicLink: () => false,
  };
  assert.equal(numericIdentity.ino, Number(originalBigIntIdentity.ino));
  assert.equal(numericIdentity.ino, Number(replacementBigIntIdentity.ino),
    "the fixture models the observed Number rounding collision");
  assert.notEqual(originalBigIntIdentity.ino, replacementBigIntIdentity.ino,
    "the exact filesystem identities remain distinct");

  let root;
  let displaced;
  let sentinel;
  let initialized;
  fs.lstatSync = function (target, options) {
    if (root === undefined && basename(String(target)).startsWith("galerina-test-git-")) {
      root = String(target);
      return options?.bigint === true ? originalBigIntIdentity : numericIdentity;
    }
    if (String(target) === root) {
      return options?.bigint === true ? replacementBigIntIdentity : numericIdentity;
    }
    return originalLstatSync.call(this, target, options);
  };

  try {
    assert.throws(() => {
      initialized = createIsolatedGitEnvironment(process.env, {
        afterRootCreated(allocation) {
          displaced = `${allocation}.displaced-${randomUUID()}`;
          renameSync(allocation, displaced);
          mkdirSync(allocation);
          sentinel = join(allocation, "do-not-delete.txt");
          writeFileSync(sentinel, "replacement is not owned");
        },
      });
    }, (error) => {
      assert.equal(error.code, "TEST-GIT-ENVIRONMENT-INIT-FAILED");
      assert.match(error.message, /root identity changed before initialization/u);
      return true;
    });
    assert.equal(readFileSync(sentinel, "utf8"), "replacement is not owned");
    assert.equal(existsSync(join(root, ".codex-owned")), false,
      "initialization must not write an ownership marker into the numerically aliased replacement");
  } finally {
    initialized?.cleanup();
    fs.lstatSync = originalLstatSync;
    if (root) rmSync(root, { recursive: true, force: true });
    if (displaced) rmSync(displaced, { recursive: true, force: true });
  }
});

test("cleanup refuses when the owned temporary root has moved", () => {
  const isolated = createIsolatedGitEnvironment(process.env);
  const root = dirname(isolated.configPath);
  const moved = `${root}.moved-${randomUUID()}`;

  try {
    renameSync(root, moved);

    assert.equal(isolated.cleanup().cleaned, false, "an unaccounted missing path is not clean");
    assert.equal(existsSync(moved), true, "the moved owned directory remains recoverable");
    assert.equal(existsSync(join(moved, basename(isolated.configPath))), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(moved, { recursive: true, force: true });
  }
});

test("cleanup refuses a real symlink or junction substituted for the owned root", {
  skip: process.platform !== "win32" && !IS_WSL,
}, () => {
  const isolated = createIsolatedGitEnvironment(process.env);
  const root = dirname(isolated.configPath);
  const moved = `${root}.moved-before-link-${randomUUID()}`;

  try {
    renameSync(root, moved);
    fs.symlinkSync(moved, root, process.platform === "win32" ? "junction" : "dir");

    const linkMetadata = lstatSync(root);
    assert.equal(linkMetadata.isSymbolicLink(), true,
      "the fixture must be a real filesystem link, not a mocked lstat result");
    const result = isolated.cleanup();

    assert.equal(result.cleaned, false, "a link at the old pathname is not the owned directory");
    assert.match(result.reason, /identity changed/u);
    assert.equal(existsSync(join(moved, basename(isolated.configPath))), true,
      "the moved owned config remains recoverable");
    assert.equal(existsSync(join(root, basename(isolated.configPath))), true,
      "the replacement link and its target remain untouched by refused cleanup");
  } finally {
    try {
      if (process.platform === "win32") fs.rmdirSync(root);
      else fs.unlinkSync(root);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    rmSync(moved, { recursive: true, force: true });
  }
});

test("cleanup preserves a substituted Git config file inside the owned quarantine", () => {
  const isolated = createIsolatedGitEnvironment(process.env);
  const root = dirname(isolated.configPath);
  let quarantine;
  let replacement;

  try {
    const result = isolated.cleanup({
      beforeRemoveArtifact(name, context) {
        if (name !== "global.gitconfig") return;
        quarantine = context.quarantine;
        const configPath = join(quarantine, name);
        renameSync(configPath, join(quarantine, "displaced-global.gitconfig"));
        replacement = configPath;
        writeFileSync(replacement, "unrelated replacement must survive");
      },
    });

    assert.equal(result.cleaned, false, "replacement config is not owned cleanup");
    assert.equal(readFileSync(replacement, "utf8"), "unrelated replacement must survive");
    assert.equal(existsSync(join(quarantine, "displaced-global.gitconfig")), true,
      "the original artifact remains recoverable after refusal");
    assert.equal(existsSync(join(quarantine, ".codex-owned")), true,
      "the ownership marker remains while cleanup is incomplete");
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (quarantine) rmSync(quarantine, { recursive: true, force: true });
  }
});

test("cleanup refuses an in-place rewrite of the immutable Git config", () => {
  const isolated = createIsolatedGitEnvironment(process.env);
  const root = dirname(isolated.configPath);
  const before = lstatSync(isolated.configPath);

  try {
    writeFileSync(isolated.configPath, "in-place replacement content");
    const after = lstatSync(isolated.configPath);
    assert.equal(after.dev, before.dev);
    assert.equal(after.ino, before.ino, "the adversarial write must preserve the original file identity");

    const result = isolated.cleanup();
    assert.equal(result.cleaned, false, "identity alone must not authorize deleting changed bytes");
    assert.match(result.reason, /Git config contents changed/u);
    assert.equal(readFileSync(isolated.configPath, "utf8"), "in-place replacement content");
    assert.equal(existsSync(join(root, ".codex-owned")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cleanup rechecks Git config contents after quarantine before unlink", () => {
  const isolated = createIsolatedGitEnvironment(process.env);
  const root = dirname(isolated.configPath);
  let quarantine;

  try {
    const result = isolated.cleanup({
      beforeRemoveArtifact(name, context) {
        if (name !== "global.gitconfig") return;
        quarantine = context.quarantine;
        writeFileSync(join(quarantine, name), "late in-place replacement");
      },
    });

    assert.equal(result.cleaned, false, "late in-place changes must refuse unlink");
    assert.match(result.reason, /Git config contents changed/u);
    assert.equal(result.retainedPath, quarantine);
    assert.equal(readFileSync(join(quarantine, "global.gitconfig"), "utf8"), "late in-place replacement");
    assert.equal(existsSync(join(quarantine, ".codex-owned")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (quarantine) rmSync(quarantine, { recursive: true, force: true });
  }
});

test("test preload reports an unverified path as last-known, not retained ownership", () => {
  const temporary = mkdtempSync(join(tmpdir(), "galerina-isolation-recovery-report-"));
  const worker = join(temporary, "replace-root.mjs");
  const resultFile = join(temporary, "paths.json");
  writeFileSync(worker, [
    'import { mkdirSync, renameSync, writeFileSync } from "node:fs";',
    'import { dirname } from "node:path";',
    'import { randomUUID } from "node:crypto";',
    'const lastKnown = dirname(process.env.GIT_CONFIG_GLOBAL);',
    'const displaced = `${lastKnown}.displaced-${randomUUID()}`;',
    'renameSync(lastKnown, displaced);',
    'mkdirSync(lastKnown);',
    'writeFileSync(`${lastKnown}/unrelated.txt`, "not owned by cleanup");',
    'writeFileSync(process.env.RESULT_FILE, JSON.stringify({ lastKnown, displaced }));',
    "",
  ].join("\n"));

  let lastKnown;
  let displaced;
  try {
    const result = spawnSync(process.execPath, ["--import", ISOLATION_MODULE, worker], {
      cwd: temporary,
      encoding: "utf8",
      env: { ...process.env, RESULT_FILE: resultFile },
      timeout: 15_000,
      windowsHide: true,
    });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    ({ lastKnown, displaced } = JSON.parse(readFileSync(resultFile, "utf8")));
    assert.match(result.stderr, /retained=unverified/u);
    assert.match(result.stderr, /last-known=/u);
    assert.equal(result.stderr.includes(`retained=${lastKnown}`), false,
      "the replacement pathname must not be labelled a verified recovery location");
    assert.equal(readFileSync(join(lastKnown, "unrelated.txt"), "utf8"), "not owned by cleanup");
    assert.equal(existsSync(join(displaced, ".codex-owned")), true,
      "the displaced owned directory remains available for manual recovery");
  } finally {
    if (lastKnown) rmSync(lastKnown, { recursive: true, force: true });
    if (displaced) rmSync(displaced, { recursive: true, force: true });
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("cleanup refuses and preserves a path replaced after ownership validation", () => {
  const isolated = createIsolatedGitEnvironment(process.env);
  const root = dirname(isolated.configPath);
  const displaced = `${root}.displaced-${randomUUID()}`;
  const sentinel = join(root, "do-not-delete.txt");
  let hookRan = false;
  let actualQuarantine;

  try {
    const cleaned = isolated.cleanup({
      afterValidation() {
        hookRan = true;
        renameSync(root, displaced);
        mkdirSync(root);
        writeFileSync(sentinel, "unrelated data must survive");
      },
      afterQuarantineRename({ quarantine }) {
        actualQuarantine = quarantine;
      },
    });

    assert.equal(hookRan, true, "the deterministic substitution occurred after validation");
    assert.equal(cleaned.cleaned, false, "a substituted namespace is not owned cleanup");
    assert.equal(cleaned.retainedPath, null, "the path no longer identifies the owned directory");
    assert.equal(actualQuarantine, undefined, "cleanup must refuse the replacement before moving it into quarantine");
    assert.equal(existsSync(root), true, "the unrelated replacement must remain at its original path");
    assert.equal(readFileSync(sentinel, "utf8"), "unrelated data must survive");
    assert.equal(existsSync(join(displaced, basename(isolated.configPath))), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (actualQuarantine) rmSync(actualQuarantine, { recursive: true, force: true });
    rmSync(displaced, { recursive: true, force: true });
  }
});

test("cleanup revalidates quarantined ownership after the rename before deleting", () => {
  const isolated = createIsolatedGitEnvironment(process.env);
  const root = dirname(isolated.configPath);
  const displaced = `${root}.displaced-after-quarantine`;
  let sentinel;
  let actualQuarantine;

  try {
    const cleaned = isolated.cleanup({
      afterQuarantineValidation({ quarantine: quarantinePath }) {
        actualQuarantine = quarantinePath;
        renameSync(quarantinePath, displaced);
        mkdirSync(quarantinePath);
        sentinel = join(quarantinePath, "do-not-delete.txt");
        writeFileSync(sentinel, "replacement namespace must survive");
      },
    });

    assert.equal(cleaned.cleaned, false, "replacement after quarantine validation must refuse");
    assert.equal(cleaned.retainedPath, null, "a displaced owned path must not be reported as the replacement");
    assert.equal(existsSync(sentinel), true, "cleanup must not remove entries from the replacement");
    assert.equal(existsSync(join(displaced, basename(isolated.configPath))), true,
      "the displaced owned artifacts remain recoverable");
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (actualQuarantine) rmSync(actualQuarantine, { recursive: true, force: true });
    rmSync(displaced, { recursive: true, force: true });
  }
});

for (const artifactName of ["templates", "global.gitconfig"]) {
  test(`cleanup refuses artifact removal when the quarantine is substituted before ${artifactName}`, () => {
    const isolated = createIsolatedGitEnvironment(process.env);
    const root = dirname(isolated.configPath);
    const displaced = `${root}.displaced-before-${artifactName}-${randomUUID()}`;
    let actualQuarantine;
    let sentinel;

    try {
      const result = isolated.cleanup({
        beforeRemoveArtifact(name, { quarantine }) {
          if (name !== artifactName) return;
          actualQuarantine = quarantine;
          renameSync(quarantine, displaced);
          mkdirSync(quarantine);
          sentinel = join(quarantine, "replacement-must-survive.txt");
          writeFileSync(sentinel, `replacement before ${artifactName}`);
        },
      });

      assert.equal(result.cleaned, false, "artifact removal must refuse after namespace substitution");
      assert.equal(result.retainedPath, null, "the replacement name is not a verified recovery path");
      assert.equal(readFileSync(sentinel, "utf8"), `replacement before ${artifactName}`);
      assert.equal(existsSync(join(displaced, ".codex-owned")), true,
        "the displaced directory retains its ownership marker");
      assert.equal(existsSync(join(displaced, artifactName)), true,
        "the displaced directory retains the artifact whose removal was about to begin");
    } finally {
      rmSync(root, { recursive: true, force: true });
      if (actualQuarantine) rmSync(actualQuarantine, { recursive: true, force: true });
      rmSync(displaced, { recursive: true, force: true });
    }
  });
}

test("marker-removal refusal never reports a substituted quarantine as retained ownership", () => {
  const isolated = createIsolatedGitEnvironment(process.env);
  const root = dirname(isolated.configPath);
  const displaced = `${root}.displaced-before-marker-${randomUUID()}`;
  let actualQuarantine;
  let sentinel;

  try {
    const result = isolated.cleanup({
      beforeRemoveArtifact(name, { quarantine }) {
        if (name !== ".codex-owned") return;
        actualQuarantine = quarantine;
        renameSync(quarantine, displaced);
        mkdirSync(quarantine);
        sentinel = join(quarantine, "replacement-must-survive.txt");
        writeFileSync(sentinel, "not owned by the cleanup helper");
      },
    });

    assert.equal(result.cleaned, false, "marker removal must refuse after the quarantine is substituted");
    assert.equal(result.retainedPath, null, "a replacement directory must not be reported as owned recovery state");
    assert.equal(readFileSync(sentinel, "utf8"), "not owned by the cleanup helper");
    assert.equal(existsSync(join(displaced, ".codex-owned")), true,
      "the displaced directory and ownership marker remain recoverable");
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (actualQuarantine) rmSync(actualQuarantine, { recursive: true, force: true });
    rmSync(displaced, { recursive: true, force: true });
  }
});

test("cleanup tracks completed removal steps and can retry after a later step is refused", () => {
  const isolated = createIsolatedGitEnvironment(process.env);
  const root = dirname(isolated.configPath);
  let injected = false;
  let retainedPath;

  try {
    const first = isolated.cleanup({
      beforeRemoveArtifact(name) {
        if (name === "global.gitconfig" && !injected) {
          injected = true;
          throw new Error("injected unlink failure");
        }
      },
    });

    assert.equal(first.cleaned, false);
    retainedPath = first.retainedPath;
    assert.equal(existsSync(join(first.retainedPath, "templates")), false,
      "a completed step stays completed in the cleanup ledger");
    assert.equal(existsSync(join(first.retainedPath, "global.gitconfig")), true,
      "the failed step remains available for retry");

    const retry = isolated.cleanup();
    assert.equal(retry.cleaned, true, retry.reason || "retry should finish verified cleanup");
    assert.equal(existsSync(root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (retainedPath) rmSync(retainedPath, { recursive: true, force: true });
  }
});

test("cleanup can retry final directory removal after the marker was already removed", () => {
  const isolated = createIsolatedGitEnvironment(process.env);
  const root = dirname(isolated.configPath);
  let failOnce = true;
  let retainedPath;

  try {
    const first = isolated.cleanup({
      beforeRemoveQuarantine({ quarantine }) {
        if (failOnce) {
          failOnce = false;
          retainedPath = quarantine;
          throw new Error("injected final rmdir failure");
        }
      },
    });

    assert.equal(first.cleaned, false);
    assert.equal(first.retainedPath, retainedPath);
    assert.equal(existsSync(join(retainedPath, ".codex-owned")), false,
      "the marker deletion succeeded before the final directory-removal failure");
    assert.deepEqual(readdirSync(retainedPath), []);

    const retry = isolated.cleanup();
    assert.equal(retry.cleaned, true, retry.reason || "retry must finish final directory removal");
    assert.equal(existsSync(retainedPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (retainedPath) rmSync(retainedPath, { recursive: true, force: true });
  }
});

test("final removal refuses a substituted quarantine and preserves both paths", () => {
  const isolated = createIsolatedGitEnvironment(process.env);
  const root = dirname(isolated.configPath);
  const displaced = `${root}.displaced-before-rmdir-${randomUUID()}`;
  let actualQuarantine;
  let replacementIdentity;
  let displacedIdentity;

  try {
    const result = isolated.cleanup({
      beforeRemoveQuarantine({ quarantine }) {
        actualQuarantine = quarantine;
        renameSync(quarantine, displaced);
        mkdirSync(quarantine);
        replacementIdentity = lstatSync(quarantine);
        displacedIdentity = lstatSync(displaced);
      },
    });

    assert.ok(replacementIdentity && displacedIdentity, "the substitution hook must run and capture both directories");
    assert.ok(replacementIdentity.dev !== displacedIdentity.dev || replacementIdentity.ino !== displacedIdentity.ino,
      "the replacement must have a different filesystem identity from the displaced owned directory");
    assert.equal(result.cleaned, false, "cleanup must refuse when the owned quarantine was moved");
    assert.equal(result.retainedPath, null, "the replacement name is not a verified recovery path");
    assert.equal(existsSync(actualQuarantine), true, "the replacement directory must not be removed");
    assert.equal(existsSync(join(displaced, ".codex-owned")), false,
      "the owned directory was already through marker removal, so no marker remains");
    assert.deepEqual(readdirSync(displaced), [], "the displaced owned directory remains intact");
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (actualQuarantine) rmSync(actualQuarantine, { recursive: true, force: true });
    rmSync(displaced, { recursive: true, force: true });
  }
});

test("a replacement created after successful final removal is not reported as owned", () => {
  const isolated = createIsolatedGitEnvironment(process.env);
  const root = dirname(isolated.configPath);
  let actualQuarantine;
  let sentinel;

  try {
    const result = isolated.cleanup({
      afterQuarantineRemoval({ quarantine }) {
        actualQuarantine = quarantine;
        mkdirSync(quarantine);
        sentinel = join(quarantine, "replacement-must-survive.txt");
        writeFileSync(sentinel, "not owned by cleanup");
      },
    });

    assert.equal(result.cleaned, true, "successful removal of the verified owned directory completes cleanup");
    assert.equal(result.retainedPath, null, "a later replacement is never returned as owned recovery state");
    assert.equal(readFileSync(sentinel, "utf8"), "not owned by cleanup");
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (actualQuarantine) rmSync(actualQuarantine, { recursive: true, force: true });
  }
});

test("the hostile Git template positive control imports its hook without isolation", () => {
  const root = mkdtempSync(join(tmpdir(), "galerina-template-positive-control-"));
  const template = join(root, "template", "hooks");
  const templateConfig = join(root, "template", "config");
  const repo = join(root, "fixture-repo");
  const hookPath = join(repo, ".git", "hooks", "pre-commit");

  try {
    mkdirSync(template, { recursive: true });
    writeFileSync(join(template, "pre-commit"), "#!/bin/sh\nexit 0\n");
    writeFileSync(templateConfig, "[codex]\n  template-sentinel = copied\n");
    const result = spawnSync("git", ["init", "-q", repo], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GIT_TEMPLATE_DIR: join(root, "template") },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(existsSync(hookPath), true, "the unisolated control must prove the template is active");
    const config = spawnSync("git", ["config", "--local", "--get", "codex.template-sentinel"], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "NUL" },
    });
    assert.equal(config.status, 0, config.stderr || config.stdout);
    assert.equal(config.stdout.trim(), "copied", "the unisolated control must prove template config is active");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
