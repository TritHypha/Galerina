#!/usr/bin/env node
/**
 * Refusing folder-content guard for packages/fungi/memory/.
 * Outcomes: FOLDER_ADMITTED | FOLDER_UNGOVERNED | FOLDER_REFUSED.
 * Unlisted name refuses. No null or NaN. Every switch has a default arm.
 */
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REL = "packages/fungi/memory";

const CLOSED_OUTCOMES = Object.freeze([
  "FOLDER_ADMITTED",
  "FOLDER_UNGOVERNED",
  "FOLDER_REFUSED",
]);

const ALLOWED_FILES = Object.freeze([
  "README.md",
  "src/README.md",
  "tests/README.md",
  "memory-fungi.manifest.json",
  "src/c-boundary.fungi",
  "src/body-reader.fungi",
]);

const ALLOWED_PREFIXES = Object.freeze([
  "tests/31-body-reader/",
  "evidence/31-body-reader/",
]);

const REFUSED_BASENAMES = Object.freeze([
  "package.json",
  "package.fungi.json",
  "node_modules",
]);

function slash(p) {
  return p.split(sep).join("/");
}

function isAllowedRel(rel) {
  if (ALLOWED_FILES.includes(rel)) {
    return true;
  }
  let i = 0;
  while (i < ALLOWED_PREFIXES.length) {
    const prefix = ALLOWED_PREFIXES[i];
    if (rel === prefix.slice(0, -1) || rel.startsWith(prefix)) {
      return true;
    }
    i = i + 1;
  }
  const dirPrefix = rel + "/";
  let j = 0;
  while (j < ALLOWED_FILES.length) {
    if (ALLOWED_FILES[j].startsWith(dirPrefix) === true) {
      return true;
    }
    j = j + 1;
  }
  let k = 0;
  while (k < ALLOWED_PREFIXES.length) {
    if (ALLOWED_PREFIXES[k].startsWith(dirPrefix) === true) {
      return true;
    }
    k = k + 1;
  }
  return false;
}

function classifyEntry(name, isDir) {
  if (REFUSED_BASENAMES.includes(name)) {
    return "REFUSED_BASENAME";
  }
  if (isDir === true) {
    return "DIR";
  }
  if (isDir === false) {
    return "FILE";
  }
  return "UNLISTED";
}

export function auditFungiMemoryFolder(folderAbs) {
  if (existsSync(folderAbs) !== true) {
    return {
      outcome: "FOLDER_UNGOVERNED",
      reasons: ["FOLDER_MISSING"],
    };
  }
  const rootStat = lstatSync(folderAbs);
  if (rootStat.isDirectory() !== true) {
    return {
      outcome: "FOLDER_REFUSED",
      reasons: ["FOLDER_NOT_DIRECTORY"],
    };
  }
  const reasons = [];
  const walk = (abs, rel) => {
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      reasons.push("READ_FAILED:" + (rel === "" ? "." : rel));
      return;
    }
    let i = 0;
    while (i < entries.length) {
      const ent = entries[i];
      const childRel = rel === "" ? ent.name : rel + "/" + ent.name;
      const childAbs = join(abs, ent.name);
      if (ent.isSymbolicLink() === true) {
        reasons.push("SYMLINK:" + childRel);
        i = i + 1;
        continue;
      }
      const kind = classifyEntry(ent.name, ent.isDirectory());
      switch (kind) {
        case "REFUSED_BASENAME":
          reasons.push("REFUSED_BASENAME:" + childRel);
          break;
        case "DIR":
          if (isAllowedRel(childRel) === true || isAllowedRel(childRel + "/")) {
            walk(childAbs, childRel);
          } else {
            reasons.push("UNLISTED_DIR:" + childRel);
          }
          break;
        case "FILE":
          if (isAllowedRel(childRel) === true) {
            break;
          }
          reasons.push("UNLISTED_FILE:" + childRel);
          break;
        default:
          reasons.push("UNLISTED_ENTRY:" + childRel);
          break;
      }
      i = i + 1;
    }
  };
  walk(folderAbs, "");
  if (reasons.length === 0) {
    return { outcome: "FOLDER_ADMITTED", reasons: [] };
  }
  return { outcome: "FOLDER_REFUSED", reasons };
}

function parseArgs(argv) {
  let root = DEFAULT_ROOT;
  let rel = DEFAULT_REL;
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    switch (a) {
      case "--root":
        if (i + 1 >= argv.length) {
          return { ok: false, code: "MISSING_ROOT" };
        }
        root = resolve(argv[i + 1]);
        i = i + 2;
        break;
      case "--dir":
        if (i + 1 >= argv.length) {
          return { ok: false, code: "MISSING_DIR" };
        }
        rel = slash(argv[i + 1]);
        i = i + 2;
        break;
      default:
        return { ok: false, code: "UNLISTED_FLAG" };
    }
  }
  if (rel.includes("..") === true) {
    return { ok: false, code: "DIR_ESCAPES" };
  }
  return { ok: true, root, rel };
}

function main(argv) {
  const parsed = parseArgs(argv);
  if (parsed.ok !== true) {
    const report = { outcome: "FOLDER_REFUSED", reasons: [parsed.code] };
    process.stdout.write(JSON.stringify(report) + "\n");
    process.exitCode = 2;
    return;
  }
  const folderAbs = resolve(parsed.root, parsed.rel);
  const contained = relative(parsed.root, folderAbs);
  if (contained.startsWith("..") === true) {
    const report = { outcome: "FOLDER_REFUSED", reasons: ["DIR_ESCAPES"] };
    process.stdout.write(JSON.stringify(report) + "\n");
    process.exitCode = 2;
    return;
  }
  const report = auditFungiMemoryFolder(folderAbs);
  let listed = false;
  let i = 0;
  while (i < CLOSED_OUTCOMES.length) {
    if (CLOSED_OUTCOMES[i] === report.outcome) {
      listed = true;
    }
    i = i + 1;
  }
  if (listed !== true) {
    const refused = { outcome: "FOLDER_REFUSED", reasons: ["UNLISTED_OUTCOME"] };
    process.stdout.write(JSON.stringify(refused) + "\n");
    process.exitCode = 2;
    return;
  }
  process.stdout.write(JSON.stringify(report) + "\n");
  switch (report.outcome) {
    case "FOLDER_ADMITTED":
      process.exitCode = 0;
      break;
    case "FOLDER_UNGOVERNED":
      process.exitCode = 3;
      break;
    case "FOLDER_REFUSED":
      process.exitCode = 2;
      break;
    default:
      process.exitCode = 2;
      break;
  }
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked === true) {
  main(process.argv.slice(2));
}
