"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");

const GIT_LOCAL_ENV_KEYS = new Set([
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CONFIG",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_GRAFT_FILE",
  "GIT_COMMON_DIR",
  "GIT_DIR",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_REPLACE_REF_BASE",
  "GIT_PREFIX",
  "GIT_SHALLOW_FILE",
  "GIT_WORK_TREE",
]);

const GIT_ADDITIONAL_ENV_KEYS = new Set([
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_SYSTEM",
  "GIT_CONFIG_NOSYSTEM",
  "GIT_TEMPLATE_DIR",
  "GIT_NAMESPACE",
  "GIT_CEILING_DIRECTORIES",
  "GIT_DISCOVERY_ACROSS_FILESYSTEM",
]);

function isGitEnvironmentVariable(name) {
  const upper = name.toUpperCase();
  return GIT_LOCAL_ENV_KEYS.has(upper)
    || GIT_ADDITIONAL_ENV_KEYS.has(upper)
    || /^GIT_CONFIG_(?:KEY|VALUE)_[0-9]+$/u.test(upper);
}

function inheritedGitEnvironment(environment) {
  return [...new Set(Object.keys(environment)
    .filter(isGitEnvironmentVariable)
    .map((key) => key.toUpperCase()))].sort();
}

function cleanGitEnvironment(environment) {
  const clean = { ...environment };
  for (const key of Object.keys(clean)) {
    if (isGitEnvironmentVariable(key)) delete clean[key];
  }
  return clean;
}

function isWslEnvironment() {
  if (process.platform !== "linux") return false;
  if (typeof process.env.WSL_DISTRO_NAME === "string") return true;
  if (/(?:microsoft|wsl)/iu.test(os.release())) return true;
  try {
    return /microsoft/iu.test(fs.readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}

function createWslInteropGitEnvironment(environment, globalConfigPath) {
  if (!path.isAbsolute(globalConfigPath)) {
    throw new TypeError("WSL Git global config path must be absolute");
  }
  const neutralizedKeys = [...new Set([
    ...GIT_LOCAL_ENV_KEYS,
    ...GIT_ADDITIONAL_ENV_KEYS,
    ...Object.keys(environment).filter(isGitEnvironmentVariable).map((key) => key.toUpperCase()),
  ])].sort();
  const env = cleanGitEnvironment(environment);
  const wslEnvEntries = (typeof env.WSLENV === "string" ? env.WSLENV : "")
    .split(":")
    .filter(Boolean)
    .filter((entry) => !neutralizedKeys.includes(entry.split("/")[0].toUpperCase()));
  // WSL interop may preserve the original Windows environment for Win32
  // children. Explicitly bridge empty values for every recognized Git
  // override, not just the three repository-routing variables.
  for (const key of neutralizedKeys) env[key] = "";
  env.GIT_CONFIG_GLOBAL = globalConfigPath;
  env.GIT_CONFIG_NOSYSTEM = "1";
  // An empty WSL-side environment does not guarantee that native interop
  // children lose command-scope config inherited from their Windows parent.
  // Override both Git command-config channels explicitly at the boundary.
  env.GIT_CONFIG_COUNT = "0";
  env.GIT_CONFIG_PARAMETERS = "";
  // WSL can pass the original Windows environment to Win32 children even
  // when these routing variables are absent from the Linux process.
  // Export explicit empty values so native Git cannot inherit stale routing.
  env.GIT_DIR = "";
  env.GIT_INDEX_FILE = "";
  env.GIT_WORK_TREE = "";
  env.WSLENV = [
    ...wslEnvEntries,
    ...neutralizedKeys.map((key) => key === "GIT_CONFIG_GLOBAL" ? `${key}/p` : key),
  ].join(":");
  return env;
}

function createWslTestGitEnvironment({ environment, configPath, templateDirectory }) {
  if (!path.isAbsolute(configPath) || !path.isAbsolute(templateDirectory)) {
    throw new TypeError("WSL test Git config and template paths must be absolute");
  }
  const env = cleanGitEnvironment(environment);
  const neutralizedNames = [...new Set([
    ...GIT_LOCAL_ENV_KEYS,
    ...GIT_ADDITIONAL_ENV_KEYS,
    ...Object.keys(environment).filter(isGitEnvironmentVariable).map((key) => key.toUpperCase()),
  ])];
  const wslEnvEntries = (typeof env.WSLENV === "string" ? env.WSLENV : "")
    .split(":")
    .filter(Boolean)
    .filter((entry) => !neutralizedNames.includes(entry.split("/")[0].toUpperCase()));

  // Keep Linux Git's environment genuinely clean. Only bridge the disposable
  // settings that native Windows Git needs; command-scope and repository
  // routing overrides are rejected by assertWslWindowsGitEnvironmentClean.
  env.GIT_CONFIG_GLOBAL = configPath;
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_TEMPLATE_DIR = templateDirectory;
  env.WSLENV = [
    ...wslEnvEntries,
    "GIT_CONFIG_GLOBAL/p",
    "GIT_CONFIG_NOSYSTEM",
    "GIT_TEMPLATE_DIR/p",
  ].join(":");
  return env;
}

function assertWslWindowsGitEnvironmentClean(allowedNames = []) {
  if (!isWslEnvironment()) return;
  const recognizedPattern = "^(?:"
    + [...GIT_LOCAL_ENV_KEYS, ...GIT_ADDITIONAL_ENV_KEYS].join("|")
    + "|GIT_CONFIG_(?:KEY|VALUE)_[0-9]+)$";
  const probe = spawnSync("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "$pattern='" + recognizedPattern + "'; $names=@([Environment]::GetEnvironmentVariables('Process').Keys | Where-Object { $_ -match $pattern } | ForEach-Object { $_.ToUpperInvariant() } | Sort-Object -Unique); [Console]::Out.Write((ConvertTo-Json -InputObject $names -Compress))",
  ], {
    encoding: "utf8",
    timeout: 5_000,
    windowsHide: true,
  });
  if (probe.error || probe.status !== 0) {
    const failure = new Error(
      "Windows-parent Git environment could not be verified ("
      + String(probe.error?.code || probe.status || "unknown")
      + ").",
    );
    failure.code = "TEST-GIT-WINDOWS-PARENT-ENVIRONMENT-UNKNOWN";
    throw failure;
  }
  let observed;
  try {
    observed = JSON.parse(probe.stdout);
  } catch {
    const failure = new Error("Windows-parent Git environment probe returned invalid data.");
    failure.code = "TEST-GIT-WINDOWS-PARENT-ENVIRONMENT-UNKNOWN";
    throw failure;
  }
  const names = (Array.isArray(observed) ? observed : [observed])
    .filter((name) => typeof name === "string")
    .map((name) => name.toUpperCase());
  const allowed = new Set(allowedNames.map((name) => name.toUpperCase()));
  const unexpected = names.filter((name) => !allowed.has(name));
  if (unexpected.length > 0) {
    const failure = new Error(
      "Unsafe Windows-parent Git environment is present (" + unexpected.join(", ") + ").",
    );
    failure.code = "TEST-GIT-WINDOWS-PARENT-ENVIRONMENT-REFUSED";
    throw failure;
  }
}

function lstatOrNull(target) {
  try {
    return fs.lstatSync(target, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function sameFileIdentity(actual, expected) {
  return actual !== null
    && expected !== null
    && !actual.isSymbolicLink()
    && actual.dev === expected.dev
    && actual.ino === expected.ino;
}

// Path identity checks refuse substitutions that are observed, but Node's
// path-based rename/unlink/rmdir calls are not atomic with those checks. This
// is best-effort cleanup in a non-hostile same-user namespace, not protection
// against a concurrent same-user writer with access to the temporary parent.
function cleanupOwnedDirectory({ root, rootIdentity, markerPath, ownershipToken, artifacts }, options = {}) {
  const refuse = (reason, retainedPath = null) => ({
    cleaned: false,
    reason,
    retainedPath,
  });

  let current;
  try {
    current = lstatOrNull(root);
  } catch (error) {
    return refuse(`cannot inspect owned temporary directory (${error?.code || "unknown error"})`);
  }
  if (current === null) {
    return refuse("owned temporary directory disappeared before cleanup; location is unknown");
  }
  if (!current.isDirectory() || !sameFileIdentity(current, rootIdentity)) {
    return refuse("temporary directory identity changed before cleanup");
  }
  const verifiedRootPath = () => {
    try {
      return sameFileIdentity(lstatOrNull(root), rootIdentity) ? root : null;
    } catch {
      return null;
    }
  };

  let marker;
  try {
    marker = lstatOrNull(markerPath);
    if (artifacts[".codex-owned"] !== null) {
      if (!sameFileIdentity(marker, artifacts[".codex-owned"]) || !marker.isFile()) {
        return refuse("temporary directory ownership marker changed", verifiedRootPath());
      }
      if (fs.readFileSync(markerPath, "utf8") !== ownershipToken) {
        return refuse("temporary directory ownership marker contents changed", verifiedRootPath());
      }
    } else if (marker !== null) {
      return refuse("unexpected ownership marker appeared during cleanup", verifiedRootPath());
    }

    for (const [name, identity] of Object.entries(artifacts)) {
      if (identity === null) continue;
      const target = path.join(root, name);
      const actual = lstatOrNull(target);
      if (name === "global.gitconfig") {
        if (!sameFileIdentity(actual, identity) || !actual.isFile()) {
          return refuse("owned Git config identity changed", verifiedRootPath());
        }
        if (actual.size !== 0n) {
          return refuse("owned Git config contents changed", verifiedRootPath());
        }
      } else if (!sameFileIdentity(actual, identity)) {
        return refuse(`owned temporary artifact changed: ${name}`, verifiedRootPath());
      }
      if (name === "templates" && (!actual.isDirectory() || fs.readdirSync(target).length !== 0)) {
        return refuse("owned Git template directory is not empty", verifiedRootPath());
      }
    }
    const expectedNames = Object.entries(artifacts)
      .filter(([, identity]) => identity !== null)
      .map(([name]) => name)
      .sort();
    if (JSON.stringify(fs.readdirSync(root).sort()) !== JSON.stringify(expectedNames)) {
      return refuse("temporary directory contains unexpected entries", verifiedRootPath());
    }
  } catch (error) {
    return refuse(`cannot verify owned temporary artifacts (${error?.code || "unknown error"})`, verifiedRootPath());
  }

  try {
    options.afterValidation?.();
  } catch (error) {
    return refuse(`cleanup validation hook failed (${error?.code || error?.message || "unknown error"})`, verifiedRootPath());
  }

  let beforeQuarantine;
  try {
    beforeQuarantine = lstatOrNull(root);
  } catch (error) {
    return refuse(`cannot recheck temporary directory before quarantine (${error?.code || "unknown error"})`);
  }
  if (!sameFileIdentity(beforeQuarantine, rootIdentity)) {
    return refuse("temporary directory identity changed immediately before quarantine", verifiedRootPath());
  }

  const quarantine = path.join(
    path.dirname(root),
    `${path.basename(root)}.cleanup-${randomUUID()}`,
  );
  try {
    if (lstatOrNull(quarantine) !== null) {
      return refuse("cleanup quarantine path already exists", verifiedRootPath());
    }
    fs.renameSync(root, quarantine);
  } catch (error) {
    return refuse(
      `cannot atomically quarantine owned temporary directory (${error?.code || "unknown error"})`,
      verifiedRootPath(),
    );
  }

  try {
    options.afterQuarantineRename?.({ quarantine });
    const quarantinedRoot = lstatOrNull(quarantine);
    const quarantinedMarker = lstatOrNull(path.join(quarantine, ".codex-owned"));
    const markerIsOwned = artifacts[".codex-owned"] === null
      ? quarantinedMarker === null
      : sameFileIdentity(quarantinedMarker, artifacts[".codex-owned"])
        && quarantinedMarker.isFile()
        && fs.readFileSync(path.join(quarantine, ".codex-owned"), "utf8") === ownershipToken;
    if (!sameFileIdentity(quarantinedRoot, rootIdentity) || !markerIsOwned) {
      let retainedPath = null;
      try {
        if (sameFileIdentity(lstatOrNull(quarantine), rootIdentity)) retainedPath = quarantine;
        else if (sameFileIdentity(lstatOrNull(root), rootIdentity)) retainedPath = root;
      } catch {}
      return refuse("directory namespace changed during quarantine; owned location is unverified", retainedPath);
    }

    options.afterQuarantineValidation?.({ quarantine });
    const revalidateQuarantine = () => {
      if (!sameFileIdentity(lstatOrNull(quarantine), rootIdentity)) return false;
      const markerPath = path.join(quarantine, ".codex-owned");
      const marker = lstatOrNull(markerPath);
      if (artifacts[".codex-owned"] !== null) {
        return sameFileIdentity(marker, artifacts[".codex-owned"])
          && marker.isFile()
          && fs.readFileSync(markerPath, "utf8") === ownershipToken;
      }
      return marker === null;
    };
    const verifiedRecoveryPath = () => {
      try {
        if (sameFileIdentity(lstatOrNull(quarantine), rootIdentity)) return quarantine;
        if (sameFileIdentity(lstatOrNull(root), rootIdentity)) return root;
      } catch {}
      return null;
    };
    for (const name of ["templates", "global.gitconfig"]) {
      if (artifacts[name] === null) continue;
      options.beforeRemoveArtifact?.(name, { quarantine });
      const target = path.join(quarantine, name);
      const actual = lstatOrNull(target);
      const artifactIsOwned = sameFileIdentity(actual, artifacts[name]);
      const artifactContentsAreExpected = name !== "global.gitconfig"
        || (actual !== null && actual.isFile() && actual.size === 0n);
      if (!revalidateQuarantine() || !artifactIsOwned) {
        return refuse(`quarantined namespace changed before removing ${name}`, verifiedRecoveryPath());
      }
      if (!artifactContentsAreExpected) {
        return refuse("owned Git config contents changed before removal", verifiedRecoveryPath());
      }
      if (name === "templates") {
        if (!actual.isDirectory() || fs.readdirSync(target).length !== 0) {
          return refuse("owned Git template directory changed before removal", verifiedRecoveryPath());
        }
        fs.rmdirSync(target);
      } else {
        if (!actual.isFile()) return refuse("owned Git config changed before removal", verifiedRecoveryPath());
        fs.unlinkSync(target);
      }
      artifacts[name] = null;
    }
    if (artifacts[".codex-owned"] !== null) {
      options.beforeRemoveArtifact?.(".codex-owned", { quarantine });
      const markerPath = path.join(quarantine, ".codex-owned");
      if (!revalidateQuarantine()) {
        return refuse("ownership marker changed before removal", verifiedRecoveryPath());
      }
      fs.unlinkSync(markerPath);
      artifacts[".codex-owned"] = null;
    }
    options.beforeRemoveQuarantine?.({ quarantine });
    if (!revalidateQuarantine()) {
      return refuse("quarantined directory changed before final removal", verifiedRecoveryPath());
    }
    fs.rmdirSync(quarantine);
    options.afterQuarantineRemoval?.({ quarantine });
    return { cleaned: true, reason: null, retainedPath: null };
  } catch (error) {
    let retainedPath = null;
    try {
      if (sameFileIdentity(lstatOrNull(quarantine), rootIdentity)) retainedPath = quarantine;
      else if (sameFileIdentity(lstatOrNull(root), rootIdentity)) retainedPath = root;
    } catch {}
    return refuse(`owned temporary cleanup was incomplete (${error?.code || "unknown error"})`, retainedPath);
  }
}

function createIsolatedGitEnvironment(environment, options = {}) {
  const env = cleanGitEnvironment(environment);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "galerina-test-git-"));
  const markerPath = path.join(root, ".codex-owned");
  const ownershipToken = randomUUID();
  const configPath = path.join(root, "global.gitconfig");
  const templateDirectory = path.join(root, "templates");
  let rootIdentity = null;
  const artifacts = { ".codex-owned": null, "global.gitconfig": null, templates: null };
  try {
    rootIdentity = lstatOrNull(root);
    if (rootIdentity === null || !rootIdentity.isDirectory() || rootIdentity.isSymbolicLink()) {
      throw new Error("temporary root is not a real directory");
    }
    options.afterRootCreated?.(root);
    if (!sameFileIdentity(lstatOrNull(root), rootIdentity)) {
      throw new Error("temporary root identity changed before initialization");
    }
    fs.writeFileSync(markerPath, ownershipToken, { flag: "wx", mode: 0o600 });
    artifacts[".codex-owned"] = fs.lstatSync(markerPath, { bigint: true });
    fs.writeFileSync(configPath, "", { flag: "wx", mode: 0o600 });
    artifacts["global.gitconfig"] = fs.lstatSync(configPath, { bigint: true });
    fs.mkdirSync(templateDirectory);
    artifacts.templates = fs.lstatSync(templateDirectory, { bigint: true });
  } catch (error) {
    const cleanup = rootIdentity === null || artifacts[".codex-owned"] === null
      ? {
        cleaned: false,
        reason: `ownership identity or marker was not established; last-known allocation=${root}`,
        retainedPath: null,
      }
      : cleanupOwnedDirectory({ root, rootIdentity, markerPath, ownershipToken, artifacts });
    const failure = new Error(
      `TEST-GIT-ENVIRONMENT-INIT-FAILED: ${error?.message || "isolated Git environment setup failed"}`
      + (cleanup.cleaned ? " (partial state cleaned)" : `; retained path ${cleanup.retainedPath || "unverified"}: ${cleanup.reason}`),
      { cause: error },
    );
    failure.code = "TEST-GIT-ENVIRONMENT-INIT-FAILED";
    throw failure;
  }

  env.GIT_CONFIG_GLOBAL = configPath;
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_TEMPLATE_DIR = templateDirectory;

  let cleanupPath = root;
  let cleaned = false;
  function cleanup(options = {}) {
    if (cleaned) return { cleaned: true, reason: null, retainedPath: null };
    const result = cleanupOwnedDirectory({
      root: cleanupPath,
      rootIdentity,
      markerPath: path.join(cleanupPath, ".codex-owned"),
      ownershipToken,
      artifacts,
    }, options);
    cleaned = result.cleaned;
    if (!result.cleaned && result.retainedPath) cleanupPath = result.retainedPath;
    return result;
  }

  return {
    env,
    root,
    configPath,
    templateDirectory,
    cleanup,
  };
}

module.exports = {
  cleanGitEnvironment,
  cleanupOwnedDirectory,
  createIsolatedGitEnvironment,
  createWslInteropGitEnvironment,
  createWslTestGitEnvironment,
  assertWslWindowsGitEnvironmentClean,
  inheritedGitEnvironment,
  isGitEnvironmentVariable,
  isWslEnvironment,
};
